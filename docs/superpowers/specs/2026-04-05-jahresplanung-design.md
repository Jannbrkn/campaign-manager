# Jahresplanung — Design Spec

## Goal

A `/planning` page that generates a full year of campaign chains (postcard → newsletter → internal report → external report) for all manufacturers in one click, based on their configured `postcard_months` and `postcard_frequency`. Manufacturers that already have campaigns in the target year are skipped automatically.

## Architecture

### Data Source

All manufacturer configuration is already stored in `manufacturers.postcard_months` (e.g. `"März, September"`) and `postcard_frequency` (e.g. `"2x pro Jahr"`). No new DB columns needed.

### Skip Logic

Before generating, the API loads all existing campaigns for the target year. Any manufacturer that already has at least one campaign with `scheduled_date` in that year is skipped entirely.

### Date Calculation Algorithm

For each manufacturer and each of their configured months:

1. **Parse month** — Map German month name to 0-indexed month number (e.g. `"März"` → 2).
2. **Find all Fridays** in that month for the target year.
3. **Spread across Fridays** — Group all manufacturers sharing the same month, sort alphabetically by `manufacturer.name`, then assign `Fridays[i % fridays.length]` to the i-th manufacturer. This distributes campaigns evenly across weeks to avoid email spam.
4. **Postcard** → assigned Friday.
5. **Newsletter** → Wednesday of the following week (postcard Friday + 5 days).
6. **Internal Report** → Monday after newsletter (newsletter Wednesday + 5 days).
7. **External Report** → same Monday as internal report.

**Example (März 2027, 4 Fridays: Mar 5, 12, 19, 26, 8 manufacturers alphabetically sorted):**
- Arclinea → Mar 5 | B&B Outdoor → Mar 5 | DePadova → Mar 12 | Magis → Mar 12 | Marset → Mar 19 | Röthlisberger → Mar 19 | Tuuci (Norden) → Mar 26 | Tuuci (Südlich) → Mar 26

### Campaign Chain Created Per Manufacturer Per Month

| Type | Date | Title pattern | Linked to |
|------|------|---------------|-----------|
| `postcard` | Friday | `{Name} Postkarte {MonatJahr}` | — |
| `newsletter` | Wed +5d | `{Name} Newsletter {MonatJahr}` | `linked_postcard_id` |
| `report_internal` | Mon +5d | `{Name} Report intern {MonatJahr}` | `linked_newsletter_id` |
| `report_external` | Mon +5d | `{Name} Report extern {MonatJahr}` | `linked_newsletter_id` |

All campaigns created with `status: 'planned'`.

`{MonatJahr}` = short German month name + year, e.g. `"Mär 2027"`.

## Page: `/planning`

**Route:** `app/(app)/planning/page.tsx` — Server Component (renders client form, no server data needed)

**Sidebar:** New nav item "Jahresplanung" with `CalendarPlus` icon, positioned between Performance and Kalender.

## Components

### `PlanningForm` (client)

Single client component at `components/planning/PlanningForm.tsx`.

**State:**
- `year: number` — selected year, default = current year + 1
- `loading: boolean`
- `result: { created: number; skipped: number; errors: string[] } | null`

**UI:**
- Heading + subtitle explaining what this does
- Year pills: current year, current year +1, current year +2 (active pill highlighted with `border-accent-warm text-accent-warm`)
- "Kampagnen generieren →" button (disabled while loading, shows spinner)
- After success: result card showing created count (gold), skipped count (muted), "Im Kalender ansehen →" link to `/calendar`
- Errors (if any) shown below as a muted list

## API Route

### `POST /api/planning/generate`

**Auth:** Supabase user session required (401 if missing).

**Body:** `{ year: number }`

**Logic:**

```typescript
// 1. Validate year (2020–2040)
// 2. Load all manufacturers
// 3. Load all campaign scheduled_dates for the target year
// 4. Build a Set of manufacturer_ids that already have campaigns this year
// 5. For each manufacturer NOT in that Set:
//    a. Parse postcard_months into array of German month names
//    b. For each month:
//       - Find all Fridays in that month/year
//       - Determine this manufacturer's position among all manufacturers sharing this month (sorted alphabetically)
//       - Assign Friday = fridays[position % fridays.length]
//       - Insert postcard, newsletter, report_internal, report_external
//       - Link newsletter.linked_postcard_id = postcard.id
//       - Link reports.linked_newsletter_id = newsletter.id
// 6. Return { created, skipped, errors }
```

**Returns:** `{ created: number; skipped: number; errors: string[] }`

`maxDuration = 30` (campaign inserts are fast, 18 manufacturers × ~2 months × 4 campaigns = ~144 inserts).

## German Month Name Mapping

```typescript
const MONTH_MAP: Record<string, number> = {
  Januar: 0, Februar: 1, März: 2, April: 3, Mai: 4, Juni: 5,
  Juli: 6, August: 7, September: 8, Oktober: 9, November: 10, Dezember: 11,
}
```

## Design System

Follows existing conventions:
- Background `#0A0A0A`, Surface `#1A1A1A`, Border `#2A2A2A`
- Text Primary `#FFFFFF`, Secondary `#999999`
- Accent Warm `#EDE8E3` (active year pill, button)
- Accent Gold `#C4A87C` (created count)
- All UI text in German
