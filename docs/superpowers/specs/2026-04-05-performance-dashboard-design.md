# Performance Dashboard — Design Spec

## Goal

A dedicated `/performance` page that shows email marketing results (open rates, click rates) per manufacturer and per campaign, sourced from Mailchimp API for new campaigns and from uploaded CSV exports for older ones.

## Architecture

### Data Pipeline

Stats are stored as JSONB on the `campaigns` table. Two sources populate them:

**1. Mailchimp API (new campaigns)**
When a campaign is created via `POST /api/send/mailchimp`, the Mailchimp campaign ID (`created.id`) is saved to `campaigns.mailchimp_campaign_id`. A "Mailchimp aktualisieren" button on the performance page calls `POST /api/performance/refresh`, which loops over all campaigns with a `mailchimp_campaign_id`, fetches `GET /3.0/reports/{id}` from the Mailchimp API, and writes the result to `campaigns.performance_stats`.

**2. CSV fallback (older campaigns)**
When a report is generated (`POST /api/generate/report`), the uploaded CSV is already parsed for lead scoring. After parsing, aggregate stats (total rows, unique opens, unique clicks) are calculated and written to `campaigns.performance_stats` with `source: 'csv'`. No manual step needed.

**Stats shape (JSONB):**
```json
{
  "open_rate": 0.46,
  "click_rate": 0.14,
  "emails_sent": 1240,
  "unsubscribes": 3,
  "source": "api"
}
```
`source` is either `"api"` or `"csv"`.

### DB Migration

```sql
ALTER TABLE campaigns
  ADD COLUMN mailchimp_campaign_id text DEFAULT NULL,
  ADD COLUMN performance_stats jsonb DEFAULT NULL;
```

Run once manually in Supabase SQL editor.

## Page: `/performance`

**Route:** `app/(app)/performance/page.tsx` — Server Component

**Data loaded:**
- All campaigns with `manufacturers(*, agencies(*))` — no status filter
- Grouped by `manufacturer_id` on the server before passing to client

**Sidebar:** New nav item "Performance" with `BarChart2` icon, positioned between Dashboard and Kalender.

## Components

### `KpiRow` (server, static)
Four stat cards computed from all loaded campaigns:
1. **Ø Öffnungsrate** — average `open_rate` across all campaigns with stats
2. **Ø Klickrate** — average `click_rate` across all campaigns with stats
3. **Kampagnen mit Daten** — count of campaigns where `performance_stats != null`, shown as "X von Y gesamt"
4. **Bester Hersteller** — manufacturer name with highest average `open_rate`

### `ManufacturerGrid` (client)
Holds filter state and renders the grid.

**Filters (URL params, not local state — so they survive refresh):**
- `year`: `2026`, `2025`, `Alle` — filters by `scheduled_date` year
- `agency`: agency ID or `alle`
- `type`: `alle`, `newsletter`, `postcard`

**Sort:** Manufacturers with data sorted descending by average `open_rate`. Manufacturers with no data shown last, dimmed to 45% opacity.

**Grid:** 4 columns on desktop (`lg`), 3 on `md`, 2 on `sm`.

### `ManufacturerCard` (client)
Displays per manufacturer:
- Agency name (small, secondary, uppercase)
- Manufacturer name
- Average `open_rate` (large, gold `#C4A87C`)
- `click_rate` + campaign count (small, secondary)
- Source badge top-right: `API` (green), `CSV` (gold), `Keine Daten` (muted)

If a manufacturer has a mix of API and CSV campaigns, the badge shows `API+CSV`.

Clicking a card toggles the drill-down panel below it. Multiple cards can be expanded simultaneously.

### `DrillDown` (client)
Expands inline below the card grid row when a card is selected. Shows:

**Header:**
- Manufacturer name + campaign count + year
- 4 aggregate stats: Ø Öffnungsrate, Ø Klickrate, Versendet gesamt, Abmeldungen
- "✕ Schließen" button

**Campaign table columns:**
| Typ | Kampagne | Datum | Öffnung | Klick | Versendet | Quelle |
|-----|----------|-------|---------|-------|-----------|--------|
| Type badge | title | scheduled_date | open_rate | click_rate | emails_sent | API / CSV badge |

Campaigns without `performance_stats` show `—` in the stats columns.
Campaigns are sorted by `scheduled_date` descending (newest first).

## API Routes

### `POST /api/performance/refresh`
Authenticated. Fetches Mailchimp report stats for all campaigns with `mailchimp_campaign_id`.

For each such campaign:
1. `GET https://us19.api.mailchimp.com/3.0/reports/{mailchimp_campaign_id}`
2. Extract `report_summary.open_rate`, `report_summary.click_rate`, `emails_sent`, `unsubscribes`
3. Write to `campaigns.performance_stats` via admin client

Returns `{ updated: N, errors: [...] }`.

### `POST /api/send/mailchimp` (amendment)
After creating the Mailchimp campaign, save `created.id` to `campaigns.mailchimp_campaign_id`:
```typescript
await admin.from('campaigns').update({ mailchimp_campaign_id: created.id }).eq('id', campaign_id)
```

### `POST /api/generate/report` (amendment)
After parsing the CSV for lead scoring, also compute aggregate stats:
```typescript
const total = rows.length
const uniqueOpens = rows.filter(r => Number(r['Number of Opens'] ?? 0) > 0).length
const uniqueClicks = rows.filter(r => Number(r['Number of Clicks'] ?? 0) > 0).length
const stats = {
  open_rate: total > 0 ? uniqueOpens / total : 0,
  click_rate: total > 0 ? uniqueClicks / total : 0,
  emails_sent: total,
  unsubscribes: 0, // not available in member export
  source: 'csv',
}
await admin.from('campaigns').update({ performance_stats: stats }).eq('id', campaign_id)
```

## Empty State

When a manufacturer has no data at all, the card is dimmed and shows `—` as the rate. No error state — just graceful absence of data.

Global KPI row shows `—` if fewer than 3 campaigns have stats total.

## Design System

Follows existing conventions:
- Background `#0A0A0A`, Surface `#1A1A1A`, Border `#2A2A2A`
- Text Primary `#FFFFFF`, Secondary `#999999`
- Accent Warm `#EDE8E3` (active filters, selected cards)
- Accent Gold `#C4A87C` (performance numbers)
- Success green `#2E7D32` for API badge
- All UI text in German
