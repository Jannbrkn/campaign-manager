'use client'

import { useState, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createCampaign } from '@/app/(app)/calendar/actions'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

interface Props {
  agencies: Agency[]
  manufacturers: Manufacturer[]
  defaultDate?: string
  onClose: () => void
  onCreated: () => void
}

type CampaignTypeOption = 'postcard' | 'newsletter' | 'report_internal' | 'report_external'

const TYPE_LABELS: Record<CampaignTypeOption, string> = {
  postcard: 'Postkarte',
  newsletter: 'Newsletter',
  report_internal: 'Report Intern',
  report_external: 'Report Extern',
}

function nextWeekday(from: Date, targetDay: number): Date {
  // targetDay: 0=Sun, 1=Mon, 3=Wed, 4=Thu
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1)
  return d
}

function toInputDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function NewCampaignModal({ agencies, manufacturers, defaultDate, onClose, onCreated }: Props) {
  const [manufacturerId, setManufacturerId] = useState('')
  const [type, setType] = useState<CampaignTypeOption>('postcard')
  const [date, setDate] = useState(defaultDate ?? '')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [suggestions, setSuggestions] = useState<{ newsletter?: string; report?: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleTypeChange(t: CampaignTypeOption) {
    setType(t)
    if (t === 'postcard' && date) {
      const postcardDate = new Date(date)
      const newsletterDate = nextWeekday(postcardDate, 3) // Wednesday
      const reportDate = nextWeekday(newsletterDate, 1) // Monday
      setSuggestions({
        newsletter: toInputDate(newsletterDate),
        report: toInputDate(reportDate),
      })
    } else {
      setSuggestions(null)
    }
  }

  function handleDateChange(d: string) {
    setDate(d)
    if (type === 'postcard' && d) {
      const postcardDate = new Date(d)
      const newsletterDate = nextWeekday(postcardDate, 3)
      const reportDate = nextWeekday(newsletterDate, 1)
      setSuggestions({
        newsletter: toInputDate(newsletterDate),
        report: toInputDate(reportDate),
      })
    }
  }

  function getAutoTitle(): string {
    if (!manufacturerId) return ''
    const mfg = manufacturers.find((m) => m.id === manufacturerId)
    if (!mfg) return ''
    const typeLabel = TYPE_LABELS[type]
    const month = date ? new Date(date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : ''
    return `${mfg.name} – ${typeLabel}${month ? ` ${month}` : ''}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const finalTitle = title || getAutoTitle()
    if (!manufacturerId || !date || !finalTitle) {
      setError('Hersteller, Datum und Titel sind Pflichtfelder.')
      return
    }
    startTransition(async () => {
      try {
        await createCampaign({ manufacturer_id: manufacturerId, type, title: finalTitle, scheduled_date: date, notes })
        onCreated()
        onClose()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  // Group manufacturers by agency
  const grouped = agencies.reduce<Record<string, Manufacturer[]>>((acc, agency) => {
    acc[agency.id] = manufacturers.filter((m) => m.agency_id === agency.id)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-surface border border-border rounded-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">Neue Kampagne</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Manufacturer */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Hersteller</label>
            <select
              value={manufacturerId}
              onChange={(e) => setManufacturerId(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50 appearance-none"
              required
            >
              <option value="">Hersteller wählen…</option>
              {agencies.map((agency) => {
                const mfgs = grouped[agency.id] ?? []
                if (!mfgs.length) return null
                return (
                  <optgroup key={agency.id} label={agency.name}>
                    {mfgs.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Typ</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(TYPE_LABELS) as CampaignTypeOption[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`px-2 py-2 text-xs rounded-sm border transition-colors ${
                    type === t
                      ? 'border-accent-warm text-accent-warm bg-accent-warm/5'
                      : 'border-border text-text-secondary hover:border-border hover:text-text-primary'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50 [color-scheme:dark]"
              required
            />
          </div>

          {/* Auto chain preview for postcard */}
          {type === 'postcard' && suggestions && (
            <div className="bg-background border border-border rounded-sm px-4 py-3 space-y-2">
              <p className="text-xs text-text-secondary uppercase tracking-wider">Kampagnenkette wird automatisch erstellt</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-warm shrink-0" />
                  <span className="text-text-secondary">Newsletter</span>
                  <span className="text-accent-warm ml-auto">
                    {new Date(suggestions.newsletter!).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-secondary shrink-0" />
                  <span className="text-text-secondary">Report Intern + Extern</span>
                  <span className="text-text-primary ml-auto">
                    {new Date(suggestions.report!).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={getAutoTitle() || 'Kampagnentitel…'}
              className="w-full bg-background border border-border rounded-sm px-3 py-2.5 text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50"
            />
            <p className="text-xs text-text-secondary mt-1">Leer lassen für Autotitel</p>
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

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-text-secondary border border-border rounded-sm hover:text-text-primary hover:border-text-secondary/30 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-2.5 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {type === 'postcard' ? 'Kette erstellen' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
