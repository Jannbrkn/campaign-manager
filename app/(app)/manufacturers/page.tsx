import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'
import ContactEmailBulkEditor from '@/components/manufacturers/ContactEmailBulkEditor'

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

  const activeTab = searchParams.tab === 'emails' ? 'emails' : 'list'

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light text-text-primary">Hersteller</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        <Link
          href="/manufacturers"
          className={`px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
            activeTab === 'list'
              ? 'border-accent-warm text-accent-warm'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Übersicht
        </Link>
        <Link
          href="/manufacturers?tab=emails"
          className={`px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
            activeTab === 'emails'
              ? 'border-accent-warm text-accent-warm'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Kontakt-Mails
        </Link>
      </div>

      {/* ── List tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <>
          {/* Agency filter */}
          <div className="flex gap-2 mb-8 flex-wrap">
            <Link
              href="/manufacturers"
              className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
                !searchParams.agency
                  ? 'border-accent-warm text-accent-warm'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              Alle
            </Link>
            {agencies.map((agency) => (
              <Link
                key={agency.id}
                href={`/manufacturers?agency=${agency.id}`}
                className={`text-xs px-3 py-1.5 rounded-sm border transition-colors ${
                  searchParams.agency === agency.id
                    ? 'border-accent-warm text-accent-warm'
                    : 'border-border text-text-secondary hover:text-text-primary'
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
                  <h2 className="text-xs tracking-wider uppercase text-text-secondary mb-3">
                    {agency.name}
                  </h2>
                  <div className="bg-surface border border-border rounded-sm divide-y divide-border">
                    {mfgs.length === 0 ? (
                      <p className="px-6 py-4 text-text-secondary text-sm text-center">
                        Keine Hersteller
                      </p>
                    ) : (
                      mfgs.map((m) => (
                        <Link
                          key={m.id}
                          href={`/manufacturers/${m.id}`}
                          className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                        >
                          <div>
                            <p className="text-sm text-text-primary">{m.name}</p>
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
                              size={14}
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
          <p className="text-sm text-text-secondary mb-6">
            Diese E-Mail-Adressen werden im Newsletter als Kontaktadresse des Herstellers verwendet.
            Leer lassen = keine Kontaktadresse im Newsletter.
          </p>
          <ContactEmailBulkEditor manufacturers={manufacturers} agencies={agencies} />
        </div>
      )}
    </div>
  )
}
