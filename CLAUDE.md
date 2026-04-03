# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Campaign Manager — Collezioni Design Syndicate

## Project Overview
A campaign management tool for a luxury furniture brand agency managing newsletters, postcards, and lead reports across 5 agencies and 18+ manufacturers. Built with Next.js, Supabase, and Claude API integration.

## Tech Stack
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS — dark luxury theme (black background, white calendar lines, warm accent #EDE8E3)
- **Database & Auth**: Supabase (PostgreSQL + Auth + Storage)
- **AI Generation**: Claude API (Sonnet) for newsletters (MJML) and reports (Excel)
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
- Generated via Claude API → MJML → HTML → flat ZIP for Mailchimp import
- Footer must include agency logo, address, phone, email from agency record
- Audience tags from manufacturer record determine Mailchimp segment

### Report Rules
- Input: Mailchimp Members Export (CSV/XLSX)
- Output: Two Excel files per campaign
  - Internal: Lead prioritization with scoring (clicks×3, opens×1, personal mail bonus +2)
  - External: Client-facing report, alphabetically sorted, no internal metrics visible

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
