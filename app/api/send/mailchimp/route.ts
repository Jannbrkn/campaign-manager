// app/api/send/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'

export async function POST(req: NextRequest) {
  const { campaign_id, subject } = await req.json()
  if (!campaign_id || !subject) {
    return NextResponse.json({ error: 'campaign_id and subject required' }, { status: 400 })
  }
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign || campaign.type !== 'newsletter') {
    return NextResponse.json({ error: 'Newsletter campaign not found' }, { status: 404 })
  }

  const { data: previewAsset } = await supabase
    .from('campaign_assets')
    .select('file_url')
    .eq('campaign_id', campaign_id)
    .eq('asset_category', 'newsletter_preview')
    .eq('is_output', true)
    .single()

  if (!previewAsset) {
    return NextResponse.json({ error: 'Kein generierter Newsletter gefunden. Bitte zuerst generieren.' }, { status: 422 })
  }

  const marker = '/campaign-assets/'
  const idx = previewAsset.file_url.indexOf(marker)
  let htmlContent = ''

  if (idx !== -1) {
    const path = decodeURIComponent(previewAsset.file_url.slice(idx + marker.length).split('?')[0])
    const { data: signed } = await admin.storage.from('campaign-assets').createSignedUrl(path, 300)
    if (signed?.signedUrl) {
      const htmlRes = await fetch(signed.signedUrl)
      if (htmlRes.ok) htmlContent = await htmlRes.text()
    }
  }

  if (!htmlContent) {
    return NextResponse.json({ error: 'Newsletter-HTML konnte nicht geladen werden' }, { status: 500 })
  }

  const mfg = campaign.manufacturers as any
  const fromName = mfg?.agencies?.name ?? 'Collezioni Design Syndicate'
  const fromEmail = mfg?.agencies?.order_email ?? 'newsletter@collezioni.eu'

  const created = await mcFetch('/campaigns', 'POST', {
    type: 'regular',
    settings: {
      subject_line: subject,
      title: `${campaign.title} — ${new Date().toISOString().split('T')[0]}`,
      from_name: fromName,
      reply_to: fromEmail,
    },
  })

  await mcFetch(`/campaigns/${created.id}/content`, 'PUT', { html: htmlContent })

  const editUrl = `https://us19.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`

  // Save Mailchimp campaign ID and edit URL for persistent link
  await admin.from('campaigns').update({
    mailchimp_campaign_id: created.id,
    mailchimp_url: editUrl,
  }).eq('id', campaign_id)

  return NextResponse.json({ success: true, campaignId: created.id, editUrl })
}
