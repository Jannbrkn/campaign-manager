import { createClient } from '@/lib/supabase/server'
import type { Campaign, Manufacturer, Agency } from '@/lib/supabase/types'
import CampaignList from '@/components/dashboard/CampaignList'

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
    { label: 'Agenturen',            value: agencyCount ?? 0 },
    { label: 'Hersteller',           value: manufacturerCount ?? 0 },
    { label: 'Geplante Kampagnen',   value: campaignCount ?? 0 },
    { label: 'Nächste Kampagne',     value: nextCampaigns[0]
        ? new Date(nextCampaigns[0].scheduled_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
        : '—'
    },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-light text-text-primary mb-8">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-surface border border-border rounded-sm p-6">
            <p className="text-text-secondary text-xs tracking-wider uppercase mb-3">{label}</p>
            <p className="text-3xl font-light text-text-primary">{value}</p>
          </div>
        ))}
      </div>

      {/* Upcoming campaigns */}
      <div>
        <h2 className="text-xs tracking-wider uppercase text-text-secondary mb-4">
          Nächste Kampagnen
        </h2>
        <div className="bg-surface border border-border rounded-sm divide-y divide-border">
          <CampaignList campaigns={nextCampaigns as any} />
        </div>
      </div>
    </div>
  )
}
