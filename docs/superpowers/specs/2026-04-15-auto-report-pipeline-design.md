# Auto-Report Pipeline

**Date:** 2026-04-15
**Status:** Approved

---

## Overview

Eliminate the manual CSV-download → upload → generate → send workflow for campaign reports. Instead, a daily cron job detects newsletters that were sent ≥4 business days ago, fetches engagement data directly from the Mailchimp API, generates both reports (internal lead prioritization + external campaign summary), and stores them on the correct report campaigns.

**Time saved:** ~20 min per report cycle × ~18 manufacturers × multiple cycles/year = significant hours/year. More importantly: zero cognitive load — reports just appear.

---

## 1. New File: `lib/mailchimp/fetch-report-data.ts`

### Purpose

Given a `mailchimp_campaign_id`, fetch all data needed for report generation directly from the Mailchimp API v3. Returns CSV-formatted strings that are compatible with the existing `generateReports()` function — no changes to the report generator needed.

### Interface

```typescript
interface MailchimpReportData {
  recipientsCsv: string   // CSV string: Email Address, First Name, Last Name, Phone Number
  campaignCsv: string     // CSV string: Email Address, First Name, Last Name, Opens, Clicks
  sendTime: string        // ISO date string from Mailchimp
  listId: string          // Mailchimp list/audience ID
}

async function fetchMailchimpReportData(
  mailchimpCampaignId: string,
  knownListId?: string    // optional: skip campaign metadata fetch if already known
): Promise<MailchimpReportData>
```

### API Calls

**Step 1 — Get campaign metadata (skipped if `knownListId` provided):**
```
GET /campaigns/{campaign_id}
→ recipients.list_id, send_time, settings.title
```

**Step 2 — Get email activity (engagement data):**
```
GET /reports/{campaign_id}/email-activity?count=500&offset=0
→ Per subscriber: email_address, activity[{action: "open"|"click"}]
```
- Paginated: loop until `items.length < count`
- Aggregate opens and clicks per email address
- Output as CSV string with columns: `Email Address,First Name,Last Name,Opens,Clicks`

**Step 3 — Get list members (contact data):**
```
GET /lists/{list_id}/members?count=500&offset=0&fields=members.email_address,members.merge_fields,members.status
→ Per member: email_address, FNAME, LNAME, PHONE
```
- Paginated: loop until `members.length < count`
- Filter to `status === 'subscribed'` only
- Output as CSV string with columns: `Email Address,First Name,Last Name,Phone Number`

### CSV Format

The output strings must match exactly what `parseRecipientsFile()` and `parseCampaignFile()` in `lib/generate/report.ts` expect. Column headers must use the same naming convention as Mailchimp's CSV exports:
- Recipients: `Email Address`, `First Name`, `Last Name`, `Phone Number`
- Campaign: `Email Address`, `First Name`, `Last Name`, `Opens`, `Clicks`

### Error Handling

- Mailchimp API returns 404 → throw with message `MAILCHIMP_CAMPAIGN_NOT_FOUND`
- Mailchimp API returns 401/403 → throw with message `MAILCHIMP_AUTH_ERROR`
- Empty email activity (no opens/clicks at all) → throw with message `MAILCHIMP_NO_ACTIVITY` (campaign may not have been sent yet)
- Network/timeout errors → let them bubble up to caller

---

## 2. New File: `app/api/cron/auto-reports/route.ts`

### Purpose

Daily cron job that automatically generates reports for newsletters sent ≥N business days ago.

### Schedule

`0 9 * * *` (daily at 09:00 UTC, 1 hour after campaign alerts)

### Configuration

```typescript
const REPORT_DELAY_BUSINESS_DAYS = 4
```

Hardcoded constant. Can be moved to a settings page later if needed.

### Logic Flow

```
1. Query all newsletter campaigns where:
   - mailchimp_campaign_id IS NOT NULL
   - type = 'newsletter'

2. For each campaign, find sibling report campaigns:
   - SELECT id, type FROM campaigns
     WHERE linked_newsletter_id = {newsletter.id}
     AND type IN ('report_internal', 'report_external')

3. Skip if:
   - No sibling report campaigns exist (not part of a chain)
   - Sibling report campaigns already have report_xlsx output assets
   - send_time not yet determined (see below)
   - Business days since send < REPORT_DELAY_BUSINESS_DAYS

4. Determine send_time + list_id:
   a. Check campaign.mailchimp_send_time in DB (cached from previous run)
   b. If null: GET /campaigns/{mailchimp_campaign_id} → send_time, recipients.list_id, status
   c. If Mailchimp status !== 'sent' → skip (not sent yet)
   d. Cache send_time in DB: UPDATE campaigns SET mailchimp_send_time = ... WHERE id = ...

5. Fetch report data:
   - fetchMailchimpReportData(mailchimp_campaign_id, listId) — pass listId to avoid redundant API call

6. Generate reports:
   - generateReports({recipientsCsv, campaignCsv, manufacturerName, agencyName, ...})

7. Upload & link:
   - Upload internalBuffer to internal report campaign (same logic as existing route.ts:164-182)
   - Upload externalBuffer to external report campaign (same logic as existing route.ts:185-203)
   - Set both report campaigns to status 'review'
   - Save performance_stats on newsletter campaign (same as existing route.ts:206-219)

8. Log results:
   - Console log: which campaigns processed, which skipped, any errors
```

### Business Days Calculation

```typescript
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
```

No public holiday calendar — weekdays only. Acceptable for this use case.

### Safety Checks (all must pass before generating)

1. `mailchimp_campaign_id` is not null
2. Mailchimp confirms campaign `status === 'sent'`
3. Sibling report campaigns exist (`report_internal` and/or `report_external` with `linked_newsletter_id`)
4. No `report_xlsx` output assets exist on sibling campaigns yet (prevents double generation)
5. Business days since `send_time` ≥ `REPORT_DELAY_BUSINESS_DAYS`

If any check fails → skip silently (log reason). Never generate a wrong report — worst case is no report (user falls back to manual).

### Response

```json
{
  "processed": 2,
  "skipped": 5,
  "errors": [],
  "details": [
    { "campaign": "Salvatori Herbst 2026", "status": "generated" },
    { "campaign": "Tuuci Outdoor", "status": "skipped", "reason": "only 3 business days" }
  ]
}
```

### Authentication & Runtime

- Cron uses `GET` method with `Bearer ${CRON_SECRET}` auth header (same pattern as `campaign-alerts/route.ts`)
- `maxDuration = 120` (multiple campaigns × paginated API calls)
- Max 10 campaigns per run to stay within Vercel timeout
- 1 second delay between campaigns to respect Mailchimp rate limits (10 concurrent connections max)

---

## 3. Database Changes

### `campaigns` — add `mailchimp_send_time`

```sql
ALTER TABLE campaigns ADD COLUMN mailchimp_send_time timestamptz;
```

- Set by auto-report cron when it first reads `send_time` from Mailchimp API
- Used for business-day calculation on subsequent runs (avoids repeated API calls)
- Also set by the performance refresh route (if it runs first)

### TypeScript type update

In `lib/supabase/types.ts`, add to `Campaign`:
```typescript
mailchimp_send_time: string | null
```

---

## 4. Changes to Existing Files

### `vercel.json` — add cron schedule + function config

```json
{
  "crons": [
    { "path": "/api/cron/campaign-alerts", "schedule": "0 8 * * *" },
    { "path": "/api/cron/auto-reports", "schedule": "0 9 * * *" }
  ],
  "functions": {
    "app/api/cron/auto-reports/route.ts": { "maxDuration": 120 }
  }
}
```

Runs 1 hour after alerts — ensures alerts about missing assets fire before auto-reports try to run.

### `components/calendar/CampaignSidePanel.tsx` — status hint

On report campaigns that are linked to a newsletter with `mailchimp_campaign_id` but don't have output assets yet:

Show a hint text: `"Auto-Report wird ca. [date] generiert"` (calculated from newsletter's `mailchimp_send_time` + 4 business days).

After auto-generation: the existing "review" status badge and output asset list already handle this — no changes needed there.

### `app/api/generate/report/route.ts` — no changes

The existing manual report route stays as-is. It remains the fallback for:
- Campaigns without `mailchimp_campaign_id` (manually sent via Mailchimp)
- Ad-hoc re-generation with fresh data
- Quick reports via the dashboard modal

### `lib/generate/report.ts` — no changes

The report generator is untouched. It receives CSV strings regardless of source (file upload or API fetch).

### `lib/generate/scoring.ts` — no changes

Scoring logic is untouched.

---

## 5. What Does NOT Change

| Component | Status |
|---|---|
| `generateReports()` | Untouched — receives CSV strings as before |
| `filterAndScore()` | Untouched |
| Manual CSV upload flow | Still works — fallback path |
| Quick Report Modal | Still works |
| Report email sending | Still manual — intentional review gate |
| Newsletter generation | Unrelated |
| Performance Dashboard | Unrelated (but benefits from `mailchimp_send_time`) |

---

## 6. Implementation Order

1. SQL migration: add `mailchimp_send_time` to campaigns
2. TypeScript types: add field to `Campaign` interface
3. `lib/mailchimp/fetch-report-data.ts`: Mailchimp API → CSV strings
4. `app/api/cron/auto-reports/route.ts`: cron job with safety checks
5. `vercel.json`: add cron schedule
6. `CampaignSidePanel.tsx`: auto-report status hint
7. Test with a real campaign that has `mailchimp_campaign_id`

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Mailchimp API rate limits | Reports delayed | Cron processes max 10 campaigns per run, with 1s delay between API calls |
| Merge field names differ per audience | Phone not found | Fallback: try `PHONE`, `MMERGE5`, common variants. Log warning if not found — report still generates, just without phone data |
| Email activity endpoint returns partial data | Report quality slightly lower | 4 business days is sufficient for 95%+ data completeness. User can re-trigger manually for a refresh |
| Cron fails silently | Reports never generated | Log all runs. Add optional alert email when cron processes 0 campaigns for >7 days |
