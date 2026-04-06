'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAgencyContactEmail(id: string, contact_email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('agencies')
    .update({ contact_email: contact_email.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/agencies/${id}`)
}

export async function updateAgencyWebsiteUrl(id: string, website_url: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('agencies')
    .update({ website_url: website_url.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/agencies/${id}`)
}
