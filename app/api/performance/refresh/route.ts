// app/api/performance/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured, MC_SERVER, fetchAllMcCampaigns } from '@/lib/mailchimp'
import { findBestMatch } from '@/lib/mailchimp/matching'

export const maxDuration = 60

// Only refresh campaigns sent within this window — older snapshots are frozen.
const REFRESH_WINDOW_DAYS = 30

// Tight field filter to reduce payload size (~10x smaller than full report)
const REPORT_FIELDS = [
  'emails_sent',
  'bounces.hard_bounces',
  'bounces.soft_bounces',
  'bounces.syntax_errors',
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
  'send_time',
].join(',')

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

export async function POST(_req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── Phase 1: Matching ────────────────────────────────────────────────────

  const [mcCampaigns, { data: dbCampaigns }] = await Promise.all([
    fetchAllMcCampaigns({ onlySent: true }),
    admin
      .from('campaigns')
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(name, agencies(name))')
      .eq('type', 'newsletter'),
  ])

  let linked = 0
  const linkedDetails: { db_title: string; mc_title: string; diff_days: number; score: number }[] = []
  const noMatch: string[] = []

  // Skip matching on future-dated campaigns — they can't possibly be sent yet
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue

      // Future campaigns won't have a Mailchimp match yet
      if (new Date(db.scheduled_date) > today) continue

      const best = findBestMatch(
        {
          id: db.id,
          title: db.title,
          scheduled_date: db.scheduled_date,
          manufacturer_name: (db.manufacturers as any)?.name ?? '',
        },
        mcCampaigns
      )

      if (best) {
        await admin
          .from('campaigns')
          .update({
            mailchimp_campaign_id: best.mc.id,
            mailchimp_url: `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${best.mc.web_id}`,
          })
          .eq('id', db.id)
        linked++
        linkedDetails.push({
          db_title: db.title,
          mc_title: best.mc.settings?.title ?? best.mc.id,
          diff_days: best.diffDays,
          score: best.score,
        })
      } else {
        noMatch.push(db.title)
      }
    }
  }

  // ── Phase 2: Stats fetchen + Snapshots schreiben ──────────────────────────

  const { data: toRefresh } = await admin
    .from('campaigns')
    .select('id, title, mailchimp_campaign_id, scheduled_date')
    .not('mailchimp_campaign_id', 'is', null)

  let updated = 0
  let snapshotsWritten = 0
  const errors: string[] = []
  const statsDetails: {
    title: string
    open_rate: number
    click_rate: number
    emails_sent: number
  }[] = []

  for (const campaign of toRefresh ?? []) {
    try {
      const report = await mcFetch(
        `/reports/${campaign.mailchimp_campaign_id}?fields=${encodeURIComponent(REPORT_FIELDS)}`,
        'GET'
      )

      // Extract structured values
      const emails_sent = report.emails_sent ?? 0
      const hard_bounces = report.bounces?.hard_bounces ?? null
      const soft_bounces = report.bounces?.soft_bounces ?? null

      const opens_total = report.opens?.opens_total ?? null
      const unique_opens = report.opens?.unique_opens ?? null
      const raw_open_rate = report.opens?.open_rate ?? null
      const proxy_excluded_opens = report.opens?.proxy_excluded_opens ?? null
      const proxy_excluded_unique_opens = report.opens?.proxy_excluded_unique_opens ?? null
      const proxy_excluded_open_rate = report.opens?.proxy_excluded_open_rate ?? null

      // MPP-Fix: preferred rate for display
      const open_rate = proxy_excluded_open_rate ?? raw_open_rate ?? 0

      const clicks_total = report.clicks?.clicks_total ?? null
      const unique_clicks = report.clicks?.unique_clicks ?? null
      const unique_subscriber_clicks = report.clicks?.unique_subscriber_clicks ?? null
      const click_rate = report.clicks?.click_rate ?? 0

      const unsubscribed = report.unsubscribed ?? report.unsubscribes?.count ?? 0
      const abuse_reports = report.abuse_reports ?? null

      const industry_type = report.industry_stats?.type ?? null
      const industry_open_rate = report.industry_stats?.open_rate ?? null
      const industry_click_rate = report.industry_stats?.click_rate ?? null
      const industry_bounce_rate = report.industry_stats?.bounce_rate ?? null
      const industry_unsub_rate = report.industry_stats?.unsub_rate ?? null

      // Freeze older snapshots — no further refreshes change history
      const ageDays = campaign.scheduled_date ? daysSince(campaign.scheduled_date) : 0
      const is_final = ageDays > REFRESH_WINDOW_DAYS

      // Skip if already finalized (don't write more snapshots for frozen campaigns)
      if (is_final) {
        const { data: existingFinal } = await admin
          .from('campaign_reports')
          .select('id')
          .eq('campaign_id', campaign.id)
          .eq('is_final', true)
          .limit(1)
          .maybeSingle()

        if (existingFinal) {
          // Already have a final snapshot — don't touch it
          continue
        }
      }

      // Write new snapshot
      const { error: snapErr } = await admin.from('campaign_reports').insert({
        campaign_id: campaign.id,
        mailchimp_campaign_id: campaign.mailchimp_campaign_id as string,
        snapshot_date: new Date().toISOString(),
        is_final,
        emails_sent,
        hard_bounces,
        soft_bounces,
        opens_total,
        unique_opens,
        open_rate: raw_open_rate,
        proxy_excluded_opens,
        proxy_excluded_unique_opens,
        proxy_excluded_open_rate,
        clicks_total,
        unique_clicks,
        unique_subscriber_clicks,
        click_rate,
        unsubscribed,
        abuse_reports,
        industry_type,
        industry_open_rate,
        industry_click_rate,
        industry_bounce_rate,
        industry_unsub_rate,
        raw_report: report,
      })

      if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`)
      snapshotsWritten++

      // Mirror latest values to campaigns.performance_stats (cheap page loads)
      const { error: mirrorErr } = await admin
        .from('campaigns')
        .update({
          performance_stats: {
            open_rate,                              // MPP-preferred rate
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
        .eq('id', campaign.id)

      if (mirrorErr) throw new Error(`Mirror update: ${mirrorErr.message}`)
      updated++
      statsDetails.push({
        title: (campaign as any).title ?? campaign.id,
        open_rate: Math.round(open_rate * 1000) / 10, // als Prozent für Lesbarkeit
        click_rate: Math.round(click_rate * 1000) / 10,
        emails_sent,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('404')) errors.push(`${(campaign as any).title ?? campaign.id}: ${msg}`)
    }
  }

  return NextResponse.json({
    linked,
    updated,
    snapshotsWritten,
    errors,
    linkedDetails,
    noMatch,
    statsDetails,
  })
}
