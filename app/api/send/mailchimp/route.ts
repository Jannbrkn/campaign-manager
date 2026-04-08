// app/api/send/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured, MC_SERVER } from '@/lib/mailchimp'
import { signStorageUrl } from '@/lib/supabase/storage'
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
import JSZip from 'jszip'

export async function POST(req: NextRequest) {
  let body: { campaign_id?: string; subject?: string; preview_text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { campaign_id, subject, preview_text } = body
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

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (campaignError) return NextResponse.json({ error: 'DB-Fehler beim Laden der Kampagne' }, { status: 500 })
  if (!campaign || campaign.type !== 'newsletter') {
    return NextResponse.json({ error: 'Newsletter campaign not found' }, { status: 404 })
  }

  // --- Load the latest newsletter ZIP from Supabase ---
  const { data: zipAssets } = await supabase
    .from('campaign_assets')
    .select('file_url, file_name')
    .eq('campaign_id', campaign_id)
    .eq('is_output', true)
    .like('file_name', 'newsletter%.zip')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!zipAssets?.length) {
    return NextResponse.json({ error: 'Keine ZIP-Datei gefunden. Bitte Newsletter zuerst generieren.' }, { status: 422 })
  }

  // --- Download and extract ZIP ---
  const zipSignedUrl = await signStorageUrl(admin, zipAssets[0].file_url)
  const zipRes = await fetch(zipSignedUrl)
  if (!zipRes.ok) {
    return NextResponse.json({ error: 'ZIP konnte nicht geladen werden.' }, { status: 500 })
  }
  const zipBuffer = await zipRes.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuffer)

  // --- Extract HTML from ZIP ---
  const htmlFile = zip.file('newsletter.html')
  if (!htmlFile) {
    return NextResponse.json({ error: 'newsletter.html nicht in ZIP gefunden.' }, { status: 422 })
  }
  let htmlContent = await htmlFile.async('string')

  // --- Upload each image to Mailchimp File Manager ---
  const imageFiles = Object.keys(zip.files).filter(
    (name) => !name.endsWith('.html') && !zip.files[name].dir
  )

  for (const imageName of imageFiles) {
    const imageData = await zip.files[imageName].async('base64')
    try {
      const uploaded = await mcFetch('/file-manager/files', 'POST', {
        name: imageName,
        file_data: imageData,
      })
      if (uploaded?.full_size_url) {
        htmlContent = htmlContent.split(imageName).join(uploaded.full_size_url)
      }
    } catch (err) {
      console.warn(`[mailchimp] Bild-Upload fehlgeschlagen: ${imageName}`, err)
    }
  }

  // --- Validate HTML before sending ---
  const guard = validateNewsletterHtml(htmlContent, 'newsletter-mailchimp.html')
  if (!guard.passed) {
    return NextResponse.json({ error: guard.errors.join(' | ') }, { status: 422 })
  }

  // --- Create Mailchimp campaign ---
  const mfg = campaign.manufacturers as { agencies?: { name?: string; order_email?: string } | null } | null | undefined
  const fromName = mfg?.agencies?.name ?? 'Collezioni Design Syndicate'
  const fromEmail = mfg?.agencies?.order_email ?? 'newsletter@collezioni.eu'

  let created: { id: string; web_id: number }
  try {
    created = await mcFetch('/campaigns', 'POST', {
      type: 'regular',
      settings: {
        subject_line: subject,
        preview_text: preview_text ?? '',
        title: `${campaign.title} — ${new Date().toISOString().split('T')[0]}`,
        from_name: fromName,
        reply_to: fromEmail,
      },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Mailchimp API-Fehler'
    return NextResponse.json({ error: errorMsg }, { status: 502 })
  }

  // --- Upload HTML content to campaign ---
  try {
    await mcFetch(`/campaigns/${created.id}/content`, 'PUT', { html: htmlContent })
  } catch (err: unknown) {
    mcFetch(`/campaigns/${created.id}`, 'DELETE').catch(() => undefined)
    const errorMsg = err instanceof Error ? err.message : 'Mailchimp Inhalt-Upload fehlgeschlagen'
    return NextResponse.json({ error: errorMsg }, { status: 502 })
  }

  const editUrl = `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`

  // --- Save Mailchimp references in DB ---
  try {
    await admin.from('campaigns').update({
      mailchimp_campaign_id: created.id,
      mailchimp_url: editUrl,
    }).eq('id', campaign_id)
  } catch {
    return NextResponse.json({
      success: true,
      campaignId: created.id,
      editUrl,
      warnings: [...guard.warnings, 'DB-Sync fehlgeschlagen — Campaign-ID manuell notieren.'],
    })
  }

  return NextResponse.json({ success: true, campaignId: created.id, editUrl, warnings: guard.warnings })
}
