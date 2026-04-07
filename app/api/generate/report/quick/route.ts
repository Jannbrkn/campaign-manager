// app/api/generate/report/quick/route.ts
// Ad-hoc report generation — no campaign context required.
// Accepts multipart/form-data with two CSV files + metadata.
// Returns both Excel files as base64 JSON (no DB writes).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReports, detectCsvType } from '@/lib/generate/report'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const recipientsFile = formData.get('csv_recipients') as File | null
  const campaignFile = formData.get('csv_campaign') as File | null
  const manufacturerName = (formData.get('manufacturer_name') as string | null) ?? 'Unbekannt'
  const agencyName = (formData.get('agency_name') as string | null) ?? 'Collezioni'
  const campaignTitle = (formData.get('campaign_title') as string | null) ?? manufacturerName

  // Validate both files present
  if (!recipientsFile && !campaignFile) {
    return NextResponse.json(
      { error: 'Beide CSV-Dateien fehlen. Bitte Rezipienten-Export und Kampagnenwerte-Export hochladen.' },
      { status: 400 }
    )
  }
  if (!recipientsFile) {
    return NextResponse.json(
      { error: 'Die Rezipienten-Auswertung fehlt für den vollständigen Report. Bitte den Mailchimp Audience-Export hochladen.' },
      { status: 400 }
    )
  }
  if (!campaignFile) {
    return NextResponse.json(
      { error: 'Die Kampagnenwerte fehlen für den vollständigen Report. Bitte den Mailchimp Kampagnen-Report (mit Opens/Clicks-Spalten) hochladen.' },
      { status: 400 }
    )
  }

  const [recipientsCsv, campaignCsv] = await Promise.all([
    recipientsFile.text(),
    campaignFile.text(),
  ])

  // Sanity check: verify the files are actually the right type
  const recipientsType = detectCsvType(recipientsCsv)
  const campaignType = detectCsvType(campaignCsv)

  if (recipientsType === 'campaign' || recipientsType === 'unknown') {
    return NextResponse.json(
      { error: 'Die erste Datei scheint kein Rezipienten-Export zu sein. Bitte den Mailchimp Audience-Export (mit E-Mail-Spalte) als Rezipienten hochladen.' },
      { status: 400 }
    )
  }
  if (campaignType === 'recipients' || campaignType === 'unknown') {
    return NextResponse.json(
      { error: 'Die zweite Datei scheint kein Kampagnenwerte-Export zu sein. Bitte den Mailchimp Kampagnen-Report (mit Opens/Clicks-Spalten) als Kampagnenwerte hochladen.' },
      { status: 400 }
    )
  }

  const dateStr = new Date().toISOString().split('T')[0]
  const slug = manufacturerName.replace(/[^a-zA-Z0-9]/g, '_')

  try {
    const { internalBuffer, externalBuffer } = await generateReports({
      recipientsCsv,
      campaignCsv,
      manufacturerName,
      agencyName,
      campaignTitle,
      campaignDate: dateStr,
    })

    return NextResponse.json({
      internal: {
        filename: `${slug}_Lead_Priorisierung_${dateStr}.xlsx`,
        base64: internalBuffer.toString('base64'),
      },
      external: {
        filename: `${slug}_Kampagnenauswertung_${dateStr}.xlsx`,
        base64: externalBuffer.toString('base64'),
      },
    })
  } catch (err: any) {
    console.error('Quick report generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
