// components/performance/ManufacturerCard.tsx
import { TrendingUp, TrendingDown, Minus, CalendarClock } from 'lucide-react'
import type { ManufacturerGroup, TrendDirection } from '@/lib/supabase/types'

function sourceBadge(sources: ('api' | 'csv')[]) {
  if (sources.length === 0) return { label: 'Keine Daten', cls: 'text-text-secondary/60 border-border bg-transparent' }
  if (sources.includes('api') && sources.includes('csv')) return { label: 'API+CSV', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' }
  if (sources.includes('api')) return { label: 'API', cls: 'text-success border-success/30 bg-success/10' }
  return { label: 'CSV', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' }
}

function fmtRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtDelta(own: number | null, benchmark: number | null): { text: string; cls: string } | null {
  if (own == null || benchmark == null) return null
  const delta = (own - benchmark) * 100
  const sign = delta >= 0 ? '+' : ''
  const cls = delta >= 0 ? 'text-success' : 'text-warning'
  return { text: `${sign}${delta.toFixed(1)}%`, cls }
}

function TrendIcon({ trend }: { trend: TrendDirection }) {
  if (trend === 'up') return <TrendingUp size={14} className="text-success shrink-0" strokeWidth={2} aria-label="Trend steigend" />
  if (trend === 'down') return <TrendingDown size={14} className="text-warning shrink-0" strokeWidth={2} aria-label="Trend fallend" />
  if (trend === 'stable') return <Minus size={14} className="text-text-secondary/60 shrink-0" strokeWidth={2} aria-label="Trend stabil" />
  return null
}

function MetricBlock({
  label,
  value,
  trend,
  benchmark,
  hasData,
}: {
  label: string
  value: string
  trend: TrendDirection
  benchmark: { text: string; cls: string } | null
  hasData: boolean
}) {
  return (
    <div>
      <p className={`font-display text-2xl font-semibold leading-tight mb-1 ${hasData ? 'text-accent-gold' : 'text-text-secondary/50'}`}>
        {value}
      </p>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-secondary">
        <span>{label}</span>
        <TrendIcon trend={trend} />
      </div>
      {benchmark && (
        <p className={`text-[11px] mt-1 ${benchmark.cls}`} title="vs. Branchen-Benchmark">
          {benchmark.text}
        </p>
      )}
    </div>
  )
}

export default function ManufacturerCard({
  group,
  isExpanded,
  onClick,
}: {
  group: ManufacturerGroup
  isExpanded: boolean
  onClick: () => void
}) {
  const hasData = group.avgOpenRate !== null
  const badge = sourceBadge(group.sources)
  const campaignsWithStats = group.campaigns.filter((c) => c.performance_stats).length

  const openDelta = fmtDelta(group.avgOpenRate, group.avgIndustryOpenRate)
  const clickDelta = fmtDelta(group.avgClickRate, group.avgIndustryClickRate)

  return (
    <button
      onClick={onClick}
      aria-expanded={isExpanded}
      className={`text-left bg-surface border rounded-2xl p-6 transition-all relative w-full ${
        isExpanded
          ? 'border-accent-warm bg-accent-warm/5'
          : hasData
          ? 'border-border hover:border-border-strong hover:bg-surface-hover'
          : 'border-border opacity-45 hover:opacity-60'
      }`}
    >
      <span className={`absolute top-4 right-4 text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-full ${badge.cls}`}>
        {badge.label}
      </span>

      <p className="text-[11px] text-text-secondary uppercase tracking-wider mb-1.5">
        {group.manufacturer.agencies?.name}
      </p>
      <p className="text-sm text-text-primary font-medium mb-5 pr-16 truncate">
        {group.manufacturer.name}
      </p>

      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricBlock
              label="Öffnung"
              value={fmtRate(group.avgOpenRate)}
              trend={group.trendOpen}
              benchmark={openDelta}
              hasData={hasData}
            />
            <MetricBlock
              label="Klick"
              value={fmtRate(group.avgClickRate)}
              trend={group.trendClick}
              benchmark={clickDelta}
              hasData={hasData}
            />
          </div>
          <p className="text-[11px] text-text-secondary/70">
            {campaignsWithStats} Kampagne{campaignsWithStats !== 1 ? 'n' : ''}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2.5 mt-2 text-text-secondary">
          <CalendarClock size={20} className="text-text-secondary/50 shrink-0" strokeWidth={1.75} />
          <p className="text-[11px]">
            {group.campaigns.length} Kampagne{group.campaigns.length !== 1 ? 'n' : ''} geplant · noch kein Versand
          </p>
        </div>
      )}
    </button>
  )
}
