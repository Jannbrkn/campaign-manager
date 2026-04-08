'use client'

import { useState, useRef } from 'react'
import { X, Loader2, Download, FileSpreadsheet, Users, BarChart2 } from 'lucide-react'
import type { Manufacturer, Agency } from '@/lib/supabase/types'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

interface Props {
  manufacturers: ManufacturerWithAgency[]
  onClose: () => void
}

type Step = 'form' | 'generating' | 'done' | 'error'

interface ReportFile {
  filename: string
  base64: string
}

function downloadFile(file: ReportFile) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename
  a.click()
  URL.revokeObjectURL(url)
}

function FileDropZone({
  label,
  hint,
  icon: Icon,
  file,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  icon: React.ElementType
  file: File | null
  onChange: (f: File | null) => void
  disabled: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-text-secondary mb-1.5">
        {label}
      </label>
      <div
        className={`border border-dashed rounded-sm px-4 py-4 text-center cursor-pointer transition-colors ${
          file
            ? 'border-[#2E7D32]/60 bg-[#2E7D32]/5'
            : 'border-border hover:border-accent-warm/40'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => ref.current?.click()}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <Icon size={13} className="text-[#2E7D32] shrink-0" />
            <span className="text-sm text-[#2E7D32] truncate max-w-[220px]">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); if (ref.current) ref.current.value = '' }}
              className="text-text-secondary/60 hover:text-text-secondary transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <Icon size={15} className="mx-auto mb-1.5 text-text-secondary/40" />
            <p className="text-xs text-text-secondary/70">{hint}</p>
          </>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

export default function QuickReportModal({ manufacturers, onClose }: Props) {
  const [manufacturerId, setManufacturerId] = useState('')
  const [campaignTitle, setCampaignTitle] = useState('')
  const [recipientsFile, setRecipientsFile] = useState<File | null>(null)
  const [campaignFile, setCampaignFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState('')
  const [internal, setInternal] = useState<ReportFile | null>(null)
  const [external, setExternal] = useState<ReportFile | null>(null)

  const selectedMfg = manufacturers.find((m) => m.id === manufacturerId)
  const canSubmit = !!manufacturerId && !!recipientsFile && !!campaignFile && step === 'form'

  async function handleGenerate() {
    if (!canSubmit) return
    setStep('generating')
    setError('')

    const mfg = manufacturers.find((m) => m.id === manufacturerId)!
    const title = campaignTitle.trim() || mfg.name

    const fd = new FormData()
    fd.append('csv_recipients', recipientsFile!)
    fd.append('csv_campaign', campaignFile!)
    fd.append('manufacturer_name', mfg.name)
    fd.append('agency_name', mfg.agencies?.name ?? 'Collezioni')
    fd.append('campaign_title', title)

    try {
      const res = await fetch('/api/generate/report/quick', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler')
      setInternal(json.internal)
      setExternal(json.external)
      setStep('done')
    } catch (err: any) {
      setError(err.message ?? 'Unbekannter Fehler')
      setStep('error')
    }
  }

  function reset() {
    setStep('form')
    setRecipientsFile(null)
    setCampaignFile(null)
    setCampaignTitle('')
    setInternal(null)
    setExternal(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-surface border border-border rounded-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-secondary mb-0.5">Schnell-Report</p>
            <h2 className="text-base font-light text-text-primary">Report generieren</h2>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {step === 'done' ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Beide Reports wurden erfolgreich erstellt. Klicke zum Herunterladen.
              </p>
              {internal && (
                <button
                  onClick={() => downloadFile(internal)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-background border border-border rounded-sm hover:border-accent-warm/50 transition-colors text-left"
                >
                  <FileSpreadsheet size={16} className="text-[#2E7D32] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{internal.filename}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Interner Lead-Report</p>
                  </div>
                  <Download size={14} className="text-text-secondary shrink-0" />
                </button>
              )}
              {external && (
                <button
                  onClick={() => downloadFile(external)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-background border border-border rounded-sm hover:border-accent-warm/50 transition-colors text-left"
                >
                  <FileSpreadsheet size={16} className="text-accent-warm shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{external.filename}</p>
                    <p className="text-xs text-text-secondary mt-0.5">Externe Kampagnenauswertung</p>
                  </div>
                  <Download size={14} className="text-text-secondary shrink-0" />
                </button>
              )}
              <button
                onClick={reset}
                className="w-full text-xs text-text-secondary hover:text-text-primary transition-colors pt-1"
              >
                Weiteren Report erstellen
              </button>
            </div>
          ) : step === 'error' ? (
            <div className="space-y-3">
              <p className="text-sm text-[#E65100]">{error}</p>
              <button
                onClick={() => setStep('form')}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Zurück
              </button>
            </div>
          ) : (
            <>
              {/* Manufacturer select */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-secondary mb-1.5">
                  Hersteller
                </label>
                <select
                  value={manufacturerId}
                  onChange={(e) => setManufacturerId(e.target.value)}
                  disabled={step === 'generating'}
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-warm/50 transition-colors disabled:opacity-50"
                >
                  <option value="">Hersteller wählen…</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.agencies?.name ?? '—'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Campaign title */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-text-secondary mb-1.5">
                  Kampagnenname <span className="normal-case text-text-secondary/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  disabled={step === 'generating'}
                  placeholder={selectedMfg ? selectedMfg.name : 'z.B. B&B Italia Frühjahr 2026'}
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-warm/50 transition-colors disabled:opacity-50"
                />
              </div>

              {/* Two CSV upload zones */}
              <FileDropZone
                label="Rezipienten-Export"
                hint="Mailchimp Audience-Export · enthält Namen & Telefon"
                icon={Users}
                file={recipientsFile}
                onChange={setRecipientsFile}
                disabled={step === 'generating'}
              />
              <FileDropZone
                label="Kampagnenwerte-Export"
                hint="Mailchimp Kampagnen-Report · enthält Opens & Clicks"
                icon={BarChart2}
                file={campaignFile}
                onChange={setCampaignFile}
                disabled={step === 'generating'}
              />

              {/* Missing file hints */}
              {manufacturerId && (recipientsFile || campaignFile) && !(recipientsFile && campaignFile) && (
                <p className="text-xs text-[#E65100]">
                  {!recipientsFile
                    ? 'Die Rezipienten-Auswertung fehlt für den vollständigen Report.'
                    : 'Die Kampagnenwerte fehlen für den vollständigen Report.'}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(step === 'form' || step === 'generating') && (
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-40"
            >
              {step === 'generating' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Wird generiert…
                </>
              ) : (
                <>
                  <FileSpreadsheet size={14} />
                  Reports generieren
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
