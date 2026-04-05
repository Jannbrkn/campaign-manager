---
name: newsletter-generator
description: >
  Create production-ready email newsletters for luxury furniture brands.
  Works for any agency (Collezioni, Exclusive Collection, Design Collection, EMQuadrat, vondomani)
  and any manufacturer they represent. Use this skill whenever generating a newsletter
  via the Campaign Manager API or when the user asks to create a newsletter for any
  luxury furniture brand. Handles briefing validation, design, copywriting, MJML compilation,
  and Mailchimp-ready ZIP export.
---

# Newsletter Generator — Luxusmöbel-Agenturen

Build versandfertige Produkt-Newsletter für Luxusmöbelmarken. Output ist immer auf Deutsch.

**Dynamische Absender:** Die Agentur-Daten (Name, Logo, Adresse, Mail, Telefon) werden pro Kampagne übergeben.
**Marken:** Alle Hersteller der fünf Agenturen — Boffi, DePadova, B&B Italia, Tuuci, Salvatori, Lodes, Magis, Arclinea, Terzani, Marset, Maxalto, Baxter, Arflex, Promemoria, Barovier & Toso, Röthlisberger, ADL und weitere.

---

## Erwarteter Input

Wenn dieser Skill über die API aufgerufen wird, werden folgende Daten übergeben:

```
AGENTUR:
- Name: [z.B. "Exclusive Collection"]
- Logo-URL: [Supabase Storage URL]
- Adresse: [Volle Postanschrift]
- E-Mail: [z.B. "order@exclusive-collection.eu"]
- Telefon: [z.B. "+49 40 123456"]

HERSTELLER:
- Name: [z.B. "Salvatori"]
- Kategorie: [z.B. "Bad/Fliesen"]
- Logo-URL: [wenn vorhanden]

KAMPAGNE:
- Titel: [z.B. "Salvatori Home Collection Herbst 2026"]
- Textentwurf: [Rohtexte vom User oder Hersteller]
- Bilder: [Liste der hochgeladenen Bild-URLs]
- Links: [Produkt-URLs, CTA-Links]
- Postkarten-Referenz: [wenn vorhanden — Newsletter muss im gleichen Style sein]
```

---

## Workflow

### Schritt 1: Briefing prüfen — IMMER zuerst

Bevor du irgendetwas baust, prüfe ob folgende Infos vorhanden sind:

| Pflichtfeld | Was wird gebraucht | Wenn fehlt |
|---|---|---|
| Agentur-Daten | Name, Logo, Adresse, Mail, Telefon | Aus Datenbank laden — darf nie fehlen |
| Hersteller | Name + Logo (als Upload oder URL) | Nachfragen |
| Produkt/Thema | Was wird vorgestellt | Nachfragen |
| Textentwurf | Rohentwurf oder Stichpunkte | Nachfragen |
| Bilder | Mind. 1 Hero + 1–2 Detail (als Upload) | Nachfragen |
| Links | Produkt-URL, alle CTA-Links | Nachfragen — NICHT mit Platzhaltern bauen |

**Frage nach fehlenden Infos, bevor du baust.** Besonders Links — ohne Links ist der Newsletter nicht versandfertig. Wenn trotzdem gebaut werden soll, markiere fehlende Links im Output klar mit ⚠️.

### Schritt 2: Postkarten-Check

Wenn eine verknüpfte Postkarte existiert:
- Analysiere deren Farben, Layout-Stil und Bildsprache
- Der Newsletter MUSS visuell zur Postkarte passen
- Übernimm die Akzentfarbe der Postkarte

### Schritt 3: Design-Entscheidung treffen

Erkläre in 1–2 Sätzen deine Wahl zu Akzentfarbe und Layout, BEVOR du Code schreibst.

Beispiel: *„Für Tuuci nehme ich Gold (#b8953e) als Akzent — passt zur Miami-Herkunft und Outdoor-Wertigkeit. Layout: Alternierende Zweispalter, weil drei Bilder vorhanden sind."*

Die Akzentfarbe soll zur Marke und Kategorie passen:

| Stimmung | Farbe | Hex | Passt zu |
|---|---|---|---|
| Warm, klassisch | Gold | #b8953e | Outdoor, Holz, traditionelle Marken (Tuuci, Röthlisberger) |
| Kühl, modern | Anthrazit | #3a3a3a | Küchen, Bäder, Minimalismus (Arclinea, Salvatori, Boffi) |
| Natur, ruhig | Olive | #6b7c5e | Gartenmöbel, natürliche Materialien |
| Maritim, frisch | Gedämpftes Blau | #4a6d8c | Outdoor, Poolbereich |
| Elegant, warm | Weinrot | #7a3b3b | Interior, Stoffe, Events (Baxter, Maxalto) |
| Neutral, edel | Taupe | #8c7e6e | Allrounder, Messen, Kollektionen (DePadova, B&B Italia) |
| Licht, modern | Schieferblau | #5a6e7f | Leuchten, Lichtdesign (Lodes, Terzani, Marset) |
| Objekt, klar | Dunkelblau | #2c3e50 | Objektmöbel, Vertragsmöbel (Magis) |
| Luxus, opulent | Dunkles Gold | #9a7b4f | Fancy Leuchten, Kristall (Barovier & Toso) |

### Schritt 4: Texte humanisieren

Nimm den Textentwurf als Basis. Nicht komplett umschreiben — nah am Original bleiben, aber humanisieren.

**Zielgruppe & Ton:**
- Deutsch, Sie-Form
- Professionell, nicht steif
- Sachlich, mit Haltung
- Die Zielgruppe (Architekten, Designer, Hotellerie) kennt sich aus — nicht erklären, nicht beeindrucken, informieren

**Vermeide:**
- Aufgeblasene Bedeutung („gestalterisches Statement", „konstruktive Exzellenz")
- Werbephrasen („Entdecken Sie", „Lassen Sie sich inspirieren", „Erleben Sie")
- Rule of Three („elegant, funktional und zeitlos")
- Superlative ohne Substanz („einzigartig", „unvergleichlich")
- Passive Konstruktionen und Nominalstil

**Stattdessen:**
- Rhythmus variieren. Kurze Sätze nach langen.
- Konkret statt vage. Was kann das Produkt? Wo wird es eingesetzt?
- Haltung zeigen. „Genau das ist der Punkt."
- Sachliche Wärme. Nicht kalt, nicht übertrieben.

**CTA-Texte — konkret benennen:**
- ✅ „Preisliste herunterladen", „Termin vereinbaren", „Einladung bestätigen"
- ❌ „Mehr erfahren", „Jetzt entdecken", „Kontakt aufnehmen"

### Schritt 5: MJML bauen, kompilieren, ZIP erstellen

#### MJML-Grundregeln
1. MJML 4.x, `lang="de"` auf Root-Tag
2. 640px Breite
3. `alt`-Attribut auf jedem `<mj-image>`
4. `<mj-title>` setzen

#### Font-Import — KRITISCH
**NIEMALS `<mj-font>` verwenden.** Mailchimp blockt die resultierenden `<link>`-Tags.

```xml
<mj-style>
  @import url('https://fonts.googleapis.com/css?family=Montserrat:200,300,400,500,600');
</mj-style>
```

Auch die CSS2-API (`css2?family=...wght@200;300`) wird von Mailchimp NICHT akzeptiert. Nur das v1-Format.

**Font-Stack:**
```xml
<mj-attributes>
  <mj-all font-family="'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" />
</mj-attributes>
```

#### Typografie

| Element | Gewicht | Größe | Extras |
|---|---|---|---|
| Headlines | ExtraLight/Light (200–300) | 28–34px | Versalien, Laufweite 4–6px |
| Sub-Headlines | Light (300) | 12–13px | Versalien, Laufweite 3px |
| Fließtext | Light (300) | 14px | Zeilenhöhe 1.85 |
| Buttons | Medium (500) | 10–11px | Versalien, Laufweite 2.5px |
| Footer | Light (300) | 9–10px | Hellgrau |

#### Layout-Regeln
- Hero-Bild: Full-Width, ganz oben nach der Topbar
- Alle Produktbilder MÜSSEN klickbar sein (`href` auf Produkt-URL)
- Alle CTA-Buttons MÜSSEN auf angegebene Links zeigen
- CTAs kontextuell eingebettet — neben dem passenden Inhalt, NICHT als Block am Ende

#### Logo-Platzierung — DYNAMISCH

| Logo | Position | Breite |
|---|---|---|
| **Agentur-Logo** | Header (oben, zentriert) | 200–220px |
| Hersteller-Logo | Über der Headline, nach dem Hero | 120–160px |
| **Agentur-Logo** | Closing (unter Signatur) | 140–160px |

#### Footer — DYNAMISCH

Der Footer MUSS die Agentur-Daten enthalten:
```
[Agentur-Name]
[Agentur-Adresse]
[Agentur-Telefon] · [Agentur-Mail]
```

Plus Mailchimp-Merge-Tags:
```html
<a href="*|UNSUB|*">Abmelden</a>
<a href="*|UPDATE_PROFILE|*">Einstellungen ändern</a>
```

#### Kompilierung

```bash
npx mjml newsletter.mjml -o newsletter.html --config.minify=true --config.validationLevel=strict
```

#### ZIP erstellen — FLACH, keine Unterordner

1. HTML mit relativen Bild-Pfaden
2. Alle Bilder im selben Ordner wie HTML
3. ZIP mit `-j` Flag: `zip -j newsletter.zip build-folder/*`
4. Dateinamen im HTML müssen exakt den ZIP-Dateinamen entsprechen

#### Preview erstellen

HTML mit Base64-eingebetteten Bildern für lokale Vorschau.
**NIEMALS in Mailchimp hochladen** — nur zur Ansicht.

### Schritt 6: Checkliste + Subject Lines

Nach dem Bauen IMMER auflisten:

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

Schlage 2–3 Subject-Line-Varianten mit Preview-Text vor. Mit kurzer Begründung und einer klaren Empfehlung.

---

## Output-Dateien

| Datei | Zweck |
|---|---|
| `newsletter.mjml` | Editierbare Quelle |
| `newsletter.html` | Kompiliertes HTML |
| `newsletter-preview.html` | Preview mit Base64-Bildern |
| **`newsletter.zip`** | **Primärer Output** — Mailchimp-ready ZIP |

**Die ZIP ist das Wichtigste.** Import in Mailchimp: Saved Templates → Create Template → Code your own → Import ZIP.

---

## Zielgruppe

- **Alter:** 35–60 Jahre
- **Rollen:** Architekten, Interior Designer, Hoteldirektoren, gehobene Privatkunden, Fachhandelspartner
- **Erwartung:** Erkennen Qualität sofort. Generische Werbung wird ignoriert. Newsletter muss wirken wie eine persönliche Einladung.
- **Sprache:** Deutsch, Sie-Form. Professionell, nicht steif. Sachlich, mit Haltung.

---

## Design-Grundprinzip

Das Design muss eine Emotion auslösen. Es soll sich anfühlen wie ein hochwertiges Magazin, nicht wie eine Werbe-E-Mail. Luxus durch Reduktion — nicht durch Überladung.

**Sei kreativ.** Jeder Newsletter darf anders aussehen. Wähle Design passend zu Marke und Anlass.

### Farbwelt
- Haupthintergrund: Weiß (#ffffff) und warme Hellgrau-Töne (#efede8, #f5f3ef)
- Text: Dunkelgrau (#1a1a1a, #2c2c2c) — kein reines Schwarz
- Akzentfarbe: variabel, passend zur Marke (siehe Tabelle oben)
- Akzente sparsam einsetzen: Linien, Sublines, Buttons

### Layout-Varianten
- Alternierende Zweispalter — Standard für 3+ Bilder
- Einspalter — editorial, wenig Bilder oder langer Text
- Full-Width Bilder zwischen Textsektionen — atmosphärisch
- Drei-Spalter — Produktvergleiche, Kollektion-Übersichten
- Dunkle Sektionen als Kontrast — z.B. Anthrazit-Block für CTA

---

## Bekannte Mailchimp-Fehler

| Fehler | Ursache | Lösung |
|---|---|---|
| „Cannot find CSS file..." | `<mj-font>` erzeugt `<link>` Tag | `@import` in `<mj-style>` nutzen |
| „Encoded images will not display" | Base64-Bilder im HTML | Preview-Datei hochgeladen statt ZIP |
| „Email at high risk of being clipped" | Preview-Datei hochgeladen (Base64 = riesig) | ZIP nutzen |
| Bilder erscheinen nicht | Platzhalter-URLs nicht ersetzt | ZIP-Import nutzen |
