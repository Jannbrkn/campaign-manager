'use client'

import { useState } from 'react'
import { Loader2, FileSpreadsheet, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'

export default function AutoReportsPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function triggerAutoReports() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/cron/auto-reports')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Fehler beim Ausführen')
      } else {
        setResult(data)
      }
    } catch (err: any) {
      setError(err.message ?? 'Netzwerkfehler')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="section-title mb-1.5">Auto-Reports</h2>
          <p className="text-sm text-text-secondary max-w-prose">
            Generiert Reports für alle Newsletter, die ≥4 Werktage her sind.
          </p>
        </div>
        <button
          onClick={triggerAutoReports}
          disabled={running}
          className="btn-primary shrink-0"
        >
          {running ? <Loader2 size={16} className="animate-spin" strokeWidth={1.75} /> : <FileSpreadsheet size={16} strokeWidth={1.75} />}
          {running ? 'Läuft…' : 'Jetzt ausführen'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-warning mt-2">{error}</p>
      )}

      {result && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="flex flex-wrap gap-8 mb-4">
            <span className="flex flex-col gap-1">
              <span className="field-label">Generiert</span>
              <span className="font-display text-2xl font-semibold text-success">{result.processed}</span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="field-label">Übersprungen</span>
              <span className="font-display text-2xl font-semibold text-text-primary">{result.skipped}</span>
            </span>
            {result.errors?.length > 0 && (
              <span className="flex flex-col gap-1">
                <span className="field-label">Fehler</span>
                <span className="font-display text-2xl font-semibold text-warning">{result.errors.length}</span>
              </span>
            )}
          </div>
          {result.details?.length > 0 && (
            <div className="space-y-1.5">
              {result.details.map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {d.status === 'generated' ? (
                    <CheckCircle2 size={16} className="text-success shrink-0" strokeWidth={1.75} />
                  ) : d.status === 'error' ? (
                    <XCircle size={16} className="text-warning shrink-0" strokeWidth={1.75} />
                  ) : (
                    <MinusCircle size={16} className="text-text-secondary shrink-0" strokeWidth={1.75} />
                  )}
                  <span className="text-text-primary">{d.campaign}</span>
                  {d.reason && <span className="text-text-secondary">— {d.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
