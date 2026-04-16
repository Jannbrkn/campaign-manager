// components/performance/ManufacturerCard.tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { ManufacturerGroup, TrendDirection } from '@/lib/supabase/types'

function sourceBadge(sources: ('api' | 'csv')[]) {
  if (sources.length === 0) return { label: 'Keine Daten', cls: 'text-[#444] border-[#333] bg-transparent' }
  if (sources.includes('api') && sources.includes('csv')) return { label: 'API+CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
  if (sources.includes('api')) return { label: 'API', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
  return { label: 'CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
}

function fmtRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function fmtDelta(own: number | null, benchmark: number | null): { text: string; cls: string } | null {
  if (own == null || benchmark == null) return null
  const delta = (own - benchmark) * 100
  const sign = delta >= 0 ? '+' : ''
  const cls = delta >= 0 ? 'text-[#2E7D32]' : 'text-[#E65100]'
  return { text: `${sign}${delta.toFixed(1)}%`, cls }
}

function TrendIcon({ trend }: { trend: TrendDirection }) {
  if (trend === 'up') return <TrendingUp size={11} className="text-[#2E7D32] shrink-0" strokeWidth={2} />
  if (trend === 'down') return <TrendingDown size={11} className="text-[#E65100] shrink-0" strokeWidth={2} />
  if (trend === 'stable') return <Minus size={11} className="text-text-secondary/60 shrink-0" strokeWidth={2} />
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
      <p className={`text-2xl font-light leading-tight mb-1 ${hasData ? 'text-[#C4A87C]' : 'text-[#444]'}`}>
        {value}
      </p>
      <div className="flex items-center gap-1 text-[10px] text-text-secondary">
        <span>{label}</span>
        <TrendIcon trend={trend} />
      </div>
      {benchmark && (
        <p className={`text-[10px] mt-0.5 ${benchmark.cls}`} title="vs. Branchen-Benchmark">
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
      className={`text-left bg-surface border rounded-sm p-5 transition-all relative w-full ${
        isExpanded
          ? 'border-accent-warm bg-[#EDE8E3]/5'
          : hasData
          ? 'border-border hover:border-[#3A3A3A] hover:bg-[#1E1E1E]'
          : 'border-border opacity-45 hover:opacity-60'
      }`}
    >
      <span className={`absolute top-3 right-3 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm ${badge.cls}`}>
        {badge.label}
      </span>

      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
        {group.manufacturer.agencies?.name}
      </p>
      <p className="text-sm text-text-primary font-medium mb-4 pr-12 truncate">
        {group.manufacturer.name}
      </p>

      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
          <p className="text-[10px] text-text-secondary/70">
            {campaignsWithStats} Kampagne{campaignsWithStats !== 1 ? 'n' : ''}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-text-secondary mt-2">
          {group.campaigns.length} Kampagne{group.campaigns.length !== 1 ? 'n' : ''} geplant · noch kein Versand
        </p>
      )}
    </button>
  )
}
