# Performance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/performance` page that shows email marketing stats (open rate, click rate) per manufacturer, sourced from Mailchimp API for new campaigns and from uploaded CSV exports for older ones.

**Architecture:** Stats are stored as `performance_stats` JSONB on the `campaigns` table, populated either automatically when Mailchimp campaigns are created (via API) or when reports are generated (CSV parsing). The page groups campaigns by manufacturer, shows cards sorted by open rate, and expands inline drill-down panels per manufacturer on click.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, Tailwind CSS, Mailchimp API v3, lucide-react

---

## File Map

**Create:**
- `supabase/migrations/005_performance_stats.sql`
- `lib/mailchimp.ts` — shared Mailchimp API client (extracted from send route)
- `app/api/performance/refresh/route.ts` — fetches stats from Mailchimp for all tracked campaigns
- `app/(app)/performance/page.tsx` — server component, groups campaigns by manufacturer
- `components/performance/KpiRow.tsx` — 4 global KPI cards (pure, no state)
- `components/performance/ManufacturerGrid.tsx` — client component, filters + card grid + drill-down state
- `components/performance/ManufacturerCard.tsx` — single manufacturer stat card
- `components/performance/DrillDown.tsx` — expandable campaign table for one manufacturer

**Modify:**
- `lib/supabase/types.ts` — add `PerformanceStats`, `ManufacturerGroup`, update `Campaign`
- `components/Sidebar.tsx` — add Performance nav item
- `app/api/send/mailchimp/route.ts` — save `mailchimp_campaign_id` + use `lib/mailchimp.ts`
- `app/api/generate/report/route.ts` — compute + save CSV stats after report generation

---

## Task 1: DB Migration + Type Definitions

**Files:**
- Create: `supabase/migrations/005_performance_stats.sql`
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/005_performance_stats.sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_campaign_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS performance_stats jsonb DEFAULT NULL;
```

- [ ] **Step 2: Run the migration in Supabase**

Open Supabase dashboard → SQL Editor → paste and run the SQL above.
Expected: no error, query returns successfully.

- [ ] **Step 3: Add PerformanceStats interface and update Campaign in `lib/supabase/types.ts`**

Add after the `NewsletterBriefing` interface (around line 52):

```typescript
export interface PerformanceStats {
  open_rate: number    // 0–1, e.g. 0.46 = 46%
  click_rate: number   // 0–1
  emails_sent: number
  unsubscribes: number
  source: 'api' | 'csv'
}
```

Update the `Campaign` interface — add two fields after `briefing`:

```typescript
  mailchimp_campaign_id: string | null
  performance_stats: PerformanceStats | null
```

Add after the `CampaignWithManufacturer` interface (around line 108):

```typescript
export interface ManufacturerGroup {
  manufacturer: ManufacturerWithAgency
  campaigns: CampaignWithManufacturer[]
  avgOpenRate: number | null
  avgClickRate: number | null
  totalSent: number
  totalUnsubscribes: number
  sources: ('api' | 'csv')[]
}
```

Also update the `Database` type for campaigns (around line 115) — add the two new columns to `Update`:

```typescript
campaigns: {
  Row: Campaign
  Insert: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>
  Update: Partial<Omit<Campaign, 'id' | 'created_at' | 'updated_at'>>
}
```

(No change needed — `Partial<Omit<...>>` already covers new columns automatically.)

- [ ] **Step 4: Type-check**

```bash
cd "C:\Users\Jann Brunken\campaign-manager" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_performance_stats.sql lib/supabase/types.ts
git commit -m "feat: add performance_stats and mailchimp_campaign_id to campaigns"
```

---

## Task 2: Shared Mailchimp Helper + Sidebar Nav Item

**Files:**
- Create: `lib/mailchimp.ts`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Create `lib/mailchimp.ts`**

```typescript
// lib/mailchimp.ts
const MC_API_KEY = process.env.MAILCHIMP_API_KEY ?? ''
const MC_SERVER = MC_API_KEY.split('-').at(-1) ?? 'us19'
export const MC_BASE = `https://${MC_SERVER}.api.mailchimp.com/3.0`

export function mcAuthHeader() {
  return `Basic ${Buffer.from(`anystring:${MC_API_KEY}`).toString('base64')}`
}

export async function mcFetch(path: string, method: string, body?: object) {
  const res = await fetch(`${MC_BASE}${path}`, {
    method,
    headers: {
      Authorization: mcAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.detail ?? json.title ?? `Mailchimp error ${res.status}`)
  return json
}

export function mcConfigured() {
  return MC_API_KEY.length > 0
}
```

- [ ] **Step 2: Add Performance nav item to `components/Sidebar.tsx`**

Add `BarChart2` to the lucide-react import:

```typescript
import { LayoutDashboard, CalendarDays, Building2, Factory, Settings, LogOut, ImageIcon, BarChart2 } from 'lucide-react'
```

Add Performance between Dashboard and Kalender in `navItems`:

```typescript
const navItems = [
  { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/performance',   label: 'Performance',  icon: BarChart2 },
  { href: '/calendar',      label: 'Kalender',     icon: CalendarDays },
  { href: '/agencies',      label: 'Agenturen',    icon: Building2 },
  { href: '/manufacturers', label: 'Hersteller',   icon: Factory },
  { href: '/logos',         label: 'Logos',        icon: ImageIcon },
  { href: '/settings',      label: 'Einstellungen', icon: Settings },
]
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/mailchimp.ts components/Sidebar.tsx
git commit -m "feat: shared Mailchimp helper, Performance nav item in sidebar"
```

---

## Task 3: Amend Mailchimp Send Route — Save Campaign ID

**Files:**
- Modify: `app/api/send/mailchimp/route.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with the version below, which (a) uses `lib/mailchimp.ts` and (b) saves `mailchimp_campaign_id` after campaign creation:

```typescript
// app/api/send/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'

export async function POST(req: NextRequest) {
  const { campaign_id, subject } = await req.json()
  if (!campaign_id || !subject) {
    return NextResponse.json({ error: 'campaign_id and subject required' }, { status: 400 })
  }
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign || campaign.type !== 'newsletter') {
    return NextResponse.json({ error: 'Newsletter campaign not found' }, { status: 404 })
  }

  const { data: previewAsset } = await supabase
    .from('campaign_assets')
    .select('file_url')
    .eq('campaign_id', campaign_id)
    .eq('asset_category', 'newsletter_preview')
    .eq('is_output', true)
    .single()

  if (!previewAsset) {
    return NextResponse.json({ error: 'Kein generierter Newsletter gefunden. Bitte zuerst generieren.' }, { status: 422 })
  }

  const marker = '/campaign-assets/'
  const idx = previewAsset.file_url.indexOf(marker)
  let htmlContent = ''

  if (idx !== -1) {
    const path = decodeURIComponent(previewAsset.file_url.slice(idx + marker.length).split('?')[0])
    const { data: signed } = await admin.storage.from('campaign-assets').createSignedUrl(path, 300)
    if (signed?.signedUrl) {
      const htmlRes = await fetch(signed.signedUrl)
      if (htmlRes.ok) htmlContent = await htmlRes.text()
    }
  }

  if (!htmlContent) {
    return NextResponse.json({ error: 'Newsletter-HTML konnte nicht geladen werden' }, { status: 500 })
  }

  const mfg = campaign.manufacturers as any
  const fromName = mfg?.agencies?.name ?? 'Collezioni Design Syndicate'
  const fromEmail = mfg?.agencies?.order_email ?? 'newsletter@collezioni.eu'

  const created = await mcFetch('/campaigns', 'POST', {
    type: 'regular',
    settings: {
      subject_line: subject,
      title: `${campaign.title} — ${new Date().toISOString().split('T')[0]}`,
      from_name: fromName,
      reply_to: fromEmail,
    },
  })

  await mcFetch(`/campaigns/${created.id}/content`, 'PUT', { html: htmlContent })

  // Save Mailchimp campaign ID for later stats refresh
  await admin.from('campaigns').update({ mailchimp_campaign_id: created.id }).eq('id', campaign_id)

  const editUrl = `https://us19.admin.mailchimp.com/campaigns/edit?id=${created.web_id}`
  return NextResponse.json({ success: true, campaignId: created.id, editUrl })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/send/mailchimp/route.ts
git commit -m "feat: save mailchimp_campaign_id on campaign after creation"
```

---

## Task 4: Amend Report Generation — Save CSV Stats

**Files:**
- Modify: `app/api/generate/report/route.ts`

The goal: after `generateReports()` succeeds, parse `recipientsCsv` to compute aggregate open/click stats and save them to `performance_stats` on the linked newsletter campaign (or the report campaign itself if no newsletter link exists).

- [ ] **Step 1: Add the CSV stats helper function**

Open `app/api/generate/report/route.ts`. Add this helper function before the `POST` handler (after the `signUrl` function, around line 18):

```typescript
function parseCsvStats(csvText: string): { total: number; opens: number; clicks: number } {
  const lines = csvText.trim().split('\n').filter((l) => l.trim())
  if (lines.length < 2) return { total: 0, opens: 0, clicks: 0 }
  const header = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim())
  const opensIdx = header.findIndex((h) => /number.of.opens/i.test(h))
  const clicksIdx = header.findIndex((h) => /number.of.clicks/i.test(h))
  let opens = 0
  let clicks = 0
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (opensIdx >= 0 && Number(cols[opensIdx] ?? 0) > 0) opens++
    if (clicksIdx >= 0 && Number(cols[clicksIdx] ?? 0) > 0) clicks++
  }
  return { total: lines.length - 1, opens, clicks }
}
```

- [ ] **Step 2: Save stats after successful report generation**

Find the line `return NextResponse.json({ success: true })` inside the `try` block (around line 197). Insert the stats computation and save **before** that return:

```typescript
    // Compute and save performance stats on the newsletter campaign (or this campaign)
    if (recipientsCsv) {
      const { total, opens, clicks } = parseCsvStats(recipientsCsv)
      if (total > 0) {
        const statsTargetId = campaign.linked_newsletter_id ?? campaign_id
        await admin.from('campaigns').update({
          performance_stats: {
            open_rate: opens / total,
            click_rate: clicks / total,
            emails_sent: total,
            unsubscribes: 0,
            source: 'csv',
          },
        }).eq('id', statsTargetId)
      }
    }

    return NextResponse.json({ success: true })
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/generate/report/route.ts
git commit -m "feat: compute and save CSV performance stats on report generation"
```

---

## Task 5: Refresh API Route

**Files:**
- Create: `app/api/performance/refresh/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/performance/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'

export const maxDuration = 60

export async function POST(_req: NextRequest) {
  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Load all campaigns that have a Mailchimp campaign ID
  const { data: campaigns } = await admin
    .from('campaigns')
    .select('id, mailchimp_campaign_id')
    .not('mailchimp_campaign_id', 'is', null)

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ updated: 0, errors: [] })
  }

  let updated = 0
  const errors: string[] = []

  for (const campaign of campaigns) {
    try {
      const report = await mcFetch(`/reports/${campaign.mailchimp_campaign_id}`, 'GET')
      const stats = {
        open_rate: report.opens?.open_rate ?? report.report_summary?.open_rate ?? 0,
        click_rate: report.clicks?.click_rate ?? report.report_summary?.click_rate ?? 0,
        emails_sent: report.emails_sent ?? 0,
        unsubscribes: report.unsubscribed ?? 0,
        source: 'api' as const,
      }
      await admin.from('campaigns').update({ performance_stats: stats }).eq('id', campaign.id)
      updated++
    } catch (err: any) {
      errors.push(`${campaign.id}: ${err.message}`)
    }
  }

  return NextResponse.json({ updated, errors })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/performance/refresh/route.ts
git commit -m "feat: POST /api/performance/refresh — fetch Mailchimp stats for all tracked campaigns"
```

---

## Task 6: Performance Page + KpiRow

**Files:**
- Create: `app/(app)/performance/page.tsx`
- Create: `components/performance/KpiRow.tsx`

- [ ] **Step 1: Create `components/performance/KpiRow.tsx`**

```typescript
// components/performance/KpiRow.tsx
import type { ManufacturerGroup } from '@/lib/supabase/types'

function fmt(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

export default function KpiRow({
  groups,
  totalCampaigns,
}: {
  groups: ManufacturerGroup[]
  totalCampaigns: number
}) {
  const allWithStats = groups.flatMap((g) =>
    g.campaigns.filter((c) => c.performance_stats)
  )
  const withDataCount = allWithStats.length
  const enoughData = withDataCount >= 3

  const avgOpenRate = enoughData
    ? allWithStats.reduce((s, c) => s + c.performance_stats!.open_rate, 0) / withDataCount
    : null

  const avgClickRate = enoughData
    ? allWithStats.reduce((s, c) => s + c.performance_stats!.click_rate, 0) / withDataCount
    : null

  const best = groups
    .filter((g) => g.avgOpenRate !== null)
    .sort((a, b) => (b.avgOpenRate ?? 0) - (a.avgOpenRate ?? 0))[0]

  const kpis = [
    {
      label: 'Ø Öffnungsrate',
      value: fmt(avgOpenRate),
      sub: enoughData ? `über ${withDataCount} Kampagnen` : 'Noch zu wenig Daten',
    },
    {
      label: 'Ø Klickrate',
      value: fmt(avgClickRate),
      sub: enoughData ? `über ${withDataCount} Kampagnen` : 'Noch zu wenig Daten',
    },
    {
      label: 'Kampagnen mit Daten',
      value: withDataCount.toString(),
      sub: `von ${totalCampaigns} gesamt`,
    },
    {
      label: 'Bester Hersteller',
      value: best ? best.manufacturer.name : '—',
      sub: best ? `${fmt(best.avgOpenRate)} Öffnungsrate` : 'Noch keine Daten',
      small: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map(({ label, value, sub, small }) => (
        <div key={label} className="bg-surface border border-border rounded-sm p-6">
          <p className="text-text-secondary text-[10px] tracking-wider uppercase mb-3">{label}</p>
          <p className={`font-light text-text-primary ${small ? 'text-xl' : 'text-3xl'}`}>{value}</p>
          <p className="text-[11px] text-text-secondary/60 mt-1.5">{sub}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(app)/performance/page.tsx`**

```typescript
// app/(app)/performance/page.tsx
import { createClient } from '@/lib/supabase/server'
import type { CampaignWithManufacturer, ManufacturerGroup, Agency } from '@/lib/supabase/types'
import KpiRow from '@/components/performance/KpiRow'
import ManufacturerGrid from '@/components/performance/ManufacturerGrid'

function groupCampaigns(
  campaigns: CampaignWithManufacturer[],
  searchParams: { year?: string; agency?: string; type?: string }
): ManufacturerGroup[] {
  // Apply filters
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
        totalSent: 0,
        totalUnsubscribes: 0,
        sources: [],
      })
    }
    const g = map.get(id)!
    g.campaigns.push(c)
    if (c.performance_stats) {
      g.totalSent += c.performance_stats.emails_sent
      g.totalUnsubscribes += c.performance_stats.unsubscribes
      const src = c.performance_stats.source
      if (!g.sources.includes(src)) g.sources.push(src)
    }
  }

  for (const g of map.values()) {
    const ws = g.campaigns.filter((c) => c.performance_stats)
    if (ws.length > 0) {
      g.avgOpenRate = ws.reduce((s, c) => s + c.performance_stats!.open_rate, 0) / ws.length
      g.avgClickRate = ws.reduce((s, c) => s + c.performance_stats!.click_rate, 0) / ws.length
    }
  }

  return [...map.values()].sort((a, b) => {
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

      <KpiRow groups={groups} totalCampaigns={campaigns.length} />

      <ManufacturerGrid
        groups={groups}
        agencies={agencies}
        searchParams={searchParams}
      />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/performance/KpiRow.tsx app/\(app\)/performance/page.tsx
git commit -m "feat: performance page server component + KpiRow"
```

---

## Task 7: ManufacturerCard + DrillDown + ManufacturerGrid

**Files:**
- Create: `components/performance/ManufacturerCard.tsx`
- Create: `components/performance/DrillDown.tsx`
- Create: `components/performance/ManufacturerGrid.tsx`

- [ ] **Step 1: Create `components/performance/ManufacturerCard.tsx`**

```typescript
// components/performance/ManufacturerCard.tsx
import type { ManufacturerGroup } from '@/lib/supabase/types'

function sourceBadge(sources: ('api' | 'csv')[]) {
  if (sources.length === 0) return { label: 'Keine Daten', cls: 'text-[#444] border-[#333] bg-transparent' }
  if (sources.includes('api') && sources.includes('csv')) return { label: 'API+CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
  if (sources.includes('api')) return { label: 'API', cls: 'text-[#2E7D32] border-[#2E7D32]/30 bg-[#2E7D32]/10' }
  return { label: 'CSV', cls: 'text-[#C4A87C] border-[#C4A87C]/30 bg-[#C4A87C]/8' }
}

function fmt(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

export default function ManufacturerCard({
  group,
  isExpanded,
  onClick,
}: {
  group: ManufacturerGroup
  isExpanded: boolean
  onClick: () => void
}) {
  const hasData = group.avgOpenRate !== null
  const badge = sourceBadge(group.sources)
  const campaignsWithStats = group.campaigns.filter((c) => c.performance_stats).length

  return (
    <button
      onClick={onClick}
      className={`text-left bg-surface border rounded-sm p-5 transition-all relative w-full ${
        isExpanded
          ? 'border-accent-warm bg-[#EDE8E3]/5'
          : hasData
          ? 'border-border hover:border-[#3A3A3A] hover:bg-[#1E1E1E]'
          : 'border-border opacity-45 hover:opacity-60'
      }`}
    >
      {/* Source badge */}
      <span className={`absolute top-3 right-3 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm ${badge.cls}`}>
        {badge.label}
      </span>

      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">
        {group.manufacturer.agencies?.name}
      </p>
      <p className="text-sm text-text-primary font-medium mb-4 pr-12 truncate">
        {group.manufacturer.name}
      </p>

      <p className={`text-3xl font-light mb-1.5 ${hasData ? 'text-[#C4A87C]' : 'text-[#444]'}`}>
        {fmt(group.avgOpenRate)}
      </p>
      <p className="text-[11px] text-text-secondary">
        {hasData
          ? `${fmt(group.avgClickRate)} Klick · ${campaignsWithStats} Kamp.`
          : `${group.campaigns.length} Kampagne${group.campaigns.length !== 1 ? 'n' : ''} · kein Export`}
      </p>
    </button>
  )
}
```

- [ ] **Step 2: Create `components/performance/DrillDown.tsx`**

```typescript
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
```

- [ ] **Step 3: Create `components/performance/ManufacturerGrid.tsx`**

```typescript
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
      // Reload page to show new data
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Year */}
        <div className="flex gap-1.5">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={filterLink({ year: y.toLowerCase() === 'alle' ? 'alle' : y })}
              className={`${pillBase} ${year === (y.toLowerCase() === 'alle' ? 'alle' : y) ? pillActive : pillInactive}`}
            >
              {y}
            </Link>
          ))}
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
      {[...expanded].map((mfgId) => {
        const g = groups.find((x) => x.manufacturer.id === mfgId)
        if (!g) return null
        return <DrillDown key={mfgId} group={g} onClose={() => toggle(mfgId)} />
      })}
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start dev server and verify**

```bash
npm run dev
```

Open http://localhost:3000/performance

Expected:
- "Performance" appears in the sidebar nav between Dashboard and Kalender
- Page loads with 4 KPI cards showing `—` (no data yet)
- All manufacturers appear as dimmed cards with `Keine Daten` badge
- Filter pills work (clicking year/agency/type changes URL and re-filters)
- Clicking a manufacturer card expands a DrillDown panel below
- Clicking again closes it
- "Mailchimp aktualisieren" button shows spinner while running

- [ ] **Step 6: Commit**

```bash
git add components/performance/ManufacturerCard.tsx components/performance/DrillDown.tsx components/performance/ManufacturerGrid.tsx
git commit -m "feat: performance dashboard — manufacturer grid, drill-down, filters, refresh"
```
