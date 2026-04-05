// lib/alerts/index.ts
// Core alert collection logic — runs daily via Vercel Cron

import { createAdminClient } from '@/lib/supabase/admin'

export type AlertType =
  | 'six_week_notice'
  | 'briefing_missing'
  | 'assets_missing'
  | 'chain_blocked'
  | 'overdue'

export interface CampaignAlertInfo {
  campaign_id: string
  title: string
  manufacturer: string
  agency: string
  type: string
  scheduled_date: string
  status: string
  days_until: number
  alert_types: AlertType[]
  warnings: string[]
}

export interface AlertCollectionResult {
  todayStr: string
  isMonday: boolean
  kw: number
  alerts: CampaignAlertInfo[]
  upcoming14Days: CampaignAlertInfo[]    // for Monday weekly summary
  completedLastWeek: CampaignAlertInfo[] // for Monday weekly summary
}

// Returns today's date in Berlin timezone as 'YYYY-MM-DD'
function getTodayBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

// Returns true if today is Monday in Berlin timezone
export function isMondayInBerlin(): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'long' }).format(
      new Date()
    ) === 'Monday'
  )
}

// ISO week number
function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00Z')
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// Days from todayStr to dateStr (negative = past/overdue)
function daysDiff(dateStr: string, todayStr: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const target = new Date(dateStr + 'T12:00:00Z').getTime()
  const today = new Date(todayStr + 'T12:00:00Z').getTime()
  return Math.round((target - today) / msPerDay)
}

// Returns the most recent sent_at for a given campaign + alert type
function getLastSent(
  alerts: Array<{ campaign_id: string; alert_type: string; sent_at: string | null }>,
  campaignId: string,
  alertType: AlertType
): Date | null {
  const relevant = alerts.filter(
    (a) => a.campaign_id === campaignId && a.alert_type === alertType && a.sent_at
  )
  if (!relevant.length) return null
  return new Date(Math.max(...relevant.map((a) => new Date(a.sent_at!).getTime())))
}

// Returns true if enough time has passed since last send (null = only send once ever)
function canSend(lastSent: Date | null, frequencyDays: number | null): boolean {
  if (frequencyDays === null) return lastSent === null
  if (!lastSent) return true
  return Date.now() - lastSent.getTime() > frequencyDays * 24 * 60 * 60 * 1000
}

export async function collectAlerts(): Promise<AlertCollectionResult> {
  const admin = createAdminClient()
  const todayStr = getTodayBerlin()
  const monday = isMondayInBerlin()
  const kw = getISOWeek(todayStr)

  // Load all campaigns with manufacturer + agency
  const { data: campaigns } = await admin
    .from('campaigns')
    .select('*, manufacturers(name, agencies(name))')
    .order('scheduled_date')

  if (!campaigns || campaigns.length === 0) {
    return { todayStr, isMonday: monday, kw, alerts: [], upcoming14Days: [], completedLastWeek: [] }
  }

  // Recent alerts (last 7 days) — covers all frequency windows except six_week_notice
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentAlerts } = await admin
    .from('campaign_alerts')
    .select('campaign_id, alert_type, sent_at')
    .not('sent_at', 'is', null)
    .gte('sent_at', sevenDaysAgo)

  // All-time six_week_notice alerts (once per campaign, no repeat)
  const { data: sixWeekHistory } = await admin
    .from('campaign_alerts')
    .select('campaign_id')
    .eq('alert_type', 'six_week_notice')
    .not('sent_at', 'is', null)

  const recent = recentAlerts ?? []
  const sixWeekSent = new Set((sixWeekHistory ?? []).map((a) => a.campaign_id))

  // Input asset presence per campaign
  const campaignIds = campaigns.map((c) => c.id)
  const { data: inputAssets } = await admin
    .from('campaign_assets')
    .select('campaign_id')
    .in('campaign_id', campaignIds)
    .eq('is_output', false)

  const hasAssets = new Set((inputAssets ?? []).map((a) => a.campaign_id))

  // Lookup map for chain-blocking checks
  const campaignById = new Map(campaigns.map((c) => [c.id, c]))

  const alerts: CampaignAlertInfo[] = []
  const upcoming14Days: CampaignAlertInfo[] = []
  const completedLastWeek: CampaignAlertInfo[] = []

  for (const campaign of campaigns) {
    const mfg = (campaign as any).manufacturers
    const agency = mfg?.agencies
    const daysUntil = daysDiff(campaign.scheduled_date, todayStr)

    // Collect campaigns sent in the last 7 days (for Monday "done" section)
    if (campaign.status === 'sent') {
      if (daysUntil >= -7 && daysUntil <= 0) {
        completedLastWeek.push({
          campaign_id: campaign.id,
          title: campaign.title,
          manufacturer: mfg?.name ?? '',
          agency: agency?.name ?? '',
          type: campaign.type,
          scheduled_date: campaign.scheduled_date,
          status: campaign.status,
          days_until: daysUntil,
          alert_types: [],
          warnings: [],
        })
      }
      continue // No alerts for sent campaigns
    }

    // No alerts for approved campaigns
    if (campaign.status === 'approved') continue

    const alertTypes: AlertType[] = []
    const warnings: string[] = []

    // overdue — scheduled_date in the past, daily
    if (daysUntil < 0) {
      const last = getLastSent(recent, campaign.id, 'overdue')
      if (canSend(last, 1)) alertTypes.push('overdue')
    }

    // six_week_notice — only for planned campaigns, fires once
    if (daysUntil >= 0 && daysUntil <= 42 && campaign.status === 'planned') {
      if (!sixWeekSent.has(campaign.id)) alertTypes.push('six_week_notice')
    }

    // briefing_missing — newsletter + postcard, ≤21 days, weekly repeat
    if (
      daysUntil >= 0 &&
      daysUntil <= 21 &&
      ['newsletter', 'postcard'].includes(campaign.type) &&
      !campaign.briefing
    ) {
      const last = getLastSent(recent, campaign.id, 'briefing_missing')
      if (canSend(last, 7)) {
        alertTypes.push('briefing_missing')
        warnings.push('Briefing fehlt')
      }
    }

    // assets_missing — ≤14 days, every 3 days (>7d) or daily (≤7d)
    if (daysUntil >= 0 && daysUntil <= 14 && !hasAssets.has(campaign.id)) {
      const freqDays = daysUntil <= 7 ? 1 : 3
      const last = getLastSent(recent, campaign.id, 'assets_missing')
      if (canSend(last, freqDays)) {
        if (!alertTypes.includes('assets_missing')) alertTypes.push('assets_missing')
        if (!warnings.includes('Assets fehlen')) warnings.push('Assets fehlen')
      }
    }

    // chain_blocked — ≤7 days, daily
    if (daysUntil >= 0 && daysUntil <= 7) {
      let blocked = false
      if (campaign.type === 'newsletter' && campaign.linked_postcard_id) {
        const postcard = campaignById.get(campaign.linked_postcard_id)
        if (postcard && postcard.status !== 'sent') blocked = true
      }
      if (
        ['report_internal', 'report_external'].includes(campaign.type) &&
        campaign.linked_newsletter_id
      ) {
        const newsletter = campaignById.get(campaign.linked_newsletter_id)
        if (newsletter && newsletter.status !== 'sent') blocked = true
      }
      if (blocked) {
        const last = getLastSent(recent, campaign.id, 'chain_blocked')
        if (canSend(last, 1)) {
          alertTypes.push('chain_blocked')
          warnings.push('Vorgänger nicht versendet')
        }
      }
    }

    const info: CampaignAlertInfo = {
      campaign_id: campaign.id,
      title: campaign.title,
      manufacturer: mfg?.name ?? '',
      agency: agency?.name ?? '',
      type: campaign.type,
      scheduled_date: campaign.scheduled_date,
      status: campaign.status,
      days_until: daysUntil,
      alert_types: alertTypes,
      warnings,
    }

    if (alertTypes.length > 0) alerts.push(info)

    // Include in weekly summary if within 14 days (regardless of alert)
    if (daysUntil >= 0 && daysUntil <= 14) upcoming14Days.push(info)
  }

  return { todayStr, isMonday: monday, kw, alerts, upcoming14Days, completedLastWeek }
}

// Inserts one campaign_alerts row per alert type per campaign
export async function recordAlertsSent(alerts: CampaignAlertInfo[]): Promise<void> {
  const admin = createAdminClient()
  const sentAt = new Date().toISOString()

  const rows = alerts.flatMap((alert) =>
    alert.alert_types.map((alertType) => ({
      campaign_id: alert.campaign_id,
      alert_type: alertType,
      sent_at: sentAt,
      scheduled_for: sentAt, // legacy column
      sent: true,            // legacy column
    }))
  )

  if (rows.length === 0) return
  await admin.from('campaign_alerts').insert(rows)
}
