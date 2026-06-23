import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, Plus, Building2, Mail, Hash } from 'lucide-react'
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
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Agenturen</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Alle Agenturen und ihre Stammdaten verwalten.
          </p>
        </div>
        <Link href="/agencies/new" className="btn-primary shrink-0">
          <Plus size={16} strokeWidth={1.75} />
          Agentur hinzufügen
        </Link>
      </div>

      {agencies.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center py-16 px-6">
          <Building2 size={32} strokeWidth={1.5} className="text-text-secondary/50 mb-4" />
          <p className="text-text-primary text-sm font-medium">Noch keine Agenturen angelegt</p>
          <p className="text-text-secondary text-sm mt-1 max-w-sm">
            Lege deine erste Agentur an, um Marken und Kampagnen zuzuordnen.
          </p>
          <Link href="/agencies/new" className="btn-primary mt-6">
            <Plus size={16} strokeWidth={1.75} />
            Agentur hinzufügen
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {agencies.map((agency) => (
            <Link
              key={agency.id}
              href={`/agencies/${agency.id}`}
              className="flex items-center justify-between gap-4 px-6 py-5 hover:bg-surface-hover transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{agency.name}</p>
                <p className="text-xs text-text-secondary mt-1">{agency.cost_center}</p>
              </div>
              <div className="flex items-center gap-6 text-right">
                {agency.order_email && (
                  <p className="hidden md:flex items-center gap-1.5 text-xs text-text-secondary">
                    <Mail size={14} strokeWidth={1.75} className="text-text-secondary/60" />
                    {agency.order_email}
                  </p>
                )}
                {agency.ident_number && (
                  <p className="hidden lg:flex items-center gap-1.5 text-xs text-text-secondary font-mono">
                    <Hash size={14} strokeWidth={1.75} className="text-text-secondary/60" />
                    {agency.ident_number}
                  </p>
                )}
                <ChevronRight size={16} strokeWidth={1.75} className="text-text-secondary group-hover:text-text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
