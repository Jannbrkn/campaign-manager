'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Loader2, Save, Factory } from 'lucide-react'
import { updateCampaign } from '@/app/(app)/calendar/actions'
import type { Campaign, Agency, Manufacturer } from '@/lib/supabase/types'

interface Props {
  campaign: Campaign & { manufacturer_id: string }
  onClose: () => void
  onSaved: () => void
}

export default function EditCampaignModal({ campaign, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(campaign.title)
  const [date, setDate] = useState(campaign.scheduled_date)
  const [notes, setNotes] = useState(campaign.notes ?? '')
  const [manufacturerId, setManufacturerId] = useState(campaign.manufacturer_id)

  const [agencies, setAgencies] = useState<Agency[]>([])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Fetch agencies + manufacturers client-side (self-contained)
  useEffect(() => {
    async function load() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const [{ data: ag }, { data: mf }] = await Promise.all([
        supabase.from('agencies').select('*').order('name'),
        supabase.from('manufacturers').select('*').order('name'),
      ])
      setAgencies((ag ?? []) as Agency[])
      setManufacturers((mf ?? []) as Manufacturer[])
      setLoadingData(false)
    }
    load()
  }, [])

  const grouped = agencies.reduce<Record<string, Manufacturer[]>>((acc, ag) => {
    acc[ag.id] = manufacturers.filter((m) => m.agency_id === ag.id)
    return acc
  }, {})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !date || !manufacturerId) {
      setError('Titel, Datum und Hersteller sind Pflichtfelder.')
      return
    }
    startTransition(async () => {
      try {
        await updateCampaign(campaign.id, {
          title: title.trim(),
          scheduled_date: date,
          notes: notes.trim() || null,
          manufacturer_id: manufacturerId,
        })
        onSaved()
        onClose()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-surface-2 border border-border rounded-2xl shadow-elevated">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div>
            <h2 className="section-title">Kampagne bearbeiten</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Titel, Datum, Hersteller und Notizen dieser Kampagne anpassen.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Schließen"
            aria-label="Schließen"
            className="btn-ghost p-2 shrink-0"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Manufacturer */}
          <div>
            <label className="field-label flex items-center gap-1.5">
              <Factory size={14} strokeWidth={1.75} className="text-text-secondary" />
              Hersteller
            </label>
            {loadingData ? (
              <div className="flex items-center gap-2 py-2.5">
                <Loader2 size={16} className="animate-spin text-text-secondary" strokeWidth={1.75} />
                <span className="text-sm text-text-secondary">Lädt…</span>
              </div>
            ) : (
              <select
                value={manufacturerId}
                onChange={(e) => setManufacturerId(e.target.value)}
                className="field-input appearance-none"
                required
              >
                {agencies.map((ag) => {
                  const mfgs = grouped[ag.id] ?? []
                  if (!mfgs.length) return null
                  return (
                    <optgroup key={ag.id} label={ag.name}>
                      {mfgs.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="field-label">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field-input"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="field-label">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field-input [color-scheme:dark]"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional…"
              className="field-input resize-none"
            />
            <p className="mt-1.5 text-xs text-text-secondary">
              Interne Notizen zur Kampagne – optional.
            </p>
          </div>

          {error && <p className="text-sm text-warning">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending || loadingData}
              className="btn-primary flex-1"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" strokeWidth={1.75} /> : <Save size={16} strokeWidth={1.75} />}
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
