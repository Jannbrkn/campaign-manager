// app/api/send/report-email/route.ts
// Sends both report xlsx files to a manufacturer contact via Resend.
// Finds all output xlsx assets across sibling report campaigns.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

async function signUrl(admin: any, url: string): Promise<string> {
  const marker = '/campaign-assets/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  const { data } = await admin.storage.from('campaign-assets').createSignedUrl(path, 3600)
  return data?.signedUrl ?? url
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campaign_id, to, subject, body } = await req.json()
  if (!campaign_id || !to || !subject || !body) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Determine all campaign IDs to search for report assets
  const { data: campaign } = await admin
    .from('campaigns')
    .select('linked_newsletter_id, type')
    .eq('id', campaign_id)
    .single()

  const campaignIds: string[] = [campaign_id]

  if (campaign?.linked_newsletter_id) {
    // Collect all sibling report campaigns linked to the same newsletter
    const { data: siblings } = await admin
      .from('campaigns')
      .select('id')
      .eq('linked_newsletter_id', campaign.linked_newsletter_id)
    if (siblings) campaignIds.push(...siblings.map((s: any) => s.id))
  }

  // Load all output xlsx assets across sibling campaigns
  const { data: xlsxAssets } = await admin
    .from('campaign_assets')
    .select('*')
    .in('campaign_id', campaignIds)
    .eq('asset_category', 'report_xlsx')
    .eq('is_output', true)

  if (!xlsxAssets || xlsxAssets.length === 0) {
    return NextResponse.json(
      { error: 'Keine Report-Dateien gefunden. Bitte zuerst den Report generieren.' },
      { status: 400 }
    )
  }

  // Download and prepare attachments (sign URLs — bucket is private)
  const attachments: { filename: string; content: Buffer }[] = []
  for (const asset of xlsxAssets) {
    try {
      const url = await signUrl(admin, asset.file_url)
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      attachments.push({ filename: asset.file_name, content: Buffer.from(buf) })
    } catch (err) {
      console.error(`Attachment download failed: ${asset.file_name}`, err)
      // Don't block sending if one attachment fails
    }
  }

  // Convert plain text body to minimal HTML (preserve line breaks)
  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333333;max-width:560px;">${body
    .split('\n')
    .map((line: string) =>
      line.trim()
        ? `<p style="margin:0 0 10px 0;">${line}</p>`
        : `<p style="margin:0 0 6px 0;">&nbsp;</p>`
    )
    .join('')}</div>`

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: htmlBody,
    text: body,
    attachments,
  })

  if (error) {
    console.error('Resend send error:', error)
    return NextResponse.json(
      { error: error.message ?? 'E-Mail konnte nicht gesendet werden.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, attachmentCount: attachments.length })
}
