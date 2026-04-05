'use client'

import { useState, useRef } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
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
    <div className="px-6 py-4 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-text-primary">{manufacturer.name}</p>
          <p className="text-xs text-text-secondary">{manufacturer.agencies?.name}</p>
        </div>
        <div className="h-4 flex items-center">
          {state.saving && <Loader2 size={12} className="animate-spin text-text-secondary" />}
          {state.saved && <CheckCircle2 size={12} className="text-[#2E7D32]" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1.5">
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
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 resize-none"
          />
        </div>
        <div>
          <label className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1.5">
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
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 resize-none"
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
  return (
    <div className="space-y-8">
      <p className="text-sm text-text-secondary">
        Kommagetrennte Mailchimp-Zielgruppen-Tags pro Hersteller. Änderungen werden automatisch gespeichert.
      </p>

      {agencies.map((agency) => {
        const mfgs = manufacturers.filter((m) => m.agency_id === agency.id)
        if (mfgs.length === 0) return null
        return (
          <div key={agency.id}>
            <h2 className="text-xs tracking-wider uppercase text-text-secondary mb-3">
              {agency.name}
            </h2>
            <div className="bg-surface border border-border rounded-sm">
              {mfgs.map((m) => (
                <TagRow key={m.id} manufacturer={m} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
