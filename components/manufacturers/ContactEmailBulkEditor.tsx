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
    <div className="space-y-8 max-w-xl">
      <p className="text-sm text-text-secondary max-w-prose">
        Hinterlege pro Hersteller eine Kontakt-E-Mail. Änderungen werden automatisch
        gespeichert, sobald du das Feld verlässt.
      </p>

      {grouped.map(({ agency, manufacturers: mfgs }) => (
        <div key={agency.id}>
          <h3 className="section-title mb-3">
            {agency.name}
          </h3>
          <div className="card divide-y divide-border overflow-hidden">
            {mfgs.map((m) => {
              const state = fieldState[m.id] ?? 'idle'
              const error = fieldError[m.id]
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-44 shrink-0">
                    <p className="text-sm text-text-primary truncate">{m.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                  </div>
                  <div className="flex-1 relative">
                    <Mail size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none" />
                    <input
                      type="email"
                      value={emails[m.id] ?? ''}
                      onChange={(e) => setEmails((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      onBlur={() => saveField(m.id)}
                      placeholder="kontakt@hersteller.com"
                      className={`field-input pl-9 text-xs ${
                        state === 'error'
                          ? 'border-warning/60 focus:border-warning'
                          : ''
                      }`}
                    />
                  </div>
                  <div className="w-6 shrink-0 flex items-center justify-center">
                    {state === 'saving' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-text-secondary" />}
                    {state === 'saved' && <Check size={16} strokeWidth={2} className="text-success" />}
                    {state === 'error' && (
                      <span title={error}>
                        <AlertCircle size={16} strokeWidth={1.75} className="text-warning" />
                      </span>
                    )}
                  </div>
                  {state === 'error' && error && (
                    <p className="text-[10px] text-warning mt-0.5 col-span-full">{error}</p>
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
          className="btn-primary"
        >
          {savingAll ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
          {savingAll ? 'Wird gespeichert…' : 'Alle speichern'}
        </button>
        {saveAllResult === 'success' && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Check size={16} strokeWidth={2} />
            Alle Mails gespeichert
          </span>
        )}
        {saveAllResult === 'error' && (
          <span className="flex items-center gap-1.5 text-xs text-warning">
            <AlertCircle size={16} strokeWidth={1.75} />
            Einige konnten nicht gespeichert werden
          </span>
        )}
      </div>
    </div>
  )
}
