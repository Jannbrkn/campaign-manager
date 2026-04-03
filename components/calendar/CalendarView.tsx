'use client'

import { useState, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Agency, Manufacturer, CampaignWithManufacturer, CampaignType } from '@/lib/supabase/types'
import NewCampaignModal from './NewCampaignModal'
import CampaignSidePanel, { STATUS_STYLE } from './CampaignSidePanel'

interface Props {
  agencies: Agency[]
  manufacturers: Manufacturer[]
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// ISO Monday-first: 0=Mon … 6=Sun
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

function buildCalendarGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = isoWeekday(firstDay) // cells before month start
  const endOffset = 6 - isoWeekday(lastDay) // cells after month end

  const days: Date[] = []
  for (let i = startOffset; i > 0; i--) {
    days.push(new Date(year, month, 1 - i))
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  for (let i = 1; i <= endOffset; i++) {
    days.push(new Date(year, month + 1, i))
  }
  // Ensure we always have complete weeks
  while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - lastDay.getDate() - startOffset + 1))
  return days
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export default function CalendarView({ agencies, manufacturers }: Props) {
  const today = new Date()
  const todayKey = toDateKey(today)

  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [campaigns, setCampaigns] = useState<CampaignWithManufacturer[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>()

  const fetchCampaigns = useCallback(async (year: number, month: number) => {
    setLoading(true)
    const supabase = createClient()
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0]
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0]
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
    fetchCampaigns(currentYear, currentMonth)
  }, [currentYear, currentMonth, fetchCampaigns])

  function prevMonth() {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11) }
    else setCurrentMonth(m => m - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0) }
    else setCurrentMonth(m => m + 1)
    setSelectedDate(null)
  }

  function goToday() {
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth())
  }

  const grid = buildCalendarGrid(currentYear, currentMonth)

  // Group campaigns by date key
  const byDate = campaigns.reduce<Record<string, CampaignWithManufacturer[]>>((acc, c) => {
    const key = c.scheduled_date
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  const selectedCampaigns = selectedDate ? (byDate[selectedDate] ?? []) : []

  function handleDayClick(dateKey: string) {
    setSelectedDate(prev => prev === dateKey ? null : dateKey)
  }

  function handleNewCampaign(dateKey?: string) {
    setModalDefaultDate(dateKey)
    setShowModal(true)
  }

  return (
    <div className="flex flex-1 h-full min-h-0">
      {/* Calendar area */}
      <div className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden transition-all duration-300`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-light text-text-primary tracking-wide">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToday}
                className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-text-secondary/40 rounded-sm transition-colors"
              >
                Heute
              </button>
              <button
                onClick={nextMonth}
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-sm transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <button
            onClick={() => handleNewCampaign()}
            className="flex items-center gap-2 px-4 py-2 text-sm text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors"
          >
            <Plus size={14} />
            Neue Kampagne
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border shrink-0">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-4 py-2.5 text-xs text-text-secondary font-medium text-center border-r border-border last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          className="flex-1 grid grid-cols-7 overflow-hidden min-h-0"
          style={{ gridTemplateRows: `repeat(${grid.length / 7}, 1fr)` }}
        >
          {grid.map((date, idx) => {
            const dateKey = toDateKey(date)
            const isCurrentMonth = date.getMonth() === currentMonth
            const isToday = dateKey === todayKey
            const isSelected = dateKey === selectedDate
            const dayCampaigns = byDate[dateKey] ?? []
            const isWeekend = isoWeekday(date) >= 5

            return (
              <div
                key={dateKey + idx}
                onClick={() => handleDayClick(dateKey)}
                className={`relative border-r border-b border-border cursor-pointer transition-colors
                  last-in-row:border-r-0
                  ${isSelected ? 'bg-accent-warm/5' : isWeekend && isCurrentMonth ? 'bg-white/[0.01] hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]'}
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                `}
                style={{ minHeight: 0 }}
              >
                {/* Day number */}
                <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                  <span
                    className={`text-xs w-6 h-6 flex items-center justify-center rounded-full transition-colors
                      ${isToday ? 'bg-accent-warm text-background font-medium' : isSelected ? 'text-accent-warm' : 'text-text-secondary'}
                    `}
                  >
                    {date.getDate()}
                  </span>
                </div>

                {/* Campaign dots — color = status */}
                {dayCampaigns.length > 0 && (
                  <div className="px-3 pb-2 flex flex-wrap gap-1">
                    {dayCampaigns.slice(0, 3).map((c) => (
                      <span
                        key={c.id}
                        className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_STYLE[c.status].dot}`}
                        title={`${c.title} · ${c.status}`}
                      />
                    ))}
                    {dayCampaigns.length > 3 && (
                      <span className="text-[9px] text-text-secondary leading-none self-center">+{dayCampaigns.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Campaign labels (taller cells) */}
                {dayCampaigns.length > 0 && (
                  <div className="px-2 pb-1.5 space-y-0.5 hidden [@media(min-height:800px)]:block">
                    {dayCampaigns.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] truncate bg-white/[0.04] text-text-secondary"
                      >
                        <span className={`w-1 h-1 rounded-full shrink-0 ${STATUS_STYLE[c.status].dot}`} />
                        <span className="truncate">{c.title}</span>
                      </div>
                    ))}
                    {dayCampaigns.length > 2 && (
                      <p className="text-[10px] text-text-secondary px-1.5">+{dayCampaigns.length - 2} weitere</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {loading && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
            <div className="w-4 h-4 border-2 border-accent-warm border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Side Panel */}
      {selectedDate !== null && (
        <div className="w-80 shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden">
          <CampaignSidePanel
            campaigns={selectedCampaigns}
            selectedDate={selectedDate}
            onClose={() => setSelectedDate(null)}
            onRefresh={() => fetchCampaigns(currentYear, currentMonth)}
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
          onCreated={() => fetchCampaigns(currentYear, currentMonth)}
        />
      )}
    </div>
  )
}
