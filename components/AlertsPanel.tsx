'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Bell, X, CheckCheck, ExternalLink, Loader2 } from 'lucide-react'
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
  six_week_notice:  'text-[#C4A87C] bg-[#C4A87C]/10',
  briefing_missing: 'text-[#E65100] bg-[#E65100]/10',
  assets_missing:   'text-[#E65100] bg-[#E65100]/10',
  chain_blocked:    'text-[#E65100] bg-[#E65100]/10',
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
        className={`relative flex items-center gap-3 px-3 py-2.5 w-full rounded-sm text-sm transition-colors
          ${open ? 'bg-white/5 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
      >
        <Bell size={16} strokeWidth={1.5} />
        <span>Alerts</span>
        {count > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#E65100] text-white text-[10px] font-medium px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-surface border border-border rounded-sm shadow-2xl z-50 flex flex-col max-h-[70vh]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <p className="text-xs font-medium text-text-primary uppercase tracking-wider">
              Alerts {count > 0 && <span className="text-[#E65100]">({count})</span>}
            </p>
            <div className="flex items-center gap-2">
              {alerts.length > 0 && (
                <button
                  onClick={handleDismissAll}
                  disabled={pending}
                  className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-accent-warm transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={11} />
                  Alle gesehen
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-text-secondary" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-text-secondary">Keine offenen Alerts</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${ALERT_COLOR[alert.alert_type] ?? 'text-text-secondary bg-white/5'}`}>
                      {ALERT_LABELS[alert.alert_type] ?? alert.alert_type}
                    </span>
                    <span className="text-[10px] text-text-secondary/60 shrink-0">{timeAgo(alert.sent_at)}</span>
                  </div>

                  <p className="text-xs text-text-primary leading-snug mb-0.5 truncate">{alert.campaign_title}</p>
                  <p className="text-[10px] text-text-secondary mb-2">
                    {alert.manufacturer_name} · {formatDate(alert.scheduled_date)}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToCampaign(alert.scheduled_date)}
                      className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-accent-warm transition-colors"
                    >
                      <ExternalLink size={10} />
                      Im Kalender
                    </button>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      disabled={pending}
                      className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 ml-auto"
                    >
                      <X size={10} />
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
