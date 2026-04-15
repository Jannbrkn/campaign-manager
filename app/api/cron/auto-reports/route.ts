// app/api/cron/auto-reports/route.ts
// Daily cron (09:00 UTC): auto-generate reports for newsletters sent ≥4 business days ago.
// Secured with CRON_SECRET bearer token.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'
import { fetchMailchimpReportData } from '@/lib/mailchimp/fetch-report-data'
import { generateReports } from '@/lib/generate/report'

export const maxDuration = 120

const REPORT_DELAY_BUSINESS_DAYS = 4
const MAX_CAMPAIGNS_PER_RUN = 10

// ─── Business days ───────────────────────────────────────────────────────────

function countBusinessDays(from: Date, to: Date): number {
  let count = 0
  const d = new Date(from)
  while (d < to) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProcessResult {
  campaign: string
  status: 'generated' | 'skipped' | 'error'
  reason?: string
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth: accept CRON_SECRET (for external triggers) OR logged-in Supabase user (for UI button)
  const auth = req.headers.get('authorization')
  const cronOk = auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const results: ProcessResult[] = []

  // Step 1: Find all newsletter campaigns with a Mailchimp link
  const { data: newsletters } = await admin
    .from('campaigns')
    .select('id, title, mailchimp_campaign_id, mailchimp_send_time, manufacturers(name, agencies(name))')
    .eq('type', 'newsletter')
    .not('mailchimp_campaign_id', 'is', null)

  if (!newsletters || newsletters.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, errors: [], details: [] })
  }

  let processed = 0

  for (const nl of newsletters) {
    if (processed >= MAX_CAMPAIGNS_PER_RUN) break

    const title = nl.title ?? nl.id
    const mfgName = (nl.manufacturers as any)?.name ?? 'Unbekannt'
    const agencyName = (nl.manufacturers as any)?.agencies?.name ?? 'Collezioni'

    try {
      // Step 2: Find sibling report campaigns
      const { data: siblings } = await admin
        .from('campaigns')
        .select('id, type')
        .eq('linked_newsletter_id', nl.id)

      const internalId = siblings?.find((s: any) => s.type === 'report_internal')?.id
      const externalId = siblings?.find((s: any) => s.type === 'report_external')?.id

      if (!internalId && !externalId) {
        results.push({ campaign: title, status: 'skipped', reason: 'no sibling report campaigns' })
        continue
      }

      // Step 3: Check if reports already exist
      const reportCampaignIds = [internalId, externalId].filter(Boolean) as string[]
      const { data: existingOutputs } = await admin
        .from('campaign_assets')
        .select('campaign_id')
        .in('campaign_id', reportCampaignIds)
        .eq('asset_category', 'report_xlsx')
        .eq('is_output', true)
        .limit(1)

      if (existingOutputs && existingOutputs.length > 0) {
        results.push({ campaign: title, status: 'skipped', reason: 'reports already exist' })
        continue
      }

      // Step 4: Determine send_time
      let sendTime: Date | null = null
      let listId: string | undefined

      if (nl.mailchimp_send_time) {
        sendTime = new Date(nl.mailchimp_send_time)
      } else {
        // Fetch from Mailchimp API and cache
        try {
          const mcCampaign = await mcFetch(`/campaigns/${nl.mailchimp_campaign_id}`, 'GET')
          if (mcCampaign.status !== 'sent') {
            results.push({ campaign: title, status: 'skipped', reason: 'not yet sent on Mailchimp' })
            continue
          }
          sendTime = mcCampaign.send_time ? new Date(mcCampaign.send_time) : null
          listId = mcCampaign.recipients?.list_id

          // Cache send_time for future runs
          if (sendTime) {
            await admin.from('campaigns')
              .update({ mailchimp_send_time: sendTime.toISOString() })
              .eq('id', nl.id)
          }
        } catch (err: any) {
          if (err.message?.includes('404')) {
            results.push({ campaign: title, status: 'skipped', reason: 'Mailchimp campaign not found (404)' })
          } else {
            results.push({ campaign: title, status: 'error', reason: err.message })
          }
          continue
        }
      }

      if (!sendTime) {
        results.push({ campaign: title, status: 'skipped', reason: 'no send_time available' })
        continue
      }

      // Step 5: Check business days
      const businessDays = countBusinessDays(sendTime, now)
      if (businessDays < REPORT_DELAY_BUSINESS_DAYS) {
        const dueDate = addBusinessDays(sendTime, REPORT_DELAY_BUSINESS_DAYS)
        results.push({
          campaign: title,
          status: 'skipped',
          reason: `only ${businessDays} business days (due ${dueDate.toISOString().split('T')[0]})`,
        })
        continue
      }

      // Step 6: Fetch data from Mailchimp API
      const reportData = await fetchMailchimpReportData(
        nl.mailchimp_campaign_id!,
        listId
      )

      // Step 7: Generate reports
      const dateStr = new Date().toISOString().split('T')[0]
      const { internalBuffer, externalBuffer } = await generateReports({
        recipientsCsv: reportData.recipientsCsv,
        campaignCsv: reportData.campaignCsv,
        manufacturerName: mfgName,
        agencyName,
        campaignTitle: title,
        campaignDate: dateStr,
      })

      // Step 8: Upload + link (same logic as existing report route)
      const mfgSlug = mfgName.replace(/[^a-zA-Z0-9]/g, '_')
      const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      if (internalId) {
        const path = `${internalId}/${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`
        await admin.storage.from('campaign-assets').upload(path, internalBuffer, { upsert: true, contentType: xlsxMime })
        const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
        await admin.from('campaign_assets').delete().eq('campaign_id', internalId).eq('is_output', true)
        await admin.from('campaign_assets').insert({
          campaign_id: internalId,
          file_name: `${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`,
          file_type: xlsxMime,
          file_url: urlData.publicUrl,
          file_size: internalBuffer.length,
          asset_category: 'report_xlsx',
          is_output: true,
        })
        await admin.from('campaigns').update({ status: 'review' }).eq('id', internalId)
      }

      if (externalId) {
        const path = `${externalId}/${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`
        await admin.storage.from('campaign-assets').upload(path, externalBuffer, { upsert: true, contentType: xlsxMime })
        const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
        await admin.from('campaign_assets').delete().eq('campaign_id', externalId).eq('is_output', true)
        await admin.from('campaign_assets').insert({
          campaign_id: externalId,
          file_name: `${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`,
          file_type: xlsxMime,
          file_url: urlData.publicUrl,
          file_size: externalBuffer.length,
          asset_category: 'report_xlsx',
          is_output: true,
        })
        await admin.from('campaigns').update({ status: 'review' }).eq('id', externalId)
      }

      processed++
      results.push({ campaign: title, status: 'generated' })
      console.log(`[auto-reports] Generated reports for "${title}"`)

      // Rate limit: wait 1s between campaigns
      if (processed < MAX_CAMPAIGNS_PER_RUN) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    } catch (err: any) {
      results.push({ campaign: title, status: 'error', reason: err.message })
      console.error(`[auto-reports] Error for "${title}":`, err)
    }
  }

  const errors = results.filter((r) => r.status === 'error')
  console.log(`[auto-reports] Done: ${processed} generated, ${results.filter((r) => r.status === 'skipped').length} skipped, ${errors.length} errors`)

  return NextResponse.json({
    processed,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: errors.map((e) => `${e.campaign}: ${e.reason}`),
    details: results,
  })
}
