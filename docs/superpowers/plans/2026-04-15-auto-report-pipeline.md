# Auto-Report Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate internal + external campaign reports 4 business days after a newsletter is sent, by fetching engagement data directly from the Mailchimp API — eliminating the manual CSV-download → upload → generate workflow.

**Architecture:** A new `fetchMailchimpReportData()` function fetches email activity + member data from Mailchimp API v3 and converts it to CSV strings compatible with the existing `generateReports()`. A daily Vercel Cron job (`/api/cron/auto-reports`) checks for newsletters due for reports, calls the fetcher, generates both report types, and stores them on the linked report campaigns.

**Tech Stack:** Next.js 14 API Routes, Mailchimp API v3 (existing `mcFetch` client), Supabase (existing admin client), ExcelJS (existing report generator), Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-04-15-auto-report-pipeline-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260415000000_add_mailchimp_send_time.sql` | Create | DB migration: new column |
| `lib/supabase/types.ts` | Modify | Add `mailchimp_send_time` to Campaign interface |
| `lib/mailchimp/fetch-report-data.ts` | Create | Fetch email-activity + members from Mailchimp API → CSV strings |
| `lib/mailchimp/fetch-report-data.test.ts` | Create | Unit tests for CSV formatting + aggregation logic |
| `app/api/cron/auto-reports/route.ts` | Create | Daily cron: find due campaigns, fetch data, generate reports |
| `vercel.json` | Modify | Add cron schedule + maxDuration |
| `components/calendar/CampaignSidePanel.tsx` | Modify | Auto-report status hint on report campaigns |

---

### Task 1: Database Migration + Types

**Files:**
- Create: `supabase/migrations/20260415000000_add_mailchimp_send_time.sql`
- Modify: `lib/supabase/types.ts:77-97`

- [ ] **Step 1: Create migration file**

```sql
-- Add mailchimp_send_time to campaigns for auto-report scheduling
ALTER TABLE campaigns ADD COLUMN mailchimp_send_time timestamptz;

-- Index for cron query: find newsletters with mailchimp data that need reports
CREATE INDEX idx_campaigns_auto_report
  ON campaigns (mailchimp_campaign_id, type)
  WHERE mailchimp_campaign_id IS NOT NULL AND type = 'newsletter';
```

- [ ] **Step 2: Update TypeScript types**

In `lib/supabase/types.ts`, add `mailchimp_send_time` to the `Campaign` interface after `mailchimp_preview_text`:

```typescript
  mailchimp_preview_text: string | null
  mailchimp_send_time: string | null    // ← add this line
  performance_stats: PerformanceStats | null
```

- [ ] **Step 3: Run migration against Supabase**

```bash
npx supabase db push
```

If using Supabase Dashboard instead: run the SQL manually in the SQL Editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415000000_add_mailchimp_send_time.sql lib/supabase/types.ts
git commit -m "feat: add mailchimp_send_time column for auto-report scheduling"
```

---

### Task 2: Mailchimp Report Data Fetcher

**Files:**
- Create: `lib/mailchimp/fetch-report-data.ts`

- [ ] **Step 1: Create the fetcher module**

```typescript
// lib/mailchimp/fetch-report-data.ts
// Fetches email activity + list members from Mailchimp API v3
// and returns CSV-formatted strings compatible with generateReports().

import { mcFetch } from '@/lib/mailchimp'

export interface MailchimpReportData {
  recipientsCsv: string
  campaignCsv: string
  sendTime: string
  listId: string
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function buildCsvString(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  return lines.join('\n')
}

// ─── Mailchimp API fetchers ──────────────────────────────────────────────────

interface EmailActivity {
  email_address: string
  activity: Array<{ action: string; timestamp: string }>
}

async function fetchAllEmailActivity(campaignId: string): Promise<EmailActivity[]> {
  const all: EmailActivity[] = []
  let offset = 0
  const count = 500
  while (true) {
    const res = await mcFetch(
      `/reports/${campaignId}/email-activity?count=${count}&offset=${offset}`,
      'GET'
    )
    const batch: EmailActivity[] = res.emails ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return all
}

interface McListMember {
  email_address: string
  merge_fields: Record<string, string>
  status: string
}

async function fetchAllListMembers(listId: string): Promise<McListMember[]> {
  const all: McListMember[] = []
  let offset = 0
  const count = 500
  while (true) {
    const res = await mcFetch(
      `/lists/${listId}/members?count=${count}&offset=${offset}&fields=members.email_address,members.merge_fields,members.status`,
      'GET'
    )
    const batch: McListMember[] = res.members ?? []
    all.push(...batch)
    if (batch.length < count) break
    offset += count
  }
  return all.filter((m) => m.status === 'subscribed')
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface AggregatedActivity {
  email: string
  opens: number
  clicks: number
}

export function aggregateActivity(activities: EmailActivity[]): AggregatedActivity[] {
  const map = new Map<string, { opens: number; clicks: number }>()

  for (const entry of activities) {
    const email = entry.email_address.toLowerCase()
    const existing = map.get(email) ?? { opens: 0, clicks: 0 }
    for (const act of entry.activity ?? []) {
      if (act.action === 'open') existing.opens++
      else if (act.action === 'click') existing.clicks++
    }
    map.set(email, existing)
  }

  return Array.from(map.entries()).map(([email, stats]) => ({
    email,
    opens: stats.opens,
    clicks: stats.clicks,
  }))
}

// Phone merge field can have different names across audiences
const PHONE_FIELDS = ['PHONE', 'MMERGE5', 'MMERGE4', 'PHONE_NUMBER']

function findPhone(mergeFields: Record<string, string>): string {
  for (const key of PHONE_FIELDS) {
    const val = mergeFields[key]
    if (val && val.trim()) return val.trim()
  }
  // Fallback: search all merge fields for phone-like values
  for (const [key, val] of Object.entries(mergeFields)) {
    if (key.toLowerCase().includes('phone') && val && val.trim()) return val.trim()
  }
  return ''
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchMailchimpReportData(
  mailchimpCampaignId: string,
  knownListId?: string
): Promise<MailchimpReportData> {
  // Step 1: Get campaign metadata (skip if listId already known)
  let listId = knownListId ?? ''
  let sendTime = ''

  const campaignMeta = await mcFetch(`/campaigns/${mailchimpCampaignId}`, 'GET')
  sendTime = campaignMeta.send_time ?? ''
  if (!listId) listId = campaignMeta.recipients?.list_id ?? ''

  if (!listId) {
    throw new Error('MAILCHIMP_NO_LIST_ID: Campaign has no associated audience/list')
  }
  if (!sendTime) {
    throw new Error('MAILCHIMP_NOT_SENT: Campaign has no send_time — may not be sent yet')
  }

  // Step 2: Fetch email activity (engagement data)
  const rawActivity = await fetchAllEmailActivity(mailchimpCampaignId)
  if (rawActivity.length === 0) {
    throw new Error('MAILCHIMP_NO_ACTIVITY: No email activity found for this campaign')
  }
  const aggregated = aggregateActivity(rawActivity)

  // Step 3: Fetch list members (contact data)
  const members = await fetchAllListMembers(listId)

  // Build member lookup for names
  const memberMap = new Map<string, McListMember>()
  for (const m of members) {
    memberMap.set(m.email_address.toLowerCase(), m)
  }

  // Step 4: Build campaign CSV (engagement data)
  const campaignRows: string[][] = []
  for (const act of aggregated) {
    const member = memberMap.get(act.email)
    campaignRows.push([
      act.email,
      member?.merge_fields?.FNAME ?? '',
      member?.merge_fields?.LNAME ?? '',
      String(act.opens),
      String(act.clicks),
    ])
  }
  const campaignCsv = buildCsvString(
    ['Email Address', 'First Name', 'Last Name', 'Opens', 'Clicks'],
    campaignRows
  )

  // Step 5: Build recipients CSV (contact data)
  const recipientRows: string[][] = []
  for (const m of members) {
    recipientRows.push([
      m.email_address,
      m.merge_fields?.FNAME ?? '',
      m.merge_fields?.LNAME ?? '',
      findPhone(m.merge_fields),
    ])
  }
  const recipientsCsv = buildCsvString(
    ['Email Address', 'First Name', 'Last Name', 'Phone Number'],
    recipientRows
  )

  return { recipientsCsv, campaignCsv, sendTime, listId }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mailchimp/fetch-report-data.ts
git commit -m "feat: add Mailchimp report data fetcher (API → CSV strings)"
```

---

### Task 3: Unit Tests for Fetcher

**Files:**
- Create: `lib/mailchimp/fetch-report-data.test.ts`

- [ ] **Step 1: Write tests for aggregation + CSV formatting**

These tests cover the pure functions (no API calls). The API-calling functions are integration-tested via Task 6.

```typescript
// lib/mailchimp/fetch-report-data.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateActivity } from './fetch-report-data'

describe('aggregateActivity', () => {
  test('aggregates opens and clicks per email', () => {
    const input = [
      {
        email_address: 'Anna@Firma.de',
        activity: [
          { action: 'open', timestamp: '2026-04-10T10:00:00Z' },
          { action: 'open', timestamp: '2026-04-10T11:00:00Z' },
          { action: 'click', timestamp: '2026-04-10T11:05:00Z' },
        ],
      },
      {
        email_address: 'bob@test.com',
        activity: [
          { action: 'open', timestamp: '2026-04-10T12:00:00Z' },
        ],
      },
    ]

    const result = aggregateActivity(input)
    const anna = result.find((r) => r.email === 'anna@firma.de')
    const bob = result.find((r) => r.email === 'bob@test.com')

    assert.ok(anna)
    assert.equal(anna.opens, 2)
    assert.equal(anna.clicks, 1)
    assert.ok(bob)
    assert.equal(bob.opens, 1)
    assert.equal(bob.clicks, 0)
  })

  test('deduplicates same email with multiple entries', () => {
    const input = [
      {
        email_address: 'test@test.com',
        activity: [{ action: 'open', timestamp: '2026-04-10T10:00:00Z' }],
      },
      {
        email_address: 'TEST@test.com',
        activity: [{ action: 'click', timestamp: '2026-04-10T11:00:00Z' }],
      },
    ]

    const result = aggregateActivity(input)
    assert.equal(result.length, 1)
    assert.equal(result[0].opens, 1)
    assert.equal(result[0].clicks, 1)
  })

  test('handles empty activity array', () => {
    const input = [
      { email_address: 'test@test.com', activity: [] },
    ]

    const result = aggregateActivity(input)
    assert.equal(result.length, 1)
    assert.equal(result[0].opens, 0)
    assert.equal(result[0].clicks, 0)
  })

  test('handles empty input', () => {
    const result = aggregateActivity([])
    assert.equal(result.length, 0)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx -y pnpm@10 exec node --test lib/mailchimp/fetch-report-data.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/mailchimp/fetch-report-data.test.ts
git commit -m "test: add unit tests for Mailchimp activity aggregation"
```

---

### Task 4: Auto-Reports Cron Route

**Files:**
- Create: `app/api/cron/auto-reports/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
// app/api/cron/auto-reports/route.ts
// Daily cron (09:00 UTC): auto-generate reports for newsletters sent ≥4 business days ago.
// Secured with CRON_SECRET bearer token.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mcFetch, mcConfigured } from '@/lib/mailchimp'
import { fetchMailchimpReportData } from '@/lib/mailchimp/fetch-report-data'
import { generateReports } from '@/lib/generate/report'

export const maxDuration = 120

const REPORT_DELAY_BUSINESS_DAYS = 4
const MAX_CAMPAIGNS_PER_RUN = 10

// ─── Business days ───────────────────────────────────────────────────────────

function countBusinessDays(from: Date, to: Date): number {
  let count = 0
  const d = new Date(from)
  while (d < to) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProcessResult {
  campaign: string
  status: 'generated' | 'skipped' | 'error'
  reason?: string
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!mcConfigured()) {
    return NextResponse.json({ error: 'MAILCHIMP_API_KEY not configured' }, { status: 500 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const results: ProcessResult[] = []

  // Step 1: Find all newsletter campaigns with a Mailchimp link
  const { data: newsletters } = await admin
    .from('campaigns')
    .select('id, title, mailchimp_campaign_id, mailchimp_send_time, manufacturers(name, agencies(name))')
    .eq('type', 'newsletter')
    .not('mailchimp_campaign_id', 'is', null)

  if (!newsletters || newsletters.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, errors: [], details: [] })
  }

  let processed = 0

  for (const nl of newsletters) {
    if (processed >= MAX_CAMPAIGNS_PER_RUN) break

    const title = nl.title ?? nl.id
    const mfgName = (nl.manufacturers as any)?.name ?? 'Unbekannt'
    const agencyName = (nl.manufacturers as any)?.agencies?.name ?? 'Collezioni'

    try {
      // Step 2: Find sibling report campaigns
      const { data: siblings } = await admin
        .from('campaigns')
        .select('id, type')
        .eq('linked_newsletter_id', nl.id)

      const internalId = siblings?.find((s: any) => s.type === 'report_internal')?.id
      const externalId = siblings?.find((s: any) => s.type === 'report_external')?.id

      if (!internalId && !externalId) {
        results.push({ campaign: title, status: 'skipped', reason: 'no sibling report campaigns' })
        continue
      }

      // Step 3: Check if reports already exist
      const reportCampaignIds = [internalId, externalId].filter(Boolean) as string[]
      const { data: existingOutputs } = await admin
        .from('campaign_assets')
        .select('campaign_id')
        .in('campaign_id', reportCampaignIds)
        .eq('asset_category', 'report_xlsx')
        .eq('is_output', true)
        .limit(1)

      if (existingOutputs && existingOutputs.length > 0) {
        results.push({ campaign: title, status: 'skipped', reason: 'reports already exist' })
        continue
      }

      // Step 4: Determine send_time
      let sendTime: Date | null = null
      let listId: string | undefined

      if (nl.mailchimp_send_time) {
        sendTime = new Date(nl.mailchimp_send_time)
      } else {
        // Fetch from Mailchimp API and cache
        try {
          const mcCampaign = await mcFetch(`/campaigns/${nl.mailchimp_campaign_id}`, 'GET')
          if (mcCampaign.status !== 'sent') {
            results.push({ campaign: title, status: 'skipped', reason: 'not yet sent on Mailchimp' })
            continue
          }
          sendTime = mcCampaign.send_time ? new Date(mcCampaign.send_time) : null
          listId = mcCampaign.recipients?.list_id

          // Cache send_time for future runs
          if (sendTime) {
            await admin.from('campaigns')
              .update({ mailchimp_send_time: sendTime.toISOString() })
              .eq('id', nl.id)
          }
        } catch (err: any) {
          if (err.message?.includes('404')) {
            results.push({ campaign: title, status: 'skipped', reason: 'Mailchimp campaign not found (404)' })
          } else {
            results.push({ campaign: title, status: 'error', reason: err.message })
          }
          continue
        }
      }

      if (!sendTime) {
        results.push({ campaign: title, status: 'skipped', reason: 'no send_time available' })
        continue
      }

      // Step 5: Check business days
      const businessDays = countBusinessDays(sendTime, now)
      if (businessDays < REPORT_DELAY_BUSINESS_DAYS) {
        const dueDate = addBusinessDays(sendTime, REPORT_DELAY_BUSINESS_DAYS)
        results.push({
          campaign: title,
          status: 'skipped',
          reason: `only ${businessDays} business days (due ${dueDate.toISOString().split('T')[0]})`,
        })
        continue
      }

      // Step 6: Fetch data from Mailchimp API
      const reportData = await fetchMailchimpReportData(
        nl.mailchimp_campaign_id!,
        listId
      )

      // Step 7: Generate reports
      const dateStr = new Date().toISOString().split('T')[0]
      const { internalBuffer, externalBuffer } = await generateReports({
        recipientsCsv: reportData.recipientsCsv,
        campaignCsv: reportData.campaignCsv,
        manufacturerName: mfgName,
        agencyName,
        campaignTitle: title,
        campaignDate: dateStr,
      })

      // Step 8: Upload + link (same logic as existing report route)
      const mfgSlug = mfgName.replace(/[^a-zA-Z0-9]/g, '_')
      const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      if (internalId) {
        const path = `${internalId}/${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`
        await admin.storage.from('campaign-assets').upload(path, internalBuffer, { upsert: true, contentType: xlsxMime })
        const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
        await admin.from('campaign_assets').delete().eq('campaign_id', internalId).eq('is_output', true)
        await admin.from('campaign_assets').insert({
          campaign_id: internalId,
          file_name: `${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`,
          file_type: xlsxMime,
          file_url: urlData.publicUrl,
          file_size: internalBuffer.length,
          asset_category: 'report_xlsx',
          is_output: true,
        })
        await admin.from('campaigns').update({ status: 'review' }).eq('id', internalId)
      }

      if (externalId) {
        const path = `${externalId}/${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`
        await admin.storage.from('campaign-assets').upload(path, externalBuffer, { upsert: true, contentType: xlsxMime })
        const { data: urlData } = admin.storage.from('campaign-assets').getPublicUrl(path)
        await admin.from('campaign_assets').delete().eq('campaign_id', externalId).eq('is_output', true)
        await admin.from('campaign_assets').insert({
          campaign_id: externalId,
          file_name: `${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`,
          file_type: xlsxMime,
          file_url: urlData.publicUrl,
          file_size: externalBuffer.length,
          asset_category: 'report_xlsx',
          is_output: true,
        })
        await admin.from('campaigns').update({ status: 'review' }).eq('id', externalId)
      }

      processed++
      results.push({ campaign: title, status: 'generated' })
      console.log(`[auto-reports] Generated reports for "${title}"`)

      // Rate limit: wait 1s between campaigns
      if (processed < MAX_CAMPAIGNS_PER_RUN) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    } catch (err: any) {
      results.push({ campaign: title, status: 'error', reason: err.message })
      console.error(`[auto-reports] Error for "${title}":`, err)
    }
  }

  const errors = results.filter((r) => r.status === 'error')
  console.log(`[auto-reports] Done: ${processed} generated, ${results.filter((r) => r.status === 'skipped').length} skipped, ${errors.length} errors`)

  return NextResponse.json({
    processed,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: errors.map((e) => `${e.campaign}: ${e.reason}`),
    details: results,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/auto-reports/route.ts
git commit -m "feat: add auto-reports cron route (daily, 4 business days after send)"
```

---

### Task 5: Vercel Configuration

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add cron schedule and function config**

Replace the full content of `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/campaign-alerts",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/auto-reports",
      "schedule": "0 9 * * *"
    }
  ],
  "functions": {
    "app/api/generate/newsletter/route.ts": {
      "maxDuration": 300
    },
    "app/api/generate/report/route.ts": {
      "maxDuration": 300
    },
    "app/api/cron/auto-reports/route.ts": {
      "maxDuration": 120
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "config: add auto-reports cron schedule (daily 09:00 UTC)"
```

---

### Task 6: UI Status Hint

**Files:**
- Modify: `components/calendar/CampaignSidePanel.tsx`

- [ ] **Step 1: Add auto-report hint for report campaigns**

Find the section around line 742 where the generation buttons are rendered for report campaigns. Before the existing generation button, add a status hint when auto-report is expected.

Locate this block (around line 742-785):

```tsx
        {/* Generation */}
        {(campaign.type === 'newsletter' ||
          campaign.type === 'report_internal' ||
          campaign.type === 'report_external') && (
```

Inside the report branch (after line 768, where the generate button is for reports), add the auto-report hint above the existing button. The hint should show when:
- Campaign is `report_internal` or `report_external`
- The linked newsletter has a `mailchimp_campaign_id`
- No output assets exist yet

This requires loading the linked newsletter's `mailchimp_send_time`. The `linkedCampaigns` data is already loaded (line 96-100), but doesn't include `mailchimp_send_time`. We need to extend the query.

First, extend the linked campaign data to include `mailchimp_send_time` and `mailchimp_campaign_id`. Find the report linked-campaign query (around line 103-106):

```tsx
      const { data: nl } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date, linked_postcard_id')
        .eq('id', campaign.linked_newsletter_id)
        .single()
```

Change the select to:

```tsx
      const { data: nl } = await supabase
        .from('campaigns')
        .select('id, title, type, scheduled_date, linked_postcard_id, mailchimp_campaign_id, mailchimp_send_time')
        .eq('id', campaign.linked_newsletter_id)
        .single()
```

Then add a helper function near the top of the component (after the imports):

```tsx
function getAutoReportDate(linkedNewsletter: any): string | null {
  if (!linkedNewsletter?.mailchimp_send_time) return null
  const send = new Date(linkedNewsletter.mailchimp_send_time)
  let added = 0
  const d = new Date(send)
  while (added < 4) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
```

Then add the hint inside the report generation section. Find where the "Report generieren" button is shown (around line 769-780) and add the hint before the button:

```tsx
              {/* Auto-report hint */}
              {(campaign.type === 'report_internal' || campaign.type === 'report_external') &&
                !assets.some((a) => a.is_output) && (() => {
                  const linkedNl = linkedCampaigns.find((lc) => lc.type === 'newsletter')
                  if (!linkedNl || !(linkedNl as any).mailchimp_campaign_id) return null
                  const dueDate = getAutoReportDate(linkedNl)
                  if (!dueDate) return null
                  return (
                    <p className="text-xs text-text-secondary mb-2">
                      Auto-Report wird ca. {dueDate} generiert
                    </p>
                  )
                })()}
```

- [ ] **Step 2: Extend LinkedCampaign type if needed**

Find the `LinkedCampaign` type definition in the same file and add the new fields. If it's a simple inline type, extend it:

```typescript
interface LinkedCampaign {
  id: string
  title: string
  type: string
  scheduled_date: string
  mailchimp_campaign_id?: string | null
  mailchimp_send_time?: string | null
}
```

- [ ] **Step 3: Commit**

```bash
git add components/calendar/CampaignSidePanel.tsx
git commit -m "feat: show auto-report due date hint on report campaigns"
```

---

### Task 7: TypeScript Check + Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compiler**

```bash
npx -y pnpm@10 exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run unit tests**

```bash
npx -y pnpm@10 exec node --test lib/mailchimp/fetch-report-data.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Run existing tests to verify no regressions**

```bash
npx -y pnpm@10 exec node --test lib/mailchimp/size-guard.test.ts
```

Expected: All existing tests pass.

- [ ] **Step 4: Final commit + push**

```bash
git add -A
git status
git push origin master
```

---

## Post-Deployment Verification

After deploying to Vercel:

1. Check Vercel dashboard → Cron Jobs → verify `/api/cron/auto-reports` is listed
2. Find a newsletter campaign with `mailchimp_campaign_id` in the database
3. Manually trigger: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/auto-reports`
4. Check response JSON for `details` array
5. Verify report XLSX files appear on the sibling report campaigns
6. Check campaign status changed to `review`
