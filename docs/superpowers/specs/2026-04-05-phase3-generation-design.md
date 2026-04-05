# Phase 3: AI-Generierung — Newsletter & Report

**Datum:** 2026-04-05
**Status:** Approved for implementation

---

## Überblick

Phase 3 fügt zwei Generierungs-Workflows hinzu:

1. **Newsletter-Generierung** — Claude API → MJML → HTML → ZIP (Mailchimp-ready)
2. **Report-Generierung** — CSV-Parsing → Scoring → zwei Excel-Dateien (intern + extern)

Beide Workflows werden über API Routes ausgelöst und speichern ihre Outputs als `campaign_assets` mit `is_output=true` in Supabase Storage. Der Campaign-Status wechselt automatisch auf `review`.

---

## Architektur

```
app/api/generate/
  newsletter/route.ts   HTTP-Handling, Datenladen, Asset-Speicherung (~120 Zeilen)
  report/route.ts       HTTP-Handling, Datenladen, Asset-Speicherung (~120 Zeilen)

lib/generate/
  newsletter.ts         Prompt aufbauen → Claude API → MJML kompilieren → ZIP (~80 Zeilen)
  report.ts             CSV parsen → Scoring → 2× ExcelJS generieren (~80 Zeilen)
  scoring.ts            Pure functions: score(), priority(), filterContacts() (~60 Zeilen)
```

### Packages (neu)
- `@anthropic-ai/sdk` — Claude API
- `mjml` — MJML → HTML serverseitig
- `jszip` — ZIP-Erstellung
- `exceljs` — Excel-Generierung
- `papaparse` — CSV-Parsing

---

## Newsletter-Route (`POST /api/generate/newsletter`)

### Request
```json
{ "campaign_id": "uuid" }
```

### Ablauf

1. Kampagne laden: `campaigns` + `manufacturers` + `agencies` (via `CampaignWithManufacturer`)
2. Assets laden: alle Assets der Kampagne — Bilder (`image`), Texte (`text`), CTAs (`cta`), Links (`link`)
3. Prompt aufbauen:
   - **System:** Inhalt von `.claude/skills/newsletter-generator/newsletter skill.md`
   - **User:** Strukturierte Übergabe aller Kampagnen-Daten im Format des Skills:
     ```
     AGENTUR: Name, Logo-URL, Adresse, E-Mail, Telefon
     HERSTELLER: Name, Kategorie
     KAMPAGNE: Titel, Textentwurf (Text-Assets), Bilder (Image-URLs), Links (CTA/Link-Assets)
     ```
4. Claude API Call: `claude-sonnet-4-20250514`, `max_tokens: 8192`
5. Response parsen: MJML-Code aus der Antwort extrahieren (zwischen ` ```xml ` und ` ``` ` Tags oder direkt)
6. MJML kompilieren: `mjml(source, { validationLevel: 'strict' })` → HTML
   - Bei Fehler: MJML-Rohtext als Asset speichern, Campaign-Status → `assets_pending`, Fehler in `notes` eintragen → Abbruch
7. ZIP erstellen (`jszip`): nur die HTML-Datei, **keine Bilder** — Bilder referenzieren absolute Supabase-URLs
8. MJML-Quelle und ZIP speichern als `campaign_assets` (`is_output=true`, `asset_category='newsletter_zip'`)
9. Campaign-Status → `review`

### Vercel-Konfiguration
```ts
export const maxDuration = 60  // Pro Plan: 60s Timeout
```

---

## Report-Route (`POST /api/generate/report`)

### Request
```json
{ "campaign_id": "uuid" }
```

### Ablauf

1. Kampagne laden (report_internal oder report_external)
2. Geschwister-Kampagne finden: alle Kampagnen mit gleicher `linked_newsletter_id` laden → interne und externe Kampagnen-IDs bestimmen
3. CSV-Asset suchen:
   - Erst: Assets der eigenen Kampagne (`asset_category = 'csv_export'`)
   - Fallback: Assets der verlinkten Newsletter-Kampagne (`linked_newsletter_id`)
   - Wenn kein CSV gefunden: 400-Error mit Hinweistext
4. CSV aus Supabase Storage laden und parsen (`papaparse`, dynamische Trennzeichen-Erkennung)
5. Scoring und Filterung (via `lib/generate/scoring.ts`):
   - Deduplizierung über E-Mail-Adresse, Opens/Clicks aggregieren
   - Score = `(Clicks × 3) + (Opens × 1) + Mail-Typ-Bonus`
   - Mail-Typ-Bonus: +2 wenn E-Mail NICHT mit `info@`, `office@`, `kontakt@`, `contact@`, `mail@` beginnt
   - Priorität A: Score ≥ 8 ODER (≥ 1 Click UND persönliche Mail)
   - Priorität B: Score ≥ 5 ODER Opens ≥ 4
   - Priorität C: alle übrigen qualifizierten Kontakte
   - Ausschluss: ≤ 3 Opens UND 0 Clicks
   - Limit: 30 Kontakte + alle zusätzlichen Clicker über dem Limit
   - Sortierung: Score desc → Clicks desc → Opens desc
6. Interner Report (`exceljs`) — Dateiname: `[Hersteller]_Lead_Priorisierung_[YYYY-MM-DD].xlsx`
   - Sheet 1 "Lead-Priorisierung": Kopfbereich (Kunde/Kampagne/Datum), Spalten: Nr, Priorität, Kontakt, E-Mail, Telefon, Opens, Clicks, Mail-Typ
     - Header: weiße Schrift auf #2C2C2C
     - Priorität A: Hintergrund #EDE8E3; B: #F5F3F0; C: weiß
     - Mail-Typ "Persönlich": grüne Schrift #2E7D32; "Info": grau #999999
     - E-Mail-Adressen: blau #4A6FA5
     - Freeze Panes ab Zeile 7, Auto-Filter
   - Sheet 2 "Auswertung": Verteilung nach Priorität (Anzahl + Anteil), Mail-Typ-Aufschlüsselung
   - Sheet 3 "Methodik": Scoring-Formel, Filterkriterien, Datengrundlage
7. Externer Report (`exceljs`) — Dateiname: `[Hersteller]_Kampagnenauswertung_[YYYY-MM-DD].xlsx`
   - Sheet 1 "Kampagnenübersicht": KPI-Block (Erreichte Kontakte, Öffnungsrate/Absolutzahl, Qualifizierte Leads, Erreichte Entscheider) — positiv formuliert
   - Sheet 2 "Erreichte Kontakte": Nr, Kontakt, E-Mail — **keine Opens/Clicks/Scores/Prioritäten** — alphabetisch sortiert, max 30 Kontakte
   - Zebra-Muster (#F9F7F4 / weiß), kein Auto-Filter
8. Beide XLSX als `campaign_assets` speichern (`is_output=true`, `asset_category='report_xlsx'`):
   - Internes XLSX → report_internal Campaign-ID
   - Externes XLSX → report_external Campaign-ID
9. **Beide** Kampagnen-Status → `review`

---

## Side Panel — UI-Ergänzungen

### Generierungs-Button
- **Newsletter-Kampagnen:** Button "Newsletter generieren" unter dem Status-Dropdown
- **Report-Kampagnen (intern oder extern):** Button "Report generieren"
- Loading-State: Spinner + "Wird generiert…" (Button disabled)
- Bei Fehler: roter Fehlertext unterhalb des Buttons (nicht als Toast)

### Output-Assets
- Assets mit `is_output=true` werden visuell unterschieden: `border-accent-warm/30` statt `border-border`
- Download-Link bleibt gleich (`ExternalLink`-Icon)
- Kein separater "Output"-Bereich — Output-Assets erscheinen in derselben Asset-Liste, aber oben (sortiert nach `is_output desc, created_at desc`)

---

## Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| Claude gibt ungültiges MJML zurück | MJML-Rohtext als Asset speichern, Status → `assets_pending`, Fehler in Notes |
| Kein CSV gefunden | 400-Response: "Kein CSV-Asset gefunden. Bitte CSV auf dieser oder der Newsletter-Kampagne hochladen." |
| CSV nicht parsbar | 400-Response: "CSV konnte nicht gelesen werden." |
| Claude API Timeout / Error | 500-Response, Status unverändert |
| Supabase Storage Upload schlägt fehl | 500-Response, bereits generierte Assets werden nicht gespeichert |

---

## Nicht in Scope (Phase 3)

- Streaming der Claude-Response (wäre nice-to-have, aber erhöht Komplexität erheblich)
- Newsletter-Preview im Browser (kommt in späterem Phase)
- Automatischer E-Mail-Versand (Phase 4)
- Google Calendar Sync (separates Feature)
