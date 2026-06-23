'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Bell, X, CheckCheck, ExternalLink, Loader2, BellOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getActiveAlerts, acknowledgeAlert, acknowledgeAllAlerts } from '@/app/(app)/alerts/actions'
import type { ActiveAlert } from '@/app/(app)/alerts/actions'

const ALERT_LABELS: Record<string, string> = {
  six_week_notice:  '6 Wochen bis Versand',
  briefing_missing: 'Briefing fehlt',
  assets_missing:   'Assets fehlen',
  chain_blocked:    'Kette blockiert',
  overdue:          'Überfällig',
}

const ALERT_COLOR: Record<string, string> = {
  six_week_notice:  'text-accent-gold bg-accent-gold/10',
  briefing_missing: 'text-warning bg-warning/10',
  assets_missing:   'text-warning bg-warning/10',
  chain_blocked:    'text-warning bg-warning/10',
  overdue:          'text-red-400 bg-red-400/10',
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    day: 'numeric', month: 'short',
  })
}

function timeAgo(isoStr: string) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000)
  if (diff < 60) return `vor ${diff} Min.`
  if (diff < 1440) return `vor ${Math.floor(diff / 60)} Std.`
  return `vor ${Math.floor(diff / 1440)} Tagen`
}

export default function AlertsPanel({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleOpen() {
    setOpen((o) => !o)
    if (!open) {
      setLoading(true)
      const data = await getActiveAlerts()
      setAlerts(data)
      setCount(data.length)
      setLoading(false)
    }
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      await acknowledgeAlert(id)
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      setCount((c) => Math.max(0, c - 1))
    })
  }

  function handleDismissAll() {
    startTransition(async () => {
      await acknowledgeAllAlerts()
      setAlerts([])
      setCount(0)
    })
  }

  function goToCampaign(scheduledDate: string) {
    setOpen(false)
    router.push(`/calendar?date=${scheduledDate}`)
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        title="Alerts"
        aria-label="Alerts"
        className={`relative flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm transition-colors
          ${open ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
      >
        <Bell size={16} strokeWidth={1.75} />
        <span>Alerts</span>
        {count > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-warning text-white text-[10px] font-medium px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-surface-2 border border-border rounded-2xl shadow-elevated z-50 flex flex-col max-h-[70vh]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <p className="section-title">
              Alerts {count > 0 && <span className="text-warning">({count})</span>}
            </p>
            <div className="flex items-center gap-1">
              {alerts.length > 0 && (
                <button
                  onClick={handleDismissAll}
                  disabled={pending}
                  title="Alle als gesehen markieren"
                  aria-label="Alle als gesehen markieren"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-secondary hover:text-accent-warm hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={14} strokeWidth={1.75} />
                  Alle gesehen
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Schließen"
                aria-label="Schließen"
                className="rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-text-secondary" strokeWidth={1.75} />
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                <BellOff size={32} className="text-text-secondary/50 mb-3" strokeWidth={1.5} />
                <p className="text-sm font-medium text-text-primary">Keine offenen Alerts</p>
                <p className="mt-1 max-w-xs text-xs text-text-secondary">
                  Hier erscheinen Hinweise zu anstehenden Versänden, fehlenden Assets und überfälligen Kampagnen.
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`badge font-medium ${ALERT_COLOR[alert.alert_type] ?? 'text-text-secondary bg-surface-hover'}`}>
                      {ALERT_LABELS[alert.alert_type] ?? alert.alert_type}
                    </span>
                    <span className="text-[10px] text-text-secondary/60 shrink-0">{timeAgo(alert.sent_at)}</span>
                  </div>

                  <p className="text-sm text-text-primary leading-snug mb-0.5 truncate">{alert.campaign_title}</p>
                  <p className="text-xs text-text-secondary mb-2.5">
                    {alert.manufacturer_name} · {formatDate(alert.scheduled_date)}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToCampaign(alert.scheduled_date)}
                      title="Im Kalender öffnen"
                      aria-label="Im Kalender öffnen"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-secondary hover:text-accent-warm hover:bg-surface-hover transition-colors"
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                      Im Kalender
                    </button>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      disabled={pending}
                      title="Als gesehen markieren"
                      aria-label="Als gesehen markieren"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50 ml-auto"
                    >
                      <X size={14} strokeWidth={1.75} />
                      Gesehen
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
