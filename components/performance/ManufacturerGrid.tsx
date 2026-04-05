// components/performance/ManufacturerGrid.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { ManufacturerGroup, Agency } from '@/lib/supabase/types'
import ManufacturerCard from './ManufacturerCard'
import DrillDown from './DrillDown'

const YEARS = ['2026', '2025', '2024', 'Alle']

export default function ManufacturerGrid({
  groups,
  agencies,
  searchParams,
}: {
  groups: ManufacturerGroup[]
  agencies: Agency[]
  searchParams: { year?: string; agency?: string; type?: string }
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  const year = searchParams.year ?? '2026'
  const agency = searchParams.agency ?? 'alle'
  const type = searchParams.type ?? 'alle'

  function toggle(mfgId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mfgId)) next.delete(mfgId)
      else next.add(mfgId)
      return next
    })
  }

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const res = await fetch('/api/performance/refresh', { method: 'POST' })
      const json = await res.json()
      setRefreshResult(json.updated > 0 ? `${json.updated} Kampagnen aktualisiert` : 'Keine API-Kampagnen gefunden')
      if (json.updated > 0) window.location.reload()
    } catch {
      setRefreshResult('Fehler beim Aktualisieren')
    } finally {
      setRefreshing(false)
    }
  }

  function filterLink(params: { year?: string; agency?: string; type?: string }) {
    const p = new URLSearchParams({ year, agency, type, ...params })
    return `/performance?${p.toString()}`
  }

  const pillBase = 'text-xs px-3 py-1.5 rounded-sm border transition-colors'
  const pillActive = 'border-accent-warm text-accent-warm'
  const pillInactive = 'border-border text-text-secondary hover:text-text-primary'

  return (
    <div>
      {/* Refresh button + result */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-xs text-text-secondary border border-border rounded-sm px-3 py-1.5 hover:text-text-primary transition-colors disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Mailchimp aktualisieren
        </button>
        {refreshResult && <span className="text-xs text-text-secondary">{refreshResult}</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Year */}
        <div className="flex gap-1.5">
          {YEARS.map((y) => {
            const val = y.toLowerCase() === 'alle' ? 'alle' : y
            return (
              <Link key={y} href={filterLink({ year: val })} className={`${pillBase} ${year === val ? pillActive : pillInactive}`}>
                {y}
              </Link>
            )
          })}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Agency */}
        <div className="flex gap-1.5 flex-wrap">
          <Link href={filterLink({ agency: 'alle' })} className={`${pillBase} ${agency === 'alle' ? pillActive : pillInactive}`}>
            Alle
          </Link>
          {agencies.map((a) => (
            <Link key={a.id} href={filterLink({ agency: a.id })} className={`${pillBase} ${agency === a.id ? pillActive : pillInactive}`}>
              {a.name}
            </Link>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Type */}
        <div className="flex gap-1.5">
          {[
            { value: 'alle', label: 'Alle' },
            { value: 'newsletter', label: 'Newsletter' },
            { value: 'postcard', label: 'Postkarte' },
          ].map(({ value, label }) => (
            <Link key={value} href={filterLink({ type: value })} className={`${pillBase} ${type === value ? pillActive : pillInactive}`}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Section label */}
      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-4">
        Hersteller · sortiert nach Öffnungsrate
      </p>

      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {groups.map((g) => (
          <ManufacturerCard
            key={g.manufacturer.id}
            group={g}
            isExpanded={expanded.has(g.manufacturer.id)}
            onClick={() => toggle(g.manufacturer.id)}
          />
        ))}
        {groups.length === 0 && (
          <p className="col-span-4 text-sm text-text-secondary text-center py-12">
            Keine Kampagnen für diese Filter
          </p>
        )}
      </div>

      {/* Drill-down panels */}
      {Array.from(expanded).map((mfgId) => {
        const g = groups.find((x) => x.manufacturer.id === mfgId)
        if (!g) return null
        return <DrillDown key={mfgId} group={g} onClose={() => toggle(mfgId)} />
      })}
    </div>
  )
}
