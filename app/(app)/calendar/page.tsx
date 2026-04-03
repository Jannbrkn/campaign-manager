import { createClient } from '@/lib/supabase/server'
import CalendarView from '@/components/calendar/CalendarView'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

export default async function CalendarPage() {
  const supabase = await createClient()

  const [{ data: agencyData }, { data: mfgData }] = await Promise.all([
    supabase.from('agencies').select('*').order('name'),
    supabase.from('manufacturers').select('*').order('name'),
  ])

  const agencies = (agencyData ?? []) as Agency[]
  const manufacturers = (mfgData ?? []) as Manufacturer[]

  return (
    <CalendarView agencies={agencies} manufacturers={manufacturers} />
  )
}
