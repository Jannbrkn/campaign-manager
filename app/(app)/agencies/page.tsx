import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import type { Agency } from '@/lib/supabase/types'

export default async function AgenciesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agencies')
    .select('*')
    .order('name')

  const agencies = (data ?? []) as Agency[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light text-text-primary">Agenturen</h1>
        <Link
          href="/agencies/new"
          className="flex items-center gap-2 text-sm bg-accent-warm text-background px-4 py-2 rounded-sm hover:bg-white transition-colors"
        >
          <Plus size={14} />
          Agentur hinzufügen
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-sm divide-y divide-border">
        {agencies.map((agency) => (
          <Link
            key={agency.id}
            href={`/agencies/${agency.id}`}
            className="flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors group"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">{agency.name}</p>
              <p className="text-xs text-text-secondary mt-1">{agency.cost_center}</p>
            </div>
            <div className="flex items-center gap-6 text-right">
              {agency.order_email && (
                <p className="text-xs text-text-secondary hidden md:block">{agency.order_email}</p>
              )}
              {agency.ident_number && (
                <p className="text-xs text-text-secondary hidden lg:block font-mono">{agency.ident_number}</p>
              )}
              <ChevronRight size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
