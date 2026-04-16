// app/(app)/performance/page.tsx
import { createClient } from '@/lib/supabase/server'
import type { CampaignWithManufacturer, ManufacturerGroup, Agency } from '@/lib/supabase/types'
import KpiRow from '@/components/performance/KpiRow'
import ManufacturerGrid from '@/components/performance/ManufacturerGrid'

function groupCampaigns(
  campaigns: CampaignWithManufacturer[],
  searchParams: { year?: string; agency?: string; type?: string }
): ManufacturerGroup[] {
  const year = searchParams.year
  const agencyFilter = searchParams.agency
  const typeFilter = searchParams.type

  const filtered = campaigns.filter((c) => {
    if (year && year !== 'alle' && !c.scheduled_date.startsWith(year)) return false
    if (agencyFilter && agencyFilter !== 'alle' && c.manufacturers?.agencies?.id !== agencyFilter) return false
    if (typeFilter && typeFilter !== 'alle' && c.type !== typeFilter) return false
    return true
  })

  const map = new Map<string, ManufacturerGroup>()

  for (const c of filtered) {
    const id = c.manufacturer_id
    if (!map.has(id)) {
      map.set(id, {
        manufacturer: c.manufacturers,
        campaigns: [],
        avgOpenRate: null,
        avgClickRate: null,
        avgIndustryOpenRate: null,
        avgIndustryClickRate: null,
        totalSent: 0,
        totalUnsubscribes: 0,
        totalHardBounces: 0,
        totalSoftBounces: 0,
        totalAbuseReports: 0,
        sources: [],
        mppFiltered: false,
      })
    }
    const g = map.get(id)!
    g.campaigns.push(c)
    if (c.performance_stats) {
      const ps = c.performance_stats
      g.totalSent += ps.emails_sent
      if (ps.unsubscribes !== null) g.totalUnsubscribes += ps.unsubscribes
      if (ps.hard_bounces != null) g.totalHardBounces += ps.hard_bounces
      if (ps.soft_bounces != null) g.totalSoftBounces += ps.soft_bounces
      if (ps.abuse_reports != null) g.totalAbuseReports += ps.abuse_reports
      if (!g.sources.includes(ps.source)) g.sources.push(ps.source)
    }
  }

  for (const g of Array.from(map.values())) {
    const ws = g.campaigns.filter((c) => c.performance_stats)
    if (ws.length > 0) {
      g.avgOpenRate =
        ws.reduce((s: number, c: CampaignWithManufacturer) => s + c.performance_stats!.open_rate, 0) / ws.length
      g.avgClickRate =
        ws.reduce((s: number, c: CampaignWithManufacturer) => s + c.performance_stats!.click_rate, 0) / ws.length

      // Industry benchmark averages (only over campaigns that have them)
      const withIndustry = ws.filter((c) => c.performance_stats!.industry_open_rate != null)
      if (withIndustry.length > 0) {
        g.avgIndustryOpenRate =
          withIndustry.reduce((s, c) => s + (c.performance_stats!.industry_open_rate ?? 0), 0) / withIndustry.length
        g.avgIndustryClickRate =
          withIndustry.reduce((s, c) => s + (c.performance_stats!.industry_click_rate ?? 0), 0) / withIndustry.length
      }

      // MPP filter status — true only if every API-sourced stat has proxy_excluded_open_rate
      const apiStats = ws.filter((c) => c.performance_stats!.source === 'api')
      g.mppFiltered = apiStats.length > 0 && apiStats.every((c) => c.performance_stats!.proxy_excluded_open_rate != null)
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.avgOpenRate === null && b.avgOpenRate === null) return 0
    if (a.avgOpenRate === null) return 1
    if (b.avgOpenRate === null) return -1
    return b.avgOpenRate - a.avgOpenRate
  })
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: { year?: string; agency?: string; type?: string }
}) {
  const supabase = await createClient()

  const [{ data: campaignData }, { data: agencyData }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, manufacturers(*, agencies(*))')
      .order('scheduled_date', { ascending: false }),
    supabase.from('agencies').select('*').order('name'),
  ])

  const campaigns = (campaignData ?? []) as unknown as CampaignWithManufacturer[]
  const agencies = (agencyData ?? []) as Agency[]
  const groups = groupCampaigns(campaigns, searchParams)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light text-text-primary">Performance</h1>
      </div>

      <KpiRow groups={groups} totalCampaigns={groups.reduce((sum, g) => sum + g.campaigns.length, 0)} />

      <ManufacturerGrid
        groups={groups}
        agencies={agencies}
        searchParams={searchParams}
      />
    </div>
  )
}
