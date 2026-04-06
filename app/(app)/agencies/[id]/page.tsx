import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'
import WebsiteUrlInlineEdit from '@/components/agencies/WebsiteUrlInlineEdit'
import { updateAgencyWebsiteUrl } from '../actions'

export default async function AgencyDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const [{ data: agencyData }, { data: mfgData }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', params.id).single(),
    supabase.from('manufacturers').select('*').eq('agency_id', params.id).order('name'),
  ])

  if (!agencyData) notFound()

  const agency = agencyData as Agency
  const manufacturers = (mfgData ?? []) as Manufacturer[]

  const readonlyFields = [
    { label: 'Kostenstelle',  value: agency.cost_center },
    { label: 'Ident-Nummer', value: agency.ident_number },
    { label: 'Order-E-Mail', value: agency.order_email },
    { label: 'Adresse',      value: agency.address },
    { label: 'Telefon',      value: agency.phone },
  ]

  return (
    <div className="p-8">
      <Link
        href="/agencies"
        className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={12} />
        Agenturen
      </Link>

      <div className="flex items-start justify-between mb-8">
        <h1 className="text-2xl font-light text-text-primary">{agency.name}</h1>
      </div>

      {/* Details */}
      <div className="bg-surface border border-border rounded-sm mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xs tracking-wider uppercase text-text-secondary">Details</h2>
        </div>
        <div className="divide-y divide-border">
          {readonlyFields.map(({ label, value }) => (
            <div key={label} className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-text-secondary w-40">{label}</span>
              <span className="text-sm text-text-primary flex-1 text-right">{value ?? '—'}</span>
            </div>
          ))}
          {/* Editable: website_url */}
          <div className="px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-text-secondary w-40">Website</span>
            <div className="flex-1 flex justify-end">
              <WebsiteUrlInlineEdit
                agencyId={agency.id}
                initialValue={agency.website_url}
                onSave={updateAgencyWebsiteUrl}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Manufacturers */}
      <div>
        <h2 className="text-xs tracking-wider uppercase text-text-secondary mb-4">
          Hersteller ({manufacturers.length})
        </h2>
        <div className="bg-surface border border-border rounded-sm divide-y divide-border">
          {manufacturers.length === 0 ? (
            <p className="px-6 py-6 text-text-secondary text-sm text-center">
              Keine Hersteller zugeordnet
            </p>
          ) : (
            manufacturers.map((m) => (
              <Link
                key={m.id}
                href={`/manufacturers/${m.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
              >
                <div>
                  <p className="text-sm text-text-primary">{m.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-secondary hidden sm:block">{m.postcard_frequency}</span>
                  <ChevronRight size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
