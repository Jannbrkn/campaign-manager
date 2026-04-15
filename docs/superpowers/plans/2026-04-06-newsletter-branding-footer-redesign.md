# Newsletter Branding & Footer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move manufacturer logo to newsletter header, restrict agency to footer only, enforce minimum 2 CTAs, add clickable logo linking to manufacturer website, and ensure an elegant, readable footer with full agency contact details.

**Architecture:** DB migration adds two new nullable text columns (`manufacturers.website_url`, `agencies.contact_email`). The newsletter prompt rules are rewritten in-place to enforce the new branding logic. Two new server actions + inline-edit client components expose the fields in the existing detail pages.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS bypass via admin client), Tailwind CSS, Server Actions (`'use server'`), MJML 4.x

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/20260406000000_add_website_contact_email.sql` |
| Modify | `lib/supabase/types.ts` |
| Modify | `lib/generate/newsletter.ts` (`buildUserPrompt` function) |
| Modify | `lib/generate/newsletter-prompt.ts` (logo rules, CTA rules, footer rules) |
| Create | `app/(app)/agencies/actions.ts` |
| Create | `components/agencies/InlineEditField.tsx` |
| Modify | `app/(app)/agencies/[id]/page.tsx` |
| Modify | `app/(app)/manufacturers/actions.ts` (add `updateManufacturerWebsiteUrl`) |
| Create | `components/manufacturers/WebsiteUrlInlineEdit.tsx` |
| Modify | `app/(app)/manufacturers/[id]/page.tsx` |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260406000000_add_website_contact_email.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260406000000_add_website_contact_email.sql

ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS contact_email text;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output: migration applied successfully, no errors.

If you don't have the Supabase CLI linked, apply manually in the Supabase dashboard SQL editor.

- [ ] **Step 3: Verify in Supabase dashboard**

Open Table Editor → `manufacturers` → confirm `website_url` column exists (nullable text).  
Open Table Editor → `agencies` → confirm `contact_email` column exists (nullable text).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260406000000_add_website_contact_email.sql
git commit -m "feat: add manufacturers.website_url and agencies.contact_email columns"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Add `website_url` to `Manufacturer` interface**

In `lib/supabase/types.ts`, find the `Manufacturer` interface. Add after `contact_email`:

```typescript
  website_url: string | null
```

The updated interface block (relevant portion):
```typescript
export interface Manufacturer {
  id: string
  agency_id: string
  name: string
  category: string | null
  contact_person: string | null
  postcard_frequency: string | null
  postcard_months: string | null
  postcard_format: string | null
  newsletter_frequency: string | null
  images_source: string | null
  texts_source: string | null
  own_creatives: boolean
  own_texts: boolean
  logo_url: string | null
  contact_email: string | null
  website_url: string | null          // ← ADD THIS
  additional_report_email: string | null
  dropbox_link: string | null
  postcard_tags: string | null
  newsletter_tags: string | null
  extra_tags: string | null
  print_run: number | null
  created_at: string
}
```

- [ ] **Step 2: Add `contact_email` to `Agency` interface**

Find the `Agency` interface. Add after `phone`:

```typescript
  contact_email: string | null
```

The updated interface block:
```typescript
export interface Agency {
  id: string
  name: string
  cost_center: string | null
  ident_number: string | null
  order_email: string | null
  logo_url: string | null
  address: string | null
  phone: string | null
  contact_email: string | null        // ← ADD THIS
  created_at: string
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: add website_url and contact_email to TypeScript types"
```

---

## Task 3: Pass New Fields Through the Prompt Builder

**Files:**
- Modify: `lib/generate/newsletter.ts` (function `buildUserPrompt`, lines ~40–60)

The `buildUserPrompt` function already pulls `mfg` and `agency` from `campaign.manufacturers` and `mfg.agencies`. We just need to surface the two new fields in the prompt text.

- [ ] **Step 1: Add `website_url` to the HERSTELLER section**

In `lib/generate/newsletter.ts`, find the HERSTELLER lines block (around line 48). Replace:

```typescript
  '## HERSTELLER',
  `Name: ${mfg?.name ?? ''}`,
  `Kategorie: ${mfg?.category ?? ''}`,
  mfg?.contact_email
    ? `Kontakt-Mail (Hersteller, für CTA/Kontaktzeile im Body verwenden): ${mfg.contact_email}`
    : '(Keine Hersteller-Kontaktmail — keine Kontaktadresse im Newsletter-Body nennen)',
```

With:

```typescript
  '## HERSTELLER',
  `Name: ${mfg?.name ?? ''}`,
  `Kategorie: ${mfg?.category ?? ''}`,
  mfg?.website_url
    ? `Website (für klickbares Logo + CTAs verwenden): ${mfg.website_url}`
    : '(Keine Website hinterlegt — Logo nicht verlinken)',
  mfg?.contact_email
    ? `Kontakt-Mail (Hersteller, für CTA/Kontaktzeile im Body verwenden): ${mfg.contact_email}`
    : '(Keine Hersteller-Kontaktmail — keine Kontaktadresse im Newsletter-Body nennen)',
```

- [ ] **Step 2: Add `contact_email` to the AGENTUR section**

Find the AGENTUR lines block (around line 41). Replace:

```typescript
  '## AGENTUR',
  `Name: ${agency?.name ?? ''}`,
  `Logo-URL: ${agency?.logo_url ?? '(kein Logo)'}`,
  `Adresse: ${agency?.address ?? ''}`,
  `E-Mail: ${agency?.order_email ?? ''}`,
  `Telefon: ${agency?.phone ?? ''}`,
```

With:

```typescript
  '## AGENTUR',
  `Name: ${agency?.name ?? ''}`,
  `Logo-URL: ${agency?.logo_url ?? '(kein Logo)'}`,
  `Adresse: ${agency?.address ?? ''}`,
  `Telefon: ${agency?.phone ?? ''}`,
  agency?.contact_email
    ? `Kontakt-E-Mail (Footer): ${agency.contact_email}`
    : '(Keine öffentliche Kontakt-Mail hinterlegt — E-Mail im Footer weglassen)',
```

Note: `order_email` is intentionally removed from the prompt entirely — it was previously passed as `E-Mail` but is an internal address that must never appear in newsletters.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/generate/newsletter.ts
git commit -m "feat: pass website_url and contact_email to newsletter prompt builder"
```

---

## Task 4: Rewrite Newsletter Prompt Rules

**Files:**
- Modify: `lib/generate/newsletter-prompt.ts`

This is the most impactful change. Three sections get rewritten: logo placement, CTA enforcement, and footer design.

- [ ] **Step 1: Replace the Logo-Platzierung table**

Find this block in `NEWSLETTER_SYSTEM_PROMPT` (around line 172):

```
#### Logo-Platzierung — DYNAMISCH

| Logo | Position | Breite |
|---|---|---|
| **Agentur-Logo** | Header (oben, zentriert) | 200–220px |
| Hersteller-Logo | Über der Headline, nach dem Hero | 120–160px |
| **Agentur-Logo** | Closing (unter Signatur) | 140–160px |
```

Replace with:

```
#### Logo-Platzierung — DYNAMISCH (KRITISCH)

**Der Newsletter wird im Namen des HERSTELLERS versandt — die Hersteller-Marke steht im Vordergrund.**

| Logo | Position | Breite | Klickbar |
|---|---|---|---|
| **Hersteller-Logo** | **Header (oben, zentriert, auf #ffffff)** | 160–220px | **Ja → website_url des Herstellers** |
| Agentur-Logo | Footer (zentriert, über Adressdaten, auf #ffffff) | 140–160px | Ja → website_url der Agentur |

- Das Hersteller-Logo im Header MUSS in `<mj-image>` mit `href="[website_url]"` eingebettet sein.
- Wenn keine `website_url` vorhanden: Logo anzeigen, aber kein `href` setzen.
- Das Agentur-Logo erscheint **ausschließlich im Footer** — niemals im Header oder Body.
```

- [ ] **Step 2: Update the Layout-Regeln to reinforce clickable manufacturer logo**

Find the Layout-Regeln section (around line 166):

```
#### Layout-Regeln
- Hero-Bild: Full-Width, ganz oben nach der Topbar
- Alle Produktbilder MÜSSEN klickbar sein (`href` auf Produkt-URL)
- Alle CTA-Buttons MÜSSEN auf angegebene Links zeigen
- CTAs kontextuell eingebettet — neben dem passenden Inhalt, NICHT als Block am Ende
```

Replace with:

```
#### Layout-Regeln
- Hero-Bild: Full-Width, ganz oben nach der Topbar
- **Hersteller-Logo im Header ist klickbar** → `href` auf `website_url` des Herstellers
- Alle Produktbilder MÜSSEN klickbar sein (`href` auf Produkt-URL)
- Alle CTA-Buttons MÜSSEN auf angegebene Links zeigen
- **Mindestens 2 CTAs pro Newsletter** (siehe CTA-Pflicht unten)
- CTAs kontextuell eingebettet — neben dem passenden Inhalt, NICHT als Block am Ende
```

- [ ] **Step 3: Add the 2-CTA enforcement rule**

After the Layout-Regeln section (which ends with the "CTAs kontextuell eingebettet" line), before the Logo-Platzierung section, add a new block:

```
#### CTA-Pflicht — MINDESTENS 2 CTAs (KRITISCH)

Jeder Newsletter MUSS mindestens zwei CTAs enthalten:

1. **Haupt-CTA** (prominenter Button): aus dem Briefing-Feld `cta_text` / `cta_link`
   - Beispiele: "Preisliste herunterladen", "Termin vereinbaren", "Einladung bestätigen"
2. **Sekundärer CTA** (kontextuell, im Body eingebettet): ein weiterer klickbarer Link oder Button
   - Quelle: `extra_links` aus dem Briefing, oder `website_url` des Herstellers als Fallback
   - Wenn kein zweiter Link vorhanden: zweiten CTA mit `⚠️ LINK FEHLT` markieren, aber trotzdem die MJML-Struktur ausgeben

Niemals einen Newsletter mit nur einem CTA ausliefern.
```

- [ ] **Step 4: Replace the Footer section**

Find the footer section (around line 182):

```
#### Footer — DYNAMISCH

Der Footer enthält die Agentur-Adressdaten (rechtlicher Absender) — **aber keine order@-Mail**.

Pflichtinhalt:
```
[Agentur-Name]
[Agentur-Adresse]
[Agentur-Telefon]
```

Plus Mailchimp-Merge-Tags:
```html
<a href="*|UNSUB|*">Abmelden</a>
<a href="*|UPDATE_PROFILE|*">Einstellungen ändern</a>
```

**Footer-Design (PFLICHT):**
- Hintergrund: #ffffff
- Haupttext: #999999
- Links (Abmelden etc.): #bbbbbb
- Logo-Hintergrund: immer #ffffff
```

Replace entirely with:

```
#### Footer — DYNAMISCH (PFLICHT-DESIGN)

Der Footer ist der rechtliche Absender-Block der Agentur. Er folgt einem festen Design — keine Abweichungen.

**Struktur (von oben nach unten):**
1. Agentur-Logo (140–160px, zentriert, klickbar auf Agentur-Website) — auf #ffffff
2. Agentur-Name (Versalien, #999999)
3. Kontakt-E-Mail · Telefon (`contact_email` — NICHT `order_email`)
4. Straße · PLZ Stadt
5. Mailchimp-Pflicht-Links: `<a href="*|UNSUB|*">Abmelden</a>` | `<a href="*|UPDATE_PROFILE|*">Einstellungen ändern</a>`

**Design (nicht verhandelbar):**
- Hintergrund: `#ffffff`
- Haupttext: `#999999`, 9–10px, Light (300)
- Links (Abmelden etc.): `#bbbbbb`
- Logo-Hintergrund: immer `#ffffff`
- NIEMALS `order_email` der Agentur im Footer oder im Body verwenden.
```

- [ ] **Step 5: Update the Checkliste**

Find the checklist block (around line 228):

```
CHECKLISTE
✅/❌ Alle Produktbilder klickbar (href auf Produkt-URL)?
✅/❌ Alle CTA-Buttons mit finalem Link?
✅/❌ Logos eingebunden (Agentur + Hersteller)?
✅/❌ Footer mit korrekten Agentur-Daten?
✅/❌ Subject Line + Preview Text vorgeschlagen?
✅/❌ ZIP-Datei erstellt und ausgeliefert?
⚠️  Fehlende Links: [auflisten oder „keine"]
```

Replace with:

```
CHECKLISTE
✅/❌ Hersteller-Logo im Header (160–220px, klickbar auf website_url, auf #ffffff)?
✅/❌ Agentur-Logo NUR im Footer (140–160px, klickbar auf Agentur-website_url, auf #ffffff)?
✅/❌ Kein Agentur-Logo/-Name im Header oder Body?
✅/❌ Mindestens 2 CTAs vorhanden?
✅/❌ Alle Produktbilder klickbar (href auf Produkt-URL)?
✅/❌ Alle CTA-Buttons mit finalem Link?
✅/❌ Footer: Agentur-Name, contact_email (NICHT order_email), Telefon, Straße + PLZ + Stadt?
✅/❌ Footer: #ffffff Hintergrund, #999999 Text?
✅/❌ Subject Line + Preview Text vorgeschlagen?
✅/❌ ZIP-Datei erstellt und ausgeliefert?
⚠️  Fehlende Links: [auflisten oder „keine"]
```

- [ ] **Step 6: Also update the ABSENDER-LOGIK section at the top of the prompt**

Find (around line 14):

```
## ABSENDER-LOGIK (KRITISCH — immer beachten)

**Der Newsletter wird im Namen des HERSTELLERS geschrieben, nicht im Namen der Agentur.**

- Sign-off/Unterschrift: "Ihr [Herstellername]-Team" — niemals "Ihr Collezioni-Team", "Ihr Exclusive Collection-Team" o.ä.
- Die Agentur ist der rechtliche Absender und erscheint NUR im Footer (Adressdaten) — sie tritt inhaltlich nicht in Erscheinung.
- **Die order@-E-Mail der Agentur darf NIEMALS als Kontaktadresse im Newsletter-Inhalt stehen.** Diese Adressen sind interne Bestelladressen, keine Kundenpost-Adressen.
- Wenn im Input eine "Kontakt-Mail (Hersteller)" angegeben ist → diese für CTA / Kontaktzeile im Body verwenden.
- Wenn KEINE Hersteller-Kontaktmail vorhanden → keine Kontaktadresse im Body nennen.
```

Replace with:

```
## ABSENDER-LOGIK (KRITISCH — immer beachten)

**Der Newsletter wird im Namen des HERSTELLERS geschrieben. Die Hersteller-Marke steht im Vordergrund.**

- **Header**: Hersteller-Logo oben, zentriert, klickbar (→ website_url). Kein Agentur-Logo im Header.
- **Body**: Im Namen des Herstellers geschrieben. Sign-off: "Ihr [Herstellername]-Team" — niemals "Ihr Collezioni-Team" o.ä.
- **Footer**: Agentur erscheint NUR hier — mit Logo (klein), Name, Adresse, Kontakt-Mail, Telefon.
- **Die order@-E-Mail der Agentur darf NIEMALS im Newsletter erscheinen** (weder Header, Body noch Footer). Nur `contact_email` der Agentur ist für den Footer erlaubt.
- Wenn im Input eine "Kontakt-Mail (Hersteller)" angegeben ist → diese für CTA / Kontaktzeile im Body verwenden.
- Wenn KEINE Hersteller-Kontaktmail vorhanden → keine Kontaktadresse im Body nennen.
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (this file only exports a string constant).

- [ ] **Step 8: Fix the Typografie table footer row**

The Typografie table (around line 164 in the prompt) has this row:
```
| Footer | Light (300) | 9–10px | Dunkelgrau (#3a3a3a) auf hellem Hintergrund ODER #cccccc auf dunklem (#1a1a1a) |
```

Replace with:
```
| Footer | Light (300) | 9–10px | #999999 auf #ffffff Hintergrund — immer weiß |
```

- [ ] **Step 9: Commit**

```bash
git add lib/generate/newsletter-prompt.ts
git commit -m "feat: rewrite newsletter prompt — manufacturer logo in header, 2 CTAs enforced, dark footer"
```

---

## Task 5: Agency Server Action + Inline Edit

**Files:**
- Create: `app/(app)/agencies/actions.ts`
- Create: `components/agencies/InlineEditField.tsx`
- Modify: `app/(app)/agencies/[id]/page.tsx`

### Step group A: Server action

- [ ] **Step 1: Create `app/(app)/agencies/actions.ts`**

```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAgencyContactEmail(id: string, contact_email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('agencies')
    .update({ contact_email: contact_email.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/agencies/${id}`)
}
```

### Step group B: Inline edit component

- [ ] **Step 2: Create `components/agencies/InlineEditField.tsx`**

This follows the same pattern as `components/manufacturers/ContactEmailBulkEditor.tsx` but for a single field on the detail page.

```typescript
'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

interface Props {
  agencyId: string
  initialValue: string | null
  onSave: (id: string, value: string) => Promise<void>
  placeholder?: string
}

export default function InlineEditField({ agencyId, initialValue, onSave, placeholder }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(agencyId, value)
      setEditing(false)
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setValue(initialValue ?? '')
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-text-primary">{initialValue ?? '—'}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent border-b border-border text-sm text-text-primary focus:outline-none focus:border-accent-warm w-56 text-right"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
        autoFocus
      />
      {saving ? (
        <Loader2 size={12} className="animate-spin text-text-secondary" />
      ) : (
        <>
          <button onClick={handleSave} className="text-green-500 hover:text-green-400 transition-colors" aria-label="Speichern">
            <Check size={12} />
          </button>
          <button onClick={handleCancel} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Abbrechen">
            <X size={12} />
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-500 ml-1">{error}</span>}
    </div>
  )
}
```

### Step group C: Wire into agency detail page

- [ ] **Step 3: Modify `app/(app)/agencies/[id]/page.tsx`**

The page is currently a pure server component. Add `contact_email` to the fields list and render the inline edit component for it.

Replace the entire file content with:

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'
import InlineEditField from '@/components/agencies/InlineEditField'
import { updateAgencyContactEmail } from '../actions'

export default async function AgencyDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const [{ data: agencyData }, { data: mfgData }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', params.id).single(),
    supabase.from('manufacturers').select('*').eq('agency_id', params.id).order('name'),
  ])

  if (!agencyData) notFound()

  const agency = agencyData as Agency
  const manufacturers = (mfgData ?? []) as Manufacturer[]

  const readonlyFields = [
    { label: 'Kostenstelle',  value: agency.cost_center },
    { label: 'Ident-Nummer', value: agency.ident_number },
    { label: 'Order-E-Mail', value: agency.order_email },
    { label: 'Adresse',      value: agency.address },
    { label: 'Telefon',      value: agency.phone },
  ]

  return (
    <div className="p-8">
      <Link
        href="/agencies"
        className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={12} />
        Agenturen
      </Link>

      <div className="flex items-start justify-between mb-8">
        <h1 className="text-2xl font-light text-text-primary">{agency.name}</h1>
      </div>

      {/* Details */}
      <div className="bg-surface border border-border rounded-sm mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xs tracking-wider uppercase text-text-secondary">Details</h2>
        </div>
        <div className="divide-y divide-border">
          {readonlyFields.map(({ label, value }) => (
            <div key={label} className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-text-secondary w-40">{label}</span>
              <span className="text-sm text-text-primary flex-1 text-right">{value ?? '—'}</span>
            </div>
          ))}
          {/* Editable: contact_email */}
          <div className="px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-text-secondary w-40">Kontakt-E-Mail (Footer)</span>
            <div className="flex-1 flex justify-end">
              <InlineEditField
                agencyId={agency.id}
                initialValue={agency.contact_email}
                onSave={updateAgencyContactEmail}
                placeholder="info@agentur.eu"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Manufacturers */}
      <div>
        <h2 className="text-xs tracking-wider uppercase text-text-secondary mb-4">
          Hersteller ({manufacturers.length})
        </h2>
        <div className="bg-surface border border-border rounded-sm divide-y divide-border">
          {manufacturers.length === 0 ? (
            <p className="px-6 py-6 text-text-secondary text-sm text-center">
              Keine Hersteller zugeordnet
            </p>
          ) : (
            manufacturers.map((m) => (
              <Link
                key={m.id}
                href={`/manufacturers/${m.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
              >
                <div>
                  <p className="text-sm text-text-primary">{m.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{m.category}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-text-secondary hidden sm:block">{m.postcard_frequency}</span>
                  <ChevronRight size={14} className="text-text-secondary group-hover:text-text-primary transition-colors" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Start the dev server (`npm run dev`), open an agency detail page, and verify:
- "Kontakt-E-Mail (Footer)" row appears
- Clicking the pencil icon opens an inline input
- Typing a value and pressing Enter saves it (check Supabase dashboard or reload page)
- Pressing Escape cancels without saving

- [ ] **Step 6: Commit**

```bash
git add app/(app)/agencies/actions.ts components/agencies/InlineEditField.tsx app/(app)/agencies/[id]/page.tsx
git commit -m "feat: add contact_email inline edit to agency detail page"
```

---

## Task 6: Manufacturer Website URL Inline Edit

**Files:**
- Modify: `app/(app)/manufacturers/actions.ts` (add one function)
- Create: `components/manufacturers/WebsiteUrlInlineEdit.tsx`
- Modify: `app/(app)/manufacturers/[id]/page.tsx`

### Step group A: Server action

- [ ] **Step 1: Add `updateManufacturerWebsiteUrl` to `app/(app)/manufacturers/actions.ts`**

Open the file. It already has `updateManufacturerTags` and `updateManufacturerContactEmail`. Append:

```typescript
export async function updateManufacturerWebsiteUrl(id: string, website_url: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('manufacturers')
    .update({ website_url: website_url.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/manufacturers/${id}`)
}
```

### Step group B: Inline edit component

- [ ] **Step 2: Create `components/manufacturers/WebsiteUrlInlineEdit.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'

interface Props {
  manufacturerId: string
  initialValue: string | null
  onSave: (id: string, value: string) => Promise<void>
}

export default function WebsiteUrlInlineEdit({ manufacturerId, initialValue, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(manufacturerId, value)
      setEditing(false)
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setValue(initialValue ?? '')
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-sm text-text-primary break-all text-right">{initialValue ?? '—'}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
          aria-label="Bearbeiten"
        >
          <Pencil size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://www.hersteller.com"
        className="bg-transparent border-b border-border text-sm text-text-primary focus:outline-none focus:border-accent-warm w-64 text-right"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
        autoFocus
      />
      {saving ? (
        <Loader2 size={12} className="animate-spin text-text-secondary" />
      ) : (
        <>
          <button onClick={handleSave} className="text-green-500 hover:text-green-400 transition-colors" aria-label="Speichern">
            <Check size={12} />
          </button>
          <button onClick={handleCancel} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Abbrechen">
            <X size={12} />
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
```

### Step group C: Wire into manufacturer detail page

- [ ] **Step 3: Modify `app/(app)/manufacturers/[id]/page.tsx`**

Replace the entire file content with:

```typescript
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Agency, Manufacturer } from '@/lib/supabase/types'
import WebsiteUrlInlineEdit from '@/components/manufacturers/WebsiteUrlInlineEdit'
import { updateManufacturerWebsiteUrl } from '../actions'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency | null
}

export default async function ManufacturerDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('manufacturers')
    .select('*, agencies(*)')
    .eq('id', params.id)
    .single()

  if (!data) notFound()

  const manufacturer = data as unknown as ManufacturerWithAgency

  const readonlyFields = [
    { label: 'Agentur',                value: manufacturer.agencies?.name },
    { label: 'Kategorie',              value: manufacturer.category },
    { label: 'Kontaktperson',          value: manufacturer.contact_person },
    { label: 'Postkarte Häufigkeit',   value: manufacturer.postcard_frequency },
    { label: 'Postkarte Monate',       value: manufacturer.postcard_months },
    { label: 'Postkarte Format',       value: manufacturer.postcard_format },
    { label: 'Newsletter Häufigkeit',  value: manufacturer.newsletter_frequency },
    { label: 'Bilder-Quelle',          value: manufacturer.images_source },
    { label: 'Text-Quelle',            value: manufacturer.texts_source },
    { label: 'Eigene Creatives',       value: manufacturer.own_creatives ? 'Ja' : 'Nein' },
    { label: 'Eigene Texte',           value: manufacturer.own_texts ? 'Ja' : 'Nein' },
    { label: 'Auflage',                value: manufacturer.print_run?.toString() },
    { label: 'Postkarten-Tags',        value: manufacturer.postcard_tags },
    { label: 'Newsletter-Tags',        value: manufacturer.newsletter_tags },
    { label: 'Zusätzliche Tags',       value: manufacturer.extra_tags },
    { label: 'Report-E-Mail',          value: manufacturer.additional_report_email },
    { label: 'Dropbox-Link',           value: manufacturer.dropbox_link },
  ]

  return (
    <div className="p-8">
      <Link
        href="/manufacturers"
        className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={12} />
        Hersteller
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-text-primary">{manufacturer.name}</h1>
          <p className="text-text-secondary text-sm mt-1">
            {manufacturer.category} · {manufacturer.agencies?.name}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-sm">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xs tracking-wider uppercase text-text-secondary">Details</h2>
        </div>
        <div className="divide-y divide-border">
          {readonlyFields.map(({ label, value }) => (
            <div key={label} className="px-6 py-4 flex items-start justify-between gap-4">
              <span className="text-xs text-text-secondary w-48 shrink-0">{label}</span>
              <span className="text-sm text-text-primary text-right break-all">{value ?? '—'}</span>
            </div>
          ))}
          {/* Editable: website_url */}
          <div className="px-6 py-4 flex items-start justify-between gap-4">
            <span className="text-xs text-text-secondary w-48 shrink-0">Website</span>
            <div className="flex-1 flex justify-end">
              <WebsiteUrlInlineEdit
                manufacturerId={manufacturer.id}
                initialValue={manufacturer.website_url}
                onSave={updateManufacturerWebsiteUrl}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Start the dev server (`npm run dev`), open a manufacturer detail page, and verify:
- "Website" row appears at the bottom of the fields list
- Clicking the pencil icon opens an inline URL input
- Entering a URL and pressing Enter saves it
- Reloading the page shows the saved URL
- Pressing Escape cancels without saving

- [ ] **Step 6: Commit**

```bash
git add app/(app)/manufacturers/actions.ts components/manufacturers/WebsiteUrlInlineEdit.tsx app/(app)/manufacturers/[id]/page.tsx
git commit -m "feat: add website_url inline edit to manufacturer detail page"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Fill in test data**

Pick one manufacturer. In the manufacturer detail page, set a `website_url` (e.g. `https://www.salvatori.it`).  
In the manufacturer's agency detail page, set a `contact_email` (e.g. `info@collezioni.eu`).

- [ ] **Step 2: Generate a test newsletter**

Trigger newsletter generation for a campaign linked to that manufacturer. Use the existing briefing form — provide at least one CTA link.

- [ ] **Step 3: Inspect the generated MJML**

Download or view the `newsletter.mjml` output asset. Verify:
- `<mj-image href="https://www.salvatori.it" ...>` with the manufacturer logo src at the top (header section)
- No agency logo in the header or body
- Agency logo appears only in the footer section
- Footer background is `#ffffff`
- Footer text color is `#999999`
- `info@collezioni.eu` (contact_email) appears in footer
- `order@...` does NOT appear anywhere in the MJML
- At least 2 `<mj-button>` or CTA elements present

- [ ] **Step 4: Final commit (if any fixes were made)**

```bash
git add -p
git commit -m "fix: adjust newsletter output based on e2e verification"
```
