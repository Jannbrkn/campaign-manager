import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency | null
}

export default async function ManufacturerDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('manufacturers')
    .select('*, agencies(*)')
    .eq('id', params.id)
    .single()

  if (!data) notFound()

  const manufacturer = data as unknown as ManufacturerWithAgency

  const fields = [
    { label: 'Agentur',                value: manufacturer.agencies?.name },
    { label: 'Kategorie',              value: manufacturer.category },
    { label: 'Kontaktperson',          value: manufacturer.contact_person },
    { label: 'Postkarte Häufigkeit',   value: manufacturer.postcard_frequency },
    { label: 'Postkarte Monate',       value: manufacturer.postcard_months },
    { label: 'Postkarte Format',       value: manufacturer.postcard_format },
    { label: 'Newsletter Häufigkeit',  value: manufacturer.newsletter_frequency },
    { label: 'Bilder-Quelle',          value: manufacturer.images_source },
    { label: 'Text-Quelle',            value: manufacturer.texts_source },
    { label: 'Eigene Creatives',       value: manufacturer.own_creatives ? 'Ja' : 'Nein' },
    { label: 'Eigene Texte',           value: manufacturer.own_texts ? 'Ja' : 'Nein' },
    { label: 'Auflage',                value: manufacturer.print_run?.toString() },
    { label: 'Postkarten-Tags',        value: manufacturer.postcard_tags },
    { label: 'Newsletter-Tags',        value: manufacturer.newsletter_tags },
    { label: 'Zusätzliche Tags',       value: manufacturer.extra_tags },
    { label: 'Report-E-Mail',          value: manufacturer.additional_report_email },
    { label: 'Dropbox-Link',           value: manufacturer.dropbox_link },
  ]

  return (
    <div>
      <Link
        href="/manufacturers"
        className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={12} />
        Hersteller
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-text-primary">{manufacturer.name}</h1>
          <p className="text-text-secondary text-sm mt-1">
            {manufacturer.category} · {manufacturer.agencies?.name}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-sm">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xs tracking-wider uppercase text-text-secondary">Details</h2>
        </div>
        <div className="divide-y divide-border">
          {fields.map(({ label, value }) => (
            <div key={label} className="px-6 py-4 flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary w-48 shrink-0">{label}</span>
              <span className="text-sm text-text-primary text-right break-all">{value ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
