// app/api/generate/newsletter/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateNewsletter } from '@/lib/generate/newsletter'
import { signStorageUrl } from '@/lib/supabase/storage'
import type { CampaignAsset, CampaignWithManufacturer } from '@/lib/supabase/types'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { campaign_id, feedback } = await req.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Load input assets for this campaign (exclude existing outputs)
  const { data: rawAssets } = await supabase
    .from('campaign_assets')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('is_output', false)

  const assets = (rawAssets ?? []) as CampaignAsset[]

  // Load postcard assets if linked
  let postcardAssets: CampaignAsset[] = []
  if (campaign.linked_postcard_id) {
    const { data: pcRaw } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', campaign.linked_postcard_id)
      .eq('is_output', false)
    postcardAssets = (pcRaw ?? []) as CampaignAsset[]
  }

  // Sign all asset URLs so server-side fetches work with private bucket (admin bypasses RLS)
  const [signedAssets, signedPostcardAssets] = await Promise.all([
    Promise.all(assets.map(async (a) => ({ ...a, file_url: await signStorageUrl(admin, a.file_url) }))),
    Promise.all(postcardAssets.map(async (a) => ({ ...a, file_url: await signStorageUrl(admin, a.file_url) }))),
  ])

  // Helper: upload to storage via admin client (bypasses RLS)
  const uploadAsset = async (
    path: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<string> => {
    const { error: uploadError } = await admin.storage
      .from('campaign-assets')
      .upload(path, data, { upsert: true, contentType })
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)
    const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
    return urlData.publicUrl
  }

  // Sign logo URLs for agency and manufacturer (bucket is private)
  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any
  if (agency?.logo_url) agency.logo_url = await signStorageUrl(admin, agency.logo_url)
  if (mfg?.logo_url) mfg.logo_url = await signStorageUrl(admin, mfg.logo_url)

  try {
    const { mjmlSource, zipBuffer, previewHtml } = await generateNewsletter({
      campaign: campaign as CampaignWithManufacturer,
      assets: signedAssets,
      postcardAssets: signedPostcardAssets,
      briefing: campaign.briefing ?? undefined,
      feedback: feedback ?? undefined,
    })

    const dateStr = new Date().toISOString().split('T')[0]

    const zipUrl = await uploadAsset(
      `${campaign_id}/newsletter-${dateStr}.zip`,
      zipBuffer,
      'application/zip'
    )
    const mjmlUrl = await uploadAsset(
      `${campaign_id}/newsletter.mjml`,
      new TextEncoder().encode(mjmlSource),
      'text/plain'
    )
    const previewUrl = await uploadAsset(
      `${campaign_id}/newsletter-preview.html`,
      new TextEncoder().encode(previewHtml),
      'text/html'
    )

    // Replace existing output assets
    await admin.from('campaign_assets').delete().eq('campaign_id', campaign_id).eq('is_output', true)

    await admin.from('campaign_assets').insert([
      {
        campaign_id,
        file_name: `newsletter-${dateStr}.zip`,
        file_type: 'application/zip',
        file_url: zipUrl,
        file_size: zipBuffer.length,
        asset_category: 'newsletter_zip',
        is_output: true,
      },
      {
        campaign_id,
        file_name: 'newsletter.mjml',
        file_type: 'text/plain',
        file_url: mjmlUrl,
        file_size: Buffer.byteLength(mjmlSource, 'utf8'),
        asset_category: 'text',
        is_output: true,
      },
      {
        campaign_id,
        file_name: 'newsletter-preview.html',
        file_type: 'text/html',
        file_url: previewUrl,
        file_size: Buffer.byteLength(previewHtml, 'utf8'),
        asset_category: 'newsletter_preview',
        is_output: true,
      },
    ])

    await admin.from('campaigns').update({ status: 'review' }).eq('id', campaign_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Newsletter generation error:', err)

    // Save raw MJML if available and update status + notes
    if (err.message?.startsWith('INVALID_MJML:') || err.message?.startsWith('MJML_ERROR:')) {
      const parts = err.message.split('|||')
      const rawMjml = parts.length > 1 ? parts[1] : err.message.split(':').slice(1).join(':')
      if (rawMjml) {
        const path = `${campaign_id}/newsletter-invalid-${Date.now()}.mjml`
        await admin.storage
          .from('campaign-assets')
          .upload(path, new TextEncoder().encode(rawMjml), { upsert: true, contentType: 'text/plain' })
        const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
        await admin.from('campaign_assets').insert({
          campaign_id,
          file_name: 'newsletter-invalid.mjml',
          file_type: 'text/plain',
          file_url: urlData.publicUrl,
          file_size: rawMjml.length,
          asset_category: 'text',
          is_output: true,
        })
      }
      await admin
        .from('campaigns')
        .update({ status: 'assets_pending', notes: `Generierungsfehler: ${err.message.split('|||')[0]}` })
        .eq('id', campaign_id)
      return NextResponse.json({ error: err.message }, { status: 422 })
    }

    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
