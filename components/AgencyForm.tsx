'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Save, Upload, AlertCircle } from 'lucide-react'

export default function AgencyForm() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const form = e.currentTarget
    const data = new FormData(form)

    let logo_url: string | null = null

    // Upload logo if provided
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `logos/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('campaign-assets')
        .upload(path, logoFile)
      if (uploadError) {
        setError('Logo-Upload fehlgeschlagen.')
        setSaving(false)
        return
      }
      logo_url = path
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase.from('agencies') as any).insert({
      name:         data.get('name') as string,
      cost_center:  data.get('cost_center') as string || null,
      ident_number: data.get('ident_number') as string || null,
      order_email:  data.get('order_email') as string || null,
      address:      data.get('address') as string || null,
      phone:        data.get('phone') as string || null,
      logo_url,
    })

    if (insertError) {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
      setSaving(false)
      return
    }

    router.push('/agencies')
    router.refresh()
  }

  const fields = [
    { name: 'name',         label: 'Name',          required: true,  type: 'text' },
    { name: 'cost_center',  label: 'Kostenstelle',  required: false, type: 'text' },
    { name: 'ident_number', label: 'Ident-Nummer',  required: false, type: 'text' },
    { name: 'order_email',  label: 'Order-E-Mail',  required: false, type: 'email' },
    { name: 'phone',        label: 'Telefon',       required: false, type: 'tel' },
  ]

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      {fields.map(({ name, label, required, type }) => (
        <div key={name}>
          <label className="field-label">
            {label}{required && <span className="text-warning ml-1">*</span>}
          </label>
          <input
            name={name}
            type={type}
            required={required}
            className="field-input"
          />
        </div>
      ))}

      {/* Address textarea */}
      <div>
        <label className="field-label">
          Adresse
        </label>
        <textarea
          name="address"
          rows={3}
          className="field-input resize-none"
        />
      </div>

      {/* Logo upload */}
      <div>
        <label className="field-label">
          Logo
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-border file:bg-surface-2 file:text-text-secondary hover:file:text-text-primary file:cursor-pointer file:transition-colors"
        />
        <p className="mt-1.5 text-xs text-text-secondary">PNG, JPG oder SVG — wird im Footer der Newsletter verwendet.</p>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-warning">
          <AlertCircle size={16} strokeWidth={1.75} />
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? <Upload size={16} strokeWidth={1.75} className="animate-pulse" /> : <Save size={16} strokeWidth={1.75} />}
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          Abbrechen
        </button>
      </div>
    </form>
  )
}
