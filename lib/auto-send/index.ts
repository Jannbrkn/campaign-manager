// lib/auto-send/index.ts
// Monday auto-send: sends approved reports to configured email addresses.
// SAFETY: Only campaigns with review_approved = true are ever sent.

import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
const APP_URL = process.env.APP_URL ?? 'https://campaign-manager-three.vercel.app'

async function signUrl(admin: any, url: string): Promise<string> {
  const marker = '/campaign-assets/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  const { data } = await admin.storage.from('campaign-assets').createSignedUrl(path, 3600)
  return data?.signedUrl ?? url
}

export interface AutoSendResult {
  sent: number
  skipped: number
  errors: string[]
}

export async function runAutoSend(): Promise<AutoSendResult> {
  const admin = createAdminClient()
  const result: AutoSendResult = { sent: 0, skipped: 0, errors: [] }

  // Find all report campaigns eligible for auto-send:
  // - review_approved = true (HARD GATE — nothing goes without this)
  // - auto_send_emails is set and non-empty
  // - status is not 'sent'
  const { data: candidates } = await admin
    .from('campaigns')
    .select('*, manufacturers(name, agencies(name))')
    .in('type', ['report_internal', 'report_external'])
    .eq('review_approved', true)
    .not('auto_send_emails', 'is', null)
    .neq('status', 'sent')

  if (!candidates || candidates.length === 0) return result

  for (const campaign of candidates) {
    const emails: string[] = campaign.auto_send_emails ?? []
    if (emails.length === 0) {
      result.skipped++
      continue
    }

    // Load output xlsx assets for this campaign
    const { data: assets } = await admin
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('asset_category', 'report_xlsx')
      .eq('is_output', true)

    if (!assets || assets.length === 0) {
      result.skipped++
      result.errors.push(`${campaign.title}: Keine Report-Dateien gefunden — übersprungen`)
      continue
    }

    // Download assets and prepare attachments
    const attachments: { filename: string; content: Buffer }[] = []
    for (const asset of assets) {
      try {
        const url = await signUrl(admin, asset.file_url)
        const res = await fetch(url)
        if (!res.ok) continue
        const buf = await res.arrayBuffer()
        attachments.push({ filename: asset.file_name, content: Buffer.from(buf) })
      } catch (err: any) {
        result.errors.push(`${campaign.title}: Anhang ${asset.file_name} konnte nicht geladen werden`)
      }
    }

    if (attachments.length === 0) {
      result.skipped++
      result.errors.push(`${campaign.title}: Keine Anhänge — übersprungen`)
      continue
    }

    const mfg = (campaign as any).manufacturers
    const typeLabel = campaign.type === 'report_internal' ? 'Interner Report' : 'Externe Auswertung'
    const calendarLink = `${APP_URL}/calendar?date=${campaign.scheduled_date}`

    const subject = `${typeLabel}: ${campaign.title}`
    const bodyText = `Hallo,

anbei der ${typeLabel.toLowerCase()} für ${campaign.title}${mfg?.name ? ` (${mfg.name})` : ''}.

Bei Fragen oder Änderungswünschen meldet euch gerne.

Viele Grüße,
Jann`

    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;max-width:560px;">
${bodyText.split('\n').map((line: string) => line.trim()
  ? `<p style="margin:0 0 10px 0;">${line}</p>`
  : `<p style="margin:0 0 6px 0;">&nbsp;</p>`
).join('')}
<p style="margin:16px 0 0;font-size:12px;color:#999;">
  <a href="${calendarLink}" style="color:#999;">Im Kalender anzeigen</a>
</p>
</div>`

    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: emails,
        subject,
        html: htmlBody,
        text: bodyText,
        attachments,
      })

      if (error) {
        result.errors.push(`${campaign.title}: ${error.message}`)
        continue
      }

      // Mark campaign as sent
      await admin
        .from('campaigns')
        .update({ status: 'sent' })
        .eq('id', campaign.id)

      result.sent++
    } catch (err: any) {
      result.errors.push(`${campaign.title}: ${err.message ?? 'Unbekannter Fehler'}`)
    }
  }

  return result
}
