'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Agency, Manufacturer, CampaignWithManufacturer, CampaignType } from '@/lib/supabase/types'
import NewCampaignModal from './NewCampaignModal'
import CampaignSidePanel, { STATUS_STYLE } from './CampaignSidePanel'

interface Props {
  agencies: Agency[]
  manufacturers: Manufacturer[]
}

type ViewMode = 'month' | 'quarter' | 'year'

const WEEKDAYS    = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_XS = ['M', 'D', 'M', 'D', 'F', 'S', 'S']
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

// ─── Date helpers ──────────────────────────────────────────────────────────────

function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildCalendarGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = isoWeekday(firstDay)
  const endOffset = 6 - isoWeekday(lastDay)
  const days: Date[] = []
  for (let i = startOffset; i > 0; i--) days.push(new Date(year, month, 1 - i))
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
  for (let i = 1; i <= endOffset; i++) days.push(new Date(year, month + 1, i))
  while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - lastDay.getDate() - startOffset + 1))
  return days
}

function getQuarterMonths(year: number, month: number): Array<{ year: number; month: number }> {
  return [0, 1, 2].map((i) => {
    let m = month + i, y = year
    if (m > 11) { m -= 12; y++ }
    return { year: y, month: m }
  })
}

// ─── Conflict detection: weeks with 2+ newsletters ────────────────────────────

function buildConflictDates(campaigns: CampaignWithManufacturer[]): Set<string> {
  const weekMap: Record<string, string[]> = {}
  for (const c of campaigns) {
    if (c.type !== 'newsletter') continue
    const d = new Date(c.scheduled_date + 'T00:00:00')
    const monday = new Date(d)
    monday.setDate(d.getDate() - isoWeekday(d))
    const wk = toDateKey(monday)
    if (!weekMap[wk]) weekMap[wk] = []
    weekMap[wk].push(c.scheduled_date)
  }
  const result = new Set<string>()
  for (const dates of Object.values(weekMap)) {
    if (dates.length >= 2) dates.forEach((d) => result.add(d))
  }
  return result
}

// ─── Campaign type dot color ───────────────────────────────────────────────────

const TYPE_DOT: Record<CampaignType, string> = {
  postcard:        'bg-[#C4A87C]',
  newsletter:      'bg-[#EDE8E3]',
  report_internal: 'bg-[#555555]',
  report_external: 'bg-[#555555]',
}

// ─── Year view — mini month ────────────────────────────────────────────────────

function MiniMonth({
  year, month, byDate, conflictDates, todayKey, onDayClick,
}: {
  year: number
  month: number
  byDate: Record<string, CampaignWithManufacturer[]>
  conflictDates: Set<string>
  todayKey: string
  onDayClick: (year: number, month: number, dateKey: string) => void
}) {
  const grid = buildCalendarGrid(year, month)
  return (
    <div className="p-4">
      <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
        {MONTH_SHORT[month]}
      </p>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS_XS.map((d, i) => (
          <div key={i} className="text-[8px] text-text-secondary/40 text-center py-0.5">{d}</div>
        ))}
      </div>
      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px">
        {grid.map((date, i) => {
          const key = toDateKey(date)
          const isCurrentMonth = date.getMonth() === month
          const dayCampaigns = byDate[key] ?? []
          const isToday = key === todayKey
          const hasNewsletter = dayCampaigns.some((c) => c.type === 'newsletter')
          const hasPostcard = dayCampaigns.some((c) => c.type === 'postcard')
          const isConflict = conflictDates.has(key)

          return (
            <div
              key={key + i}
              onClick={() => isCurrentMonth && dayCampaigns.length > 0 && onDayClick(year, month, key)}
              className={`
                relative flex flex-col items-center justify-start pt-0.5 pb-1 rounded-sm min-h-[26px]
                ${!isCurrentMonth ? 'opacity-20 pointer-events-none' : ''}
                ${isCurrentMonth && dayCampaigns.length > 0 ? 'cursor-pointer hover:bg-white/5' : ''}
              `}
            >
              <span className={`
                text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full leading-none
                ${isToday ? 'bg-accent-warm text-background font-medium w-5 h-5' : 'text-text-secondary'}
              `}>
                {date.getDate()}
              </span>
              {dayCampaigns.length > 0 && !isToday && (
                <div className="flex gap-px mt-0.5">
                  {hasNewsletter && (
                    <span className={`w-1 h-1 rounded-full ${isConflict ? 'bg-[#E65100]' : 'bg-[#EDE8E3]'}`} />
                  )}
                  {hasPostcard && <span className="w-1 h-1 rounded-full bg-[#C4A87C]" />}
                  {!hasNewsletter && !hasPostcard && (
                    <span className="w-1 h-1 rounded-full bg-[#555555]" />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Quarter view — one month column ─────────────────────────────────────────

function QuarterMonth({
  year, month, byDate, conflictDates, todayKey, selectedDate, onDayClick,
}: {
  year: number
  month: number
  byDate: Record<string, CampaignWithManufacturer[]>
  conflictDates: Set<string>
  todayKey: string
  selectedDate: string | null
  onDayClick: (dateKey: string) => void
}) {
  const grid = buildCalendarGrid(year, month)
  const rows = grid.length / 7

  return (
    <div className="flex flex-col border-r border-border last:border-r-0 min-h-0">
      {/* Month label */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <p className="text-sm font-light text-text-primary">
          {MONTH_NAMES[month]} <span className="text-text-secondary">{year}</span>
        </p>
      </div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border shrink-0">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] text-text-secondary/60 text-center py-1.5">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div
        className="flex-1 grid grid-cols-7 min-h-0"
        style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {grid.map((date, i) => {
          const key = toDateKey(date)
          const isCurrentMonth = date.getMonth() === month
          const dayCampaigns = byDate[key] ?? []
          const isToday = key === todayKey
          const isSelected = key === selectedDate
          const isConflict = conflictDates.has(key)

          return (
            <div
              key={key + i}
              onClick={() => isCurrentMonth && onDayClick(key)}
              className={`
                border-b border-r border-border cursor-pointer p-1.5 flex flex-col gap-0.5
                ${!isCurrentMonth ? 'opacity-25 pointer-events-none' : ''}
                ${isSelected ? 'bg-accent-warm/5' : 'hover:bg-white/[0.03]'}
              `}
            >
              <span className={`
                text-[10px] w-5 h-5 flex items-center justify-center rounded-full shrink-0
                ${isToday ? 'bg-accent-warm text-background font-medium' : 'text-text-secondary'}
              `}>
                {date.getDate()}
              </span>
              {dayCampaigns.map((c) => (
                <div key={c.id} className="flex items-center gap-1 min-w-0">
                  <span className={`w-1 h-1 rounded-full shrink-0 ${
                    c.type === 'newsletter' && isConflict ? 'bg-[#E65100]' : TYPE_DOT[c.type]
                  }`} />
                  <span className="text-[8px] text-text-secondary truncate leading-tight">
                    {c.manufacturers?.name ?? ''}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main CalendarView ────────────────────────────────────────────────────────

export default function CalendarView({ agencies, manufacturers }: Props) {
  const today = new Date()
  const todayKey = toDateKey(today)

  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [campaigns, setCampaigns] = useState<CampaignWithManufacturer[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>()

  const fetchCampaigns = useCallback(async (year: number, month: number, view: ViewMode) => {
    setLoading(true)
    const supabase = createClient()
    let firstDay: string
    let lastDay: string

    if (view === 'year') {
      firstDay = `${year}-01-01`
      lastDay = `${year}-12-31`
    } else if (view === 'quarter') {
      firstDay = toDateKey(new Date(year, month, 1))
      let em = month + 2, ey = year
      if (em > 11) { em -= 12; ey++ }
      lastDay = toDateKey(new Date(ey, em + 1, 0))
    } else {
      firstDay = toDateKey(new Date(year, month, 1))
      lastDay = toDateKey(new Date(year, month + 1, 0))
    }

    const { data } = await supabase
      .from('campaigns')
      .select('*, manufacturers(*, agencies(*))')
      .gte('scheduled_date', firstDay)
      .lte('scheduled_date', lastDay)
      .order('scheduled_date')
    setCampaigns((data as CampaignWithManufacturer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCampaigns(currentYear, currentMonth, viewMode)
  }, [currentYear, currentMonth, viewMode, fetchCampaigns])

  // Group campaigns by date
  const byDate = useMemo(() =>
    campaigns.reduce<Record<string, CampaignWithManufacturer[]>>((acc, c) => {
      if (!acc[c.scheduled_date]) acc[c.scheduled_date] = []
      acc[c.scheduled_date].push(c)
      return acc
    }, {}),
    [campaigns]
  )

  // Weeks with 2+ newsletters → conflict indicator
  const conflictDates = useMemo(() => buildConflictDates(campaigns), [campaigns])

  // ── Navigation ──────────────────────────────────────────────────────────────

  function navigate(delta: number) {
    if (viewMode === 'year') {
      setCurrentYear((y) => y + delta)
    } else if (viewMode === 'quarter') {
      let m = currentMonth + delta * 3, y = currentYear
      while (m < 0) { m += 12; y-- }
      while (m > 11) { m -= 12; y++ }
      setCurrentYear(y); setCurrentMonth(m)
    } else {
      let m = currentMonth + delta, y = currentYear
      if (m < 0) { m = 11; y-- }
      if (m > 11) { m = 0; y++ }
      setCurrentYear(y); setCurrentMonth(m)
    }
    setSelectedDate(null)
  }

  function goToday() {
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth())
    setSelectedDate(null)
  }

  // ── Toolbar label ───────────────────────────────────────────────────────────

  function toolbarLabel(): string {
    if (viewMode === 'year') return String(currentYear)
    if (viewMode === 'quarter') {
      const months = getQuarterMonths(currentYear, currentMonth)
      const first = months[0], last = months[2]
      return first.year === last.year
        ? `${MONTH_SHORT[first.month]} – ${MONTH_SHORT[last.month]} ${first.year}`
        : `${MONTH_SHORT[first.month]} ${first.year} – ${MONTH_SHORT[last.month]} ${last.year}`
    }
    return `${MONTH_NAMES[currentMonth]} ${currentYear}`
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleDayClick(dateKey: string) {
    setSelectedDate((prev) => prev === dateKey ? null : dateKey)
  }

  function handleYearDayClick(y: number, m: number, dateKey: string) {
    setCurrentYear(y)
    setCurrentMonth(m)
    setViewMode('month')
    setSelectedDate(dateKey)
  }

  function handleNewCampaign(dateKey?: string) {
    setModalDefaultDate(dateKey)
    setShowModal(true)
  }

  function refresh() {
    fetchCampaigns(currentYear, currentMonth, viewMode)
  }

  const selectedCampaigns = selectedDate ? (byDate[selectedDate] ?? []) : []
  const monthGrid = buildCalendarGrid(currentYear, currentMonth)
  const quarterMonths = getQuarterMonths(currentYear, currentMonth)

  return (
    <div className="flex flex-1 h-full min-h-0">
      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-light text-text-primary tracking-wide min-w-[180px]">
              {toolbarLabel()}
            </h1>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={goToday} className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-text-secondary/40 rounded-sm transition-colors">
                Heute
              </button>
              <button onClick={() => navigate(1)} className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* View switcher */}
            <div className="flex items-center border border-border rounded-sm overflow-hidden">
              {(['month', 'quarter', 'year'] as ViewMode[]).map((v, i) => (
                <button
                  key={v}
                  onClick={() => { setViewMode(v); setSelectedDate(null) }}
                  className={`
                    px-3 py-1.5 text-xs transition-colors
                    ${i > 0 ? 'border-l border-border' : ''}
                    ${viewMode === v
                      ? 'bg-accent-warm/10 text-accent-warm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                    }
                  `}
                >
                  {v === 'month' ? 'Monat' : v === 'quarter' ? 'Quartal' : 'Jahr'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Conflict legend — only when conflicts exist */}
            {conflictDates.size > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#E65100] border border-[#E65100]/30 bg-[#E65100]/5 px-2.5 py-1 rounded-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E65100] shrink-0" />
                Newsletter-Konflikt in dieser Woche
              </div>
            )}
            <button
              onClick={() => handleNewCampaign()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors"
            >
              <Plus size={14} />
              Neue Kampagne
            </button>
          </div>
        </div>

        {/* ── Month view ─────────────────────────────────────────────────────── */}
        {viewMode === 'month' && (
          <>
            <div className="grid grid-cols-7 border-b border-border shrink-0">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-4 py-2.5 text-xs text-text-secondary font-medium text-center border-r border-border last:border-r-0">
                  {d}
                </div>
              ))}
            </div>
            <div
              className="flex-1 grid grid-cols-7 overflow-hidden min-h-0 relative"
              style={{ gridTemplateRows: `repeat(${monthGrid.length / 7}, 1fr)` }}
            >
              {monthGrid.map((date, idx) => {
                const dateKey = toDateKey(date)
                const isCurrentMonth = date.getMonth() === currentMonth
                const isToday = dateKey === todayKey
                const isSelected = dateKey === selectedDate
                const dayCampaigns = byDate[dateKey] ?? []
                const isConflict = conflictDates.has(dateKey)
                const isWeekend = isoWeekday(date) >= 5

                return (
                  <div
                    key={dateKey + idx}
                    onClick={() => handleDayClick(dateKey)}
                    className={`
                      relative border-r border-b border-border cursor-pointer transition-colors
                      ${isSelected ? 'bg-accent-warm/5' : isWeekend && isCurrentMonth ? 'bg-white/[0.01] hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'}
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                    `}
                  >
                    <div className="px-3 pt-2.5 pb-1">
                      <span className={`
                        text-xs w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-accent-warm text-background font-medium' : isSelected ? 'text-accent-warm' : 'text-text-secondary'}
                      `}>
                        {date.getDate()}
                      </span>
                    </div>
                    {dayCampaigns.length > 0 && (
                      <div className="px-3 pb-2 flex flex-wrap gap-1">
                        {dayCampaigns.slice(0, 4).map((c) => (
                          <span
                            key={c.id}
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              c.type === 'newsletter' && isConflict ? 'bg-[#E65100]' : STATUS_STYLE[c.status].dot
                            }`}
                            title={c.title}
                          />
                        ))}
                        {dayCampaigns.length > 4 && (
                          <span className="text-[9px] text-text-secondary">+{dayCampaigns.length - 4}</span>
                        )}
                      </div>
                    )}
                    <div className="px-2 pb-1.5 space-y-0.5 hidden [@media(min-height:800px)]:block">
                      {dayCampaigns.slice(0, 2).map((c) => (
                        <div key={c.id} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] truncate bg-white/[0.04] text-text-secondary">
                          <span className={`w-1 h-1 rounded-full shrink-0 ${
                            c.type === 'newsletter' && isConflict ? 'bg-[#E65100]' : STATUS_STYLE[c.status].dot
                          }`} />
                          <span className="truncate">{c.title}</span>
                        </div>
                      ))}
                      {dayCampaigns.length > 2 && (
                        <p className="text-[10px] text-text-secondary px-1.5">+{dayCampaigns.length - 2} weitere</p>
                      )}
                    </div>
                  </div>
                )
              })}
              {loading && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                  <div className="w-4 h-4 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Quarter view ───────────────────────────────────────────────────── */}
        {viewMode === 'quarter' && (
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            {quarterMonths.map(({ year, month }) => (
              <QuarterMonth
                key={`${year}-${month}`}
                year={year}
                month={month}
                byDate={byDate}
                conflictDates={conflictDates}
                todayKey={todayKey}
                selectedDate={selectedDate}
                onDayClick={handleDayClick}
              />
            ))}
            {loading && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                <div className="w-4 h-4 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* ── Year view ──────────────────────────────────────────────────────── */}
        {viewMode === 'year' && (
          <div className="flex-1 overflow-y-auto relative">
            {/* Legend */}
            <div className="flex items-center gap-4 px-8 py-3 border-b border-border text-[10px] text-text-secondary">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EDE8E3]" />Newsletter</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C4A87C]" />Postkarte</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#555555]" />Report</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#E65100]" />Konflikt (2+ Newsletter / Woche)</div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-y divide-border">
              {Array.from({ length: 12 }, (_, i) => (
                <MiniMonth
                  key={i}
                  year={currentYear}
                  month={i}
                  byDate={byDate}
                  conflictDates={conflictDates}
                  todayKey={todayKey}
                  onDayClick={handleYearDayClick}
                />
              ))}
            </div>
            {loading && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                <div className="w-4 h-4 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side Panel — month & quarter views only */}
      {selectedDate !== null && viewMode !== 'year' && (
        <div className="w-80 shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden">
          <CampaignSidePanel
            campaigns={selectedCampaigns}
            selectedDate={selectedDate}
            onClose={() => setSelectedDate(null)}
            onRefresh={refresh}
          />
        </div>
      )}

      {/* New Campaign Modal */}
      {showModal && (
        <NewCampaignModal
          agencies={agencies}
          manufacturers={manufacturers}
          defaultDate={modalDefaultDate}
          onClose={() => setShowModal(false)}
          onCreated={refresh}
        />
      )}
    </div>
  )
}
