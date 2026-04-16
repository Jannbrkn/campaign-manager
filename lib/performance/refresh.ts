// lib/performance/refresh.ts
// Shared performance-refresh logic used by both:
// - POST /api/performance/refresh (UI-triggered via button)
// - GET /api/cron/performance-refresh (nightly cron)
//
// Does three things per run:
// 1. Match unlinked DB newsletter campaigns to Mailchimp sends (scored heuristic)
// 2. Snapshot latest stats for each linked campaign (+ freeze is_final after 30d)
// 3. Fetch per-link click-details and per-domain performance alongside

import { mcFetch, MC_SERVER, fetchAllMcCampaigns } from '@/lib/mailchimp'
import { findBestMatch } from '@/lib/mailchimp/matching'
import { createAdminClient } from '@/lib/supabase/admin'

const REFRESH_WINDOW_DAYS = 30

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

const CLICK_FIELDS = [
  'urls_clicked.id',
  'urls_clicked.url',
  'urls_clicked.total_clicks',
  'urls_clicked.unique_clicks',
  'urls_clicked.click_percentage',
  'urls_clicked.unique_click_percentage',
].join(',')

const DOMAIN_FIELDS = [
  'domains.domain',
  'domains.emails_sent',
  'domains.bounces',
  'domains.opens',
  'domains.clicks',
  'domains.unsubs',
  'domains.delivered',
  'domains.bounces_pct',
  'domains.opens_pct',
  'domains.clicks_pct',
  'domains.unsubs_pct',
  'domains.delivered_pct',
].join(',')

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

export interface RefreshResult {
  linked: number
  updated: number
  snapshotsWritten: number
  errors: string[]
  linkedDetails: { db_title: string; mc_title: string; diff_days: number; score: number }[]
  noMatch: string[]
  statsDetails: { title: string; open_rate: number; click_rate: number; emails_sent: number }[]
}

export async function runPerformanceRefresh(): Promise<RefreshResult> {
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
  const linkedDetails: RefreshResult['linkedDetails'] = []
  const noMatch: string[] = []

  const today = new Date()
  today.setHours(23, 59, 59, 999)

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue
      if (new Date(db.scheduled_date) > today) continue  // future → skip

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
  const statsDetails: RefreshResult['statsDetails'] = []

  for (const campaign of toRefresh ?? []) {
    try {
      const report = await mcFetch(
        `/reports/${campaign.mailchimp_campaign_id}?fields=${encodeURIComponent(REPORT_FIELDS)}`,
        'GET'
      )

      const emails_sent = report.emails_sent ?? 0
      const hard_bounces = report.bounces?.hard_bounces ?? null
      const soft_bounces = report.bounces?.soft_bounces ?? null
      const opens_total = report.opens?.opens_total ?? null
      const unique_opens = report.opens?.unique_opens ?? null
      const raw_open_rate = report.opens?.open_rate ?? null
      const proxy_excluded_opens = report.opens?.proxy_excluded_opens ?? null
      const proxy_excluded_unique_opens = report.opens?.proxy_excluded_unique_opens ?? null
      const proxy_excluded_open_rate = report.opens?.proxy_excluded_open_rate ?? null
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

      // Freeze older snapshots
      const ageDays = campaign.scheduled_date ? daysSince(campaign.scheduled_date) : 0
      const is_final = ageDays > REFRESH_WINDOW_DAYS

      if (is_final) {
        const { data: existingFinal } = await admin
          .from('campaign_reports')
          .select('id')
          .eq('campaign_id', campaign.id)
          .eq('is_final', true)
          .limit(1)
          .maybeSingle()

        if (existingFinal) continue
      }

      // Fetch click-details + domain-performance (best-effort, don't fail the whole run)
      let click_details: any[] | null = null
      let domain_performance: any[] | null = null

      if (clicks_total && clicks_total > 0) {
        try {
          const res = await mcFetch(
            `/reports/${campaign.mailchimp_campaign_id}/click-details?count=100&fields=${encodeURIComponent(CLICK_FIELDS)}`,
            'GET'
          )
          click_details = res.urls_clicked ?? []
        } catch (err: any) {
          console.warn(`[refresh] click-details failed for ${campaign.mailchimp_campaign_id}:`, err?.message)
        }
      }

      try {
        const res = await mcFetch(
          `/reports/${campaign.mailchimp_campaign_id}/domain-performance?fields=${encodeURIComponent(DOMAIN_FIELDS)}`,
          'GET'
        )
        domain_performance = res.domains ?? []
      } catch (err: any) {
        console.warn(`[refresh] domain-performance failed for ${campaign.mailchimp_campaign_id}:`, err?.message)
      }

      // Write snapshot
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
        click_details,
        domain_performance,
        raw_report: report,
      })

      if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`)
      snapshotsWritten++

      // Mirror latest values to campaigns.performance_stats for cheap page loads
      const { error: mirrorErr } = await admin
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
        .eq('id', campaign.id)

      if (mirrorErr) throw new Error(`Mirror update: ${mirrorErr.message}`)
      updated++
      statsDetails.push({
        title: (campaign as any).title ?? campaign.id,
        open_rate: Math.round(open_rate * 1000) / 10,
        click_rate: Math.round(click_rate * 1000) / 10,
        emails_sent,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('404')) errors.push(`${(campaign as any).title ?? campaign.id}: ${msg}`)
    }
  }

  return {
    linked,
    updated,
    snapshotsWritten,
    errors,
    linkedDetails,
    noMatch,
    statsDetails,
  }
}
