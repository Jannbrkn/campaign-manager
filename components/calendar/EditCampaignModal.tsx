'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
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
      <div className="relative z-10 w-full max-w-lg bg-surface border border-border rounded-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">Kampagne bearbeiten</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Manufacturer */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Hersteller</label>
            {loadingData ? (
              <div className="flex items-center gap-2 py-2.5">
                <Loader2 size={12} className="animate-spin text-text-secondary" />
                <span className="text-xs text-text-secondary">Lädt…</span>
              </div>
            ) : (
              <select
                value={manufacturerId}
                onChange={(e) => setManufacturerId(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50 appearance-none"
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
            <label className="block text-xs text-text-secondary mb-1.5">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50 [color-scheme:dark]"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional…"
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 resize-none"
            />
          </div>

          {error && <p className="text-xs text-warning">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-text-secondary border border-border rounded-sm hover:text-text-primary transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending || loadingData}
              className="flex-1 px-4 py-2.5 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
