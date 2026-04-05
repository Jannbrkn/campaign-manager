// app/api/send/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MC_API_KEY = process.env.MAILCHIMP_API_KEY ?? ''
const MC_SERVER = MC_API_KEY.split('-').at(-1) ?? 'us19'
const MC_BASE = `https://${MC_SERVER}.api.mailchimp.com/3.0`

async function mcFetch(path: string, method: string, body?: object) {
  const res = await fetch(`${MC_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${MC_API_KEY}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.detail ?? json.title ?? `Mailchimp error ${res.status}`)
  return json
}

export async function POST(req: NextRequest) {
  const { campaign_id, subject } = await req.json()
  if (!campaign_id || !subject) {
    return NextResponse.json({ error: 'campaign_id and subject required' }, { status: 400 })
  }
  if (!MC_API_KEY) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Load campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign || campaign.type !== 'newsletter') {
    return NextResponse.json({ error: 'Newsletter campaign not found' }, { status: 404 })
  }

  // Get the newsletter preview HTML (output asset)
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

  // Sign the preview URL (private bucket)
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

  // 1. Create campaign
  const created = await mcFetch('/campaigns', 'POST', {
    type: 'regular',
    settings: {
      subject_line: subject,
      title: `${campaign.title} — ${new Date().toISOString().split('T')[0]}`,
      from_name: fromName,
      reply_to: fromEmail,
    },
  })

  // 2. Set HTML content
  await mcFetch(`/campaigns/${created.id}/content`, 'PUT', {
    html: htmlContent,
  })

  const editUrl = `https://us19.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`

  return NextResponse.json({ success: true, campaignId: created.id, editUrl })
}
