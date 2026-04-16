// components/performance/TrendChart.tsx
// Pure-SVG trend chart — no charting lib dependency.
// Displays one metric over time with optional industry benchmark line.

'use client'

import { useState } from 'react'
import type { CampaignWithManufacturer } from '@/lib/supabase/types'

interface Point {
  x: number          // index in series
  y: number          // rate as fraction 0-1
  date: string       // ISO
  title: string
  benchmark: number | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function buildPoints(
  campaigns: CampaignWithManufacturer[],
  metric: 'open' | 'click'
): Point[] {
  const sorted = campaigns
    .filter((c) => c.performance_stats)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

  return sorted.map((c, i) => {
    const stats = c.performance_stats!
    const y = metric === 'open' ? stats.open_rate : stats.click_rate
    const benchmark =
      metric === 'open'
        ? stats.industry_open_rate ?? null
        : stats.industry_click_rate ?? null
    return { x: i, y, date: c.scheduled_date, title: c.title, benchmark }
  })
}

export default function TrendChart({
  campaigns,
  metric,
  label,
}: {
  campaigns: CampaignWithManufacturer[]
  metric: 'open' | 'click'
  label: string
}) {
  const points = buildPoints(campaigns, metric)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
        <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-3">{label}</p>
        <p className="text-xs text-text-secondary/60">
          {points.length === 0
            ? 'Keine Daten — noch keine Kampagne mit Stats'
            : 'Mindestens 2 Kampagnen nötig für einen Trendverlauf'}
        </p>
      </div>
    )
  }

  // Viewbox geometry
  const W = 600
  const H = 160
  const PAD_X = 40
  const PAD_Y_TOP = 16
  const PAD_Y_BOT = 28

  // Y range — combine own + benchmark to keep both visible, round up to nice number
  const allY = points.flatMap((p) => [p.y, p.benchmark ?? 0])
  const yMax = Math.max(...allY, 0.01)
  const yScale = metric === 'open' ? Math.max(0.1, Math.ceil(yMax * 10) / 10) : Math.max(0.02, Math.ceil(yMax * 50) / 50)

  const xStep = (W - 2 * PAD_X) / Math.max(1, points.length - 1)
  const toX = (i: number) => PAD_X + i * xStep
  const toY = (val: number) => PAD_Y_TOP + ((yScale - val) / yScale) * (H - PAD_Y_TOP - PAD_Y_BOT)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.y)}`).join(' ')

  // Benchmark line (only draws where data exists — break at nulls)
  const benchmarkSegments: string[] = []
  let currentSegment: string[] = []
  points.forEach((p, i) => {
    if (p.benchmark != null) {
      currentSegment.push(`${currentSegment.length === 0 ? 'M' : 'L'}${toX(i)},${toY(p.benchmark)}`)
    } else if (currentSegment.length > 0) {
      benchmarkSegments.push(currentSegment.join(' '))
      currentSegment = []
    }
  })
  if (currentSegment.length > 0) benchmarkSegments.push(currentSegment.join(' '))

  // Gridline values — 4 evenly-spaced horizontal lines
  const gridLines = [0, yScale / 4, yScale / 2, (3 * yScale) / 4, yScale]

  // X labels: first, last, and middle (if enough points)
  const xLabels = points.length <= 4
    ? points.map((_, i) => i)
    : [0, Math.floor(points.length / 2), points.length - 1]

  const hover = hoverIdx != null ? points[hoverIdx] : null
  const avgOwn = points.reduce((s, p) => s + p.y, 0) / points.length
  const benchPoints = points.filter((p) => p.benchmark != null)
  const avgBench = benchPoints.length > 0
    ? benchPoints.reduce((s, p) => s + (p.benchmark ?? 0), 0) / benchPoints.length
    : null

  return (
    <div className="bg-[#0F0F0F] border border-border rounded-sm p-5">
      {/* Header with summary */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-secondary mb-0.5">{label}</p>
          <p className="text-[11px] text-text-secondary/60">
            {points.length} Kampagnen · Ø {fmtRate(avgOwn)}
            {avgBench != null && (
              <span className="ml-1 text-text-secondary/50">
                · Branche Ø {fmtRate(avgBench)}
              </span>
            )}
          </p>
        </div>
        {hover && (
          <div className="text-right">
            <p className="text-xs text-[#C4A87C] font-medium">{fmtRate(hover.y)}</p>
            <p className="text-[10px] text-text-secondary truncate max-w-[200px]">
              {fmtDate(hover.date)} · {hover.title}
            </p>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {gridLines.map((val, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              y1={toY(val)}
              x2={W - PAD_X}
              y2={toY(val)}
              stroke="#1E1E1E"
              strokeWidth="1"
            />
            <text
              x={PAD_X - 6}
              y={toY(val) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#666"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {Math.round(val * 100)}%
            </text>
          </g>
        ))}

        {/* Benchmark line (dotted) */}
        {benchmarkSegments.map((seg, i) => (
          <path
            key={i}
            d={seg}
            fill="none"
            stroke="#666"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}

        {/* Main trend line */}
        <path
          d={linePath}
          fill="none"
          stroke="#C4A87C"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={toX(i)}
              cy={toY(p.y)}
              r={hoverIdx === i ? 4 : 2.5}
              fill="#C4A87C"
              stroke="#0F0F0F"
              strokeWidth="1.5"
            />
            {/* Hover target — larger transparent circle */}
            <circle
              cx={toX(i)}
              cy={toY(p.y)}
              r="10"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            />
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map((i) => (
          <text
            key={i}
            x={toX(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#666"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {fmtDate(points[i].date).replace(/\. /g, '.')}
          </text>
        ))}

        {/* Hover vertical line */}
        {hoverIdx != null && (
          <line
            x1={toX(hoverIdx)}
            y1={PAD_Y_TOP}
            x2={toX(hoverIdx)}
            y2={H - PAD_Y_BOT}
            stroke="#C4A87C"
            strokeWidth="0.5"
            strokeOpacity="0.3"
          />
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 pl-10">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#C4A87C]" />
          <span className="text-[9px] text-text-secondary">Diese Marke</span>
        </div>
        {avgBench != null && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-[#666]" />
            <span className="text-[9px] text-text-secondary">Branchenschnitt</span>
          </div>
        )}
      </div>
    </div>
  )
}
