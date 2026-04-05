// components/performance/ManufacturerCard.tsx
import type { ManufacturerGroup } from '@/lib/supabase/types'

function sourceBadge(sources: ('api' | 'csv')[]) {
  if (sources.length === 0) return { label: 'Keine Daten', cls: 'text-[#444] border-[#333] bg-transparent' }
  if (sources.includes('api') && sources.includes('csv')) return { label: 'API+CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
  if (sources.includes('api')) return { label: 'API', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
  return { label: 'CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
}

function fmt(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
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
      {/* Source badge */}
      <span className={`absolute top-3 right-3 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm ${badge.cls}`}>
        {badge.label}
      </span>

      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
        {group.manufacturer.agencies?.name}
      </p>
      <p className="text-sm text-text-primary font-medium mb-4 pr-12 truncate">
        {group.manufacturer.name}
      </p>

      <p className={`text-3xl font-light mb-1.5 ${hasData ? 'text-[#C4A87C]' : 'text-[#444]'}`}>
        {fmt(group.avgOpenRate)}
      </p>
      <p className="text-[11px] text-text-secondary">
        {hasData
          ? `${fmt(group.avgClickRate)} Klick · ${campaignsWithStats} Kamp.`
          : `${group.campaigns.length} Kampagne${group.campaigns.length !== 1 ? 'n' : ''} · kein Export`}
      </p>
    </button>
  )
}
