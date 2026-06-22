# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Campaign Manager — Collezioni Design Syndicate

## Project Overview
A campaign management tool for a luxury furniture brand agency managing newsletters, postcards, and lead reports across 5 agencies and 18+ manufacturers. Built with Next.js, Supabase, and Claude API integration.

## Tech Stack
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS — dark luxury theme (black background, white calendar lines, warm accent #EDE8E3)
- **Database & Auth**: Supabase (PostgreSQL + Auth + Storage)
- **AI Generation**: Claude API — Sonnet for newsletters (MJML) and reports (Excel), Haiku for subject lines
- **Email Marketing**: Mailchimp API (audience tags, campaign sends, members export → lead reports)
- **Email Notifications**: Resend (alerts, report delivery)
- **Calendar Sync**: Google Calendar API → Apple Calendar
- **Deployment**: Vercel

## Design System
- **Background**: #0A0A0A (near-black)
- **Surface**: #1A1A1A (cards, panels)
- **Border**: #2A2A2A (calendar grid lines, dividers)
- **Text Primary**: #FFFFFF
- **Text Secondary**: #999999
- **Accent Warm**: #EDE8E3 (luxury beige — highlights, active states)
- **Accent Gold**: #C4A87C (premium touches, badges)
- **Success**: #2E7D32
- **Warning**: #E65100
- **Font**: Inter (UI) + optional serif for headings
- **Aesthetic**: Clean, minimal, generous whitespace. Luxury furniture industry — think Boffi/B&B Italia website energy. No clutter, no bright colors.

## Data Model

### agencies
The 5 parent agencies that own manufacturer relationships.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | e.g. "Collezioni", "Exclusive Collection" |
| cost_center | text | e.g. "Arredamenti UG (Finom Bank)" |
| ident_number | text | e.g. "DE35 9277920" |
| order_email | text | e.g. "order@collezioni.eu" |
| logo_url | text | Supabase Storage path |
| address | text | Full postal address |
| phone | text | |
| created_at | timestamptz | |

### manufacturers
The brands/manufacturers managed under each agency.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| agency_id | uuid | FK → agencies |
| name | text | e.g. "Salvatori", "Tuuci (Südlich)" |
| category | text | e.g. "Bad/Fliesen", "Licht" |
| contact_person | text | e.g. "Karo", "Annika/Merlin" |
| postcard_frequency | text | "1x pro Jahr", "2x pro Jahr", "3x pro Jahr" |
| postcard_months | text | e.g. "Januar, Mai" |
| postcard_format | text | "A5" or "DIN Lang" |
| newsletter_frequency | text | e.g. "Immer nach Postkarte und nach Messe" |
| images_source | text | Who provides images |
| texts_source | text | Who provides texts |
| own_creatives | boolean | Does manufacturer provide own creatives? |
| own_texts | boolean | Does manufacturer provide own texts? |
| additional_report_email | text | Extra email for reports |
| dropbox_link | text | |
| postcard_tags | text | Mailchimp audience tags for postcards |
| newsletter_tags | text | Mailchimp audience tags for newsletters |
| extra_tags | text | |
| print_run | integer | Postcard print quantity (Auflage) |
| created_at | timestamptz | |

### campaigns
Individual campaign entries in the calendar.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| manufacturer_id | uuid | FK → manufacturers |
| type | enum | 'postcard', 'newsletter', 'report_internal', 'report_external' |
| title | text | Campaign title |
| status | enum | 'planned', 'assets_pending', 'assets_complete', 'generating', 'review', 'approved', 'sent' |
| scheduled_date | date | The target send/publish date |
| linked_postcard_id | uuid | FK → campaigns (nullable, links newsletter to its postcard) |
| linked_newsletter_id | uuid | FK → campaigns (nullable, links report to its newsletter) |
| notes | text | |
| review_approved | boolean | Checkbox: output reviewed and approved |
| auto_send_emails | jsonb | List of email addresses for auto-send on Monday |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### campaign_assets
Files uploaded for a campaign (images, texts, PDFs, CSVs, etc.)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns |
| file_name | text | |
| file_type | text | MIME type |
| file_url | text | Supabase Storage path |
| asset_category | enum | 'image', 'text', 'logo', 'cta', 'link', 'csv_export', 'postcard_pdf', 'newsletter_zip', 'report_xlsx' |
| is_output | boolean | false = input asset, true = generated output |
| created_at | timestamptz | |

### campaign_alerts
Scheduled alerts and notifications.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns |
| alert_type | enum | 'prep_reminder_6w', 'assets_missing', 'output_ready', 'review_needed', 'auto_send_scheduled' |
| scheduled_for | timestamptz | When to send the alert |
| sent | boolean | |
| sent_at | timestamptz | |

## Campaign Workflow / Business Rules

### Timing Pattern (fixed rhythm)
1. **Postcard** → always sent on a Friday
2. **Newsletter** → sent Wednesday or Thursday after the postcard Friday
3. **Internal Report** → generated on the Monday after newsletter send
4. **External Report** → generated on the Monday after newsletter send

### Alert Logic
- **6 weeks before** scheduled postcard date → email alert: "Kampagne vorbereiten"
- **Missing assets** → shown in UI + optional email when campaign is <2 weeks out
- **Output generated** → email: "Output zur Prüfung bereit"
- **Approved + Monday** → auto-send reports to configured email addresses

### Postcard Rules
- Can be uploaded from Canva (PDF/PNG) OR generated via Claude API
- Formats: A5 or DIN Lang (per manufacturer config)
- If a postcard exists for a campaign, the newsletter MUST match its style

### Newsletter Rules
Vollständige Regeln (Struktur, Kreativrichtlinien, technische Pipeline, Qualitätsprüfung) stehen in **`docs/NEWSLETTER_RULES.md`**.
**Diese Datei MUSS gelesen werden, bevor Newsletter-Code geschrieben oder MJML generiert wird.**

Kurzfassung der harten Regeln:
- Header: NUR Hersteller-Logo (160–220px, auf #ffffff) — KEIN Agentur-Logo/-Name im Header oder Body
- Footer: Agentur-Logo + Name + `contact_email` (NICHT `order_email`) + Telefon + Adresse + Abmelden/Einstellungen
- MJML 4.x, 640px Breite, flat ZIP, Production-HTML < 102KB
- Font-Import via `@import` in `<mj-style>` (nicht `<mj-font>`), Google Fonts v1 API
- Farbwelt aus Bildern ableiten, nicht hardcoden
- GIFs: First-Frame als JPEG an Vision API, Original-GIF in MJML/ZIP
- Conversion/CTA: Drei-Ebenen-Architektur (Primär gefüllt · Sekundär Outline · Tertiär Textlink →), ein klarer CTA above the fold, max. ein Primär-Button pro Screen — Details + Button-Maße in NEWSLETTER_RULES.md. Newsletter bleiben DE/Sie-Form.

### Report Rules
- Input: Mailchimp Members Export (CSV/XLSX)
- Output: Two Excel files per campaign
  - Internal: Lead prioritization with scoring (clicks×3, opens×1, personal mail bonus +2)
  - External: Client-facing report, alphabetically sorted, no internal metrics visible
- **Output language: English** — sheet names, headers, KPI labels, priority tiers, notes, file names. Scoring logic, priority tiers, 30-contact limit, filters and dual-report philosophy stay unchanged. See **Language Policy** below for the binding DE→EN mapping.

## File Format Support
PDF, PNG, JPEG, XLSX, CSV, ZIP — both upload and download

## Calendar Views
1. **Compact** — month view with campaign dots/badges per day
2. **Extended** — week/2-week view with full campaign cards
3. **Year** — 12-month overview with campaign density indicators

## Authentication
- Supabase Auth with email/password
- Single-user initially (Jann), expandable later
- Protected routes — all pages behind auth

## Key Conventions
- All UI text in German
- All code comments in English
- Use server components by default, client components only when interactive
- Supabase client: use @supabase/ssr for Next.js App Router
- File uploads go to Supabase Storage bucket "campaign-assets"
- Environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY

## Language Policy

> Added 2026-06-22 (briefing). Newsletters stay German; reports switch to English.

- **Reports & evaluations** (internal lead report AND client report) are produced in **English** — sheet names, column headers, KPI labels, priority tiers, notes and file names. **Scoring logic and report philosophy are unchanged — only the language changes.**
- **Newsletters** and all customer-facing mailing copy remain **German (formal Sie-Form).**

This applies in `mailchimp-lead-auswertung/SKILL.md` and `Prompt_Mailchimp_Lead_Auswertung_Dual.md` (see Roadmap → Pending alignment). Binding DE→EN mapping:

**File names**
| German | English |
|---|---|
| `[Kunde]_Lead_Priorisierung_[Datum].xlsx` | `[Client]_Lead_Prioritization_[Date].xlsx` |
| `[Kunde]_Kampagnenauswertung_[Datum].xlsx` | `[Client]_Campaign_Report_[Date].xlsx` |

**Internal report — sheets & columns**
| German | English |
|---|---|
| Sheet „Lead-Priorisierung" | `Lead Prioritization` |
| Sheet „Auswertung" | `Analysis` |
| Sheet „Methodik" | `Methodology` |
| Nr. | `No.` |
| Priorität | `Priority` |
| Kontakt | `Contact` |
| E-Mail-Adresse | `Email Address` |
| Telefon | `Phone` |
| Opens | `Opens` |
| Clicks | `Clicks` |
| Mail-Typ | `Address Type` |
| A – Hohe Relevanz | `A – High Relevance` |
| B – Relevanz gegeben | `B – Relevant` |
| C – Potenzial vorhanden | `C – Potential` |
| Mail-Typ „Persönlich" | `Personal` |
| Mail-Typ „Info-Adresse" | `Generic` |

**Client report — sheets, KPIs & text**
| German | English |
|---|---|
| Sheet „Kampagnenübersicht" | `Campaign Overview` |
| Sheet „Erreichte Kontakte" | `Engaged Contacts` |
| „Kontakte mit erhöhtem Interesse" | `Contacts with elevated interest` |
| „Kampagnenauswertung · [Name]" | `Campaign Report · [Campaign Name]` |
| „Erstellt von Collezioni · [Datum]" | `Prepared by Collezioni · [Date]` |
| Erreichte Kontakte | `Contacts Reached` |
| Öffnungsrate | `Open Rate` |
| Interaktionsrate | `Click-to-Open Rate` (only show if > 5%) |
| Erreichte Entscheider | `Decision-Makers Reached` → `XX direct contacts reached` |
| Qualifizierte Leads | `Qualified Leads` → `XX contacts with elevated interest identified` |
| Spalte „Unternehmen / Zuordnung" | `Company / Assignment` |

**Unchanged (now phrased in English):** positive KPI framing, alphabetical sorting in the client report, no scores/opens/clicks/phone in the client report, no note about missing data, absolute numbers instead of percent at low rates.

## Required Campaign Contacts (brand-dependent)

> Added 2026-06-22 (briefing §5).

Per campaign, brand-dependent internal contacts must be included:

- **Collezioni**: always include **Annika** (`office@collezioni.eu`) and **Karo** (`kontakt@collezioni.eu`).
- **All other brands** (Exclusive Collection, Design Collection, EMQuadrat, vondomani): always include **Annika** (`office@exclusive-collection.eu`); for the respective customer additionally include **Tom** (`info@exclusive-collection.eu`).

**Application scope (current decision):** these contacts are wired as **recipients of reports & alerts** (option C). This is the current setting and can be extended later (e.g. CC on lead outreach, or reply-to/CC on newsletter sends).

`campaign-contacts.ts` is **planned, not yet created** (see Roadmap). Target spec:

```typescript
// campaign-contacts.ts — brand-dependent required contacts
export const REQUIRED_CONTACTS = {
  collezioni: [
    { name: "Annika", email: "office@collezioni.eu" },
    { name: "Karo",   email: "kontakt@collezioni.eu" },
  ],
  // Default for all other brands:
  default: [
    { name: "Annika", email: "office@exclusive-collection.eu" }, // always
    { name: "Tom",    email: "info@exclusive-collection.eu", perCustomer: true }, // per customer
  ],
} as const;

export function getRequiredContacts(brand: string) {
  return brand.toLowerCase() === "collezioni"
    ? REQUIRED_CONTACTS.collezioni
    : REQUIRED_CONTACTS.default;
}
```

## Roadmap & Planned Extensions

> Foundation for upcoming tools (briefing 2026-06-22, §8). Backlog — not yet built.

1. **Phase 4 — Alert system** (designed, not implemented). Vercel Cron → consolidated email summaries to `marketing@collezioni.eu` and `brunken.jann@gmail.com` (new campaign performance, qualified leads, due follow-ups). The required campaign contacts above are wired here as report/alert recipients.
2. **Close the create–measure–iterate loop.** Feed A/B subject results and distinct CTA-link tracking from Mailchimp back into lead reporting. Extend the Supabase data model with `campaign_id ↔ subject_variant ↔ cta_clicks`.
3. **Cross-brand contact-overlap tracking.** Detect contacts that appear across multiple brands — avoid double outreach, surface highly active contacts.
4. **Postcard automation** (research). Automated runs of 300–500 pieces. Trade-off: EchtPost (simple API automation) vs. FLYERALARM/Lettershop (premium material); optilyz as deeper CRM/postcard integration if the EchtPost hybrid is not enough.
5. **Skill consolidation.** Possibly merge `ec-newsletter` into `newsletter-generator`; until then keep both in sync.

### Pending alignment (briefing §7 — intentionally NOT done this round)
Captured here so nothing is lost; source files were left untouched:
- ✓ `lib/generate/newsletter-prompt.ts` — **DONE 2026-06-22**: conversion/CTA standards from `docs/NEWSLETTER_RULES.md` folded in (three-tier CTAs, button sizes `16px 34px`, hidden preheader, closing with contact CTA). Newsletters remain DE/Sie.
- `mailchimp-lead-auswertung/SKILL.md` + `Prompt_Mailchimp_Lead_Auswertung_Dual.md` — change the language header to English and apply the DE→EN label mapping (Language Policy above). Logic unchanged.
- `ec-newsletter/SKILL.md` — fix `npx mjml` → local binary `node /home/claude/node_modules/mjml/bin/mjml`; keep in sync with `newsletter-generator`.
- `campaign-contacts.ts` — create the config object (spec above) and wire it to report/alert recipients.
