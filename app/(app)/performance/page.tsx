// app/(app)/performance/page.tsx
import { createClient } from '@/lib/supabase/server'
import type {
  CampaignWithManufacturer,
  ManufacturerGroup,
  Agency,
  AggregatedLink,
  AggregatedDomain,
  ClickDetail,
  DomainPerformance,
  TrendDirection,
} from '@/lib/supabase/types'
import KpiRow from '@/components/performance/KpiRow'
import ManufacturerGrid from '@/components/performance/ManufacturerGrid'
import UnmatchedPanel from '@/components/performance/UnmatchedPanel'

interface LatestSnapshot {
  campaign_id: string
  click_details: ClickDetail[] | null
  domain_performance: DomainPerformance[] | null
}

/** Compute a trend direction by splitting campaigns (with stats) in half
 *  chronologically and comparing averages. Noise threshold: 3pp. */
function computeTrend(
  campaigns: CampaignWithManufacturer[],
  metric: 'open_rate' | 'click_rate'
): TrendDirection {
  const noiseThresholdPp = metric === 'open_rate' ? 3 : 1  // click rates are smaller, tighter threshold
  const withStats = campaigns
    .filter((c) => c.performance_stats)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())

  if (withStats.length < 2) return null

  // Older half gets the middle point when count is odd
  const mid = Math.ceil(withStats.length / 2)
  const older = withStats.slice(0, mid)
  const newer = withStats.slice(mid)
  if (older.length === 0 || newer.length === 0) return null

  const olderAvg = older.reduce((s, c) => s + c.performance_stats![metric], 0) / older.length
  const newerAvg = newer.reduce((s, c) => s + c.performance_stats![metric], 0) / newer.length
  const deltaPp = (newerAvg - olderAvg) * 100

  if (deltaPp > noiseThresholdPp) return 'up'
  if (deltaPp < -noiseThresholdPp) return 'down'
  return 'stable'
}

/** Aggregate click_details across campaigns → top links by total_clicks. */
function aggregateLinks(snapshots: LatestSnapshot[]): AggregatedLink[] {
  const map = new Map<string, AggregatedLink>()
  for (const s of snapshots) {
    if (!Array.isArray(s.click_details)) continue
    for (const link of s.click_details) {
      if (!link?.url) continue
      const existing = map.get(link.url)
      if (existing) {
        existing.total_clicks += link.total_clicks ?? 0
        existing.unique_clicks += link.unique_clicks ?? 0
      } else {
        map.set(link.url, {
          url: link.url,
          total_clicks: link.total_clicks ?? 0,
          unique_clicks: link.unique_clicks ?? 0,
        })
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.unique_clicks - a.unique_clicks)
    .slice(0, 10)
}

/** Aggregate domain_performance across campaigns → top domains by emails_sent. */
function aggregateDomains(snapshots: LatestSnapshot[]): AggregatedDomain[] {
  const map = new Map<string, AggregatedDomain>()
  for (const s of snapshots) {
    if (!Array.isArray(s.domain_performance)) continue
    for (const d of s.domain_performance) {
      if (!d?.domain) continue
      const existing = map.get(d.domain) ?? {
        domain: d.domain,
        emails_sent: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        unsubs: 0,
        open_rate: 0,
        click_rate: 0,
      }
      existing.emails_sent += d.emails_sent ?? 0
      existing.opens += d.opens ?? 0
      existing.clicks += d.clicks ?? 0
      existing.bounces += d.bounces ?? 0
      existing.unsubs += d.unsubs ?? 0
      map.set(d.domain, existing)
    }
  }
  const out = Array.from(map.values()).map((d) => ({
    ...d,
    open_rate: d.emails_sent > 0 ? d.opens / d.emails_sent : 0,
    click_rate: d.emails_sent > 0 ? d.clicks / d.emails_sent : 0,
  }))
  return out.sort((a, b) => b.emails_sent - a.emails_sent).slice(0, 8)
}

function groupCampaigns(
  campaigns: CampaignWithManufacturer[],
  latestByCampaign: Map<string, LatestSnapshot>,
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
        trendOpen: null,
        trendClick: null,
        totalSent: 0,
        totalUnsubscribes: 0,
        totalHardBounces: 0,
        totalSoftBounces: 0,
        totalAbuseReports: 0,
        sources: [],
        mppFiltered: false,
        topLinks: [],
        topDomains: [],
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

      const withIndustry = ws.filter((c) => c.performance_stats!.industry_open_rate != null)
      if (withIndustry.length > 0) {
        g.avgIndustryOpenRate =
          withIndustry.reduce((s, c) => s + (c.performance_stats!.industry_open_rate ?? 0), 0) / withIndustry.length
        g.avgIndustryClickRate =
          withIndustry.reduce((s, c) => s + (c.performance_stats!.industry_click_rate ?? 0), 0) / withIndustry.length
      }

      const apiStats = ws.filter((c) => c.performance_stats!.source === 'api')
      g.mppFiltered = apiStats.length > 0 && apiStats.every((c) => c.performance_stats!.proxy_excluded_open_rate != null)

      // Trend direction (requires ≥2 campaigns with stats)
      g.trendOpen = computeTrend(g.campaigns, 'open_rate')
      g.trendClick = computeTrend(g.campaigns, 'click_rate')
    }

    // Aggregate click_details and domain_performance from snapshots of this manufacturer's campaigns
    const snapshots: LatestSnapshot[] = g.campaigns
      .map((c) => latestByCampaign.get(c.id))
      .filter((s): s is LatestSnapshot => !!s)

    g.topLinks = aggregateLinks(snapshots)
    g.topDomains = aggregateDomains(snapshots)
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

  const [{ data: campaignData }, { data: agencyData }, { data: snapshotData }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*, manufacturers(*, agencies(*))')
      .order('scheduled_date', { ascending: false }),
    supabase.from('agencies').select('*').order('name'),
    // Fetch ALL snapshots, we'll pick the latest per campaign_id in JS
    supabase
      .from('campaign_reports')
      .select('campaign_id, click_details, domain_performance, snapshot_date')
      .order('snapshot_date', { ascending: false }),
  ])

  const latestByCampaign = new Map<string, LatestSnapshot>()
  let lastRefreshedAt: string | null = null
  for (const s of (snapshotData ?? []) as any[]) {
    if (!latestByCampaign.has(s.campaign_id)) {
      latestByCampaign.set(s.campaign_id, {
        campaign_id: s.campaign_id,
        click_details: s.click_details,
        domain_performance: s.domain_performance,
      })
    }
    if (!lastRefreshedAt || s.snapshot_date > lastRefreshedAt) {
      lastRefreshedAt = s.snapshot_date
    }
  }

  const campaigns = (campaignData ?? []) as unknown as CampaignWithManufacturer[]
  const agencies = (agencyData ?? []) as Agency[]
  const groups = groupCampaigns(campaigns, latestByCampaign, searchParams)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light text-text-primary">Performance</h1>
      </div>

      <UnmatchedPanel />

      <KpiRow groups={groups} totalCampaigns={groups.reduce((sum, g) => sum + g.campaigns.length, 0)} />

      <ManufacturerGrid
        groups={groups}
        agencies={agencies}
        searchParams={searchParams}
        lastRefreshedAt={lastRefreshedAt}
      />
    </div>
  )
}
