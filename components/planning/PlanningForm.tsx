// components/planning/PlanningForm.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function PlanningForm() {
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2]

  const [year, setYear] = useState(currentYear + 1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  async function handleGenerate() {
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

  const pillBase = 'text-xs px-4 py-1.5 rounded-sm border transition-colors cursor-pointer'
  const pillActive = 'border-accent-warm text-accent-warm'
  const pillInactive = 'border-border text-text-secondary hover:text-text-primary'

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-light text-text-primary mb-2">Jahresplanung</h1>
      <p className="text-sm text-text-secondary mb-8">
        Kampagnenketten für alle Hersteller automatisch anlegen. Hersteller mit bestehenden Kampagnen im gewählten Jahr werden übersprungen.
      </p>

      {/* Year selector */}
      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-3">Jahr auswählen</p>
      <div className="flex gap-2 mb-8">
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

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-2 bg-accent-warm text-[#0A0A0A] text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-[#EDE8E3]/90 transition-colors disabled:opacity-50"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        Kampagnen generieren →
      </button>

      {/* Result card */}
      {result && (
        <div className="mt-8 border border-border bg-surface rounded-sm p-5 max-w-sm">
          {result.created > 0 ? (
            <>
              <p className="text-sm text-text-primary font-medium mb-4">
                ✓ Jahresplanung {year} abgeschlossen
              </p>
              <div className="flex gap-8 mb-5">
                <div>
                  <p className="text-2xl font-light text-[#C4A87C]">{result.created}</p>
                  <p className="text-[11px] text-text-secondary">Kampagnen erstellt</p>
                </div>
                {result.skipped > 0 && (
                  <div>
                    <p className="text-2xl font-light text-[#555]">{result.skipped}</p>
                    <p className="text-[11px] text-text-secondary">übersprungen</p>
                  </div>
                )}
              </div>
              <Link
                href="/calendar"
                className="text-xs text-text-secondary border border-border rounded-sm px-3 py-1.5 hover:text-text-primary transition-colors inline-block"
              >
                Im Kalender ansehen →
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
            <ul className="mt-3 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-[11px] text-text-secondary">— {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
