'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

interface Props {
  agencyId: string
  initialValue: string | null
  onSave: (id: string, value: string) => Promise<void>
}

export default function WebsiteUrlInlineEdit({ agencyId, initialValue, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (value.trim()) {
      try {
        new URL(value.trim())
      } catch {
        setError('Bitte eine gültige URL eingeben (z.B. https://www.agentur.com)')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(agencyId, value)
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
          className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
          aria-label="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://www.agentur.com"
        className="bg-transparent border-b border-border text-sm text-text-primary focus:outline-none focus:border-accent-warm w-64 text-right"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
        autoFocus
      />
      {saving ? (
        <Loader2 size={12} className="animate-spin text-text-secondary" />
      ) : (
        <>
          <button onClick={handleSave} className="text-green-500 hover:text-green-400 transition-colors" aria-label="Speichern">
            <Check size={12} />
          </button>
          <button onClick={handleCancel} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Abbrechen">
            <X size={12} />
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
