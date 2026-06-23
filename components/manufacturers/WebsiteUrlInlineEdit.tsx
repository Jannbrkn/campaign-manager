'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

interface Props {
  manufacturerId: string
  initialValue: string | null
  onSave: (id: string, value: string) => Promise<void>
}

export default function WebsiteUrlInlineEdit({ manufacturerId, initialValue, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (value.trim()) {
      try {
        new URL(value.trim())
      } catch {
        setError('Bitte eine gültige URL eingeben (z.B. https://www.hersteller.com)')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(manufacturerId, value)
      setEditing(false)
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setValue(initialValue ?? '')
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-text-primary break-all text-right">{value || '—'}</span>
        <button
          onClick={() => setEditing(true)}
          className="btn-ghost shrink-0 rounded-lg p-1.5"
          title="Website bearbeiten"
          aria-label="Bearbeiten"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://www.hersteller.com"
          className="field-input w-64 text-right"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
          autoFocus
        />
        {saving ? (
          <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-text-secondary shrink-0" />
        ) : (
          <>
            <button
              onClick={handleSave}
              className="btn-ghost shrink-0 rounded-lg p-1.5 text-success hover:text-success"
              title="Speichern"
              aria-label="Speichern"
            >
              <Check size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={handleCancel}
              className="btn-ghost shrink-0 rounded-lg p-1.5"
              title="Abbrechen"
              aria-label="Abbrechen"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
      {error && <span className="text-xs text-warning text-right max-w-xs">{error}</span>}
    </div>
  )
}
