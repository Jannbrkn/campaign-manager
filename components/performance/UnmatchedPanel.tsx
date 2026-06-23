// components/performance/UnmatchedPanel.tsx
// Shows DB campaigns that couldn't be auto-matched to Mailchimp, with ranked
// candidates and a one-click "Verknüpfen" action to set the link manually.

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronDown, ChevronUp, Link2, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'

interface Candidate {
  mc_id: string
  mc_title: string
  mc_subject: string
  send_time: string
  diff_days: number
  score: number
  reasons: string[]
}

interface UnmatchedDb {
  campaign_id: string
  title: string
  scheduled_date: string
  manufacturer_name: string
  agency_name: string
  candidates: Candidate[]
}

interface UnusedMc {
  mc_id: string
  web_id: number | string
  title: string
  subject: string
  send_time: string
}

interface UnmatchedResponse {
  unmatchedDbCount: number
  unusedMcCount: number
  unmatchedDb: UnmatchedDb[]
  unusedMc: UnusedMc[]
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

function scoreBadge(score: number): { label: string; cls: string } {
  if (score >= 10) return { label: 'Sehr wahrscheinlich', cls: 'text-success border-success/30 bg-success/10' }
  if (score >= 5) return { label: 'Wahrscheinlich', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' }
  return { label: 'Eher unwahrscheinlich', cls: 'text-text-secondary border-border bg-transparent' }
}

export default function UnmatchedPanel() {
  const router = useRouter()
  const [data, setData] = useState<UnmatchedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [linking, setLinking] = useState<string | null>(null) // campaign_id currently being linked
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({})
  const [showUnusedMc, setShowUnusedMc] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/performance/unmatched')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler beim Laden')
      setData(json)
    } catch (err: any) {
      setError(err.message ?? 'Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function link(campaignId: string, mcId: string) {
    setLinking(campaignId)
    setLinkErrors((e) => { const { [campaignId]: _, ...rest } = e; return rest })
    try {
      const res = await fetch('/api/performance/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, mailchimp_campaign_id: mcId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Verknüpfung fehlgeschlagen')

      // Remove this campaign from the unmatched list optimistically
      setData((d) => d ? {
        ...d,
        unmatchedDbCount: d.unmatchedDbCount - 1,
        unmatchedDb: d.unmatchedDb.filter((c) => c.campaign_id !== campaignId),
        unusedMc: d.unusedMc.filter((mc) => mc.mc_id !== mcId),
        unusedMcCount: d.unusedMcCount - (d.unusedMc.some((mc) => mc.mc_id === mcId) ? 1 : 0),
      } : d)

      // Refresh server components so new stats show up
      router.refresh()
    } catch (err: any) {
      setLinkErrors((e) => ({ ...e, [campaignId]: err.message ?? 'Fehler' }))
    } finally {
      setLinking(null)
    }
  }

  if (loading) {
    return (
      <div className="card p-5 mb-8 flex items-center gap-3">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-text-secondary" />
        <p className="text-sm text-text-secondary">Verknüpfungsstatus wird geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-warning/30 p-5 mb-8 flex items-center gap-3">
        <AlertCircle size={16} strokeWidth={1.75} className="text-warning shrink-0" />
        <p className="text-sm text-warning">Verknüpfungsstatus: {error}</p>
      </div>
    )
  }

  if (!data || (data.unmatchedDbCount === 0 && data.unusedMcCount === 0)) {
    return (
      <div className="card p-5 mb-8 flex items-center gap-3">
        <CheckCircle2 size={20} strokeWidth={1.75} className="text-success shrink-0" />
        <p className="text-sm text-text-secondary">
          Alle versendeten Kampagnen sind verknüpft.
        </p>
        <button
          onClick={load}
          title="Erneut prüfen"
          aria-label="Erneut prüfen"
          className="btn-ghost ml-auto gap-1.5"
        >
          <RefreshCw size={16} strokeWidth={1.75} />
          Prüfen
        </button>
      </div>
    )
  }

  return (
    <div className="mb-8 space-y-3">
      {/* Banner */}
      <div className="card border-warning/30 overflow-hidden">
        <button
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? 'Zuklappen' : 'Aufklappen'}
          aria-label={expanded ? 'Zuklappen' : 'Aufklappen'}
          aria-expanded={expanded}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-hover transition-colors"
        >
          <AlertCircle size={20} strokeWidth={1.75} className="text-warning shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-sm text-text-primary">
              <span className="font-medium">{data.unmatchedDbCount}</span> DB-Kampagne{data.unmatchedDbCount !== 1 ? 'n' : ''} nicht verknüpft
              {data.unusedMcCount > 0 && (
                <span className="text-text-secondary"> · {data.unusedMcCount} Mailchimp-Kampagnen ohne DB-Eintrag</span>
              )}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Stats dieser Kampagnen erscheinen erst, wenn sie verknüpft sind. Klicke zum Aufklappen und ordne die passende Mailchimp-Kampagne zu.
            </p>
          </div>
          {expanded ? <ChevronUp size={18} strokeWidth={1.75} className="shrink-0" /> : <ChevronDown size={18} strokeWidth={1.75} className="shrink-0" />}
        </button>

        {expanded && (
          <div className="border-t border-border">
            {data.unmatchedDb.length === 0 ? (
              <p className="text-sm text-text-secondary px-5 py-4">
                Keine ungematchten DB-Kampagnen.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {data.unmatchedDb.map((db) => (
                  <UnmatchedRow
                    key={db.campaign_id}
                    db={db}
                    linking={linking === db.campaign_id}
                    error={linkErrors[db.campaign_id]}
                    onLink={(mcId) => link(db.campaign_id, mcId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unused Mailchimp campaigns — separate collapsible section */}
      {data.unusedMcCount > 0 && expanded && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowUnusedMc((s) => !s)}
            title={showUnusedMc ? 'Zuklappen' : 'Aufklappen'}
            aria-label={showUnusedMc ? 'Zuklappen' : 'Aufklappen'}
            aria-expanded={showUnusedMc}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors"
          >
            <div className="flex-1 text-left">
              <p className="text-xs text-text-secondary">
                {data.unusedMcCount} Mailchimp-Kampagnen ohne DB-Eintrag · nur zur Info
              </p>
            </div>
            {showUnusedMc ? <ChevronUp size={16} strokeWidth={1.75} className="shrink-0" /> : <ChevronDown size={16} strokeWidth={1.75} className="shrink-0" />}
          </button>
          {showUnusedMc && (
            <div className="border-t border-border divide-y divide-border max-h-96 overflow-y-auto">
              {data.unusedMc.map((mc) => (
                <div key={mc.mc_id} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-xs text-text-secondary w-16 shrink-0">{fmtDate(mc.send_time)}</span>
                  <span className="text-sm text-text-primary truncate flex-1">{mc.title || '(ohne Titel)'}</span>
                  <span className="text-xs text-text-secondary truncate max-w-[200px]">{mc.subject}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UnmatchedRow({
  db,
  linking,
  error,
  onLink,
}: {
  db: UnmatchedDb
  linking: boolean
  error?: string
  onLink: (mcId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const candidates = db.candidates
  const visibleCandidates = showAll ? candidates : candidates.slice(0, 3)

  return (
    <div className="px-5 py-4">
      {/* DB campaign summary */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs text-text-secondary w-16 shrink-0">{fmtDate(db.scheduled_date)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate">{db.title}</p>
          <p className="text-xs text-text-secondary mt-0.5">{db.manufacturer_name} · {db.agency_name}</p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-warning mb-3 ml-[76px]">{error}</p>
      )}

      {/* Candidate list */}
      {candidates.length === 0 ? (
        <p className="text-xs text-text-secondary ml-[76px]">
          Keine passende Mailchimp-Kampagne innerhalb von 60 Tagen gefunden.
        </p>
      ) : (
        <div className="ml-[76px] space-y-1.5">
          {visibleCandidates.map((c) => {
            const badge = scoreBadge(c.score)
            return (
              <div
                key={c.mc_id}
                className="flex items-center gap-3 px-3 py-2 bg-surface-2 border border-border rounded-xl hover:border-border-strong transition-colors"
              >
                <span className="text-[10px] text-text-secondary shrink-0 w-14">
                  {fmtDate(c.send_time)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{c.mc_title || '(ohne Titel)'}</p>
                  {c.mc_subject && (
                    <p className="text-[10px] text-text-secondary truncate mt-0.5">{c.mc_subject}</p>
                  )}
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-full shrink-0 ${badge.cls}`}>
                  {badge.label} · {c.score.toFixed(1)}
                </span>
                <span className="text-[10px] text-text-secondary shrink-0 w-14 text-right">
                  {c.diff_days.toFixed(0)}d Ø
                </span>
                <button
                  onClick={() => onLink(c.mc_id)}
                  disabled={linking}
                  title="Mit dieser Mailchimp-Kampagne verknüpfen"
                  aria-label="Mit dieser Mailchimp-Kampagne verknüpfen"
                  className="flex items-center gap-1.5 text-xs text-accent-warm hover:text-accent-warm/80 border border-accent-warm/30 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 shrink-0"
                >
                  {linking ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : <Link2 size={14} strokeWidth={1.75} />}
                  Verknüpfen
                </button>
              </div>
            )
          })}
          {candidates.length > 3 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors pl-3 pt-1"
            >
              {showAll ? `Weniger anzeigen` : `+ ${candidates.length - 3} weitere Kandidaten`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
