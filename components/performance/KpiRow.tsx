// components/performance/KpiRow.tsx
import type { ManufacturerGroup } from '@/lib/supabase/types'

// Minimum campaigns required for a manufacturer to qualify as "Bester Hersteller".
// Below this threshold the number is statistical noise (e.g. a single send with
// an outlier audience shouldn't win).
const BEST_MIN_CAMPAIGNS = 3

function fmt(rate: number | null): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export default function KpiRow({
  groups,
  totalCampaigns,
}: {
  groups: ManufacturerGroup[]
  totalCampaigns: number
}) {
  const allWithStats = groups.flatMap((g) =>
    g.campaigns.filter((c) => c.performance_stats)
  )
  const withDataCount = allWithStats.length
  const enoughData = withDataCount >= 3

  const avgOpenRate = enoughData
    ? allWithStats.reduce((s, c) => s + c.performance_stats!.open_rate, 0) / withDataCount
    : null

  const avgClickRate = enoughData
    ? allWithStats.reduce((s, c) => s + c.performance_stats!.click_rate, 0) / withDataCount
    : null

  // "Bester Hersteller": requires ≥ BEST_MIN_CAMPAIGNS stat-bearing campaigns
  const bestCandidates = groups.filter(
    (g) => g.avgOpenRate !== null && g.campaigns.filter((c) => c.performance_stats).length >= BEST_MIN_CAMPAIGNS
  )
  const best = bestCandidates[0] ?? null  // groups already sorted by avgOpenRate desc
  const bestCampaignCount = best
    ? best.campaigns.filter((c) => c.performance_stats).length
    : 0

  const kpis = [
    {
      label: 'Ø Öffnungsrate',
      value: fmt(avgOpenRate),
      sub: enoughData ? `über ${withDataCount} Kampagnen` : 'Noch zu wenig Daten',
    },
    {
      label: 'Ø Klickrate',
      value: fmt(avgClickRate),
      sub: enoughData ? `über ${withDataCount} Kampagnen` : 'Noch zu wenig Daten',
    },
    {
      label: 'Kampagnen mit Daten',
      value: withDataCount.toString(),
      sub: `von ${totalCampaigns} gesamt`,
    },
    {
      label: 'Bester Hersteller',
      value: best ? best.manufacturer.name : '—',
      sub: best
        ? `${fmt(best.avgOpenRate)} Öffnung · ${bestCampaignCount} Kamp.`
        : `Min. ${BEST_MIN_CAMPAIGNS} Kampagnen nötig`,
      small: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map(({ label, value, sub, small }) => (
        <div key={label} className="bg-surface border border-border rounded-sm p-6">
          <p className="text-text-secondary text-[10px] tracking-wider uppercase mb-3">{label}</p>
          <p className={`font-light text-text-primary ${small ? 'text-xl' : 'text-3xl'}`}>{value}</p>
          <p className="text-[11px] text-text-secondary/60 mt-1.5">{sub}</p>
        </div>
      ))}
    </div>
  )
}
