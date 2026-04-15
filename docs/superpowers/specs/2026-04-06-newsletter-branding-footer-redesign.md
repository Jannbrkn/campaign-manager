# Newsletter Branding & Footer Redesign

**Date:** 2026-04-06  
**Status:** Approved

---

## Overview

Currently the newsletter shows the agency logo at the top. The manufacturer brand should be the hero — agency appears only in the footer. Additionally: mandatory minimum 2 CTAs, clickable manufacturer logo linking to their website, and a properly readable/elegant footer with full agency contact details.

---

## 1. Database Changes

### `manufacturers` — add `website_url`

```sql
ALTER TABLE manufacturers ADD COLUMN website_url text;
```

- Used as href on the manufacturer logo in the newsletter header
- Also available as a default CTA link when no explicit product URL is given

### `agencies` — add `contact_email`

```sql
ALTER TABLE agencies ADD COLUMN contact_email text;
```

- Distinct from `order_email` (which is internal/orders only and never shown publicly)
- Examples: `info@collezioni.eu`, `sales@exclusive-collection.eu`
- Shown in newsletter footer alongside address and phone

---

## 2. TypeScript Types

Update `lib/supabase/types.ts`:

- `Manufacturer`: add `website_url: string | null`
- `Agency`: add `contact_email: string | null`

---

## 3. Prompt Data Flow (`lib/generate/newsletter.ts`)

In `buildUserPrompt`, pass the new fields to Claude:

**HERSTELLER section** — add:
```
Website: [mfg.website_url ?? '(keine Website)']
```

**AGENTUR section** — add:
```
Kontakt-E-Mail (Footer): [agency.contact_email ?? '(keine Kontakt-Mail)']
```

The `order_email` continues to be passed as-is (for internal reference only) but the prompt rules ensure it never appears in newsletter content or footer.

---

## 4. Newsletter Prompt Rules (`lib/generate/newsletter-prompt.ts`)

### 4a. Logo placement — BREAKING CHANGE

**Old rule (remove):**
| Logo | Position | Breite |
|---|---|---|
| Agentur-Logo | Header (oben, zentriert) | 200–220px |
| Hersteller-Logo | Über der Headline, nach dem Hero | 120–160px |
| Agentur-Logo | Closing (unter Signatur) | 140–160px |

**New rule:**
| Logo | Position | Breite | Klickbar |
|---|---|---|---|
| **Hersteller-Logo** | Header (oben, zentriert, auf #ffffff) | 160–220px | Ja → `website_url` des Herstellers |
| Agentur-Logo | Footer (zentriert, über Adressdaten, auf #ffffff) | 140–160px | Ja → `website_url` der Agentur |

The manufacturer logo must be wrapped in `<mj-image href="[website_url]">`. If no `website_url` is available, the logo is still shown but not linked.

### 4b. Minimum 2 CTAs — hard rule

Replace the existing CTA guidance with:

**PFLICHT: Mindestens 2 CTAs pro Newsletter.**

- **Haupt-CTA** (prominent, Button-Stil): aus dem Briefing-Feld `cta_text` / `cta_link` — z.B. "Preisliste herunterladen", "Termin vereinbaren"
- **Sekundärer CTA** (kontextuell, im Body eingebettet): weiterer Link — kann auf `website_url` des Herstellers, auf ein Produkt, oder auf einen weiteren Briefing-Link zeigen
- Wenn nur ein Link im Briefing → zweiten CTA auf `website_url` des Herstellers setzen
- Wenn kein `website_url` und nur ein Link → CTA als `⚠️ LINK FEHLT` markieren, aber trotzdem zwei CTA-Strukturen im MJML ausgeben

### 4c. Footer design — strict rules

Replace the existing footer section with:

**Footer — Pflichtinhalt und Design (KRITISCH):**

Inhalt:
```
[Agentur-Logo, 140–160px, zentriert, klickbar auf Agentur-Website]
[Agentur-Name]
[Kontakt-E-Mail · Telefon]
[Straße · PLZ Stadt]
[Abmelden | Einstellungen ändern]
```

Design (nicht verhandelbar):
- Hintergrund: `#ffffff`
- Text: `#999999`, 9–10px, Light (300)
- Links (Abmelden/Einstellungen): `#bbbbbb`
- Logo immer auf `#ffffff` Hintergrund

### 4d. Checkliste — update

Add to the post-generation checklist:
```
✅/❌ Hersteller-Logo im Header (160–220px, klickbar auf website_url, auf #ffffff)?
✅/❌ Agentur-Logo NUR im Footer (140–160px, klickbar auf Agentur-website_url, auf #ffffff)?
✅/❌ Kein Agentur-Logo/-Name im Header oder Body?
✅/❌ Mindestens 2 CTAs vorhanden?
✅/❌ Footer: Agentur-Name, contact_email (NICHT order_email), Telefon, Straße + PLZ + Stadt?
✅/❌ Footer: #ffffff Hintergrund, #999999 Text?
```

---

## 5. UI Changes

### Agency detail page (`app/(app)/agencies/[id]/page.tsx`)

- Add `contact_email` to the displayed fields list
- Add inline-edit capability for `contact_email` (client component with optimistic update)
- Edit icon next to the field value; clicking opens an input; save triggers PATCH to Supabase

### Manufacturer detail page (`app/(app)/manufacturers/[id]/page.tsx`)

- Add `website_url` to the displayed fields list
- Add inline-edit capability for `website_url` (same pattern as agency)

Both pages currently display-only. Only the two new fields need inline editing — existing fields remain display-only to keep scope tight.

---

## Implementation Order

1. SQL migration file (`supabase/migrations/`)
2. TypeScript types (`lib/supabase/types.ts`)
3. Prompt data flow (`lib/generate/newsletter.ts` — `buildUserPrompt`)
4. Newsletter prompt rules (`lib/generate/newsletter-prompt.ts`)
5. Agency detail page — add + edit `contact_email`
6. Manufacturer detail page — add + edit `website_url`
