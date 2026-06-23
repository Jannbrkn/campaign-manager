// components/planning/PlanningForm.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, CalendarPlus, ArrowRight, CheckCircle2, Calendar } from 'lucide-react'

export default function PlanningForm() {
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2]

  const [year, setYear] = useState(currentYear + 1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  async function handleGenerate() {
    if (!window.confirm(`Kampagnenketten für ${year} generieren? Bereits vorhandene Kampagnen werden übersprungen.`)) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/planning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Unbekannter Fehler')
      setResult(json)
    } catch (err: unknown) {
      setResult({ created: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] })
    } finally {
      setLoading(false)
    }
  }

  const pillBase = 'text-sm px-4 py-1.5 rounded-full border transition-colors cursor-pointer'
  const pillActive = 'border-accent-warm bg-accent-warm/10 text-accent-warm'
  const pillInactive = 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'

  return (
    <div className="max-w-lg">
      <div className="mb-8">
        <h1 className="page-title">Jahresplanung</h1>
        <p className="mt-1.5 text-sm text-text-secondary max-w-prose">
          Kampagnenketten für alle Hersteller automatisch anlegen. Hersteller mit bestehenden Kampagnen im gewählten Jahr werden übersprungen.
        </p>
      </div>

      {/* Year selector */}
      <p className="field-label">Jahr auswählen</p>
      <div className="flex gap-2 mb-3 mt-2">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => { setYear(y); setResult(null) }}
            className={`${pillBase} ${year === y ? pillActive : pillInactive}`}
          >
            {y}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-secondary mb-8 max-w-prose">
        Wähle das Jahr, für das die Kampagnenketten angelegt werden sollen.
      </p>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? <Loader2 size={16} className="animate-spin" strokeWidth={1.75} /> : <CalendarPlus size={16} strokeWidth={1.75} />}
        Kampagnen generieren
      </button>

      {/* Result card */}
      {result && (
        <div className="card mt-8 p-6 max-w-sm">
          {result.created > 0 ? (
            <>
              <p className="flex items-center gap-2 text-sm text-text-primary font-medium mb-5">
                <CheckCircle2 size={18} className="text-success" strokeWidth={1.75} />
                Jahresplanung {year} abgeschlossen
              </p>
              <div className="flex gap-8 mb-6">
                <div>
                  <p className="font-display text-3xl font-semibold text-accent-gold">{result.created}</p>
                  <p className="text-xs text-text-secondary mt-0.5">Kampagnen erstellt</p>
                </div>
                {result.skipped > 0 && (
                  <div>
                    <p className="font-display text-3xl font-semibold text-text-secondary">{result.skipped}</p>
                    <p className="text-xs text-text-secondary mt-0.5">übersprungen</p>
                  </div>
                )}
              </div>
              <Link
                href="/calendar"
                className="btn-secondary inline-flex"
              >
                <Calendar size={16} strokeWidth={1.75} />
                Im Kalender ansehen
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </>
          ) : result.errors.length > 0 ? (
            <p className="text-sm text-text-secondary">Fehler beim Generieren.</p>
          ) : (
            <p className="text-sm text-text-secondary">
              Alle Hersteller haben bereits Kampagnen in {year}. Nichts zu tun.
            </p>
          )}

          {result.errors.length > 0 && (
            <ul className="mt-4 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-text-secondary">— {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
