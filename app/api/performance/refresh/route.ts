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
      `/campaigns?count=${count}&offset=${offset}&fields=campaigns.id,campaigns.web_id,campaigns.settings,campaigns.send_time,campaigns.status`,
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

  // ── Phase 1: Mailchimp-Kampagnen holen und matchen ───────────────────────

  const [mcCampaigns, { data: dbCampaigns }] = await Promise.all([
    fetchAllMailchimpCampaigns(),
    admin
      .from('campaigns')
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(name, agencies(name))')
      .eq('type', 'newsletter'),
  ])

  let linked = 0
  const linkedDetails: { db_title: string; mc_title: string; mc_id: string }[] = []

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue

      const dbTime = new Date(db.scheduled_date).getTime()
      const mfgName = (db.manufacturers as any)?.name?.toLowerCase() ?? ''
      const firstWord = mfgName.split(' ')[0]

      // Schritt 1: Kandidaten über Herstellername im MC-Titel
      const candidates = firstWord
        ? mcCampaigns.filter((mc) => {
            const mcTitle = (mc.settings?.title ?? mc.settings?.subject_line ?? '').toLowerCase()
            return mcTitle.includes(firstWord)
          })
        : []

      let best: any = null
      let bestDiff = Infinity

      // Schritt 2a: Unter Kandidaten — nächste per Sendedatum (±14 Tage)
      for (const mc of candidates) {
        if (!mc.send_time) continue
        const diff = Math.abs(dbTime - new Date(mc.send_time).getTime()) / 86_400_000
        if (diff <= 14 && diff < bestDiff) {
          bestDiff = diff
          best = mc
        }
      }

      // Schritt 2b: Genau ein Kandidat ohne send_time (Draft) → direkt nehmen
      if (!best && candidates.length === 1) {
        best = candidates[0]
      }

      // Schritt 3: Fallback — nur Datum ±3 Tage über alle MC-Kampagnen
      if (!best) {
        for (const mc of mcCampaigns) {
          if (!mc.send_time) continue
          const diff = Math.abs(dbTime - new Date(mc.send_time).getTime()) / 86_400_000
          if (diff <= 3 && diff < bestDiff) {
            bestDiff = diff
            best = mc
          }
        }
      }

      if (best) {
        await admin
          .from('campaigns')
          .update({
            mailchimp_campaign_id: best.id,
            mailchimp_url: `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${best.web_id}`,
          })
          .eq('id', db.id)
        linked++
        linkedDetails.push({
          db_title: db.title,
          mc_title: best.settings?.title ?? best.settings?.subject_line ?? best.id,
          mc_id: best.id,
        })
      }
    }
  }

  // ── Phase 2: Stats für alle verknüpften Kampagnen fetchen ────────────────

  const { data: toRefresh } = await admin
    .from('campaigns')
    .select('id, title, mailchimp_campaign_id')
    .not('mailchimp_campaign_id', 'is', null)

  let updated = 0
  const errors: string[] = []
  const statsDetails: { title: string; open_rate: number; click_rate: number; emails_sent: number }[] = []

  for (const campaign of toRefresh ?? []) {
    try {
      const report = await mcFetch(`/reports/${campaign.mailchimp_campaign_id}`, 'GET')

      // report_summary ist der korrekte Pfad in der Mailchimp Reports API v3
      // report.opens / report.clicks sind Objekte mit Rohdaten, NICHT mit den rate-Feldern
      const open_rate = report.report_summary?.open_rate ?? 0
      const click_rate = report.report_summary?.click_rate ?? 0
      const emails_sent = report.emails_sent ?? 0
      const unsubscribes = report.unsubscribes?.count ?? report.unsubscribed ?? 0

      const { error } = await admin
        .from('campaigns')
        .update({
          performance_stats: {
            open_rate,
            click_rate,
            emails_sent,
            unsubscribes,
            source: 'api',
          },
        })
        .eq('id', campaign.id)

      if (error) throw new Error(error.message)
      updated++
      statsDetails.push({
        title: (campaign as any).title ?? campaign.id,
        open_rate,
        click_rate,
        emails_sent,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // 404 = noch nicht versendet → kein Report vorhanden, kein echter Fehler
      if (!msg.includes('404')) errors.push(`${(campaign as any).title ?? campaign.id}: ${msg}`)
    }
  }

  return NextResponse.json({
    linked,
    updated,
    errors,
    linkedDetails,   // zeigt welche DB-Kampagnen neu mit welchem MC-Titel gematcht wurden
    statsDetails,    // zeigt die gezogenen Stats pro Kampagne — hier siehst du sofort ob die Zahlen stimmen
  })
}
