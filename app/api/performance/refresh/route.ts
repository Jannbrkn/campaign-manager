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
    // Kein status-Filter — alle Kampagnen holen (sent, draft, etc.)
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
      // manufacturers(name) ist neu — brauchen wir für den Titel-Match
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(name, agencies(name))')
      .eq('type', 'newsletter'),
  ])

  let linked = 0

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue

      const dbTime = new Date(db.scheduled_date).getTime()
      const mfgName = (db.manufacturers as any)?.name?.toLowerCase() ?? ''
      // Ersten Wortteil des Herstellernamens als Suchbegriff (z.B. "salvatori", "lodes", "b&b")
      const firstWord = mfgName.split(' ')[0]

      // Schritt 1: Kandidaten über Herstellername im MC-Titel filtern
      const candidates = firstWord
        ? mcCampaigns.filter((mc) => {
            const mcTitle = (
              mc.settings?.title ?? mc.settings?.subject_line ?? ''
            ).toLowerCase()
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
      // (greift wenn Hersteller-Name in MC-Titel nicht vorkommt)
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
      // 404 = Kampagne noch nicht versendet → kein Report vorhanden, kein echter Fehler
      if (!msg.includes('404')) errors.push(`${campaign.id}: ${msg}`)
    }
  }

  return NextResponse.json({ linked, updated, errors })
}
