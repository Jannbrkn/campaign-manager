// app/api/send/mailchimp/check/route.ts
// Verifies whether the stored Mailchimp campaign still exists.
// Returns { exists: true, editUrl } or { exists: false }.
// If deleted, clears mailchimp_campaign_id and mailchimp_url from DB.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MC_BASE, mcConfigured } from '@/lib/mailchimp'

function mcAuthHeader() {
  const key = process.env.MAILCHIMP_API_KEY ?? ''
  return `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}`
}

export async function GET(req: NextRequest) {
  const campaign_id = req.nextUrl.searchParams.get('campaign_id')
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('mailchimp_campaign_id, mailchimp_url')
    .eq('id', campaign_id)
    .single()

  if (!campaign?.mailchimp_campaign_id) {
    return NextResponse.json({ exists: false })
  }

  // Check if the campaign still exists in Mailchimp
  const res = await fetch(`${MC_BASE}/campaigns/${campaign.mailchimp_campaign_id}`, {
    headers: { Authorization: mcAuthHeader() },
  })

  if (res.ok) {
    return NextResponse.json({ exists: true, editUrl: campaign.mailchimp_url })
  }

  // Campaign gone (404 or other error) — clear the stale references
  const admin = createAdminClient()
  await admin
    .from('campaigns')
    .update({ mailchimp_campaign_id: null, mailchimp_url: null })
    .eq('id', campaign_id)

  return NextResponse.json({ exists: false })
}
