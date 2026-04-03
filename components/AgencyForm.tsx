'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      {fields.map(({ name, label, required, type }) => (
        <div key={name}>
          <label className="block text-xs tracking-wider uppercase text-text-secondary mb-2">
            {label}{required && <span className="text-warning ml-1">*</span>}
          </label>
          <input
            name={name}
            type={type}
            required={required}
            className="w-full bg-surface border border-border text-text-primary px-4 py-3 text-sm rounded-sm focus:outline-none focus:border-accent-warm transition-colors"
          />
        </div>
      ))}

      {/* Address textarea */}
      <div>
        <label className="block text-xs tracking-wider uppercase text-text-secondary mb-2">
          Adresse
        </label>
        <textarea
          name="address"
          rows={3}
          className="w-full bg-surface border border-border text-text-primary px-4 py-3 text-sm rounded-sm focus:outline-none focus:border-accent-warm transition-colors resize-none"
        />
      </div>

      {/* Logo upload */}
      <div>
        <label className="block text-xs tracking-wider uppercase text-text-secondary mb-2">
          Logo
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border file:border-border file:bg-background file:text-text-secondary hover:file:text-text-primary file:cursor-pointer"
        />
      </div>

      {error && <p className="text-sm text-warning">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-accent-warm text-background text-sm font-medium px-6 py-2.5 rounded-sm hover:bg-white transition-colors disabled:opacity-50"
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-text-secondary hover:text-text-primary px-4 py-2.5 transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </form>
  )
}
