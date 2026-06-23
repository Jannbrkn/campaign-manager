import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight, List, Mail, Tags, Factory } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'
import ContactEmailBulkEditor from '@/components/manufacturers/ContactEmailBulkEditor'
import TagsBulkEditor from '@/components/manufacturers/TagsBulkEditor'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

export default async function ManufacturersPage({
  searchParams,
}: {
  searchParams: { agency?: string; tab?: string }
}) {
  const supabase = await createClient()

  const [{ data: agencyData }, { data: mfgData }] = await Promise.all([
    supabase.from('agencies').select('*').order('name'),
    supabase.from('manufacturers').select('*, agencies(*)').order('name'),
  ])

  const agencies = (agencyData ?? []) as Agency[]
  const manufacturers = (mfgData ?? []) as unknown as ManufacturerWithAgency[]

  const activeTab = searchParams.tab === 'emails' ? 'emails' : searchParams.tab === 'tags' ? 'tags' : 'list'

  // Filter by agency if param set (list tab only)
  const filtered = searchParams.agency
    ? manufacturers.filter((m) => m.agency_id === searchParams.agency)
    : manufacturers

  // Group by agency
  const grouped = agencies.reduce<Record<string, ManufacturerWithAgency[]>>((acc, agency) => {
    acc[agency.id] = filtered.filter((m) => m.agency_id === agency.id)
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="page-title">Hersteller</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Alle Marken und ihre Kampagnen-Einstellungen verwalten.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border mb-8">
        <Link
          href="/manufacturers"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
            activeTab === 'list'
              ? 'border-accent-warm text-accent-warm'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <List size={16} strokeWidth={1.75} />
          Übersicht
        </Link>
        <Link
          href="/manufacturers?tab=emails"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
            activeTab === 'emails'
              ? 'border-accent-warm text-accent-warm'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Mail size={16} strokeWidth={1.75} />
          Kontakt-Mails
        </Link>
        <Link
          href="/manufacturers?tab=tags"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
            activeTab === 'tags'
              ? 'border-accent-warm text-accent-warm'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Tags size={16} strokeWidth={1.75} />
          Mailchimp-Tags
        </Link>
      </div>

      {/* ── List tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <>
          {/* Agency filter */}
          <div className="flex gap-2 mb-8 flex-wrap">
            <Link
              href="/manufacturers"
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !searchParams.agency
                  ? 'border-accent-warm text-accent-warm'
                  : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
              }`}
            >
              Alle
            </Link>
            {agencies.map((agency) => (
              <Link
                key={agency.id}
                href={`/manufacturers?agency=${agency.id}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  searchParams.agency === agency.id
                    ? 'border-accent-warm text-accent-warm'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
                }`}
              >
                {agency.name}
              </Link>
            ))}
          </div>

          <div className="space-y-8">
            {agencies.map((agency) => {
              const mfgs = grouped[agency.id] ?? []
              if (searchParams.agency && searchParams.agency !== agency.id) return null
              if (mfgs.length === 0 && !searchParams.agency) return null

              return (
                <div key={agency.id}>
                  <h2 className="section-title mb-3">
                    {agency.name}
                  </h2>
                  <div className="card overflow-hidden divide-y divide-border">
                    {mfgs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                        <Factory size={28} className="text-text-secondary/50 mb-3" strokeWidth={1.5} />
                        <p className="text-text-primary text-sm font-medium">Keine Hersteller</p>
                        <p className="text-text-secondary text-sm mt-1 max-w-sm">
                          Für diese Agentur sind noch keine Hersteller hinterlegt.
                        </p>
                      </div>
                    ) : (
                      mfgs.map((m) => (
                        <Link
                          key={m.id}
                          href={`/manufacturers/${m.id}`}
                          className="flex items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-medium text-text-primary">{m.name}</p>
                            <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                          </div>
                          <div className="flex items-center gap-6 text-right">
                            {m.contact_email && (
                              <span className="text-xs text-text-secondary hidden md:block">
                                {m.contact_email}
                              </span>
                            )}
                            <span className="text-xs text-text-secondary hidden md:block">
                              {m.contact_person}
                            </span>
                            <span className="text-xs text-text-secondary hidden lg:block">
                              {m.postcard_frequency}
                            </span>
                            <ChevronRight
                              size={16}
                              strokeWidth={1.75}
                              className="text-text-secondary group-hover:text-text-primary transition-colors"
                            />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Contact emails tab ────────────────────────────────────────────────── */}
      {activeTab === 'emails' && (
        <div>
          <p className="text-sm text-text-secondary mb-6 max-w-prose">
            Diese E-Mail-Adressen werden im Newsletter als Kontaktadresse des Herstellers verwendet.
            Leer lassen = keine Kontaktadresse im Newsletter.
          </p>
          <ContactEmailBulkEditor manufacturers={manufacturers} agencies={agencies} />
        </div>
      )}

      {/* ── Mailchimp tags tab ────────────────────────────────────────────────── */}
      {activeTab === 'tags' && (
        <TagsBulkEditor manufacturers={manufacturers} agencies={agencies} />
      )}
    </div>
  )
}
