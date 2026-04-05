# Phase 3: AI-Generierung — Newsletter & Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude-powered newsletter generation (MJML → ZIP) and scoring-based report generation (CSV → 2× XLSX) with generation buttons and preview in the campaign side panel.

**Architecture:** Two API routes (`/api/generate/newsletter`, `/api/generate/report`) backed by lib modules in `lib/generate/`. Routes handle HTTP + Supabase I/O; lib modules contain pure generation logic. A new `newsletter_preview` asset category enables an iframe preview in the side panel.

**Tech Stack:** `@anthropic-ai/sdk`, `mjml`, `jszip`, `exceljs`, `papaparse`, Next.js 14 App Router, Supabase Storage, ExcelJS

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `next.config.mjs` | Modify | Add `serverExternalPackages` for mjml + exceljs |
| `lib/supabase/types.ts` | Modify | Add `newsletter_preview` to `AssetCategory` |
| `lib/generate/newsletter-prompt.ts` | Create | Newsletter skill as exported string constant |
| `lib/generate/scoring.ts` | Create | Pure scoring functions (score, priority, filter) |
| `lib/generate/report.ts` | Create | CSV parsing + ExcelJS generation (internal + external) |
| `lib/generate/newsletter.ts` | Create | Claude API call + MJML compile + ZIP + Base64 preview |
| `app/api/generate/newsletter/route.ts` | Create | HTTP handling, data loading, asset storage |
| `app/api/generate/report/route.ts` | Create | HTTP handling, data loading, asset storage |
| `components/calendar/CampaignSidePanel.tsx` | Modify | Add generation buttons, preview iframe, output asset sorting |

---

## Task 1: Install packages + configure Next.js + run DB migration

**Files:**
- Modify: `next.config.mjs`
- Run: npm install

- [ ] **Step 1: Install npm packages**

```bash
npm install @anthropic-ai/sdk mjml jszip exceljs papaparse
npm install -D @types/papaparse
```

Expected: packages added to `node_modules/`, `package.json` updated.

- [ ] **Step 2: Configure Next.js to treat mjml and exceljs as server externals**

`mjml` and `exceljs` use dynamic requires that webpack cannot bundle. Add them as external packages so Next.js skips bundling them and uses Node.js `require()` directly.

Replace the contents of `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mjml', 'exceljs'],
}

export default nextConfig
```

- [ ] **Step 3: Run DB migration in Supabase**

Open the Supabase SQL editor for this project and run:

```sql
ALTER TYPE asset_category ADD VALUE IF NOT EXISTS 'newsletter_preview';
```

Expected: query runs without error. If "already exists" warning appears, that's fine.

- [ ] **Step 4: Commit**

```bash
git add next.config.mjs package.json package-lock.json
git commit -m "chore: install generation packages, configure server externals, add newsletter_preview enum"
```

---

## Task 2: Update AssetCategory type

**Files:**
- Modify: `lib/supabase/types.ts:3`

- [ ] **Step 1: Add `newsletter_preview` to the AssetCategory union**

In `lib/supabase/types.ts`, line 3, change:

```typescript
export type AssetCategory = 'image' | 'text' | 'logo' | 'cta' | 'link' | 'csv_export' | 'postcard_pdf' | 'newsletter_zip' | 'report_xlsx'
```

to:

```typescript
export type AssetCategory = 'image' | 'text' | 'logo' | 'cta' | 'link' | 'csv_export' | 'postcard_pdf' | 'newsletter_zip' | 'report_xlsx' | 'newsletter_preview'
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: add newsletter_preview asset category"
```

---

## Task 3: Create newsletter-prompt.ts

**Files:**
- Create: `lib/generate/newsletter-prompt.ts`

- [ ] **Step 1: Read the skill file**

Read the full content of `.claude/skills/newsletter-generator/newsletter skill.md`. This is the newsletter generation skill.

- [ ] **Step 2: Create the prompt module**

Create `lib/generate/newsletter-prompt.ts`. The file exports one string constant: the full skill file content with the strict output instruction appended. The content between the backticks must be the exact text of the skill file (strip the YAML frontmatter block `---…---` at the top, keep everything else), followed by the additional instruction block below.

```typescript
// Newsletter generation system prompt.
// Source: .claude/skills/newsletter-generator/newsletter skill.md
// The appended instruction block overrides any output format guidance in the skill.

export const NEWSLETTER_SYSTEM_PROMPT = `
[FULL CONTENT OF .claude/skills/newsletter-generator/newsletter skill.md — strip the YAML frontmatter (lines 1-10 between --- delimiters), paste all remaining markdown content here verbatim, escaping any backticks as \\\`]

---

## AUSGABE-ANWEISUNG (höchste Priorität)

Antworte NUR mit MJML-Code. Kein Markdown, keine Erklärung, kein Codeblock-Wrapper.
Beginne direkt mit <mjml> und ende mit </mjml>.
Der Output muss vollständiges, valides MJML 4.x sein, das ohne Fehler mit validationLevel strict kompiliert.
`
```

- [ ] **Step 3: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `newsletter-prompt.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/generate/newsletter-prompt.ts
git commit -m "feat: add newsletter system prompt module"
```

---

## Task 4: Create scoring.ts

**Files:**
- Create: `lib/generate/scoring.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/generate/scoring.ts
// Pure functions for Mailchimp CSV lead scoring and prioritization.
// No I/O — all functions take plain data and return plain data.

export interface Contact {
  email: string
  firstName: string
  lastName: string
  phone: string | null
  opens: number
  clicks: number
}

export type Priority = 'A' | 'B' | 'C'

export interface ScoredContact extends Contact {
  score: number
  priority: Priority
  mailType: 'Persönlich' | 'Info-Adresse'
}

// Prefixes that identify non-personal (info) email addresses.
const INFO_LOCALS = new Set(['info', 'office', 'kontakt', 'contact', 'mail'])

export function isPersonalEmail(email: string): boolean {
  const local = email.split('@')[0].toLowerCase()
  return !INFO_LOCALS.has(local)
}

export function scoreContact(c: Pick<Contact, 'opens' | 'clicks' | 'email'>): number {
  const mailBonus = isPersonalEmail(c.email) ? 2 : 0
  return c.clicks * 3 + c.opens * 1 + mailBonus
}

export function priorityOf(
  c: Pick<Contact, 'clicks' | 'opens' | 'email'>,
  score: number
): Priority {
  if (score >= 8 || (c.clicks >= 1 && isPersonalEmail(c.email))) return 'A'
  if (score >= 5 || c.opens >= 4) return 'B'
  return 'C'
}

/**
 * Deduplicate, score, filter, and sort contacts from a Mailchimp CSV.
 *
 * Rules:
 * - Deduplicate by email (case-insensitive), aggregating opens+clicks
 * - Exclude contacts with ≤ 3 opens AND 0 clicks
 * - Max 30 contacts in result, but additional contacts with clicks ≥ 1 are always included
 * - Sort: score desc → clicks desc → opens desc
 */
export function filterAndScore(contacts: Contact[]): ScoredContact[] {
  // Deduplicate
  const map = new Map<string, Contact>()
  for (const c of contacts) {
    const key = c.email.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.opens += c.opens
      existing.clicks += c.clicks
    } else {
      map.set(key, { ...c })
    }
  }

  // Score and filter
  const scored: ScoredContact[] = []
  for (const c of map.values()) {
    if (c.opens <= 3 && c.clicks === 0) continue
    const score = scoreContact(c)
    scored.push({
      ...c,
      score,
      priority: priorityOf(c, score),
      mailType: isPersonalEmail(c.email) ? 'Persönlich' : 'Info-Adresse',
    })
  }

  // Sort
  scored.sort(
    (a, b) => b.score - a.score || b.clicks - a.clicks || b.opens - a.opens
  )

  // Apply limit: top 30 + any additional clickers
  const top30 = scored.slice(0, 30)
  const extraClickers = scored.slice(30).filter((c) => c.clicks > 0)
  return [...top30, ...extraClickers]
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/generate/scoring.ts
git commit -m "feat: add lead scoring pure functions"
```

---

## Task 5: Create report.ts

**Files:**
- Create: `lib/generate/report.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/generate/report.ts
// Parses Mailchimp CSV and generates two Excel workbooks:
//   - Internal: full scoring, priority coloring, 3 sheets
//   - External: KPI summary + contact list without scores, 2 sheets

import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { filterAndScore, type ScoredContact } from './scoring'

export interface ReportParams {
  csvText: string
  manufacturerName: string
  agencyName: string
  campaignTitle: string
  campaignDate: string // YYYY-MM-DD
}

export interface ReportBuffers {
  internalBuffer: Buffer
  externalBuffer: Buffer
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function findCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/[\s_]/g, '')
    for (const c of candidates) {
      if (normalized === c.toLowerCase().replace(/[\s_]/g, '')) return row[key] ?? ''
    }
  }
  return ''
}

function parseContacts(csvText: string) {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  return data
    .map((row) => ({
      email: findCol(row, 'email address', 'email_address', 'email'),
      firstName: findCol(row, 'first name', 'first_name', 'firstname'),
      lastName: findCol(row, 'last name', 'last_name', 'lastname'),
      phone: findCol(row, 'phone number', 'phone_number', 'phone') || null,
      opens: parseInt(findCol(row, 'opens') || '0', 10) || 0,
      clicks: parseInt(findCol(row, 'clicks') || '0', 10) || 0,
    }))
    .filter((c) => c.email)
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function applyFont(cell: ExcelJS.Cell, overrides: Partial<ExcelJS.Font> = {}) {
  cell.font = { name: 'Arial', size: 10, ...overrides }
}

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.replace('#', '') } }
}

// ─── Internal report ─────────────────────────────────────────────────────────

async function buildInternal(
  contacts: ScoredContact[],
  p: Omit<ReportParams, 'csvText'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Sheet 1: Lead-Priorisierung ──────────────────────────────────────────
  const ws1 = wb.addWorksheet('Lead-Priorisierung')
  ws1.columns = [
    { key: 'nr',       width: 6  },
    { key: 'prio',     width: 13 },
    { key: 'name',     width: 26 },
    { key: 'email',    width: 36 },
    { key: 'phone',    width: 18 },
    { key: 'opens',    width: 8  },
    { key: 'clicks',   width: 8  },
    { key: 'mailtype', width: 16 },
  ]

  // Row 1: Manufacturer
  ws1.mergeCells('A1:H1')
  const r1 = ws1.getRow(1)
  r1.getCell(1).value = p.manufacturerName.toUpperCase()
  r1.getCell(1).font = { name: 'Arial', bold: true, size: 18 }
  r1.height = 28

  // Row 2: Campaign
  ws1.mergeCells('A2:H2')
  ws1.getRow(2).getCell(1).value = p.campaignTitle
  applyFont(ws1.getRow(2).getCell(1), { size: 11 })

  // Row 3: Meta
  ws1.mergeCells('A3:H3')
  ws1.getRow(3).getCell(1).value =
    `Erstellt: ${p.campaignDate} · Datenquelle: Mailchimp-Export · Filter: Score > 3 Opens`
  applyFont(ws1.getRow(3).getCell(1), { size: 9, color: { argb: 'FF999999' } })

  // Row 4: Confidentiality hint
  ws1.mergeCells('A4:H4')
  const r4cell = ws1.getRow(4).getCell(1)
  r4cell.value = 'Interne Auswertung — Nicht zur Weitergabe an Kunden'
  applyFont(r4cell, { size: 9, italic: true, color: { argb: 'FF555555' } })
  setFill(r4cell, '#F5F3F0')

  // Row 5: Empty spacer
  ws1.addRow([])

  // Row 6: Header
  const headerRow = ws1.addRow(['Nr.', 'Priorität', 'Kontakt', 'E-Mail-Adresse', 'Telefon', 'Opens', 'Clicks', 'Mail-Typ'])
  headerRow.eachCell((cell) => {
    applyFont(cell, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(cell, '#2C2C2C')
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false }
  })
  headerRow.height = 20

  // Freeze + autofilter
  ws1.views = [{ state: 'frozen', ySplit: 6, xSplit: 0 }]
  ws1.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 8 } }

  // Data rows
  contacts.forEach((c, i) => {
    const bg = c.priority === 'A' ? '#EDE8E3' : c.priority === 'B' ? '#F5F3F0' : '#FFFFFF'
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ')
    const dataRow = ws1.addRow([
      i + 1,
      `${c.priority}`,
      name,
      c.email,
      c.phone ?? '—',
      c.opens,
      c.clicks,
      c.mailType,
    ])

    dataRow.eachCell((cell) => {
      applyFont(cell)
      setFill(cell, bg)
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
    })

    // Priority: bold
    applyFont(dataRow.getCell(2), { bold: true })

    // Email: blue
    applyFont(dataRow.getCell(4), { color: { argb: 'FF4A6FA5' } })

    // Phone: gray if empty
    if (!c.phone) applyFont(dataRow.getCell(5), { color: { argb: 'FFBBBBBB' } })

    // Mail-type color
    const mtColor = c.mailType === 'Persönlich' ? 'FF2E7D32' : 'FF999999'
    applyFont(dataRow.getCell(8), { color: { argb: mtColor } })
  })

  // ── Sheet 2: Auswertung ──────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Auswertung')
  ws2.columns = [{ width: 30 }, { width: 12 }, { width: 12 }]
  ws2.addRow(['Kategorie', 'Anzahl', 'Anteil']).eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })
  const total = contacts.length
  for (const prio of ['A', 'B', 'C'] as const) {
    const count = contacts.filter((c) => c.priority === prio).length
    ws2.addRow([
      `Priorität ${prio}`,
      count,
      total > 0 ? `${Math.round((count / total) * 100)} %` : '—',
    ])
  }
  ws2.addRow([])
  ws2.addRow(['Mail-Typ', 'Anzahl', ''])
  const personal = contacts.filter((c) => c.mailType === 'Persönlich').length
  ws2.addRow(['Persönlich', personal, ''])
  ws2.addRow(['Info-Adresse', total - personal, ''])

  // ── Sheet 3: Methodik ────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Methodik')
  ws3.columns = [{ width: 30 }, { width: 60 }]
  const meta: [string, string][] = [
    ['Scoring-Formel', 'Score = (Clicks × 3) + (Opens × 1) + Mail-Typ-Bonus'],
    ['Mail-Typ-Bonus', '+2 für persönliche Adressen (nicht: info@, office@, kontakt@, contact@, mail@)'],
    ['Priorität A', 'Score ≥ 8 ODER (≥ 1 Click UND persönliche Mail)'],
    ['Priorität B', 'Score ≥ 5 ODER Opens ≥ 4'],
    ['Priorität C', 'Alle übrigen qualifizierten Kontakte'],
    ['Ausschluss', '≤ 3 Opens UND 0 Clicks'],
    ['Kontakt-Limit', 'Max. 30 Kontakte; zusätzliche Clicker immer aufgeführt'],
    ['Sortierung', 'Score absteigend → Clicks → Opens'],
    ['Hersteller', p.manufacturerName],
    ['Kampagne', p.campaignTitle],
    ['Erstellt', p.campaignDate],
  ]
  ws3.addRow(['Feld', 'Wert']).eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })
  for (const [k, v] of meta) {
    const row = ws3.addRow([k, v])
    row.eachCell((c) => applyFont(c))
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─── External report ──────────────────────────────────────────────────────────

async function buildExternal(
  contacts: ScoredContact[],
  p: Omit<ReportParams, 'csvText'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Sheet 1: Kampagnenübersicht ──────────────────────────────────────────
  const ws1 = wb.addWorksheet('Kampagnenübersicht')
  ws1.columns = [{ width: 35 }, { width: 20 }]

  ws1.mergeCells('A1:B1')
  ws1.getRow(1).getCell(1).value = p.manufacturerName.toUpperCase()
  ws1.getRow(1).getCell(1).font = { name: 'Arial', bold: true, size: 18 }

  ws1.mergeCells('A2:B2')
  ws1.getRow(2).getCell(1).value = `Kampagnenauswertung · ${p.campaignTitle}`
  applyFont(ws1.getRow(2).getCell(1), { size: 11 })

  ws1.mergeCells('A3:B3')
  ws1.getRow(3).getCell(1).value = `Erstellt von ${p.agencyName} · ${p.campaignDate}`
  applyFont(ws1.getRow(3).getCell(1), { size: 9, color: { argb: 'FF999999' } })

  ws1.addRow([])

  // KPI block
  const personal = contacts.filter((c) => c.mailType === 'Persönlich').length
  const topLeads = contacts.filter((c) => c.priority === 'A' || c.priority === 'B').length
  const kpis: [string, string | number][] = [
    ['Kontakte mit Interaktion', contacts.length],
    ['Identifizierte Entscheider', `${personal} direkte Ansprechpartner erreicht`],
    ['Kontakte mit erhöhtem Interesse', `${topLeads} Kontakte qualifiziert`],
    ['Kampagne', p.campaignTitle],
  ]
  for (const [label, value] of kpis) {
    const row = ws1.addRow([label, value])
    setFill(row.getCell(1), '#F9F7F4')
    setFill(row.getCell(2), '#F9F7F4')
    applyFont(row.getCell(1))
    applyFont(row.getCell(2), { bold: true })
    row.height = 22
  }

  // ── Sheet 2: Erreichte Kontakte ──────────────────────────────────────────
  const ws2 = wb.addWorksheet('Erreichte Kontakte')
  ws2.columns = [{ width: 6 }, { width: 28 }, { width: 36 }]

  const headerRow = ws2.addRow(['Nr.', 'Kontakt', 'E-Mail-Adresse'])
  headerRow.eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })

  // Alphabetical sort by full name (no score ordering revealed)
  const sorted = [...contacts]
    .slice(0, 30)
    .sort((a, b) => {
      const nameA = [a.lastName, a.firstName].filter(Boolean).join(' ').toLowerCase()
      const nameB = [b.lastName, b.firstName].filter(Boolean).join(' ').toLowerCase()
      return nameA.localeCompare(nameB, 'de')
    })

  sorted.forEach((c, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F9F7F4'
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ')
    const row = ws2.addRow([i + 1, name, c.email])
    row.eachCell((cell) => {
      applyFont(cell)
      setFill(cell, bg)
    })
    applyFont(row.getCell(3), { color: { argb: 'FF4A6FA5' } })
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateReports(params: ReportParams): Promise<ReportBuffers> {
  const contacts = parseContacts(params.csvText)
  const scored = filterAndScore(contacts)
  const base = {
    manufacturerName: params.manufacturerName,
    agencyName: params.agencyName,
    campaignTitle: params.campaignTitle,
    campaignDate: params.campaignDate,
  }
  const [internalBuffer, externalBuffer] = await Promise.all([
    buildInternal(scored, base),
    buildExternal(scored, base),
  ])
  return { internalBuffer, externalBuffer }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/generate/report.ts
git commit -m "feat: add report generation (internal + external Excel)"
```

---

## Task 6: Create report API route

**Files:**
- Create: `app/api/generate/report/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/generate/report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReports } from '@/lib/generate/report'
import type { CampaignAsset } from '@/lib/supabase/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Load the triggering campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!campaign.linked_newsletter_id) {
    return NextResponse.json(
      { error: 'Kein verlinkter Newsletter. Report-Kampagne muss mit Newsletter verknüpft sein.' },
      { status: 400 }
    )
  }

  // Find sibling report campaigns (same linked_newsletter_id)
  const { data: siblings } = await supabase
    .from('campaigns')
    .select('id, type')
    .eq('linked_newsletter_id', campaign.linked_newsletter_id)

  const internalId = siblings?.find((s: any) => s.type === 'report_internal')?.id
  const externalId = siblings?.find((s: any) => s.type === 'report_external')?.id

  // Find CSV asset — search chain: own → newsletter → postcard
  let csvAsset: CampaignAsset | null = null

  const searchIds = [campaign_id, campaign.linked_newsletter_id]

  // Also check the postcard linked to the newsletter
  if (!csvAsset) {
    const { data: newsletter } = await supabase
      .from('campaigns')
      .select('linked_postcard_id')
      .eq('id', campaign.linked_newsletter_id)
      .single()
    if (newsletter?.linked_postcard_id) {
      searchIds.push(newsletter.linked_postcard_id)
    }
  }

  for (const id of searchIds) {
    const { data: assets } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', id)
      .eq('asset_category', 'csv_export')
      .order('created_at', { ascending: false })
      .limit(1)
    if (assets && assets.length > 0) {
      csvAsset = assets[0] as CampaignAsset
      break
    }
  }

  if (!csvAsset) {
    return NextResponse.json(
      {
        error:
          'Kein CSV-Asset gefunden. Bitte CSV (Mailchimp-Export) auf dieser, der Newsletter- oder Postkarten-Kampagne hochladen.',
      },
      { status: 400 }
    )
  }

  // Download CSV
  const csvRes = await fetch(csvAsset.file_url)
  if (!csvRes.ok) {
    return NextResponse.json({ error: 'CSV konnte nicht geladen werden.' }, { status: 500 })
  }
  const csvText = await csvRes.text()

  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any
  const dateStr = new Date().toISOString().split('T')[0]

  try {
    const { internalBuffer, externalBuffer } = await generateReports({
      csvText,
      manufacturerName: mfg?.name ?? 'Unbekannt',
      agencyName: agency?.name ?? 'Collezioni',
      campaignTitle: campaign.title,
      campaignDate: dateStr,
    })

    const mfgSlug = (mfg?.name ?? 'report').replace(/[^a-zA-Z0-9]/g, '_')

    // Upload internal XLSX
    if (internalId) {
      const intPath = `${internalId}/${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`
      await supabase.storage
        .from('campaign-assets')
        .upload(intPath, internalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: intUrl } = supabase.storage.from('campaign-assets').getPublicUrl(intPath)

      await supabase.from('campaign_assets').delete().eq('campaign_id', internalId).eq('is_output', true)
      await supabase.from('campaign_assets').insert({
        campaign_id: internalId,
        file_name: `${mfgSlug}_Lead_Priorisierung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: intUrl.publicUrl,
        file_size: internalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await supabase.from('campaigns').update({ status: 'review' }).eq('id', internalId)
    }

    // Upload external XLSX
    if (externalId) {
      const extPath = `${externalId}/${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`
      await supabase.storage
        .from('campaign-assets')
        .upload(extPath, externalBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const { data: extUrl } = supabase.storage.from('campaign-assets').getPublicUrl(extPath)

      await supabase.from('campaign_assets').delete().eq('campaign_id', externalId).eq('is_output', true)
      await supabase.from('campaign_assets').insert({
        campaign_id: externalId,
        file_name: `${mfgSlug}_Kampagnenauswertung_${dateStr}.xlsx`,
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_url: extUrl.publicUrl,
        file_size: externalBuffer.length,
        asset_category: 'report_xlsx',
        is_output: true,
      })
      await supabase.from('campaigns').update({ status: 'review' }).eq('id', externalId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Report generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/report/route.ts
git commit -m "feat: add report generation API route"
```

---

## Task 7: Create newsletter.ts

**Files:**
- Create: `lib/generate/newsletter.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/generate/newsletter.ts
// Generates a newsletter via Claude API, compiles MJML, builds a Mailchimp ZIP,
// and creates a Base64 preview HTML.

import Anthropic from '@anthropic-ai/sdk'
import mjml2html from 'mjml'
import JSZip from 'jszip'
import { NEWSLETTER_SYSTEM_PROMPT } from './newsletter-prompt'
import type { CampaignWithManufacturer, CampaignAsset } from '@/lib/supabase/types'

export interface NewsletterInput {
  campaign: CampaignWithManufacturer
  assets: CampaignAsset[]          // Own campaign assets (input only)
  postcardAssets: CampaignAsset[]  // Linked postcard assets for style reference
  feedback?: string                 // Optional regeneration feedback
}

export interface NewsletterOutput {
  mjmlSource: string
  zipBuffer: Buffer
  previewHtml: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildUserPrompt(input: NewsletterInput): string {
  const { campaign, assets, postcardAssets, feedback } = input
  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any

  const textAssets = assets.filter((a) => a.asset_category === 'text' && !a.is_output)
  const imageAssets = assets.filter((a) => a.asset_category === 'image')
  const ctaAssets = assets.filter((a) => a.asset_category === 'cta' || a.asset_category === 'link')
  const postcardImages = postcardAssets.filter(
    (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
  )

  const lines: string[] = [
    '## AGENTUR',
    `Name: ${agency?.name ?? ''}`,
    `Logo-URL: ${agency?.logo_url ?? '(kein Logo)'}`,
    `Adresse: ${agency?.address ?? ''}`,
    `E-Mail: ${agency?.order_email ?? ''}`,
    `Telefon: ${agency?.phone ?? ''}`,
    '',
    '## HERSTELLER',
    `Name: ${mfg?.name ?? ''}`,
    `Kategorie: ${mfg?.category ?? ''}`,
    '',
    '## KAMPAGNE',
    `Titel: ${campaign.title}`,
    `Datum: ${campaign.scheduled_date}`,
    campaign.notes ? `Hinweis: ${campaign.notes}` : '',
    '',
  ]

  if (textAssets.length > 0) {
    lines.push('## TEXTENTWURF')
    lines.push('(Texte aus hochgeladenen Assets — als Basis verwenden, humanisieren)')
    for (const a of textAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (imageAssets.length > 0) {
    lines.push('## BILDER (eigene Kampagne)')
    for (const a of imageAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (ctaAssets.length > 0) {
    lines.push('## CTA-LINKS')
    for (const a of ctaAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (postcardImages.length > 0) {
    lines.push('## POSTKARTE (Stil-Referenz — Newsletter muss visuell passen)')
    for (const a of postcardImages) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (feedback) {
    lines.push('## FEEDBACK ZUR VORHERIGEN VERSION')
    lines.push(feedback)
    lines.push('')
  }

  return lines.filter((l) => l !== null).join('\n')
}

// ─── Image content blocks for vision ─────────────────────────────────────────

function buildImageBlocks(
  assets: CampaignAsset[],
  postcardAssets: CampaignAsset[]
): Anthropic.ImageBlockParam[] {
  const imageAssets = [
    ...assets.filter((a) => a.asset_category === 'image'),
    ...postcardAssets.filter(
      (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
    ),
  ]
  return imageAssets.map((a) => ({
    type: 'image' as const,
    source: {
      type: 'url' as const,
      url: a.file_url,
    },
  }))
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

async function buildZip(
  html: string,
  imageAssets: CampaignAsset[]
): Promise<{ zipBuffer: Buffer; warnings: string[] }> {
  const zip = new JSZip()
  const warnings: string[] = []
  let htmlWithRelativePaths = html

  for (const asset of imageAssets) {
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      zip.file(asset.file_name, buf)
      // Replace all occurrences of the absolute URL with the relative filename
      htmlWithRelativePaths = htmlWithRelativePaths.split(asset.file_url).join(asset.file_name)
    } catch (e: any) {
      warnings.push(`Bild übersprungen: ${asset.file_name} (${e.message})`)
    }
  }

  zip.file('newsletter.html', htmlWithRelativePaths)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { zipBuffer: Buffer.from(buf), warnings }
}

// ─── Base64 preview builder ───────────────────────────────────────────────────

async function buildPreview(html: string, imageAssets: CampaignAsset[]): Promise<string> {
  let preview = html
  for (const asset of imageAssets) {
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      const b64 = Buffer.from(buf).toString('base64')
      preview = preview.split(asset.file_url).join(`data:${asset.file_type};base64,${b64}`)
    } catch {
      // Skip failed image — preview will have broken img
    }
  }
  return preview
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateNewsletter(input: NewsletterInput): Promise<NewsletterOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const textPrompt = buildUserPrompt(input)
  const imageBlocks = buildImageBlocks(input.assets, input.postcardAssets)

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: textPrompt },
    ...imageBlocks,
  ]

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const mjmlSource = (response.content[0] as Anthropic.TextBlock).text.trim()

  if (!mjmlSource.startsWith('<mjml')) {
    throw new Error('INVALID_MJML:' + mjmlSource)
  }

  const { html, errors } = mjml2html(mjmlSource, { validationLevel: 'strict' })

  if (errors && errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage ?? e.message).join('; ')
    throw new Error('MJML_ERROR:' + msg + '|||' + mjmlSource)
  }

  const allImageAssets = [
    ...input.assets.filter((a) => a.asset_category === 'image'),
    ...input.postcardAssets.filter((a) => a.asset_category === 'image'),
  ]

  const [{ zipBuffer }, previewHtml] = await Promise.all([
    buildZip(html, allImageAssets),
    buildPreview(html, allImageAssets),
  ])

  return { mjmlSource, zipBuffer, previewHtml }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/generate/newsletter.ts
git commit -m "feat: add newsletter generation (Claude API + MJML + ZIP + preview)"
```

---

## Task 8: Create newsletter API route

**Files:**
- Create: `app/api/generate/newsletter/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/generate/newsletter/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateNewsletter } from '@/lib/generate/newsletter'
import type { CampaignAsset, CampaignWithManufacturer } from '@/lib/supabase/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { campaign_id, feedback } = await req.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, manufacturers(*, agencies(*))')
    .eq('id', campaign_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Load input assets for this campaign (exclude existing outputs)
  const { data: rawAssets } = await supabase
    .from('campaign_assets')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('is_output', false)

  const assets = (rawAssets ?? []) as CampaignAsset[]

  // Load postcard assets if linked
  let postcardAssets: CampaignAsset[] = []
  if (campaign.linked_postcard_id) {
    const { data: pcRaw } = await supabase
      .from('campaign_assets')
      .select('*')
      .eq('campaign_id', campaign.linked_postcard_id)
      .eq('is_output', false)
    postcardAssets = (pcRaw ?? []) as CampaignAsset[]
  }

  try {
    const { mjmlSource, zipBuffer, previewHtml } = await generateNewsletter({
      campaign: campaign as CampaignWithManufacturer,
      assets,
      postcardAssets,
      feedback: feedback ?? undefined,
    })

    const dateStr = new Date().toISOString().split('T')[0]

    // Helper: upload to storage and return public URL
    async function uploadAsset(
      path: string,
      data: Buffer | Uint8Array,
      contentType: string
    ): Promise<string> {
      await supabase.storage
        .from('campaign-assets')
        .upload(path, data, { upsert: true, contentType })
      const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(path)
      return urlData.publicUrl
    }

    const zipUrl = await uploadAsset(
      `${campaign_id}/newsletter-${dateStr}.zip`,
      zipBuffer,
      'application/zip'
    )
    const mjmlUrl = await uploadAsset(
      `${campaign_id}/newsletter.mjml`,
      new TextEncoder().encode(mjmlSource),
      'text/plain'
    )
    const previewUrl = await uploadAsset(
      `${campaign_id}/newsletter-preview.html`,
      new TextEncoder().encode(previewHtml),
      'text/html'
    )

    // Replace existing output assets
    await supabase.from('campaign_assets').delete().eq('campaign_id', campaign_id).eq('is_output', true)

    await supabase.from('campaign_assets').insert([
      {
        campaign_id,
        file_name: `newsletter-${dateStr}.zip`,
        file_type: 'application/zip',
        file_url: zipUrl,
        file_size: zipBuffer.length,
        asset_category: 'newsletter_zip',
        is_output: true,
      },
      {
        campaign_id,
        file_name: 'newsletter.mjml',
        file_type: 'text/plain',
        file_url: mjmlUrl,
        file_size: mjmlSource.length,
        asset_category: 'text',
        is_output: true,
      },
      {
        campaign_id,
        file_name: 'newsletter-preview.html',
        file_type: 'text/html',
        file_url: previewUrl,
        file_size: previewHtml.length,
        asset_category: 'newsletter_preview',
        is_output: true,
      },
    ])

    await supabase.from('campaigns').update({ status: 'review' }).eq('id', campaign_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Newsletter generation error:', err)

    // Save raw MJML if available and update status + notes
    if (err.message?.startsWith('INVALID_MJML:') || err.message?.startsWith('MJML_ERROR:')) {
      const parts = err.message.split('|||')
      const rawMjml = parts.length > 1 ? parts[1] : err.message.split(':').slice(1).join(':')
      if (rawMjml) {
        const path = `${campaign_id}/newsletter-invalid-${Date.now()}.mjml`
        await supabase.storage
          .from('campaign-assets')
          .upload(path, new TextEncoder().encode(rawMjml), { upsert: true, contentType: 'text/plain' })
        const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(path)
        await supabase.from('campaign_assets').insert({
          campaign_id,
          file_name: 'newsletter-invalid.mjml',
          file_type: 'text/plain',
          file_url: urlData.publicUrl,
          file_size: rawMjml.length,
          asset_category: 'text',
          is_output: true,
        })
      }
      await supabase
        .from('campaigns')
        .update({ status: 'assets_pending', notes: `Generierungsfehler: ${err.message.split('|||')[0]}` })
        .eq('id', campaign_id)
      return NextResponse.json({ error: err.message }, { status: 422 })
    }

    return NextResponse.json({ error: err.message ?? 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/newsletter/route.ts
git commit -m "feat: add newsletter generation API route"
```

---

## Task 9: Update CampaignSidePanel — generation buttons + preview iframe

**Files:**
- Modify: `components/calendar/CampaignSidePanel.tsx`

This task adds three things to `CampaignDetail`:
1. A generation button section (between meta and linked campaigns)
2. A newsletter preview iframe (above the assets section)
3. Output assets sorted to top of the list

- [ ] **Step 1: Add generation state and preview state to CampaignDetail**

In `CampaignDetail`, after the existing `const [showEdit, setShowEdit] = useState(false)` line (around line 210), add:

```typescript
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
```

- [ ] **Step 2: Add a `useEffect` to load the preview iframe**

After the existing `useEffect` that calls `loadAssets()` (around line 230), add:

```typescript
  // Load newsletter preview as Blob URL for the iframe
  useEffect(() => {
    const previewAsset = assets.find(
      (a) => a.asset_category === 'newsletter_preview' && a.is_output
    )
    if (!previewAsset) {
      setPreviewSrc(null)
      return
    }
    let blobUrl: string
    fetch(previewAsset.file_url)
      .then((r) => r.text())
      .then((html) => {
        const blob = new Blob([html], { type: 'text/html' })
        blobUrl = URL.createObjectURL(blob)
        setPreviewSrc(blobUrl)
      })
      .catch(() => setPreviewSrc(null))
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [assets])
```

- [ ] **Step 3: Add the `handleGenerate` function**

After the `handleDeleteCampaign` function (around line 277), add:

```typescript
  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      const endpoint =
        campaign.type === 'newsletter'
          ? '/api/generate/newsletter'
          : '/api/generate/report'
      const body: Record<string, string> = { campaign_id: campaign.id }
      if (campaign.type === 'newsletter' && feedback.trim()) {
        body.feedback = feedback.trim()
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generierung fehlgeschlagen')
      isLoadingRef.current = false
      await loadAssets()
      onRefresh()
      setFeedback('')
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }
```

- [ ] **Step 4: Add generation button section to the render output**

In `CampaignDetail`'s return, find the `{/* Meta */}` section (around line 338). After the closing `</div>` of that section and before `{/* Linked campaigns */}`, add:

```tsx
        {/* Generation */}
        {(campaign.type === 'newsletter' ||
          campaign.type === 'report_internal' ||
          campaign.type === 'report_external') && (
          <>
            <div className="border-t border-border" />
            <div>
              {campaign.type === 'newsletter' && assets.some((a) => a.is_output) ? (
                <>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback zur vorherigen Version (optional)…"
                    rows={2}
                    disabled={generating}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-accent-warm/50 resize-none mb-2 disabled:opacity-50"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
                  >
                    {generating && <Loader2 size={12} className="animate-spin" />}
                    {generating ? 'Wird generiert…' : 'Neu generieren'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-background bg-accent-warm rounded-sm hover:bg-accent-warm/90 transition-colors disabled:opacity-50"
                >
                  {generating && <Loader2 size={12} className="animate-spin" />}
                  {generating
                    ? 'Wird generiert…'
                    : campaign.type === 'newsletter'
                    ? 'Newsletter generieren'
                    : 'Report generieren'}
                </button>
              )}
              {genError && <p className="text-xs text-[#E65100] mt-2">{genError}</p>}
            </div>
          </>
        )}
```

- [ ] **Step 5: Add preview iframe section**

In the `{/* Assets */}` section, find the `<div>` that contains the "Assets" label (around line 412). Immediately before that `<div className="border-t border-border" />`, add:

```tsx
        {/* Newsletter preview */}
        {previewSrc && campaign.type === 'newsletter' && (
          <>
            <div className="border-t border-border" />
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">Newsletter-Vorschau</p>
              <iframe
                src={previewSrc}
                className="w-full rounded-sm border border-border"
                style={{ height: '400px' }}
                title="Newsletter Vorschau"
                sandbox="allow-same-origin"
              />
            </div>
          </>
        )}
```

- [ ] **Step 6: Sort assets so output assets appear first**

In `loadAssets`, change the Supabase query order. Find:

```typescript
      .order('created_at', { ascending: false })
```

Replace with:

```typescript
      .order('is_output', { ascending: false })
      .order('created_at', { ascending: false })
```

- [ ] **Step 7: Add accent border to output assets**

In the asset list rendering (around line 453), find the asset card `<div>`:

```typescript
                    className="flex items-center gap-2.5 bg-background border border-border rounded-sm overflow-hidden group hover:border-text-secondary/30 transition-colors"
```

Replace with:

```typescript
                    className={`flex items-center gap-2.5 bg-background border rounded-sm overflow-hidden group transition-colors ${
                      asset.is_output
                        ? 'border-accent-warm/30 hover:border-accent-warm/60'
                        : 'border-border hover:border-text-secondary/30'
                    }`}
```

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/calendar/CampaignSidePanel.tsx
git commit -m "feat: add generation buttons, newsletter preview iframe, output asset sorting"
```

---

## Task 10: Integration smoke test + final commit

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: server starts on http://localhost:3000 with no build errors.

- [ ] **Step 2: Test report generation**

1. Navigate to the calendar
2. Open a `report_internal` or `report_external` campaign that has a linked newsletter
3. Upload a Mailchimp CSV (with columns `Email Address`, `First Name`, `Opens`, `Clicks`) to any campaign in the chain
4. Click "Report generieren"
5. Expected: spinner, then two XLSX files appear as output assets (gold border) on both sibling report campaigns, status → "Zur Prüfung"

- [ ] **Step 3: Test newsletter generation**

1. Open a `newsletter` campaign
2. Upload at least one image asset
3. Click "Newsletter generieren"
4. Expected: spinner (~30–60s), then ZIP + MJML + preview assets appear, iframe preview loads below the meta section, status → "Zur Prüfung"

- [ ] **Step 4: Test regeneration**

1. On the newsletter campaign from Step 3, add feedback text "Weniger Text, mehr Bilder"
2. Click "Neu generieren"
3. Expected: previous output assets replaced, new preview loads

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3 — newsletter + report generation complete"
```
