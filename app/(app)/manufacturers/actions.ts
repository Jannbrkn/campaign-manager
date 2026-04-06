'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateManufacturerTags(
  id: string,
  postcard_tags: string,
  newsletter_tags: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('manufacturers')
    .update({
      postcard_tags: postcard_tags.trim() || null,
      newsletter_tags: newsletter_tags.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/manufacturers')
}

export async function updateManufacturerContactEmail(id: string, contact_email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('manufacturers')
    .update({ contact_email: contact_email.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/manufacturers/${id}`)
}

export async function updateManufacturerWebsiteUrl(id: string, website_url: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('manufacturers')
    .update({ website_url: website_url.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/manufacturers/${id}`)
}
