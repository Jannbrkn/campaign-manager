'use client'

import { useState, useRef } from 'react'
import { Loader2, CheckCircle2, Tags } from 'lucide-react'
import { updateManufacturerTags } from '@/app/(app)/manufacturers/actions'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

interface RowState {
  postcard: string
  newsletter: string
  saving: boolean
  saved: boolean
}

function TagRow({ manufacturer }: { manufacturer: ManufacturerWithAgency }) {
  const [state, setState] = useState<RowState>({
    postcard: manufacturer.postcard_tags ?? '',
    newsletter: manufacturer.newsletter_tags ?? '',
    saving: false,
    saved: false,
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleAutosave(postcard: string, newsletter: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setState((s) => ({ ...s, saving: true, saved: false }))
      try {
        await updateManufacturerTags(manufacturer.id, postcard, newsletter)
        setState((s) => ({ ...s, saving: false, saved: true }))
        setTimeout(() => setState((s) => ({ ...s, saved: false })), 2500)
      } catch {
        setState((s) => ({ ...s, saving: false }))
      }
    }, 800)
  }

  return (
    <div className="px-6 py-5 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{manufacturer.name}</p>
          <p className="text-xs text-text-secondary">{manufacturer.agencies?.name}</p>
        </div>
        <div className="h-5 flex items-center gap-1.5">
          {state.saving && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
              Speichern…
            </span>
          )}
          {state.saved && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 size={14} strokeWidth={1.75} />
              Gespeichert
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label">
            Postkarte
          </label>
          <textarea
            value={state.postcard}
            onChange={(e) => {
              setState((s) => ({ ...s, postcard: e.target.value }))
              scheduleAutosave(e.target.value, state.newsletter)
            }}
            rows={3}
            placeholder="Kunde, Interessenten, A-Architekt…"
            className="field-input text-xs resize-none"
          />
        </div>
        <div>
          <label className="field-label">
            Newsletter
          </label>
          <textarea
            value={state.newsletter}
            onChange={(e) => {
              setState((s) => ({ ...s, newsletter: e.target.value }))
              scheduleAutosave(state.postcard, e.target.value)
            }}
            rows={3}
            placeholder="Kunde, Interessenten, A-Architekt…"
            className="field-input text-xs resize-none"
          />
        </div>
      </div>
    </div>
  )
}

export default function TagsBulkEditor({
  manufacturers,
  agencies,
}: {
  manufacturers: ManufacturerWithAgency[]
  agencies: Agency[]
}) {
  const hasManufacturers = agencies.some(
    (agency) => manufacturers.some((m) => m.agency_id === agency.id),
  )

  return (
    <div className="space-y-8">
      <p className="max-w-prose text-sm text-text-secondary">
        Kommagetrennte Mailchimp-Zielgruppen-Tags pro Hersteller. Änderungen werden automatisch gespeichert.
      </p>

      {!hasManufacturers ? (
        <div className="card flex flex-col items-center justify-center text-center py-16 px-6">
          <Tags size={32} strokeWidth={1.5} className="text-text-secondary/50 mb-4" />
          <p className="text-sm font-medium text-text-primary">Noch keine Hersteller vorhanden</p>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            Sobald Hersteller angelegt sind, kannst du hier ihre Mailchimp-Tags pflegen.
          </p>
        </div>
      ) : (
        agencies.map((agency) => {
          const mfgs = manufacturers.filter((m) => m.agency_id === agency.id)
          if (mfgs.length === 0) return null
          return (
            <div key={agency.id}>
              <h2 className="section-title mb-3">
                {agency.name}
              </h2>
              <div className="card overflow-hidden">
                {mfgs.map((m) => (
                  <TagRow key={m.id} manufacturer={m} />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
