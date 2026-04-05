// app/api/performance/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'

export const maxDuration = 60

export async function POST(_req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Load all campaigns that have a Mailchimp campaign ID
  const { data: campaigns } = await admin
    .from('campaigns')
    .select('id, mailchimp_campaign_id')
    .not('mailchimp_campaign_id', 'is', null)

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ updated: 0, errors: [] })
  }

  let updated = 0
  const errors: string[] = []

  for (const campaign of campaigns) {
    try {
      const report = await mcFetch(`/reports/${campaign.mailchimp_campaign_id}`, 'GET')
      const stats = {
        open_rate: report.opens?.open_rate ?? report.report_summary?.open_rate ?? 0,
        click_rate: report.clicks?.click_rate ?? report.report_summary?.click_rate ?? 0,
        emails_sent: report.emails_sent ?? 0,
        unsubscribes: report.unsubscribed ?? null,
        source: 'api' as const,
      }
      await admin.from('campaigns').update({ performance_stats: stats }).eq('id', campaign.id)
      updated++
    } catch (err: any) {
      errors.push(`${campaign.id}: ${err.message}`)
    }
  }

  return NextResponse.json({ updated, errors })
}
