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
  // Nur gesendete Kampagnen für Matching nutzen — Drafts haben keinen Report
  return all.filter((mc) => mc.status === 'sent')
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
    fetchAllMailchimpCampaigns(),
    admin
      .from('campaigns')
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(name, agencies(name))')
      .eq('type', 'newsletter'),
  ])

  let linked = 0
  const linkedDetails: { db_title: string; mc_title: string; diff_days: number }[] = []
  const noMatch: string[] = []

  if (dbCampaigns) {
    for (const db of dbCampaigns) {
      if (db.mailchimp_campaign_id) continue
      if (!db.scheduled_date) continue

      const dbTime = new Date(db.scheduled_date).getTime()
      const mfgName = (db.manufacturers as any)?.name?.toLowerCase() ?? ''
      const firstWord = mfgName.split(' ')[0]

      // Kandidaten: MC-Kampagnen deren Titel den Herstellernamen enthält
      const candidates = firstWord
        ? mcCampaigns.filter((mc) => {
            const mcTitle = (mc.settings?.title ?? mc.settings?.subject_line ?? '').toLowerCase()
            return mcTitle.includes(firstWord)
          })
        : mcCampaigns

      // Besten Match per Sendedatum (±7 Tage) finden
      let best: any = null
      let bestDiff = Infinity

      for (const mc of candidates) {
        // send_time ist garantiert vorhanden (nur status=sent gefiltert)
        const diff = Math.abs(dbTime - new Date(mc.send_time).getTime()) / 86_400_000
        if (diff <= 7 && diff < bestDiff) {
          bestDiff = diff
          best = mc
        }
      }

      // Fallback: kein Namens-Match → alle gesendeten MC-Kampagnen, ±3 Tage
      if (!best && firstWord) {
        for (const mc of mcCampaigns) {
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
          mc_title: best.settings?.title ?? best.id,
          diff_days: Math.round(bestDiff * 10) / 10,
        })
      } else {
        // Kein Match — wahrscheinlich noch nicht versendet
        noMatch.push(db.title)
      }
    }
  }

  // ── Phase 2: Stats fetchen ───────────────────────────────────────────────

  const { data: toRefresh } = await admin
    .from('campaigns')
    .select('id, title, mailchimp_campaign_id')
    .not('mailchimp_campaign_id', 'is', null)

  let updated = 0
  const errors: string[] = []
  const statsDetails: {
    title: string
    open_rate: number
    click_rate: number
    emails_sent: number
  }[] = []

  for (const campaign of toRefresh ?? []) {
    try {
      const report = await mcFetch(`/reports/${campaign.mailchimp_campaign_id}`, 'GET')

      // report.opens.open_rate und report.clicks.click_rate sind die korrekten Felder
      // in der Mailchimp Reports API v3 für reguläre Kampagnen
      const open_rate = report.opens?.open_rate ?? report.report_summary?.open_rate ?? 0
      const click_rate = report.clicks?.click_rate ?? report.report_summary?.click_rate ?? 0
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
    errors,
    linkedDetails,  // neue Matches dieser Session
    noMatch,        // DB-Kampagnen ohne MC-Match (wahrscheinlich noch nicht versendet)
    statsDetails,   // Stats als Prozentwerte — sofort lesbar
  })
}
