'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CampaignType } from '@/lib/supabase/types'

export async function createCampaign(data: {
  manufacturer_id: string
  type: CampaignType
  title: string
  scheduled_date: string
  notes?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('campaigns').insert({
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
  if (error) throw new Error(error.message)
  revalidatePath('/calendar')
}

export async function uploadCampaignAsset(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get('file') as File
  const campaignId = formData.get('campaign_id') as string
  const assetCategory = formData.get('asset_category') as string

  if (!file || !campaignId) throw new Error('Missing file or campaign_id')

  const ext = file.name.split('.').pop()
  const path = `${campaignId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(path, file)
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage
    .from('campaign-assets')
    .getPublicUrl(path)

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
    asset_category: category as any,
    is_output: false,
  })
  if (dbError) throw new Error(dbError.message)

  revalidatePath('/calendar')
}
