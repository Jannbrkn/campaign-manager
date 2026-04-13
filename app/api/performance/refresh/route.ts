// app/api/performance/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured, MC_SERVER } from '@/lib/mailchimp'

export const maxDuration = 60

async function fetchAllMailchimpCampaigns() {
  const all: any[] = []
  let offset = 0
  const count = 200
  while (true) {
    const res = await mcFetch(
      `/campaigns?count=${count}&offset=${offset}&status=sent&fields=campaigns.id,campaigns.web_id,campaigns.settings,campaigns.send_time`,
      'GET'
    )
    const batch = res.campaigns ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return all
}

export async function POST(_req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── Phase 1: Mailchimp-Kampagnen holen und per Datum matchen ─────────────

  const [mcCampaigns, { data: dbCampaigns }] = await Promise.all([
    fetchAllMailchimpCampaigns(),
    admin
      .from('campaigns')
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(agencies(name))')
      .eq('type', 'newsletter'),
  ])

  let linked = 0

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue

      const dbTime = new Date(db.scheduled_date).getTime()
      const agencyName = (db.manufacturers as any)?.agencies?.name?.toLowerCase() ?? null

      // Match: Sendedatum ±3 Tage + optionaler from_name-Check auf Agentur
      const match = mcCampaigns.find((mc) => {
        if (!mc.send_time) return false
        const diffDays = Math.abs(dbTime - new Date(mc.send_time).getTime()) / 86_400_000
        if (diffDays > 3) return false
        if (agencyName && mc.settings?.from_name) {
          return mc.settings.from_name.toLowerCase().includes(agencyName)
        }
        return true
      })

      if (match) {
        await admin
          .from('campaigns')
          .update({
            mailchimp_campaign_id: match.id,
            mailchimp_url: `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${match.web_id}`,
          })
          .eq('id', db.id)
        linked++
      }
    }
  }

  // ── Phase 2: Stats für alle verknüpften Kampagnen fetchen ────────────────

  const { data: toRefresh } = await admin
    .from('campaigns')
    .select('id, mailchimp_campaign_id')
    .not('mailchimp_campaign_id', 'is', null)

  let updated = 0
  const errors: string[] = []

  for (const campaign of toRefresh ?? []) {
    try {
      const report = await mcFetch(`/reports/${campaign.mailchimp_campaign_id}`, 'GET')
      const { error } = await admin
        .from('campaigns')
        .update({
          performance_stats: {
            open_rate: report.opens?.open_rate ?? report.report_summary?.open_rate ?? 0,
            click_rate: report.clicks?.click_rate ?? report.report_summary?.click_rate ?? 0,
            emails_sent: report.emails_sent ?? 0,
            unsubscribes: report.unsubscribed ?? 0,
            source: 'api',
          },
        })
        .eq('id', campaign.id)
      if (error) throw new Error(error.message)
      updated++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('404')) errors.push(`${campaign.id}: ${msg}`)
    }
  }

  return NextResponse.json({ linked, updated, errors })
}
