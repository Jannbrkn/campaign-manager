# Phase 3: AI-Generierung — Newsletter & Report

**Datum:** 2026-04-05
**Status:** Approved for implementation

---

## Überblick

Phase 3 fügt zwei Generierungs-Workflows hinzu:

1. **Newsletter-Generierung** — Claude API → MJML → HTML → ZIP (Mailchimp-ready) + Base64-Preview
2. **Report-Generierung** — CSV-Parsing → Scoring → zwei Excel-Dateien (intern + extern)

Beide Workflows werden über API Routes ausgelöst und speichern ihre Outputs als `campaign_assets` mit `is_output=true` in Supabase Storage. Der Campaign-Status wechselt automatisch auf `review`.

---

## Schema-Änderung

`AssetCategory` Enum bekommt einen neuen Wert: `'newsletter_preview'`

Betrifft:
- `lib/supabase/types.ts` — `AssetCategory` Type
- Supabase DB Migration: `ALTER TYPE asset_category ADD VALUE 'newsletter_preview'`

---

## Architektur

```
app/api/generate/
  newsletter/route.ts       HTTP-Handling, Datenladen, Asset-Speicherung (~130 Zeilen)
  report/route.ts           HTTP-Handling, Datenladen, Asset-Speicherung (~120 Zeilen)

lib/generate/
  newsletter-prompt.ts      Newsletter-Skill als exportierte String-Konstante NEWSLETTER_SYSTEM_PROMPT
  newsletter.ts             Prompt aufbauen → Claude API → MJML kompilieren → ZIP + Preview (~100 Zeilen)
  report.ts                 CSV parsen → Scoring → 2× ExcelJS generieren (~80 Zeilen)
  scoring.ts                Pure functions: score(), priority(), filterContacts() (~60 Zeilen)
```

### Packages (neu)
- `@anthropic-ai/sdk` — Claude API
- `mjml` — MJML → HTML serverseitig
- `jszip` — ZIP-Erstellung (Bilder + HTML)
- `exceljs` — Excel-Generierung
- `papaparse` — CSV-Parsing

---

## Newsletter-Route (`POST /api/generate/newsletter`)

### Request
```json
{ "campaign_id": "uuid", "feedback": "optional feedback text for regeneration" }
```

### Vercel-Konfiguration
```ts
export const maxDuration = 60
```

### Ablauf

1. **Kampagne laden:** `campaigns` + `manufacturers` + `agencies`
2. **Assets laden:** alle Assets der eigenen Kampagne — Bilder (`image`), Texte (`text`), CTAs (`cta`), Links (`link`)
3. **Postkarten-Assets laden (wenn `linked_postcard_id` existiert):**
   - Assets der verlinkten Postkarten-Kampagne laden
   - Bilder (`image`, `postcard_pdf`) als zusätzliche Referenz-Bilder für Claude
4. **Prompt aufbauen** (`lib/generate/newsletter.ts`):
   - **System:** `NEWSLETTER_SYSTEM_PROMPT` aus `lib/generate/newsletter-prompt.ts` + feste Anweisung am Ende:
     ```
     Antworte NUR mit MJML-Code. Kein Markdown, keine Erklärung, kein Codeblock-Wrapper.
     Beginne direkt mit <mjml> und ende mit </mjml>.
     ```
   - **User (text):** Strukturierte Kampagnen-Daten:
     ```
     AGENTUR: Name, Logo-URL, Adresse, E-Mail, Telefon
     HERSTELLER: Name, Kategorie
     KAMPAGNE: Titel, Textentwurf (Text-Asset-Inhalte), Links (CTA/Link-Assets)
     BILDER (eigene Kampagne): [Liste der Bild-URLs]
     BILDER (Postkarte, Stil-Referenz): [Liste der Postkarten-Bild-URLs — nur wenn vorhanden]
     FEEDBACK (nur bei Neu-Generierung): [feedback-Text — nur wenn übergeben]
     ```
   - **User (image content blocks):** Alle Bild-URLs der Kampagne + Postkarte als `image_url`-Blöcke im Claude-Messages-Format (Vision)
5. **Claude API Call:**
   - Model: `claude-sonnet-4-20250514`
   - `max_tokens: 16384`
   - Messages: `[{ role: 'user', content: [text-block, ...image-blocks] }]`
6. **Response parsen:** Claude antwortet ohne Markdown-Wrapper — Response direkt als MJML behandeln. Validierung: muss mit `<mjml` beginnen. Wenn nicht: Rohtext als Asset speichern, Status → `assets_pending`, Fehler in `notes` → Abbruch.
7. **MJML kompilieren:** `mjml(source, { validationLevel: 'strict' })` → HTML mit absoluten Bild-URLs
8. **ZIP erstellen** (`jszip`) — flach, keine Unterordner:
   - Alle referenzierten Bild-URLs aus den Assets werden per `fetch()` heruntergeladen
   - Bilder mit originalem Dateinamen in ZIP einfügen
   - HTML: absolute Supabase-URLs durch relative Dateinamen ersetzen (`src="https://…/bild.jpg"` → `src="bild.jpg"`)
   - HTML-Datei als `newsletter.html` in ZIP
9. **Base64-Preview erstellen:** Separate HTML-Datei mit Base64-eingebetteten Bildern (für lokale Vorschau, NICHT für Mailchimp-Import)
10. **Assets speichern** (`is_output=true`):
    - ZIP → `asset_category='newsletter_zip'`, Dateiname `newsletter.zip`
    - MJML-Quelle → `asset_category='text'`, Dateiname `newsletter.mjml`
    - Base64-Preview → `asset_category='newsletter_preview'`, Dateiname `newsletter-preview.html`
11. **Campaign-Status → `review`**

### Neu-Generierung
- Wenn bereits Output-Assets existieren (`is_output=true`) wird "Neu generieren" statt "Newsletter generieren" angezeigt
- Optionales Feedback-Textfeld erscheint (Textarea, Placeholder: "Was soll verbessert werden?")
- `feedback`-String wird im User-Prompt an Claude übergeben
- Neue Output-Assets überschreiben die alten (gleicher Dateiname → Supabase Storage upsert)

---

## Report-Route (`POST /api/generate/report`)

### Request
```json
{ "campaign_id": "uuid" }
```

### Ablauf

1. **Kampagne laden** (report_internal oder report_external)
2. **Geschwister-Kampagne finden:** alle Kampagnen mit gleicher `linked_newsletter_id` → interne und externe IDs bestimmen
3. **CSV-Asset suchen** — Suchkette über gesamte Kampagnen-Kette:
   - **Stufe 1:** Assets der eigenen Kampagne (`asset_category = 'csv_export'`)
   - **Stufe 2:** Assets der verlinkten Newsletter-Kampagne (`linked_newsletter_id`)
   - **Stufe 3:** Assets der verlinkten Postkarten-Kampagne (Newsletter's `linked_postcard_id`)
   - Wenn kein CSV gefunden: 400-Response mit Hinweistext
4. **CSV laden und parsen** (`papaparse`, `dynamicTyping: true`, `skipEmptyLines: true`)
5. **Scoring und Filterung** (`lib/generate/scoring.ts`):
   - Deduplizierung über E-Mail-Adresse, Opens/Clicks aggregieren
   - Score = `(Clicks × 3) + (Opens × 1) + Mail-Typ-Bonus`
   - Mail-Typ-Bonus: +2 wenn lokaler Teil der E-Mail NICHT `info`, `office`, `kontakt`, `contact`, `mail` ist
   - Priorität A: Score ≥ 8 ODER (≥ 1 Click UND persönliche Mail)
   - Priorität B: Score ≥ 5 ODER Opens ≥ 4
   - Priorität C: alle übrigen qualifizierten Kontakte
   - Ausschluss: ≤ 3 Opens UND 0 Clicks
   - Limit: 30 Kontakte, Ausnahme: zusätzliche Clicker über dem Limit werden immer aufgeführt
   - Sortierung: Score desc → Clicks desc → Opens desc
6. **Interner Report** (`exceljs`) — `[Hersteller]_Lead_Priorisierung_[YYYY-MM-DD].xlsx`:
   - Sheet 1 "Lead-Priorisierung":
     - Kopfbereich (Zeilen 1–5): Hersteller (18pt fett), Kampagnenname, Datum, Hinweiszeile, Leerzeile
     - Spalten: Nr · Priorität · Kontakt · E-Mail · Telefon · Opens · Clicks · Mail-Typ
     - Header: weiße Schrift auf #2C2C2C
     - Priorität A: Hintergrund #EDE8E3; B: #F5F3F0; C: weiß
     - Mail-Typ "Persönlich": Schrift #2E7D32; "Info-Adresse": #999999
     - E-Mail-Adressen: #4A6FA5
     - Freeze Panes ab Zeile 7, Auto-Filter auf alle Spalten
     - Schrift durchgängig Arial
   - Sheet 2 "Auswertung": Verteilung A/B/C (Anzahl + Anteil), Mail-Typ-Aufschlüsselung
   - Sheet 3 "Methodik": Scoring-Formel, Filterkriterien, Datengrundlage
7. **Externer Report** (`exceljs`) — `[Hersteller]_Kampagnenauswertung_[YYYY-MM-DD].xlsx`:
   - Sheet 1 "Kampagnenübersicht":
     - Kopfbereich: Hersteller, Kampagnenauswertung, "Erstellt von [Agenturname]", Datum
     - KPI-Block: Erreichte Kontakte, Öffnungsrate (als Absolutzahl wenn Rate < 15%), Qualifizierte Leads ("XX Kontakte mit erhöhtem Interesse"), Erreichte Entscheider — immer positiv formuliert
   - Sheet 2 "Erreichte Kontakte":
     - Spalten: Nr · Kontakt · E-Mail — **keine Opens/Clicks/Scores/Prioritäten**
     - Max 30 Kontakte, alphabetisch nach Kontaktname sortiert
     - Zebra-Muster: Weiß / #F9F7F4, kein Auto-Filter
8. **Assets speichern** (`is_output=true`, `asset_category='report_xlsx'`):
   - Internes XLSX → report_internal Campaign-ID
   - Externes XLSX → report_external Campaign-ID
9. **Beide Kampagnen-Status → `review`**

---

## Side Panel — UI-Ergänzungen

### Generierungs-Button (Newsletter)
- Wenn keine Output-Assets: Button **"Newsletter generieren"**
- Wenn Output-Assets existieren: Button **"Neu generieren"** + optionale Textarea ("Was soll verbessert werden?")
- Loading-State: Spinner + "Wird generiert…" (Button disabled, Textarea disabled)
- Bei Fehler: roter Fehlertext unterhalb des Buttons

### Generierungs-Button (Report)
- Button **"Report generieren"** (kein Neu-Generieren-Flow — einfacher Überschreib-Modus)
- Loading-State: Spinner + "Wird generiert…"
- Bei Fehler: roter Fehlertext

### Newsletter-Preview
- Wenn ein `newsletter_preview`-Asset existiert, wird es in einem `<iframe>` im Side Panel angezeigt
- Position: zwischen Status-Dropdown und Assets-Bereich
- Höhe: 400px, Breite: 100%, `border: 1px solid border-color`, `rounded-sm`
- `srcdoc`-Attribut mit dem HTML-Inhalt des Preview-Assets (geladen aus Supabase Storage)
- Überschrift "Newsletter-Vorschau" (xs, text-secondary, uppercase)

### Output-Assets
- Assets mit `is_output=true`: visuell unterschieden durch `border-accent-warm/30`
- Sortierung in der Asset-Liste: `is_output=true` zuerst, dann nach `created_at desc`

---

## Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| Claude antwortet nicht mit `<mjml` | Rohtext als text-Asset speichern, Status → `assets_pending`, Fehler in `notes` |
| MJML-Kompilierung schlägt fehl | MJML-Rohtext als text-Asset speichern, Status → `assets_pending`, Fehler in `notes` |
| Bild-Download für ZIP schlägt fehl | Bild überspringen, ZIP ohne dieses Bild erstellen, Warnung in `notes` |
| Kein CSV gefunden (alle 3 Stufen) | 400: "Kein CSV-Asset gefunden. Bitte CSV auf Report-, Newsletter- oder Postkarten-Kampagne hochladen." |
| CSV nicht parsbar | 400: "CSV konnte nicht gelesen werden." |
| Claude API Timeout / Fehler | 500, Status unverändert |

---

## Nicht in Scope (Phase 3)

- Streaming der Claude-Response
- Automatischer E-Mail-Versand (Phase 4)
- Google Calendar Sync (separates Feature)
