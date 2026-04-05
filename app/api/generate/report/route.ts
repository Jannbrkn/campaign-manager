// app/api/generate/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReports } from '@/lib/generate/report'
import type { CampaignAsset } from '@/lib/supabase/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the triggering campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!campaign.linked_newsletter_id) {
    return NextResponse.json(
      { error: 'Kein verlinkter Newsletter. Report-Kampagne muss mit Newsletter verknüpft sein.' },
      { status: 400 }
    )
  }

  // Find sibling report campaigns (same linked_newsletter_id)
  const { data: siblings } = await supabase
    .from('campaigns')
    .select('id, type')
    .eq('linked_newsletter_id', campaign.linked_newsletter_id)

  const internalId = siblings?.find((s: any) => s.type === 'report_internal')?.id
  const externalId = siblings?.find((s: any) => s.type === 'report_external')?.id

  if (!internalId && !externalId) {
    return NextResponse.json(
      { error: 'Keine Report-Kampagnen (intern/extern) für diesen Newsletter gefunden.' },
      { status: 400 }
    )
  }

  // Find CSV asset — search chain: own → newsletter → postcard
  let csvAsset: CampaignAsset | null = null

  const searchIds = [campaign_id, campaign.linked_newsletter_id]

  // Also check the postcard linked to the newsletter
  const { data: newsletter } = await supabase
    .from('campaigns')
    .select('linked_postcard_id')
    .eq('id', campaign.linked_newsletter_id)
    .single()
  if (newsletter?.linked_postcard_id) {
    searchIds.push(newsletter.linked_postcard_id)
  }

  for (const id of searchIds) {
    const { data: assets } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', id)
      .eq('asset_category', 'csv_export')
      .order('created_at', { ascending: false })
      .limit(1)
    if (assets && assets.length > 0) {
      csvAsset = assets[0] as CampaignAsset
      break
    }
  }

  if (!csvAsset) {
    return NextResponse.json(
      {
        error:
          'Kein CSV-Asset gefunden. Bitte CSV (Mailchimp-Export) auf dieser, der Newsletter- oder Postkarten-Kampagne hochladen.',
      },
      { status: 400 }
    )
  }

  // Download CSV
  const csvRes = await fetch(csvAsset.file_url)
  if (!csvRes.ok) {
    return NextResponse.json({ error: 'CSV konnte nicht geladen werden.' }, { status: 500 })
  }
  const csvText = await csvRes.text()

  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any
  const dateStr = new Date().toISOString().split('T')[0]

  try {
    const { internalBuffer, externalBuffer } = await generateReports({
      csvText,
      manufacturerName: mfg?.name ?? 'Unbekannt',
      agencyName: agency?.name ?? 'Collezioni',
      campaignTitle: campaign.title,
      campaignDate: dateStr,
    })

    const mfgSlug = (mfg?.name ?? 'report').replace(/[^a-zA-Z0-9]/g, '_')

    // Upload internal XLSX
    if (internalId) {
      const intPath = `${internalId}/${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`
      await supabase.storage
        .from('campaign-assets')
        .upload(intPath, internalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: intUrl } = supabase.storage.from('campaign-assets').getPublicUrl(intPath)

      await supabase.from('campaign_assets').delete().eq('campaign_id', internalId).eq('is_output', true)
      await supabase.from('campaign_assets').insert({
        campaign_id: internalId,
        file_name: `${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: intUrl.publicUrl,
        file_size: internalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await supabase.from('campaigns').update({ status: 'review' }).eq('id', internalId)
    }

    // Upload external XLSX
    if (externalId) {
      const extPath = `${externalId}/${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`
      await supabase.storage
        .from('campaign-assets')
        .upload(extPath, externalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: extUrl } = supabase.storage.from('campaign-assets').getPublicUrl(extPath)

      await supabase.from('campaign_assets').delete().eq('campaign_id', externalId).eq('is_output', true)
      await supabase.from('campaign_assets').insert({
        campaign_id: externalId,
        file_name: `${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: extUrl.publicUrl,
        file_size: externalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await supabase.from('campaigns').update({ status: 'review' }).eq('id', externalId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Report generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
