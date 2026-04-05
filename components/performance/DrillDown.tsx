// components/performance/DrillDown.tsx
import { X } from 'lucide-react'
import type { ManufacturerGroup, CampaignType } from '@/lib/supabase/types'

const TYPE_LABELS: Record<CampaignType, string> = {
  postcard: 'Postkarte',
  newsletter: 'Newsletter',
  report_internal: 'Report Int.',
  report_external: 'Report Ext.',
}

function fmt(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${Math.round(rate * 100)}%`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default function DrillDown({
  group,
  onClose,
}: {
  group: ManufacturerGroup
  onClose: () => void
}) {
  const sorted = [...group.campaigns].sort(
    (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
  )

  return (
    <div className="bg-[#141414] border border-border rounded-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-border">
        <div>
          <p className="text-sm text-text-primary mb-4">
            {group.manufacturer.name} · {group.campaigns.length} Kampagnen
          </p>
          <div className="flex gap-7">
            {[
              { label: 'Ø Öffnung', value: fmt(group.avgOpenRate), gold: true },
              { label: 'Ø Klick', value: fmt(group.avgClickRate), gold: true },
              { label: 'Versendet', value: group.totalSent > 0 ? group.totalSent.toLocaleString('de-DE') : '—', gold: false },
              { label: 'Abmeldungen', value: group.totalUnsubscribes > 0 ? group.totalUnsubscribes.toString() : '—', gold: false },
            ].map(({ label, value, gold }) => (
              <div key={label}>
                <p className="text-[9px] text-text-secondary uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-xl font-light ${gold ? 'text-[#C4A87C]' : 'text-text-primary'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-text-secondary border border-border rounded-sm px-3 py-1.5 hover:text-text-primary transition-colors mt-1"
        >
          <X size={12} />
          Schließen
        </button>
      </div>

      {/* Campaign table */}
      <div>
        {/* Header row */}
        <div className="grid grid-cols-[90px_1fr_80px_70px_70px_70px_70px] px-6 py-2.5 border-b border-[#1E1E1E]">
          {['Typ', 'Kampagne', 'Datum', 'Öffnung', 'Klick', 'Versendet', 'Quelle'].map((h) => (
            <span key={h} className="text-[9px] uppercase tracking-wider text-text-secondary/50">{h}</span>
          ))}
        </div>

        {sorted.map((c) => {
          const stats = c.performance_stats
          const src = stats
            ? stats.source === 'api'
              ? { label: 'API', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
              : { label: 'CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
            : null

          return (
            <div
              key={c.id}
              className="grid grid-cols-[90px_1fr_80px_70px_70px_70px_70px] px-6 py-3 border-b border-[#1A1A1A] hover:bg-[#1A1A1A] transition-colors items-center last:border-b-0"
            >
              <span className="text-[10px] text-text-secondary">{TYPE_LABELS[c.type]}</span>
              <span className="text-xs text-text-primary truncate pr-4">{c.title}</span>
              <span className="text-xs text-text-secondary">{fmtDate(c.scheduled_date)}</span>
              <span className={`text-xs ${stats ? 'text-[#C4A87C]' : 'text-[#444]'}`}>{fmt(stats?.open_rate)}</span>
              <span className={`text-xs ${stats ? 'text-[#C4A87C]' : 'text-[#444]'}`}>{fmt(stats?.click_rate)}</span>
              <span className="text-xs text-text-secondary">{stats ? stats.emails_sent.toLocaleString('de-DE') : '—'}</span>
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
    </div>
  )
}
