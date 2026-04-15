# Newsletter Output — Regeln & Kreativität

> **Diese Regeln überschreiben widersprüchliche Angaben in Skill-Dateien.**
> Wenn eine Skill-Datei z.B. "Agentur-Logo im Header" sagt, gilt trotzdem: NUR Hersteller-Logo im Header.

---

## ZONE 1: HARTE REGELN — Verstoß = kaputtes Ergebnis

Diese Regeln gelten für JEDEN Newsletter. Keine Ausnahmen. Kein "kreatives Uminterpretieren".

### Struktur (von oben nach unten)

```
┌─────────────────────────────────────────┐
│  [HERSTELLER-LOGO]  auf #ffffff         │  ← Header: IMMER
│  [HERO-BILD]        full-width          │  ← IMMER ganz oben
├─────────────────────────────────────────┤
│                                         │
│  ~~~ KREATIVE ZONE (siehe Zone 2) ~~~   │  ← Hier darfst du gestalten
│                                         │
├─────────────────────────────────────────┤
│  [AGENTUR-LOGO]     auf #ffffff         │  ← Footer: IMMER
│  [Agentur-Name]                         │
│  [E-Mail · Telefon]                     │
│  [Straße · PLZ Stadt]                   │
│  [Abmelden | Einstellungen ändern]      │
└─────────────────────────────────────────┘
```

### Header

- **NUR** das Hersteller-Logo (160–220px, zentriert)
- Hersteller-Logo verlinkt auf Hersteller-Website (aus DB)
- Hintergrund der Logo-Section: **#ffffff** — immer, egal welches Logo
- KEIN Agentur-Logo, KEIN Agentur-Name im Header oder Body
- Direkt darunter: Hero-Bild, full-width

### Footer — Pflichtfelder (NIEMALS weglassen)

Alle folgenden Felder MÜSSEN in jedem Newsletter vorhanden sein:

1. Agentur-Logo (140–160px, zentriert, verlinkt auf Agentur-Website)
2. Agentur-Name (z.B. "Exclusive Collection")
3. Kontakt-E-Mail → **IMMER `contact_email` aus der DB, NIEMALS `order_email`**
4. Telefonnummer
5. Straße + PLZ + Stadt (z.B. "Kunaustraße 23a · 22393 Hamburg")
6. Abmelden-Link: `*|UNSUB|*`
7. Einstellungen-Link: `*|UPDATE_PROFILE|*`

Footer-Hintergrund: **#ffffff**, Text: **#999999**

### Logo-Handling

- Pro Hersteller NUR EIN Logo verwenden (Wordmark ODER Signet — nicht beides gleichzeitig)
- Alle Logos mit `href` verlinken (Hersteller → Hersteller-Website, Agentur → Agentur-Website)
- Logo-Hintergrund: **IMMER #ffffff** — auch bei hellen/weißen Logos

### CTAs

- Mindesthöhe: 44px, volle Hintergrundfarbe, **KEIN Outline-Style**
- CTA-Text MUSS die Aktion konkret benennen:
  - ✅ "Preisliste anfordern", "Einladung bestätigen", "Katalog herunterladen"
  - ❌ "Mehr erfahren", "Jetzt entdecken", "Kontakt aufnehmen"
- **Single-Topic-Mails** (ein Thema, z.B. Messeeinladung): CTA 2× einbauen — nach Hero und nach Content
- **Multi-Topic-Mails** (mehrere Produkte/Themen): Je Thema 1× CTA reicht

### Technische Pflicht

- MJML 4.x, `lang="de"`, `<mj-title>` setzen
- Breite: 640px
- Font-Import: **@import in `<mj-style>`**, NICHT `<mj-font>` (Mailchimp blockt `<link>`-Tags)
- Google Fonts **v1 API** Format: `css?family=FontName:200,300,400,500` — NICHT css2/wght@
- ZIP: Flat (keine Unterordner), alle `src`-Attribute = relative Dateinamen
- Production-HTML < 102KB (Gmail Clipping-Limit)
- Preview-HTML (signed URLs) = NUR Vorschau im Campaign Manager, NIEMALS an Mailchimp senden
- Alle Produktbilder klickbar (`href` auf Produkt- oder Aktions-URL)
- Text: Deutsch, Sie-Form

---

## ZONE 2: KREATIVE FREIHEIT — Das Mittelstück

Alles zwischen Hero-Bild und Footer ist dein gestalterischer Spielraum. **Nutze ihn.**

### Designprinzip

> Jeder Newsletter soll sich anfühlen wie ein hochwertiges Magazin — nicht wie eine Werbe-E-Mail.
> Luxus durch Reduktion, nicht durch Überladung.
> **Kein Newsletter soll aussehen wie der vorherige.** Variiere bewusst.

### Farbwelt — ABLEITEN, nicht hardcoden

Die Farbwelt kommt aus den **hochgeladenen Bildern und dem Briefing**, nicht aus einer festen Tabelle.

1. **Bilder analysieren:** Welche Stimmung transportieren die Fotos? Warm? Kühl? Erdig? Industrial?
2. **Akzentfarbe ableiten:** Eine Farbe aus der Bildwelt aufgreifen und als Akzent nutzen (Linien, Buttons, Sublines). Sparsam — ein Akzent, nicht drei.
3. **Hintergrund:** Weiß (#ffffff) oder warme Hellgrau-Töne (#efede8, #f5f3ef) als Basis. Dunkle Sektionen (Anthrazit, Charcoal) sind als Kontrast-Blöcke erlaubt und erwünscht — z.B. für einen CTA oder ein Zitat-Element.
4. **Text:** Dunkelgrau (#1a1a1a, #2c2c2c) — kein reines Schwarz (#000000)

Falls die Bildwelt keine klare Richtung gibt, hier eine Orientierung:

| Stimmung | Akzent-Vorschlag | Passt zu |
|---|---|---|
| Warm, Holz, Outdoor | Gold #b8953e | Tuuci, Röthlisberger |
| Kühl, Stein, Bad | Anthrazit #3a3a3a | Boffi, Salvatori, Arclinea |
| Natur, Garten | Olive #6b7c5e | Gartenmöbel, natürliche Materialien |
| Licht, Leuchten | Schieferblau #5a6e7f | Lodes, Terzani, Marset |
| Interior, Stoffe | Weinrot #7a3b3b | Baxter, Maxalto |
| Neutral, Allrounder | Taupe #8c7e6e | DePadova, B&B Italia |

**Diese Tabelle ist ein Vorschlag, kein Zwang.** Wenn die Bilder eine andere Farbe nahelegen — nimm die.

### Typografie — Montserrat als Sicherheitsnetz, nicht als Pflicht

**Default:** Montserrat (ExtraLight 200, Light 300, Regular 400, Medium 500)

**Erlaubt und erwünscht:** Wenn eine andere Schrift besser zur Marke passt, darf gewechselt werden.

Voraussetzungen für einen Font-Wechsel:
- Font muss auf Google Fonts verfügbar sein (v1 API Kompatibilität)
- Font muss in E-Mail-Clients halbwegs funktionieren (Fallback-Stack angeben)
- Entscheidung im Briefing oder aus der Bildwelt begründbar

Beispiele:
- Salvatori (Stein, Handwerk) → Cormorant Garamond oder Playfair Display für Headlines
- Lodes (Licht, Architektur) → DM Sans oder Inter für eine cleanere Anmutung
- Tuuci (Outdoor, Miami) → Montserrat passt hier gut, bleibt

**Wenn unsicher: Montserrat nehmen.** Es funktioniert immer.

Font-Stack immer mit Fallbacks:
```
'[Gewählte Font]', 'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif
```

### Layout-Varianten — variiere aktiv

Wähle das Layout basierend auf Anzahl der Bilder, Art des Contents und Stimmung:

| Layout | Wann nutzen |
|---|---|
| **Alternierende Zweispalter** (Bild links ↔ rechts) | 3+ Produktbilder, klassische Produktvorstellung |
| **Einspalter editorial** | Wenig Bilder, langer Text, Storytelling, Einladungen |
| **Full-Width Bilder** zwischen Textsektionen | Starke Bildsprache, atmosphärisch, Events |
| **Drei-Spalter** | Produktvergleiche, Kollektion-Übersichten, Feature-Grids |
| **Dunkle Kontrast-Sektion** | Einzelner CTA hervorheben, Zitat, Highlight |
| **Bildergalerie** | Messe-Recap, Event-Fotos, viele Bilder ohne viel Text |

**Nicht immer das gleiche Layout nehmen.** Wenn der letzte Salvatori-Newsletter alternierende Zweispalter hatte, mach den nächsten als Einspalter mit Full-Width-Bildern.

Für Zweispalter:
- Bilder IMMER zentriert innerhalb der Spalte (`align="center"`)
- `vertical-align="middle"` auf BEIDE Spalten

### Text-Richtlinien — nah am Original, human gemacht

- Textentwurf vom User als Basis nehmen — NICHT komplett umschreiben
- Zielgruppe: Architekten, Designer, Hotellerie (35–65 J.) — die kennen sich aus
- Rhythmus variieren: kurze Sätze nach langen
- Konkret statt vage: Was kann das Produkt? Wo wird es eingesetzt?
- Haltung zeigen: "Genau das ist der Punkt." > "Dies unterstreicht die Vielseitigkeit."

**Vermeide (Anti-AI-Filter):**
- Aufgeblasene Bedeutung ("gestalterisches Statement", "konstruktive Exzellenz")
- Werbephrasen ("Entdecken Sie", "Lassen Sie sich inspirieren")
- Rule of Three ("elegant, funktional und zeitlos")
- Superlative ohne Substanz ("einzigartig", "unvergleichlich")

---

## ZONE 3: TECHNISCHE PIPELINE — Bildverarbeitung & GIFs

### GIF-Handling

GIFs sind in der Luxusmöbel-Branche ein wichtiges Stilmittel (Produktanimationen, Lichteffekte, Materialtexturen).

**Problem:** GIFs können 2–50MB groß sein → als Base64 Vision-Block an die Claude API = Token-Limit-Explosion.

**Lösung — Dual-Path:**

1. **Vision (Claude API):** GIFs NICHT als Vision-Block senden. Stattdessen:
   - Erste Frame des GIFs als JPEG extrahieren (mit `sharp`: `sharp(gifBuffer).jpeg({ quality: 80 }).toBuffer()`)
   - Diese JPEG-Version als Vision-Block senden → Claude SIEHT die Farbwelt und Stimmung
   - Im Text-Prompt vermerken: "Das Bild [Dateiname].gif ist ein animiertes GIF. Du siehst hier das erste Frame zur Farb- und Stilreferenz."

2. **Output (MJML + ZIP):** Das Original-GIF als `<mj-image src="[dateiname].gif">` ins MJML schreiben und als Datei in die ZIP legen. So landet die Animation im fertigen Newsletter.

**Ergebnis:** Claude kann die Farbwelt ableiten UND das GIF wird korrekt eingebunden.

### Bildkompression für Vision-Blocks

Alle Bilder (außer GIFs, die den First-Frame-Path nehmen) vor dem Base64-Encoding komprimieren:

- Max. 800px Breite (`sharp().resize({ width: 800, withoutEnlargement: true })`)
- JPEG Quality 70
- Max. 300KB pro Bild
- Max. 1MB Gesamtbudget für alle Vision-Blöcke
- Bei Budget-Überschreitung: restliche Bilder überspringen (die URLs stehen trotzdem im Text-Prompt)

### Postkarten-Referenz

Wenn eine verknüpfte Postkarte existiert:
- Deren Bilder analysieren (Farben, Stil, Stimmung)
- Newsletter MUSS visuell zur Postkarte passen
- Akzentfarbe der Postkarte übernehmen

---

## Qualitätsprüfung (intern, nicht ausgeben)

Vor dem Absenden intern prüfen:

**Struktur:**
- [ ] Hersteller-Logo im Header? (160–220px, klickbar, auf #ffffff)
- [ ] Hero-Bild direkt nach Header?
- [ ] Agentur-Logo im Footer? (140–160px, klickbar, auf #ffffff)
- [ ] Footer: Name + contact_email + Telefon + Straße/PLZ/Stadt + Abmelden?
- [ ] Kein Agentur-Logo/-Name außerhalb des Footers?

**CTAs:**
- [ ] Single-Topic: CTA 2× vorhanden?
- [ ] Alle CTAs mit finalen Links (keine Platzhalter)?
- [ ] CTA-Text konkret und spezifisch?
- [ ] Button-Stil: volle Hintergrundfarbe, kein Outline?

**Technik:**
- [ ] Alle `src`-Attribute = relative Dateinamen?
- [ ] Font via @import in mj-style (nicht mj-font)?
- [ ] Google Fonts v1 API Format?
- [ ] Nur EIN Logo-File pro Hersteller?
- [ ] Production-HTML < 102KB?

**Kreativität:**
- [ ] Farbwelt aus Bildern abgeleitet, nicht aus Default-Tabelle kopiert?
- [ ] Layout-Variante bewusst gewählt und zur Content-Art passend?
- [ ] Sieht dieser Newsletter anders aus als ein typischer Standard-Newsletter?
