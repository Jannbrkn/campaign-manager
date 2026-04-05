'use client'

import { useState, useCallback } from 'react'
import { Upload, CheckCircle2, Loader2, Building2, Factory } from 'lucide-react'
import { uploadAgencyLogo, uploadManufacturerLogo } from './actions'
import type { Agency, Manufacturer } from '@/lib/supabase/types'

// ─── Single drop zone card ────────────────────────────────────────────────────

function LogoCard({
  id,
  name,
  currentLogoUrl,
  type,
}: {
  id: string
  name: string
  currentLogoUrl: string | null
  type: 'agency' | 'manufacturer'
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      setError('Nur Bilddateien (PNG, SVG, JPG)')
      return
    }
    setUploading(true)
    setError(null)
    setSuccess(false)

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    const fd = new FormData()
    fd.append('file', file)
    fd.append(type === 'agency' ? 'agency_id' : 'manufacturer_id', id)

    try {
      if (type === 'agency') {
        await uploadAgencyLogo(fd)
      } else {
        await uploadManufacturerLogo(fd)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
      setPreview(currentLogoUrl)
    } finally {
      setUploading(false)
    }
  }, [id, type, currentLogoUrl])

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)

    // Path 1: real File object (local drag, desktop Dropbox app)
    const file = e.dataTransfer.files[0]
    if (file) {
      upload(file)
      return
    }

    // Path 2: URL from Dropbox web (text/uri-list)
    const uriList = e.dataTransfer.getData('text/uri-list')
    const url = uriList.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'))
    if (!url) return

    setFetching(true)
    setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Fetch fehlgeschlagen')
      const blob = await res.blob()

      // Derive filename from URL, fall back to 'logo'
      const rawName = url.split('/').pop()?.split('?')[0] ?? 'logo'
      const name = rawName || 'logo'

      // If content-type is missing/generic, try to infer from extension
      let type = blob.type
      if (!type || type === 'application/octet-stream') {
        const ext = name.split('.').pop()?.toLowerCase()
        const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' }
        type = (ext && map[ext]) ? map[ext] : blob.type
      }

      const fetchedFile = new File([blob], name, { type })
      upload(fetchedFile)
    } catch {
      setError('Dropbox-Datei konnte nicht geladen werden')
    } finally {
      setFetching(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) upload(file)
    e.target.value = ''
  }

  return (
    <label
      className={`
        relative flex flex-col items-center justify-center gap-3 p-4 rounded-sm border cursor-pointer
        transition-all duration-150 min-h-[140px]
        ${dragging
          ? 'border-accent-warm bg-accent-warm/5 scale-[1.02]'
          : 'border-border bg-surface hover:border-border/80 hover:bg-white/[0.02]'
        }
      `}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input type="file" accept="image/*" className="sr-only" onChange={onFileInput} />

      {/* Logo preview or placeholder */}
      <div className="w-16 h-12 flex items-center justify-center">
        {preview ? (
          <img
            src={preview}
            alt={name}
            className="max-w-full max-h-full object-contain"
            onError={() => setPreview(null)}
          />
        ) : (
          <div className="w-10 h-10 rounded-sm bg-white/5 flex items-center justify-center">
            {type === 'agency'
              ? <Building2 size={18} className="text-text-secondary/40" />
              : <Factory size={18} className="text-text-secondary/40" />
            }
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-xs text-text-primary text-center leading-snug font-medium truncate w-full text-center px-1">
        {name}
      </p>

      {/* Status */}
      <div className="h-5 flex items-center justify-center">
        {(uploading || fetching) && <Loader2 size={12} className="animate-spin text-text-secondary" />}
        {success && <CheckCircle2 size={12} className="text-[#2E7D32]" />}
        {!uploading && !fetching && !success && (
          <span className="text-[10px] text-text-secondary/50 flex items-center gap-1">
            <Upload size={9} />
            {preview ? 'Ersetzen' : 'Logo ablegen'}
          </span>
        )}
      </div>

      {error && (
        <p className="text-[10px] text-[#E65100] text-center absolute bottom-2 left-2 right-2">
          {error}
        </p>
      )}
    </label>
  )
}

// ─── Main grid ────────────────────────────────────────────────────────────────

interface Props {
  agencies: Agency[]
  manufacturers: (Manufacturer & { agencies?: Agency })[]
}

export default function LogoGrid({ agencies, manufacturers }: Props) {
  return (
    <div className="space-y-10">

      {/* Agencies */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2">
          <Building2 size={12} />
          Agenturen
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {agencies.map((agency) => (
            <LogoCard
              key={agency.id}
              id={agency.id}
              name={agency.name}
              currentLogoUrl={agency.logo_url}
              type="agency"
            />
          ))}
        </div>
      </section>

      {/* Manufacturers — grouped by agency */}
      {agencies.map((agency) => {
        const mfgs = manufacturers.filter((m) => m.agency_id === agency.id)
        if (mfgs.length === 0) return null
        return (
          <section key={agency.id}>
            <h2 className="text-xs uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2">
              <Factory size={12} />
              {agency.name}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {mfgs.map((mfg) => (
                <LogoCard
                  key={mfg.id}
                  id={mfg.id}
                  name={mfg.name}
                  currentLogoUrl={mfg.logo_url ?? null}
                  type="manufacturer"
                />
              ))}
            </div>
          </section>
        )
      })}

    </div>
  )
}
