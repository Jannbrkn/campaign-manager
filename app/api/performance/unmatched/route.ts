// app/api/performance/unmatched/route.ts
// Diagnostic endpoint — shows DB campaigns that couldn't be auto-matched
// along with ranked candidate MC campaigns for manual verification.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcConfigured, fetchAllMcCampaigns } from '@/lib/mailchimp'
import { scoreMatch } from '@/lib/mailchimp/matching'

export const maxDuration = 60

interface Candidate {
  mc_id: string
  mc_title: string
  mc_subject: string
  send_time: string
  diff_days: number
  score: number
  reasons: string[]
}

interface UnmatchedDbCampaign {
  campaign_id: string
  title: string
  scheduled_date: string
  manufacturer_name: string
  agency_name: string
  candidates: Candidate[]  // top 5 ranked MC matches (score may be below threshold)
}

interface UnusedMcCampaign {
  mc_id: string
  web_id: number | string
  title: string
  subject: string
  send_time: string
  emails_sent?: number
}

export async function GET() {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  // Pull everything in parallel
  const [mcCampaigns, { data: dbCampaigns }, { data: allLinkedDb }] = await Promise.all([
    fetchAllMcCampaigns({ onlySent: true }),
    admin
      .from('campaigns')
      .select('id, title, scheduled_date, mailchimp_campaign_id, manufacturers(name, agencies(name))')
      .eq('type', 'newsletter')
      .is('mailchimp_campaign_id', null)
      .lte('scheduled_date', today.toISOString().slice(0, 10)),
    admin
      .from('campaigns')
      .select('mailchimp_campaign_id')
      .not('mailchimp_campaign_id', 'is', null),
  ])

  const usedMcIds = new Set(
    (allLinkedDb ?? []).map((c: any) => c.mailchimp_campaign_id).filter(Boolean)
  )

  // ── Unmatched DB campaigns with top candidates ────────────────────────────
  const unmatchedDb: UnmatchedDbCampaign[] = []
  for (const db of dbCampaigns ?? []) {
    if (!db.scheduled_date) continue

    // Score every MC campaign against this DB entry
    const scored = mcCampaigns
      .map((mc) => {
        const { score, diffDays, reasons } = scoreMatch(
          {
            id: db.id,
            title: db.title,
            scheduled_date: db.scheduled_date,
            manufacturer_name: (db.manufacturers as any)?.name ?? '',
          },
          mc
        )
        return {
          mc_id: mc.id,
          mc_title: mc.settings?.title ?? '',
          mc_subject: mc.settings?.subject_line ?? '',
          send_time: mc.send_time,
          diff_days: diffDays,
          score,
          reasons,
        } as Candidate
      })
      .filter((c) => c.diff_days <= 60)  // show anything within 2 months for manual review
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    unmatchedDb.push({
      campaign_id: db.id,
      title: db.title,
      scheduled_date: db.scheduled_date,
      manufacturer_name: (db.manufacturers as any)?.name ?? '—',
      agency_name: (db.manufacturers as any)?.agencies?.name ?? '—',
      candidates: scored,
    })
  }

  // ── MC campaigns that no DB campaign links to ─────────────────────────────
  const unusedMc: UnusedMcCampaign[] = mcCampaigns
    .filter((mc) => !usedMcIds.has(mc.id))
    .map((mc) => ({
      mc_id: mc.id,
      web_id: mc.web_id,
      title: mc.settings?.title ?? '',
      subject: mc.settings?.subject_line ?? '',
      send_time: mc.send_time,
    }))
    .sort((a, b) => new Date(b.send_time).getTime() - new Date(a.send_time).getTime())

  return NextResponse.json({
    unmatchedDbCount: unmatchedDb.length,
    unusedMcCount: unusedMc.length,
    unmatchedDb: unmatchedDb.sort(
      (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
    ),
    unusedMc,
  })
}
