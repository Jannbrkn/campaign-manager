import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Building2, Factory } from 'lucide-react'
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
    <div className="p-8 max-w-3xl">
      <Link
        href="/agencies"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        Zurück zu den Agenturen
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <Building2 size={28} strokeWidth={1.75} className="text-accent-gold shrink-0" />
            {agency.name}
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Stammdaten dieser Agentur und alle zugeordneten Hersteller.
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="card mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="section-title">Details</h2>
        </div>
        <div className="divide-y divide-border">
          {readonlyFields.map(({ label, value }) => (
            <div key={label} className="px-6 py-4 flex items-center justify-between gap-4">
              <span className="field-label w-40 shrink-0 mb-0">{label}</span>
              <span className="text-sm text-text-primary flex-1 text-right">{value ?? '—'}</span>
            </div>
          ))}
          {/* Editable: website_url */}
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <span className="field-label w-40 shrink-0 mb-0">Website</span>
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
        <h2 className="section-title mb-4">
          Hersteller ({manufacturers.length})
        </h2>
        {manufacturers.length === 0 ? (
          <div className="card flex flex-col items-center justify-center text-center py-16 px-6">
            <Factory size={32} strokeWidth={1.5} className="text-text-secondary/50 mb-4" />
            <p className="text-text-primary text-sm font-medium">Noch keine Hersteller zugeordnet</p>
            <p className="text-text-secondary text-sm mt-1 max-w-sm">
              Sobald dieser Agentur Hersteller zugeordnet sind, erscheinen sie hier.
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {manufacturers.map((m) => (
              <Link
                key={m.id}
                href={`/manufacturers/${m.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface-hover transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{m.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-secondary hidden sm:block">{m.postcard_frequency}</span>
                  <ChevronRight size={16} strokeWidth={1.75} className="text-text-secondary group-hover:text-text-primary transition-colors shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
