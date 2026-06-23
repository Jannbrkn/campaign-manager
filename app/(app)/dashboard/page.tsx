import { createClient } from '@/lib/supabase/server'
import type { Campaign, Manufacturer, Agency } from '@/lib/supabase/types'
import CampaignList from '@/components/dashboard/CampaignList'
import { Building2, Factory, CalendarClock, CalendarDays } from 'lucide-react'

interface CampaignRow extends Campaign {
  manufacturers: (Manufacturer & { agencies: Agency }) | null
}

async function getStats() {
  const supabase = await createClient()
  const [{ count: agencyCount }, { count: manufacturerCount }, { count: campaignCount }] = await Promise.all([
    supabase.from('agencies').select('*', { count: 'exact', head: true }),
    supabase.from('manufacturers').select('*', { count: 'exact', head: true }),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).neq('status', 'sent'),
  ])
  return { agencyCount, manufacturerCount, campaignCount }
}

async function getNextCampaigns(): Promise<CampaignRow[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .gte('scheduled_date', today)
    .neq('status', 'sent')
    .order('scheduled_date', { ascending: true })
    .limit(5)
  return (data ?? []) as unknown as CampaignRow[]
}


export default async function DashboardPage() {
  const [{ agencyCount, manufacturerCount, campaignCount }, nextCampaigns] =
    await Promise.all([getStats(), getNextCampaigns()])

  const stats = [
    { label: 'Agenturen',            value: agencyCount ?? 0,      Icon: Building2 },
    { label: 'Hersteller',           value: manufacturerCount ?? 0, Icon: Factory },
    { label: 'Geplante Kampagnen',   value: campaignCount ?? 0,    Icon: CalendarClock },
    { label: 'Nächste Kampagne',     value: nextCampaigns[0]
        ? new Date(nextCampaigns[0].scheduled_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
        : '—',
      Icon: CalendarDays
    },
  ]

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="page-title">Dashboard</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Überblick über Agenturen, Hersteller und die nächsten geplanten Kampagnen.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="card p-6">
            <div className="flex items-center gap-2 mb-3 text-text-secondary">
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <p className="text-xs tracking-wider uppercase">{label}</p>
            </div>
            <p className="font-display text-3xl font-semibold text-text-primary">{value}</p>
          </div>
        ))}
      </div>

      {/* Upcoming campaigns */}
      <div>
        <h2 className="section-title mb-4">
          Nächste Kampagnen
        </h2>
        <div className="card divide-y divide-border overflow-hidden">
          <CampaignList campaigns={nextCampaigns as any} />
        </div>
      </div>
    </div>
  )
}
