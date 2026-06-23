'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

interface Props {
  agencyId: string
  initialValue: string | null
  onSave: (id: string, value: string) => Promise<void>
  placeholder?: string
}

export default function InlineEditField({ agencyId, initialValue, onSave, placeholder }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
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
      <div className="group flex items-center gap-2 justify-end">
        <span className="text-sm text-text-primary">{value || '—'}</span>
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          title="Bearbeiten"
          aria-label="Bearbeiten"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-56 rounded-xl border border-border bg-surface px-3 py-1.5 text-right text-sm text-text-primary transition-colors focus:border-accent-warm focus:outline-none focus:ring-2 focus:ring-accent-warm/20"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
        autoFocus
      />
      {saving ? (
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-text-secondary" />
      ) : (
        <>
          <button
            onClick={handleSave}
            className="rounded-lg p-1.5 text-success transition-colors hover:bg-surface-hover"
            title="Speichern"
            aria-label="Speichern"
          >
            <Check size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </>
      )}
      {error && <span className="ml-1 text-xs text-warning">{error}</span>}
    </div>
  )
}
