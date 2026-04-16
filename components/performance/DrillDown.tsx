// components/performance/DrillDown.tsx
import { X, Info } from 'lucide-react'
import type { ManufacturerGroup, CampaignType, CampaignWithManufacturer } from '@/lib/supabase/types'
import TrendChart from './TrendChart'
import { TopLinksPanel, DomainPerformancePanel } from './LinkDomainPanels'

const TYPE_LABELS: Record<CampaignType, string> = {
  postcard: 'Postkarte',
  newsletter: 'Newsletter',
  report_internal: 'Report Int.',
  report_external: 'Report Ext.',
}

function fmtRate(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('de-DE')
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

/** Delta vs. industry benchmark, e.g. "+3.2pp" (positive = better than industry) */
function fmtDelta(own: number | null, industry: number | null): { text: string; cls: string } | null {
  if (own == null || industry == null) return null
  const delta = (own - industry) * 100
  const sign = delta >= 0 ? '+' : ''
  const cls = delta >= 0 ? 'text-[#2E7D32]' : 'text-[#E65100]'
  return { text: `${sign}${delta.toFixed(1)}%`, cls }
}

function MetricTile({
  label,
  value,
  sublabel,
  benchmark,
  gold = false,
  tooltip,
}: {
  label: string
  value: string
  sublabel?: string
  benchmark?: { text: string; cls: string } | null
  gold?: boolean
  tooltip?: string
}) {
  return (
    <div className="min-w-[100px]">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-[9px] text-text-secondary uppercase tracking-wider">{label}</p>
        {tooltip && (
          <span title={tooltip} className="text-text-secondary/40 hover:text-text-secondary cursor-help">
            <Info size={9} />
          </span>
        )}
      </div>
      <p className={`text-xl font-light ${gold ? 'text-[#C4A87C]' : 'text-text-primary'}`}>{value}</p>
      <div className="flex items-baseline gap-2 mt-0.5">
        {sublabel && <p className="text-[10px] text-text-secondary">{sublabel}</p>}
        {benchmark && <p className={`text-[10px] ${benchmark.cls}`}>{benchmark.text}</p>}
      </div>
    </div>
  )
}

export default function DrillDown({
  group,
  year,
  onClose,
}: {
  group: ManufacturerGroup
  year: string
  onClose: () => void
}) {
  const sorted = [...group.campaigns].sort(
    (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
  )

  const openDelta = fmtDelta(group.avgOpenRate, group.avgIndustryOpenRate)
  const clickDelta = fmtDelta(group.avgClickRate, group.avgIndustryClickRate)

  // Bounce + unsub rates (over total sent)
  const bounceRate = group.totalSent > 0
    ? (group.totalHardBounces + group.totalSoftBounces) / group.totalSent
    : null
  const unsubRate = group.totalSent > 0 ? group.totalUnsubscribes / group.totalSent : null

  return (
    <div className="bg-[#141414] border border-border rounded-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary mb-1">
            {group.manufacturer.name}
          </p>
          <p className="text-[11px] text-text-secondary mb-5">
            {group.campaigns.length} Kampagnen · {year}
            {group.mppFiltered && (
              <span className="ml-2 text-[9px] uppercase tracking-wider text-text-secondary/60 border border-border rounded-sm px-1.5 py-0.5">
                MPP-bereinigt
              </span>
            )}
          </p>

          {/* Primary metrics row */}
          <div className="flex flex-wrap gap-x-8 gap-y-4 mb-4">
            <MetricTile
              label="Ø Öffnungsrate"
              value={fmtRate(group.avgOpenRate)}
              sublabel={group.avgIndustryOpenRate != null ? `vs. Branche ${fmtRate(group.avgIndustryOpenRate)}` : undefined}
              benchmark={openDelta}
              gold
              tooltip={group.mppFiltered ? 'Ohne Apple-Mail-Prefetch-Opens — entspricht der Mailchimp-UI' : 'Rate inkl. Apple MPP-Opens (ältere Kampagnen)'}
            />
            <MetricTile
              label="Ø Klickrate"
              value={fmtRate(group.avgClickRate)}
              sublabel={group.avgIndustryClickRate != null ? `vs. Branche ${fmtRate(group.avgIndustryClickRate)}` : undefined}
              benchmark={clickDelta}
              gold
            />
            <MetricTile
              label="Versendet"
              value={group.totalSent > 0 ? fmtInt(group.totalSent) : '—'}
            />
          </div>

          {/* Secondary metrics row */}
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <MetricTile
              label="Abmeldungen"
              value={group.totalUnsubscribes > 0 ? fmtInt(group.totalUnsubscribes) : '—'}
              sublabel={unsubRate != null ? fmtRate(unsubRate) : undefined}
            />
            <MetricTile
              label="Hard Bounces"
              value={fmtInt(group.totalHardBounces)}
              tooltip="Zustellung dauerhaft fehlgeschlagen — Adresse ungültig"
            />
            <MetricTile
              label="Soft Bounces"
              value={fmtInt(group.totalSoftBounces)}
              tooltip="Zustellung temporär fehlgeschlagen — Postfach voll o.ä."
            />
            <MetricTile
              label="Bounce-Rate"
              value={bounceRate != null ? fmtRate(bounceRate) : '—'}
              sublabel="gesamt"
            />
            <MetricTile
              label="Spam-Meldungen"
              value={fmtInt(group.totalAbuseReports)}
              tooltip="Empfänger haben die Mail als Spam markiert"
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-text-secondary border border-border rounded-sm px-3 py-1.5 hover:text-text-primary transition-colors shrink-0 ml-4"
        >
          <X size={12} />
          Schließen
        </button>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 py-5 border-b border-border">
        <TrendChart campaigns={group.campaigns} metric="open" label="Öffnungsrate über Zeit" />
        <TrendChart campaigns={group.campaigns} metric="click" label="Klickrate über Zeit" />
      </div>

      {/* Link + Domain panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 py-5 border-b border-border">
        <TopLinksPanel links={group.topLinks} />
        <DomainPerformancePanel domains={group.topDomains} />
      </div>

      {/* Campaign table */}
      <CampaignTable campaigns={sorted} />
    </div>
  )
}

function CampaignTable({ campaigns }: { campaigns: CampaignWithManufacturer[] }) {
  const cols = '90px_1fr_80px_70px_70px_80px_60px_60px_70px'

  return (
    <div>
      {/* Header row */}
      <div className={`grid grid-cols-[${cols}] px-6 py-2.5 border-b border-[#1E1E1E]`}
           style={{ gridTemplateColumns: '90px 1fr 80px 70px 70px 80px 60px 60px 70px' }}>
        {['Typ', 'Kampagne', 'Datum', 'Öffnung', 'Klick', 'Versendet', 'Bounce', 'Abm.', 'Quelle'].map((h) => (
          <span key={h} className="text-[9px] uppercase tracking-wider text-text-secondary/50">{h}</span>
        ))}
      </div>

      {campaigns.map((c) => {
        const stats = c.performance_stats
        const src = stats
          ? stats.source === 'api'
            ? { label: 'API', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
            : { label: 'CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
          : null

        const bounceTotal = stats ? ((stats.hard_bounces ?? 0) + (stats.soft_bounces ?? 0)) : null

        return (
          <div
            key={c.id}
            className="grid px-6 py-3 border-b border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors items-center last:border-b-0"
            style={{ gridTemplateColumns: '90px 1fr 80px 70px 70px 80px 60px 60px 70px' }}
          >
            <span className="text-[10px] text-text-secondary">{TYPE_LABELS[c.type]}</span>
            <span className="text-xs text-text-primary truncate pr-4">{c.title}</span>
            <span className="text-xs text-text-secondary">{fmtDate(c.scheduled_date)}</span>
            <span className={`text-xs ${stats ? 'text-[#C4A87C]' : 'text-[#444]'}`}>{fmtRate(stats?.open_rate)}</span>
            <span className={`text-xs ${stats ? 'text-[#C4A87C]' : 'text-[#444]'}`}>{fmtRate(stats?.click_rate)}</span>
            <span className="text-xs text-text-secondary">{stats ? fmtInt(stats.emails_sent) : '—'}</span>
            <span className="text-xs text-text-secondary">{bounceTotal != null ? fmtInt(bounceTotal) : '—'}</span>
            <span className="text-xs text-text-secondary">{stats?.unsubscribes != null ? fmtInt(stats.unsubscribes) : '—'}</span>
            <span>
              {src && (
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm ${src.cls}`}>
                  {src.label}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
