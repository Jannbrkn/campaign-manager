// components/performance/LinkDomainPanels.tsx
// Two side-by-side tables shown in DrillDown:
// - Top-Links: which URLs got clicked most (aggregated across manufacturer's campaigns)
// - Domain-Performance: engagement by recipient email domain (gmx, t-online, gmail, ...)

import { ExternalLink } from 'lucide-react'
import type { AggregatedLink, AggregatedDomain } from '@/lib/supabase/types'

function fmtInt(n: number): string {
  return n.toLocaleString('de-DE')
}

function fmtRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function truncateUrl(url: string, maxLen: number = 50): string {
  if (url.length <= maxLen) return url
  const stripped = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
  return stripped.length > maxLen ? stripped.slice(0, maxLen - 1) + '…' : stripped
}

export function TopLinksPanel({ links }: { links: AggregatedLink[] }) {
  if (links.length === 0) {
    return (
      <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
        <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
          Top-Links
        </p>
        <p className="text-xs text-text-secondary/60">
          Keine Klick-Daten vorhanden. Wird beim nächsten Refresh für versendete Kampagnen geladen.
        </p>
      </div>
    )
  }

  const maxClicks = Math.max(...links.map((l) => l.unique_clicks))

  return (
    <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] uppercase tracking-wider text-text-secondary">
          Top-Links
        </p>
        <p className="text-[10px] text-text-secondary/60">
          {links.length} URL{links.length !== 1 ? 's' : ''} · nach unique Klicks
        </p>
      </div>

      <div className="space-y-1.5">
        {links.map((link) => {
          const pct = maxClicks > 0 ? (link.unique_clicks / maxClicks) * 100 : 0
          return (
            <div key={link.url} className="group">
              <div className="flex items-center gap-3">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-text-primary hover:text-accent-warm transition-colors flex-1 min-w-0"
                  title={link.url}
                >
                  <span className="truncate">{truncateUrl(link.url)}</span>
                  <ExternalLink size={9} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                </a>
                <span className="text-[11px] text-[#C4A87C] tabular-nums shrink-0 w-10 text-right">
                  {fmtInt(link.unique_clicks)}
                </span>
                <span className="text-[10px] text-text-secondary/60 tabular-nums shrink-0 w-12 text-right">
                  {fmtInt(link.total_clicks)} ges.
                </span>
              </div>
              <div className="h-0.5 bg-[#1A1A1A] rounded-full overflow-hidden mt-1">
                <div className="h-full bg-[#C4A87C]/40" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function DomainPerformancePanel({ domains }: { domains: AggregatedDomain[] }) {
  if (domains.length === 0) {
    return (
      <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
        <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-3">
          Domain-Performance
        </p>
        <p className="text-xs text-text-secondary/60">
          Keine Domain-Daten vorhanden. Wird beim nächsten Refresh geladen.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] uppercase tracking-wider text-text-secondary">
          Domain-Performance
        </p>
        <p className="text-[10px] text-text-secondary/60">
          Top {domains.length} · nach Volumen
        </p>
      </div>

      {/* Header */}
      <div
        className="grid items-center gap-2 text-[9px] uppercase tracking-wider text-text-secondary/50 pb-1.5 border-b border-[#1A1A1A]"
        style={{ gridTemplateColumns: '1fr 50px 55px 55px 40px' }}
      >
        <span>Domain</span>
        <span className="text-right">Versandt</span>
        <span className="text-right">Öffnung</span>
        <span className="text-right">Klick</span>
        <span className="text-right">Bounce</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1A1A1A]">
        {domains.map((d) => (
          <div
            key={d.domain}
            className="grid items-center gap-2 py-1.5 text-xs"
            style={{ gridTemplateColumns: '1fr 50px 55px 55px 40px' }}
          >
            <span className="text-text-primary truncate">{d.domain}</span>
            <span className="text-text-secondary tabular-nums text-right">{fmtInt(d.emails_sent)}</span>
            <span className="text-[#C4A87C] tabular-nums text-right">{fmtRate(d.open_rate)}</span>
            <span className="text-[#C4A87C] tabular-nums text-right">{fmtRate(d.click_rate)}</span>
            <span className="text-text-secondary tabular-nums text-right">{d.bounces > 0 ? fmtInt(d.bounces) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
