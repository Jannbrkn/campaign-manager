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
  if (score >= 10) return { label: 'Sehr wahrscheinlich', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
  if (score >= 5) return { label: 'Wahrscheinlich', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/10' }
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
      <div className="bg-surface border border-border rounded-sm p-4 mb-6 flex items-center gap-3">
        <Loader2 size={14} className="animate-spin text-text-secondary" />
        <p className="text-xs text-text-secondary">Verknüpfungsstatus wird geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-surface border border-[#E65100]/30 rounded-sm p-4 mb-6">
        <p className="text-xs text-[#E65100]">Verknüpfungsstatus: {error}</p>
      </div>
    )
  }

  if (!data || (data.unmatchedDbCount === 0 && data.unusedMcCount === 0)) {
    return (
      <div className="bg-surface border border-border rounded-sm p-4 mb-6 flex items-center gap-3">
        <CheckCircle2 size={14} className="text-[#2E7D32]" />
        <p className="text-xs text-text-secondary">
          Alle versendeten Kampagnen sind verknüpft.
        </p>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 text-[10px] text-text-secondary/60 hover:text-text-secondary transition-colors"
        >
          <RefreshCw size={10} />
          Prüfen
        </button>
      </div>
    )
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Banner */}
      <div className="bg-surface border border-[#E65100]/30 rounded-sm overflow-hidden">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1A1A1A] transition-colors"
        >
          <AlertCircle size={14} className="text-[#E65100] shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-xs text-text-primary">
              <span className="font-medium">{data.unmatchedDbCount}</span> DB-Kampagne{data.unmatchedDbCount !== 1 ? 'n' : ''} nicht verknüpft
              {data.unusedMcCount > 0 && (
                <span className="text-text-secondary"> · {data.unusedMcCount} Mailchimp-Kampagnen ohne DB-Eintrag</span>
              )}
            </p>
            <p className="text-[10px] text-text-secondary/70 mt-0.5">
              Stats dieser Kampagnen erscheinen erst, wenn sie verknüpft sind
            </p>
          </div>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded && (
          <div className="border-t border-border">
            {data.unmatchedDb.length === 0 ? (
              <p className="text-xs text-text-secondary px-4 py-4">
                Keine ungematchten DB-Kampagnen.
              </p>
            ) : (
              <div className="divide-y divide-[#1A1A1A]">
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
        <div className="bg-surface border border-border rounded-sm overflow-hidden">
          <button
            onClick={() => setShowUnusedMc((s) => !s)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1A1A1A] transition-colors"
          >
            <div className="flex-1 text-left">
              <p className="text-[11px] text-text-secondary">
                {data.unusedMcCount} Mailchimp-Kampagnen ohne DB-Eintrag · nur zur Info
              </p>
            </div>
            {showUnusedMc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showUnusedMc && (
            <div className="border-t border-border divide-y divide-[#1A1A1A] max-h-96 overflow-y-auto">
              {data.unusedMc.map((mc) => (
                <div key={mc.mc_id} className="px-4 py-2.5 flex items-center gap-4">
                  <span className="text-[10px] text-text-secondary w-16 shrink-0">{fmtDate(mc.send_time)}</span>
                  <span className="text-xs text-text-primary truncate flex-1">{mc.title || '(ohne Titel)'}</span>
                  <span className="text-[10px] text-text-secondary truncate max-w-[200px]">{mc.subject}</span>
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
    <div className="px-4 py-3">
      {/* DB campaign summary */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-[10px] text-text-secondary w-16 shrink-0">{fmtDate(db.scheduled_date)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-primary truncate">{db.title}</p>
          <p className="text-[10px] text-text-secondary">{db.manufacturer_name} · {db.agency_name}</p>
        </div>
      </div>

      {error && (
        <p className="text-[10px] text-[#E65100] mb-2 ml-[76px]">{error}</p>
      )}

      {/* Candidate list */}
      {candidates.length === 0 ? (
        <p className="text-[10px] text-text-secondary/60 ml-[76px]">
          Keine passende Mailchimp-Kampagne innerhalb von 60 Tagen gefunden.
        </p>
      ) : (
        <div className="ml-[76px] space-y-1">
          {visibleCandidates.map((c) => {
            const badge = scoreBadge(c.score)
            return (
              <div
                key={c.mc_id}
                className="flex items-center gap-3 px-2.5 py-1.5 bg-background border border-border rounded-sm hover:border-[#3A3A3A] transition-colors"
              >
                <span className="text-[9px] text-text-secondary shrink-0 w-14">
                  {fmtDate(c.send_time)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-text-primary truncate">{c.mc_title || '(ohne Titel)'}</p>
                  {c.mc_subject && (
                    <p className="text-[10px] text-text-secondary truncate">{c.mc_subject}</p>
                  )}
                </div>
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm shrink-0 ${badge.cls}`}>
                  {badge.label} · {c.score.toFixed(1)}
                </span>
                <span className="text-[9px] text-text-secondary/70 shrink-0 w-14 text-right">
                  {c.diff_days.toFixed(0)}d Ø
                </span>
                <button
                  onClick={() => onLink(c.mc_id)}
                  disabled={linking}
                  className="flex items-center gap-1 text-[10px] text-accent-warm hover:text-accent-warm/80 border border-accent-warm/30 rounded-sm px-2 py-1 transition-colors disabled:opacity-50 shrink-0"
                >
                  {linking ? <Loader2 size={9} className="animate-spin" /> : <Link2 size={9} />}
                  Verknüpfen
                </button>
              </div>
            )
          })}
          {candidates.length > 3 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-[10px] text-text-secondary hover:text-text-primary transition-colors pl-2.5"
            >
              {showAll ? `Weniger anzeigen` : `+ ${candidates.length - 3} weitere Kandidaten`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
