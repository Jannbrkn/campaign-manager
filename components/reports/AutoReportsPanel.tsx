'use client'

import { useState } from 'react'
import { Loader2, FileSpreadsheet } from 'lucide-react'

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
    <div className="bg-surface border border-border rounded-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-text-primary mb-1">Auto-Reports</h2>
          <p className="text-xs text-text-secondary">
            Generiert Reports für alle Newsletter, die ≥4 Werktage her sind.
          </p>
        </div>
        <button
          onClick={triggerAutoReports}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          {running ? 'Läuft…' : 'Jetzt ausführen'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-[#E65100] mt-2">{error}</p>
      )}

      {result && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex gap-6 mb-3">
            <span className="text-xs text-text-secondary">
              Generiert: <span className="text-[#2E7D32] font-medium">{result.processed}</span>
            </span>
            <span className="text-xs text-text-secondary">
              Übersprungen: <span className="text-text-primary font-medium">{result.skipped}</span>
            </span>
            {result.errors?.length > 0 && (
              <span className="text-xs text-text-secondary">
                Fehler: <span className="text-[#E65100] font-medium">{result.errors.length}</span>
              </span>
            )}
          </div>
          {result.details?.length > 0 && (
            <div className="space-y-1">
              {result.details.map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={
                    d.status === 'generated' ? 'text-[#2E7D32]' :
                    d.status === 'error' ? 'text-[#E65100]' :
                    'text-text-secondary'
                  }>
                    {d.status === 'generated' ? '✓' : d.status === 'error' ? '✗' : '–'}
                  </span>
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
