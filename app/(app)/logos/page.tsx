import { createClient } from '@/lib/supabase/server'
import LogoGrid from './LogoGrid'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

export default async function LogosPage() {
  const supabase = await createClient()

  const [{ data: agencies }, { data: manufacturers }] = await Promise.all([
    supabase.from('agencies').select('*').order('name'),
    supabase.from('manufacturers').select('*').order('name'),
  ])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-text-primary mb-1">Logos</h1>
        <p className="text-sm text-text-secondary">
          PNG, SVG oder JPG — einfach per Drag & Drop auf die jeweilige Karte ziehen.
        </p>
      </div>
      <LogoGrid
        agencies={(agencies ?? []) as Agency[]}
        manufacturers={(manufacturers ?? []) as unknown as (Manufacturer & { agencies?: Agency })[]}
      />
    </div>
  )
}
