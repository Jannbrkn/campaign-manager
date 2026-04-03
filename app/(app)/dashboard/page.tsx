import { createClient } from '@/lib/supabase/server'
import type { Campaign, Manufacturer, Agency } from '@/lib/supabase/types'

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

const STATUS_LABELS: Record<string, string> = {
  planned:          'Geplant',
  assets_pending:   'Assets ausstehend',
  assets_complete:  'Assets vollständig',
  generating:       'Wird generiert',
  review:           'In Prüfung',
  approved:         'Freigegeben',
  sent:             'Versendet',
}

const TYPE_LABELS: Record<string, string> = {
  postcard:         'Postkarte',
  newsletter:       'Newsletter',
  report_internal:  'Bericht intern',
  report_external:  'Bericht extern',
}

export default async function DashboardPage() {
  const { agencyCount, manufacturerCount, campaignCount } = await getStats()
  const nextCampaigns = await getNextCampaigns()

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
          {nextCampaigns.length === 0 ? (
            <p className="px-6 py-8 text-text-secondary text-sm text-center">
              Noch keine Kampagnen geplant
            </p>
          ) : (
            nextCampaigns.map((campaign) => (
              <div key={campaign.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">{campaign.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {campaign.manufacturers?.name} · {campaign.manufacturers?.agencies?.name}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-xs text-text-secondary hidden sm:block">
                    {TYPE_LABELS[campaign.type] ?? campaign.type}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {new Date(campaign.scheduled_date).toLocaleDateString('de-DE', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-accent-warm">
                    {STATUS_LABELS[campaign.status] ?? campaign.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
