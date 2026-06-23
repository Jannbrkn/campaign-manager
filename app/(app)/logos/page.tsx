import { createClient } from '@/lib/supabase/server'
import { ImageIcon } from 'lucide-react'
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
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 border border-border text-accent-warm">
          <ImageIcon size={22} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="page-title">Logos</h1>
          <p className="mt-1.5 text-sm text-text-secondary max-w-prose">
            PNG, SVG oder JPG — einfach per Drag &amp; Drop auf die jeweilige Karte ziehen.
          </p>
        </div>
      </div>
      <LogoGrid
        agencies={(agencies ?? []) as Agency[]}
        manufacturers={(manufacturers ?? []) as unknown as (Manufacturer & { agencies?: Agency })[]}
      />
    </div>
  )
}
