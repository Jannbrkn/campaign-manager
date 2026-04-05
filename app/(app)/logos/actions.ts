'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadAgencyLogo(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get('file') as File
  const agencyId = formData.get('agency_id') as string
  if (!file || !agencyId) throw new Error('Missing file or agency_id')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `logos/agencies/${agencyId}/logo.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(path)

  const { error } = await supabase
    .from('agencies')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', agencyId)
  if (error) throw new Error(error.message)

  revalidatePath('/logos')
}

export async function uploadManufacturerLogo(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get('file') as File
  const manufacturerId = formData.get('manufacturer_id') as string
  if (!file || !manufacturerId) throw new Error('Missing file or manufacturer_id')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `logos/manufacturers/${manufacturerId}/logo.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('campaign-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(path)

  const { error } = await supabase
    .from('manufacturers')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', manufacturerId)
  if (error) throw new Error(error.message)

  revalidatePath('/logos')
}
