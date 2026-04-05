'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CampaignType, CampaignStatus, NewsletterBriefing } from '@/lib/supabase/types'

// ─── Date helpers ────────────────────────────────────────────────────────────

function nextWeekdayAfter(from: Date, targetDay: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function monthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

// ─── Create campaign ─────────────────────────────────────────────────────────

export async function createCampaign(data: {
  manufacturer_id: string
  type: CampaignType
  title: string
  scheduled_date: string
  notes?: string
  createChain?: boolean          // true = auto-create linked follow-up campaigns
}) {
  const supabase = await createClient()
  const month = monthLabel(data.scheduled_date)
  // Strip trailing type label from title to get base name
  const base = data.title.replace(/\s*–\s*(Postkarte|Newsletter|Report.*)/i, '').trim()

  // Insert primary campaign
  const { data: primary, error } = await supabase
    .from('campaigns')
    .insert({
      manufacturer_id: data.manufacturer_id,
      type: data.type,
      title: data.title,
      scheduled_date: data.scheduled_date,
      status: 'planned',
      notes: data.notes ?? null,
      review_approved: false,
      auto_send_emails: null,
      linked_postcard_id: null,
      linked_newsletter_id: null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (!data.createChain) {
    revalidatePath('/calendar')
    return
  }

  // ── Postcard chain: Newsletter → Reports ────────────────────────────────
  if (data.type === 'postcard') {
    const postcardDate = new Date(data.scheduled_date)
    const newsletterDate = nextWeekdayAfter(postcardDate, 3) // Wednesday
    const reportDate = nextWeekdayAfter(newsletterDate, 1)   // Monday

    const { data: nl, error: nlErr } = await supabase
      .from('campaigns')
      .insert({
        manufacturer_id: data.manufacturer_id,
        type: 'newsletter' as CampaignType,
        title: `${base} – Newsletter ${month}`,
        scheduled_date: toDateStr(newsletterDate),
        status: 'planned',
        notes: null,
        review_approved: false,
        auto_send_emails: null,
        linked_postcard_id: primary.id,
        linked_newsletter_id: null,
      })
      .select('id')
      .single()

    if (!nlErr && nl) {
      await supabase.from('campaigns').insert([
        {
          manufacturer_id: data.manufacturer_id,
          type: 'report_internal' as CampaignType,
          title: `${base} – Report Intern ${month}`,
          scheduled_date: toDateStr(reportDate),
          status: 'planned',
          notes: null,
          review_approved: false,
          auto_send_emails: null,
          linked_postcard_id: null,
          linked_newsletter_id: nl.id,
        },
        {
          manufacturer_id: data.manufacturer_id,
          type: 'report_external' as CampaignType,
          title: `${base} – Report Extern ${month}`,
          scheduled_date: toDateStr(reportDate),
          status: 'planned',
          notes: null,
          review_approved: false,
          auto_send_emails: null,
          linked_postcard_id: null,
          linked_newsletter_id: nl.id,
        },
      ])
    }
  }

  // ── Newsletter chain: Reports ────────────────────────────────────────────
  if (data.type === 'newsletter') {
    const newsletterDate = new Date(data.scheduled_date)
    const reportDate = nextWeekdayAfter(newsletterDate, 1) // Monday

    await supabase.from('campaigns').insert([
      {
        manufacturer_id: data.manufacturer_id,
        type: 'report_internal' as CampaignType,
        title: `${base} – Report Intern ${month}`,
        scheduled_date: toDateStr(reportDate),
        status: 'planned',
        notes: null,
        review_approved: false,
        auto_send_emails: null,
        linked_postcard_id: null,
        linked_newsletter_id: primary.id,
      },
      {
        manufacturer_id: data.manufacturer_id,
        type: 'report_external' as CampaignType,
        title: `${base} – Report Extern ${month}`,
        scheduled_date: toDateStr(reportDate),
        status: 'planned',
        notes: null,
        review_approved: false,
        auto_send_emails: null,
        linked_postcard_id: null,
        linked_newsletter_id: primary.id,
      },
    ])
  }

  revalidatePath('/calendar')
}

// ─── Update campaign ──────────────────────────────────────────────────────────

export async function updateCampaign(
  campaignId: string,
  data: { title: string; scheduled_date: string; notes: string | null; manufacturer_id: string }
) {
  const supabase = await createClient()
  const { error } = await supabase.from('campaigns').update(data).eq('id', campaignId)
  if (error) throw new Error(error.message)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
}

// ─── Delete campaign (+ storage cleanup) ─────────────────────────────────────

export async function deleteCampaign(campaignId: string) {
  const supabase = await createClient()

  const { data: assets } = await supabase
    .from('campaign_assets')
    .select('file_url')
    .eq('campaign_id', campaignId)

  if (assets && assets.length > 0) {
    const marker = '/campaign-assets/'
    const paths = assets
      .map((a: any) => {
        const idx = (a.file_url as string).indexOf(marker)
        return idx !== -1 ? decodeURIComponent((a.file_url as string).slice(idx + marker.length)) : null
      })
      .filter(Boolean) as string[]
    if (paths.length > 0) await supabase.storage.from('campaign-assets').remove(paths)
  }

  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId)
  if (error) throw new Error(error.message)

  revalidatePath('/calendar')
  revalidatePath('/dashboard')
}

// ─── Update review approval ───────────────────────────────────────────────────

export async function updateReviewApproved(campaignId: string, approved: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update({ review_approved: approved })
    .eq('id', campaignId)
  if (error) throw new Error(error.message)
  revalidatePath('/calendar')
}

// ─── Update auto-send emails ──────────────────────────────────────────────────

export async function updateAutoSendEmails(campaignId: string, emails: string[]) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .update({ auto_send_emails: emails.length > 0 ? emails : null })
    .eq('id', campaignId)
  if (error) throw new Error(error.message)
}

// ─── Update briefing ──────────────────────────────────────────────────────────

export async function updateCampaignBriefing(campaignId: string, briefing: NewsletterBriefing) {
  const supabase = await createClient()
  const { error } = await supabase.from('campaigns').update({ briefing }).eq('id', campaignId)
  if (error) throw new Error(error.message)
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateCampaignStatus(campaignId: string, status: CampaignStatus) {
  const supabase = await createClient()
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', campaignId)
  if (error) throw new Error(error.message)
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
}

// ─── Upload asset ─────────────────────────────────────────────────────────────

export async function uploadCampaignAsset(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get('file') as File
  const campaignId = formData.get('campaign_id') as string
  const assetCategory = formData.get('asset_category') as string

  if (!file || !campaignId) throw new Error('Missing file or campaign_id')

  const path = `${campaignId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage.from('campaign-assets').upload(path, file)
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(path)

  const mimeToCategory: Record<string, string> = {
    'application/pdf': 'postcard_pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/webp': 'image',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'report_xlsx',
    'text/csv': 'csv_export',
    'application/zip': 'newsletter_zip',
  }
  const category = assetCategory || mimeToCategory[file.type] || 'text'

  const { error: dbError } = await supabase.from('campaign_assets').insert({
    campaign_id: campaignId,
    file_name: file.name,
    file_type: file.type,
    file_url: urlData.publicUrl,
    file_size: file.size,
    asset_category: category as any,
    is_output: false,
  })
  if (dbError) throw new Error(dbError.message)

  revalidatePath('/calendar')
}

// ─── Delete asset ─────────────────────────────────────────────────────────────

export async function deleteCampaignAsset(assetId: string, fileUrl: string) {
  const supabase = await createClient()

  const marker = '/campaign-assets/'
  const idx = fileUrl.indexOf(marker)
  if (idx !== -1) {
    const storagePath = decodeURIComponent(fileUrl.slice(idx + marker.length))
    await supabase.storage.from('campaign-assets').remove([storagePath])
  }

  const { error } = await supabase.from('campaign_assets').delete().eq('id', assetId)
  if (error) throw new Error(error.message)

  revalidatePath('/calendar')
}
