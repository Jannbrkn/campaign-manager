// app/api/generate/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReports, detectCsvType } from '@/lib/generate/report'
import type { CampaignAsset } from '@/lib/supabase/types'

export const maxDuration = 60

async function signUrl(supabase: any, url: string): Promise<string> {
  const marker = '/campaign-assets/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  const { data } = await supabase.storage.from('campaign-assets').createSignedUrl(path, 3600)
  return data?.signedUrl ?? url
}

function parseCsvStats(csvText: string): { total: number; opens: number; clicks: number } {
  const lines = csvText.trim().split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { total: 0, opens: 0, clicks: 0 }
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim())
  const opensIdx = header.findIndex((h) => /number.of.opens/i.test(h))
  const clicksIdx = header.findIndex((h) => /number.of.clicks/i.test(h))
  let opens = 0
  let clicks = 0
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (opensIdx >= 0 && Number(cols[opensIdx] ?? 0) > 0) opens++
    if (clicksIdx >= 0 && Number(cols[clicksIdx] ?? 0) > 0) clicks++
  }
  return { total: lines.length - 1, opens, clicks }
}

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()

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

  // Find sibling report campaigns when linked to a newsletter chain
  let internalId: string | undefined
  let externalId: string | undefined

  if (campaign.linked_newsletter_id) {
    const { data: siblings } = await supabase
      .from('campaigns')
      .select('id, type')
      .eq('linked_newsletter_id', campaign.linked_newsletter_id)

    internalId = siblings?.find((s: any) => s.type === 'report_internal')?.id
    externalId = siblings?.find((s: any) => s.type === 'report_external')?.id
  }

  // When not linked to a newsletter, store outputs on the triggering campaign itself
  if (!internalId && !externalId) {
    if (campaign.type === 'report_internal') internalId = campaign_id
    else if (campaign.type === 'report_external') externalId = campaign_id
    else {
      // Untyped or standalone campaign — generate both on this campaign
      internalId = campaign_id
      externalId = campaign_id
    }
  }

  // Find all CSV assets — search chain: own campaign → linked newsletter → linked postcard
  const searchIds: string[] = [campaign_id]

  if (campaign.linked_newsletter_id) {
    searchIds.push(campaign.linked_newsletter_id)
    const { data: newsletter } = await supabase
      .from('campaigns')
      .select('linked_postcard_id')
      .eq('id', campaign.linked_newsletter_id)
      .single()
    if (newsletter?.linked_postcard_id) searchIds.push(newsletter.linked_postcard_id)
  }

  const allCsvAssets: CampaignAsset[] = []
  for (const id of searchIds) {
    const { data: assets } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', id)
      .eq('asset_category', 'csv_export')
      .order('created_at', { ascending: false })
    if (assets) allCsvAssets.push(...(assets as CampaignAsset[]))
  }

  if (allCsvAssets.length === 0) {
    return NextResponse.json(
      { error: 'Keine CSV-Dateien gefunden. Bitte Rezipienten-Export und Kampagnenwerte-Export hochladen.' },
      { status: 400 }
    )
  }

  // Download all CSVs and detect their types
  const csvTexts: { asset: CampaignAsset; text: string }[] = []
  for (const asset of allCsvAssets) {
    const res = await fetch(await signUrl(admin, asset.file_url))
    if (res.ok) csvTexts.push({ asset, text: await res.text() })
  }

  let recipientsCsv: string | null = null
  let campaignCsv: string | null = null

  for (const { text } of csvTexts) {
    const type = detectCsvType(text)
    if (type === 'combined') {
      // A combined file satisfies both requirements
      recipientsCsv = text
      campaignCsv = text
      break
    }
    if (type === 'recipients' && !recipientsCsv) recipientsCsv = text
    if (type === 'campaign' && !campaignCsv) campaignCsv = text
  }

  if (!recipientsCsv && !campaignCsv) {
    return NextResponse.json(
      { error: 'Die CSV-Dateien konnten nicht erkannt werden. Bitte Mailchimp Rezipienten-Export und Kampagnenwerte-Export hochladen.' },
      { status: 400 }
    )
  }
  if (!recipientsCsv) {
    return NextResponse.json(
      { error: 'Die Rezipienten-Auswertung fehlt für den vollständigen Report. Bitte den Mailchimp Audience-Export (mit Phone-Spalte) hochladen.' },
      { status: 400 }
    )
  }
  if (!campaignCsv) {
    return NextResponse.json(
      { error: 'Die Kampagnenwerte fehlen für den vollständigen Report. Bitte den Mailchimp Kampagnen-Report (mit Opens/Clicks-Spalten) hochladen.' },
      { status: 400 }
    )
  }

  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any
  const dateStr = new Date().toISOString().split('T')[0]

  try {
    const { internalBuffer, externalBuffer } = await generateReports({
      recipientsCsv,
      campaignCsv,
      manufacturerName: mfg?.name ?? 'Unbekannt',
      agencyName: agency?.name ?? 'Collezioni',
      campaignTitle: campaign.title,
      campaignDate: dateStr,
    })

    const mfgSlug = (mfg?.name ?? 'report').replace(/[^a-zA-Z0-9]/g, '_')

    // Upload internal XLSX
    if (internalId) {
      const intPath = `${internalId}/${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`
      await admin.storage
        .from('campaign-assets')
        .upload(intPath, internalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: intUrl } = admin.storage.from('campaign-assets').getPublicUrl(intPath)

      await admin.from('campaign_assets').delete().eq('campaign_id', internalId).eq('is_output', true)
      await admin.from('campaign_assets').insert({
        campaign_id: internalId,
        file_name: `${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: intUrl.publicUrl,
        file_size: internalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await admin.from('campaigns').update({ status: 'review' }).eq('id', internalId)
    }

    // Upload external XLSX
    if (externalId) {
      const extPath = `${externalId}/${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`
      await admin.storage
        .from('campaign-assets')
        .upload(extPath, externalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: extUrl } = admin.storage.from('campaign-assets').getPublicUrl(extPath)

      await admin.from('campaign_assets').delete().eq('campaign_id', externalId).eq('is_output', true)
      await admin.from('campaign_assets').insert({
        campaign_id: externalId,
        file_name: `${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: extUrl.publicUrl,
        file_size: externalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await admin.from('campaigns').update({ status: 'review' }).eq('id', externalId)
    }

    // Compute and save performance stats on the linked newsletter campaign (or this campaign)
    if (recipientsCsv) {
      const { total, opens, clicks } = parseCsvStats(recipientsCsv)
      if (total > 0) {
        const statsTargetId = campaign.linked_newsletter_id ?? campaign_id
        await admin.from('campaigns').update({
          performance_stats: {
            open_rate: opens / total,
            click_rate: clicks / total,
            emails_sent: total,
            unsubscribes: null,
            source: 'csv',
          },
        }).eq('id', statsTargetId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Report generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
