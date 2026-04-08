// app/api/send/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured, MC_SERVER } from '@/lib/mailchimp'
import { signStorageUrl } from '@/lib/supabase/storage'
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
// @ts-ignore
import mjml2html from 'mjml'

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

  // Load MJML source and image assets in parallel
  const [{ data: mjmlAsset }, { data: rawImageAssets }] = await Promise.all([
    supabase
      .from('campaign_assets')
      .select('file_url, file_name')
      .eq('campaign_id', campaign_id)
      .eq('asset_category', 'text')
      .eq('is_output', true)
      .eq('file_name', 'newsletter.mjml')
      .single(),
    supabase
      .from('campaign_assets')
      .select('file_name, file_url, file_type')
      .eq('campaign_id', campaign_id)
      .eq('asset_category', 'image')
      .eq('is_output', false),
  ])

  if (!mjmlAsset) {
    return NextResponse.json({ error: 'Kein generierter Newsletter gefunden. Bitte zuerst generieren.' }, { status: 422 })
  }

  // Fetch MJML source with a fresh signed URL
  const mjmlSignedUrl = await signStorageUrl(admin, mjmlAsset.file_url)
  const mjmlRes = await fetch(mjmlSignedUrl)
  if (!mjmlRes.ok) {
    return NextResponse.json({ error: 'MJML-Quelle konnte nicht geladen werden.' }, { status: 500 })
  }
  let mjmlSource = await mjmlRes.text()

  // Replace relative filenames in MJML with fresh signed image URLs
  const imageAssets = rawImageAssets ?? []
  const signedImageUrls = await Promise.all(
    imageAssets.map((asset) => signStorageUrl(admin, asset.file_url))
  )
  for (let i = 0; i < imageAssets.length; i++) {
    mjmlSource = mjmlSource.split(imageAssets[i].file_name).join(signedImageUrls[i])
  }

  // Compile MJML → production HTML
  const compiled = mjml2html(mjmlSource, { validationLevel: 'soft' })
  if (compiled.errors?.length > 0) {
    console.warn('[mailchimp/send] MJML soft errors:', compiled.errors.map((e: { formattedMessage?: string; message?: string }) => e.formattedMessage ?? e.message))
  }
  if (!compiled.html) {
    return NextResponse.json({ error: 'MJML konnte nicht kompiliert werden.' }, { status: 500 })
  }
  const htmlContent = compiled.html

  // Guard: block Base64 or oversized HTML before uploading to Mailchimp
  const guard = validateNewsletterHtml(htmlContent, 'newsletter-mailchimp.html')
  if (!guard.passed) {
    return NextResponse.json({ error: guard.errors.join(' | ') }, { status: 422 })
  }

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

  try {
    await mcFetch(`/campaigns/${created.id}/content`, 'PUT', { html: htmlContent })
  } catch (err: unknown) {
    // Best-effort cleanup of the empty campaign
    mcFetch(`/campaigns/${created.id}`, 'DELETE').catch(() => undefined)
    const errorMsg = err instanceof Error ? err.message : 'Mailchimp Inhalt-Upload fehlgeschlagen'
    return NextResponse.json({ error: errorMsg }, { status: 502 })
  }

  const editUrl = `https://${MC_SERVER}.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`

  // Save Mailchimp campaign ID and edit URL for persistent link
  try {
    await admin.from('campaigns').update({
      mailchimp_campaign_id: created.id,
      mailchimp_url: editUrl,
    }).eq('id', campaign_id)
  } catch {
    // Campaign was created in Mailchimp — return success but warn about DB sync failure
    return NextResponse.json({
      success: true,
      campaignId: created.id,
      editUrl,
      warnings: [...guard.warnings, 'DB-Sync fehlgeschlagen — Campaign-ID manuell notieren.'],
    })
  }

  return NextResponse.json({ success: true, campaignId: created.id, editUrl, warnings: guard.warnings })
}
