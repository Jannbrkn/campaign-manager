# Jahresplanung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/planning` page where one click generates a full year of campaign chains (postcard → newsletter → 2 reports) for all manufacturers, spreading them across Fridays per month to avoid email spam.

**Architecture:** A single API route (`POST /api/planning/generate`) handles all the date math and Supabase inserts. A client component (`PlanningForm`) holds the year selection state and calls the API. The page is a thin server component wrapper. No new DB columns needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (admin client for batch inserts), Tailwind CSS, lucide-react

---

## File Map

**Create:**
- `app/(app)/planning/page.tsx` — Server Component, renders `<PlanningForm />`
- `components/planning/PlanningForm.tsx` — Client Component: year pills, generate button, result card
- `app/api/planning/generate/route.ts` — POST route: date algorithm + batch campaign inserts

**Modify:**
- `components/Sidebar.tsx` — add `CalendarPlus` icon import, add "Jahresplanung" nav item between Performance and Kalender

---

## Task 1: Sidebar Nav Item

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add CalendarPlus to the icon import**

Open `components/Sidebar.tsx`. The current import on line 4 is:
```typescript
import { LayoutDashboard, CalendarDays, Building2, Factory, Settings, LogOut, ImageIcon, BarChart2 } from 'lucide-react'
```
Change to:
```typescript
import { LayoutDashboard, CalendarDays, Building2, Factory, Settings, LogOut, ImageIcon, BarChart2, CalendarPlus } from 'lucide-react'
```

- [ ] **Step 2: Add the nav item**

The current `navItems` array (lines 9–17) is:
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
Change to:
```typescript
const navItems = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/performance',   label: 'Performance',   icon: BarChart2 },
  { href: '/planning',      label: 'Jahresplanung', icon: CalendarPlus },
  { href: '/calendar',      label: 'Kalender',      icon: CalendarDays },
  { href: '/agencies',      label: 'Agenturen',     icon: Building2 },
  { href: '/manufacturers', label: 'Hersteller',    icon: Factory },
  { href: '/logos',         label: 'Logos',         icon: ImageIcon },
  { href: '/settings',      label: 'Einstellungen', icon: Settings },
]
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Jahresplanung nav item to sidebar"
```

---

## Task 2: Generate API Route

**Files:**
- Create: `app/api/planning/generate/route.ts`

This is the core of the feature. The route contains all date calculation logic and performs the Supabase inserts.

- [ ] **Step 1: Create the file with the full implementation**

Create `app/api/planning/generate/route.ts`:

```typescript
// app/api/planning/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

const MONTH_MAP: Record<string, number> = {
  Januar: 0, Februar: 1, März: 2, April: 3, Mai: 4, Juni: 5,
  Juli: 6, August: 7, September: 8, Oktober: 9, November: 10, Dezember: 11,
}

const MONTH_SHORT: Record<number, string> = {
  0: 'Jan', 1: 'Feb', 2: 'Mär', 3: 'Apr', 4: 'Mai', 5: 'Jun',
  6: 'Jul', 7: 'Aug', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Dez',
}

/** Returns all Fridays (as Date objects) in a given month/year. */
function getFridaysInMonth(year: number, month: number): Date[] {
  const fridays: Date[] = []
  const d = new Date(year, month, 1)
  // Advance to first Friday (day 5)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month) {
    fridays.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return fridays
}

/** Formats a Date as YYYY-MM-DD string (local time). */
function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Adds N days to a date, returns a new Date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const year = Number(body.year)
  if (!year || year < 2020 || year > 2040) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load all manufacturers
  const { data: manufacturers, error: mfgErr } = await admin
    .from('manufacturers')
    .select('id, name, postcard_months')
    .order('name')
  if (mfgErr || !manufacturers) {
    return NextResponse.json({ error: 'Failed to load manufacturers' }, { status: 500 })
  }

  // Load all campaigns in the target year to determine which manufacturers to skip
  const { data: existing } = await admin
    .from('campaigns')
    .select('manufacturer_id')
    .gte('scheduled_date', `${year}-01-01`)
    .lte('scheduled_date', `${year}-12-31`)

  const skipSet = new Set((existing ?? []).map((c: { manufacturer_id: string }) => c.manufacturer_id))

  // Build month → sorted manufacturer list (for Friday spreading)
  const monthGroups: Map<number, { id: string; name: string; postcard_months: string | null }[]> = new Map()
  for (const mfg of manufacturers) {
    if (skipSet.has(mfg.id)) continue
    if (!mfg.postcard_months) continue
    const months = mfg.postcard_months.split(',').map((s: string) => s.trim())
    for (const monthName of months) {
      const monthIdx = MONTH_MAP[monthName]
      if (monthIdx === undefined) continue
      if (!monthGroups.has(monthIdx)) monthGroups.set(monthIdx, [])
      monthGroups.get(monthIdx)!.push(mfg)
    }
  }
  // Each month group is already sorted alphabetically because manufacturers were fetched with .order('name')

  let created = 0
  const skipped = skipSet.size
  const errors: string[] = []

  for (const [monthIdx, mfgs] of Array.from(monthGroups.entries())) {
    const fridays = getFridaysInMonth(year, monthIdx)
    if (fridays.length === 0) continue
    const monthLabel = `${MONTH_SHORT[monthIdx]} ${year}`

    for (let i = 0; i < mfgs.length; i++) {
      const mfg = mfgs[i]
      const postcardDate = fridays[i % fridays.length]
      const newsletterDate = addDays(postcardDate, 5)  // Wednesday after
      const reportDate = addDays(newsletterDate, 5)    // Monday after newsletter

      try {
        // Insert postcard
        const { data: postcard, error: pcErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'postcard',
            title: `${mfg.name} Postkarte ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(postcardDate),
            linked_postcard_id: null,
            linked_newsletter_id: null,
          })
          .select('id')
          .single()
        if (pcErr || !postcard) throw new Error(pcErr?.message ?? 'postcard insert failed')

        // Insert newsletter
        const { data: newsletter, error: nlErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'newsletter',
            title: `${mfg.name} Newsletter ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(newsletterDate),
            linked_postcard_id: postcard.id,
            linked_newsletter_id: null,
          })
          .select('id')
          .single()
        if (nlErr || !newsletter) throw new Error(nlErr?.message ?? 'newsletter insert failed')

        // Insert internal report
        const { error: irErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'report_internal',
            title: `${mfg.name} Report intern ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(reportDate),
            linked_postcard_id: null,
            linked_newsletter_id: newsletter.id,
          })
        if (irErr) throw new Error(irErr.message)

        // Insert external report
        const { error: erErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'report_external',
            title: `${mfg.name} Report extern ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(reportDate),
            linked_postcard_id: null,
            linked_newsletter_id: newsletter.id,
          })
        if (erErr) throw new Error(erErr.message)

        created += 4
      } catch (err: any) {
        errors.push(`${mfg.name} ${monthLabel}: ${err.message}`)
      }
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 3: Smoke test the route manually**

Start the dev server (`npm run dev`), then in a browser console or via curl:
```bash
curl -X POST http://localhost:3000/api/planning/generate \
  -H "Content-Type: application/json" \
  -d '{"year": 2027}' \
  --cookie "..."  # paste your session cookie
```
Expected response shape: `{"created": N, "skipped": N, "errors": []}` — exact numbers depend on existing data.

- [ ] **Step 4: Commit**

```bash
git add app/api/planning/generate/route.ts
git commit -m "feat: POST /api/planning/generate — date algorithm + batch campaign inserts"
```

---

## Task 3: PlanningForm Client Component

**Files:**
- Create: `components/planning/PlanningForm.tsx`

- [ ] **Step 1: Create the component**

Create `components/planning/PlanningForm.tsx`:

```typescript
// components/planning/PlanningForm.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function PlanningForm() {
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2]

  const [year, setYear] = useState(currentYear + 1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/planning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Unbekannter Fehler')
      setResult(json)
    } catch (err: any) {
      setResult({ created: 0, skipped: 0, errors: [err.message] })
    } finally {
      setLoading(false)
    }
  }

  const pillBase = 'text-xs px-4 py-1.5 rounded-sm border transition-colors cursor-pointer'
  const pillActive = 'border-accent-warm text-accent-warm'
  const pillInactive = 'border-border text-text-secondary hover:text-text-primary'

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-light text-text-primary mb-2">Jahresplanung</h1>
      <p className="text-sm text-text-secondary mb-8">
        Kampagnenketten für alle Hersteller automatisch anlegen. Hersteller mit bestehenden Kampagnen im gewählten Jahr werden übersprungen.
      </p>

      {/* Year selector */}
      <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-3">Jahr auswählen</p>
      <div className="flex gap-2 mb-8">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => { setYear(y); setResult(null) }}
            className={`${pillBase} ${year === y ? pillActive : pillInactive}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-2 bg-accent-warm text-[#0A0A0A] text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-[#EDE8E3]/90 transition-colors disabled:opacity-50"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        Kampagnen generieren →
      </button>

      {/* Result card */}
      {result && (
        <div className="mt-8 border border-border bg-surface rounded-sm p-5 max-w-sm">
          {result.created > 0 ? (
            <>
              <p className="text-sm text-text-primary font-medium mb-4">
                ✓ Jahresplanung {year} abgeschlossen
              </p>
              <div className="flex gap-8 mb-5">
                <div>
                  <p className="text-2xl font-light text-[#C4A87C]">{result.created}</p>
                  <p className="text-[11px] text-text-secondary">Kampagnen erstellt</p>
                </div>
                {result.skipped > 0 && (
                  <div>
                    <p className="text-2xl font-light text-[#555]">{result.skipped}</p>
                    <p className="text-[11px] text-text-secondary">übersprungen</p>
                  </div>
                )}
              </div>
              <Link
                href="/calendar"
                className="text-xs text-text-secondary border border-border rounded-sm px-3 py-1.5 hover:text-text-primary transition-colors inline-block"
              >
                Im Kalender ansehen →
              </Link>
            </>
          ) : result.errors.length > 0 ? (
            <p className="text-sm text-text-secondary">Fehler beim Generieren.</p>
          ) : (
            <p className="text-sm text-text-secondary">
              Alle Hersteller haben bereits Kampagnen in {year}. Nichts zu tun.
            </p>
          )}

          {result.errors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-[11px] text-text-secondary">— {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add components/planning/PlanningForm.tsx
git commit -m "feat: PlanningForm client component — year selector, generate button, result card"
```

---

## Task 4: Planning Page

**Files:**
- Create: `app/(app)/planning/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/(app)/planning/page.tsx`:

```typescript
// app/(app)/planning/page.tsx
import PlanningForm from '@/components/planning/PlanningForm'

export default function PlanningPage() {
  return (
    <div className="p-8">
      <PlanningForm />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no output (clean).

- [ ] **Step 3: Manual end-to-end test**

1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:3000/planning`
3. Verify: "Jahresplanung" appears active in the sidebar
4. Verify: three year pills visible, middle one selected by default
5. Click "Kampagnen generieren →"
6. Verify: spinner appears while loading
7. Verify: result card shows created/skipped counts
8. Click "Im Kalender ansehen →" — verify you land on `/calendar`
9. Check calendar: new campaigns should appear for the generated year

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/planning/page.tsx
git commit -m "feat: /planning page — Jahresplanung"
```
