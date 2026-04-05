'use client'

import { useState, useRef } from 'react'
import { Loader2, Check, AlertCircle, Mail, Save } from 'lucide-react'
import { updateManufacturerContactEmail } from '@/app/(app)/manufacturers/actions'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

interface Props {
  manufacturers: ManufacturerWithAgency[]
  agencies: Agency[]
}

type FieldState = 'idle' | 'saving' | 'saved' | 'error'

export default function ContactEmailBulkEditor({ manufacturers, agencies }: Props) {
  const [emails, setEmails] = useState<Record<string, string>>(
    () => Object.fromEntries(manufacturers.map((m) => [m.id, m.contact_email ?? '']))
  )
  const [fieldState, setFieldState] = useState<Record<string, FieldState>>({})
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [saveAllResult, setSaveAllResult] = useState<'success' | 'error' | null>(null)
  const clearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  async function saveField(id: string) {
    const value = emails[id] ?? ''
    const original = manufacturers.find((m) => m.id === id)?.contact_email ?? ''
    if (value === original) return

    setFieldState((s) => ({ ...s, [id]: 'saving' }))
    setFieldError((e) => ({ ...e, [id]: '' }))
    try {
      await updateManufacturerContactEmail(id, value)
      setFieldState((s) => ({ ...s, [id]: 'saved' }))
      if (clearTimers.current[id]) clearTimeout(clearTimers.current[id])
      clearTimers.current[id] = setTimeout(() => {
        setFieldState((s) => ({ ...s, [id]: 'idle' }))
      }, 2500)
    } catch (err: any) {
      setFieldState((s) => ({ ...s, [id]: 'error' }))
      setFieldError((e) => ({ ...e, [id]: err.message ?? 'Fehler beim Speichern' }))
    }
  }

  async function saveAll() {
    setSavingAll(true)
    setSaveAllResult(null)
    let hasError = false
    await Promise.all(
      manufacturers.map(async (m) => {
        const value = emails[m.id] ?? ''
        setFieldState((s) => ({ ...s, [m.id]: 'saving' }))
        try {
          await updateManufacturerContactEmail(m.id, value)
          setFieldState((s) => ({ ...s, [m.id]: 'saved' }))
        } catch (err: any) {
          hasError = true
          setFieldState((s) => ({ ...s, [m.id]: 'error' }))
          setFieldError((e) => ({ ...e, [m.id]: err.message ?? 'Fehler' }))
        }
      })
    )
    setSavingAll(false)
    setSaveAllResult(hasError ? 'error' : 'success')
    setTimeout(() => setSaveAllResult(null), 3000)
  }

  const grouped = agencies
    .map((agency) => ({
      agency,
      manufacturers: manufacturers.filter((m) => m.agency_id === agency.id),
    }))
    .filter((g) => g.manufacturers.length > 0)

  return (
    <div className="space-y-6">
      {grouped.map(({ agency, manufacturers: mfgs }) => (
        <div key={agency.id}>
          <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2">
            {agency.name}
          </h3>
          <div className="bg-surface border border-border rounded-sm divide-y divide-border">
            {mfgs.map((m) => {
              const state = fieldState[m.id] ?? 'idle'
              const error = fieldError[m.id]
              return (
                <div key={m.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-44 shrink-0">
                    <p className="text-sm text-text-primary truncate">{m.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                  </div>
                  <div className="flex-1 relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none" />
                    <input
                      type="email"
                      value={emails[m.id] ?? ''}
                      onChange={(e) => setEmails((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      onBlur={() => saveField(m.id)}
                      placeholder="kontakt@hersteller.com"
                      className={`w-full bg-background border rounded-sm pl-8 pr-3 py-2 text-xs text-text-primary placeholder-text-secondary/40 focus:outline-none transition-colors ${
                        state === 'error'
                          ? 'border-[#E65100]/60 focus:border-[#E65100]'
                          : 'border-border focus:border-accent-warm/50'
                      }`}
                    />
                  </div>
                  <div className="w-6 shrink-0 flex items-center justify-center">
                    {state === 'saving' && <Loader2 size={13} className="animate-spin text-text-secondary" />}
                    {state === 'saved' && <Check size={13} className="text-[#2E7D32]" />}
                    {state === 'error' && (
                      <span title={error}>
                        <AlertCircle size={13} className="text-[#E65100]" />
                      </span>
                    )}
                  </div>
                  {state === 'error' && error && (
                    <p className="text-[10px] text-[#E65100] mt-0.5 col-span-full">{error}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Save all button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={saveAll}
          disabled={savingAll}
          className="flex items-center gap-2 px-4 py-2 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
        >
          {savingAll ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {savingAll ? 'Wird gespeichert…' : 'Alle speichern'}
        </button>
        {saveAllResult === 'success' && (
          <span className="flex items-center gap-1.5 text-xs text-[#2E7D32]">
            <Check size={13} />
            Alle Mails gespeichert
          </span>
        )}
        {saveAllResult === 'error' && (
          <span className="flex items-center gap-1.5 text-xs text-[#E65100]">
            <AlertCircle size={13} />
            Einige konnten nicht gespeichert werden
          </span>
        )}
      </div>
    </div>
  )
}
