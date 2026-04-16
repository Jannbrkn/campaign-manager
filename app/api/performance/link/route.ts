// app/api/performance/link/route.ts
// Manual DB-Kampagne ↔ Mailchimp-Kampagne linking (and unlinking).
// Used by the Performance "Unmatched" UI to resolve cases the auto-matcher missed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured, MC_SERVER } from '@/lib/mailchimp'

export const maxDuration = 60

const REPORT_FIELDS = [
  'emails_sent',
  'bounces.hard_bounces',
  'bounces.soft_bounces',
  'opens.opens_total',
  'opens.unique_opens',
  'opens.open_rate',
  'opens.proxy_excluded_opens',
  'opens.proxy_excluded_unique_opens',
  'opens.proxy_excluded_open_rate',
  'clicks.clicks_total',
  'clicks.unique_clicks',
  'clicks.unique_subscriber_clicks',
  'clicks.click_rate',
  'unsubscribed',
  'abuse_reports',
  'industry_stats',
].join(',')

/**
 * Link a DB campaign to a Mailchimp campaign and immediately pull a snapshot.
 * Body: { campaign_id, mailchimp_campaign_id }
 */
export async function POST(req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campaign_id, mailchimp_campaign_id } = await req.json()
  if (!campaign_id || !mailchimp_campaign_id) {
    return NextResponse.json({ error: 'campaign_id and mailchimp_campaign_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch MC campaign meta to verify it exists and get web_id for the URL
  let mcMeta: any
  try {
    mcMeta = await mcFetch(
      `/campaigns/${mailchimp_campaign_id}?fields=id,web_id,settings,send_time,status`,
      'GET'
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: `Mailchimp campaign not found: ${err.message}` },
      { status: 404 }
    )
  }

  // Update DB campaign with the link
  const { error: linkErr } = await admin
    .from('campaigns')
    .update({
      mailchimp_campaign_id,
      mailchimp_url: `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${mcMeta.web_id}`,
    })
    .eq('id', campaign_id)

  if (linkErr) {
    return NextResponse.json({ error: `DB update failed: ${linkErr.message}` }, { status: 500 })
  }

  // Best-effort: pull a snapshot immediately so the user sees stats right away.
  // If the campaign hasn't been sent yet or has no report, skip silently.
  let snapshotWritten = false
  let mirroredStats = false

  if (mcMeta.status === 'sent') {
    try {
      const report = await mcFetch(
        `/reports/${mailchimp_campaign_id}?fields=${encodeURIComponent(REPORT_FIELDS)}`,
        'GET'
      )

      const emails_sent = report.emails_sent ?? 0
      const hard_bounces = report.bounces?.hard_bounces ?? null
      const soft_bounces = report.bounces?.soft_bounces ?? null
      const raw_open_rate = report.opens?.open_rate ?? null
      const proxy_excluded_open_rate = report.opens?.proxy_excluded_open_rate ?? null
      const open_rate = proxy_excluded_open_rate ?? raw_open_rate ?? 0
      const click_rate = report.clicks?.click_rate ?? 0
      const unsubscribed = report.unsubscribed ?? report.unsubscribes?.count ?? 0
      const abuse_reports = report.abuse_reports ?? null
      const industry_open_rate = report.industry_stats?.open_rate ?? null
      const industry_click_rate = report.industry_stats?.click_rate ?? null

      // Write snapshot
      await admin.from('campaign_reports').insert({
        campaign_id,
        mailchimp_campaign_id,
        snapshot_date: new Date().toISOString(),
        is_final: false,
        emails_sent,
        hard_bounces,
        soft_bounces,
        opens_total: report.opens?.opens_total ?? null,
        unique_opens: report.opens?.unique_opens ?? null,
        open_rate: raw_open_rate,
        proxy_excluded_opens: report.opens?.proxy_excluded_opens ?? null,
        proxy_excluded_unique_opens: report.opens?.proxy_excluded_unique_opens ?? null,
        proxy_excluded_open_rate,
        clicks_total: report.clicks?.clicks_total ?? null,
        unique_clicks: report.clicks?.unique_clicks ?? null,
        unique_subscriber_clicks: report.clicks?.unique_subscriber_clicks ?? null,
        click_rate,
        unsubscribed,
        abuse_reports,
        industry_type: report.industry_stats?.type ?? null,
        industry_open_rate,
        industry_click_rate,
        industry_bounce_rate: report.industry_stats?.bounce_rate ?? null,
        industry_unsub_rate: report.industry_stats?.unsub_rate ?? null,
        raw_report: report,
      })
      snapshotWritten = true

      // Mirror latest to campaigns.performance_stats
      await admin
        .from('campaigns')
        .update({
          performance_stats: {
            open_rate,
            click_rate,
            emails_sent,
            unsubscribes: unsubscribed,
            source: 'api',
            proxy_excluded_open_rate,
            hard_bounces,
            soft_bounces,
            abuse_reports,
            industry_open_rate,
            industry_click_rate,
          },
        })
        .eq('id', campaign_id)
      mirroredStats = true
    } catch (err: any) {
      // Stats fetch failed but the link is saved — user can trigger refresh later
      console.warn(`[link] stats fetch failed for ${mailchimp_campaign_id}:`, err?.message)
    }
  }

  return NextResponse.json({
    success: true,
    snapshotWritten,
    mirroredStats,
    mc_title: mcMeta.settings?.title ?? null,
    send_time: mcMeta.send_time ?? null,
  })
}

/** Unlink: clear mailchimp_campaign_id when auto-match was wrong. */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campaign_id } = await req.json()
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

  const admin = createAdminClient()

  const { error } = await admin
    .from('campaigns')
    .update({
      mailchimp_campaign_id: null,
      mailchimp_url: null,
      performance_stats: null,
    })
    .eq('id', campaign_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Leave historical snapshots in campaign_reports intact — they're still valid history
  // (If the wrong link was entirely wrong, the user can delete them via SQL.)

  return NextResponse.json({ success: true })
}
