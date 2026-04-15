# GIF First-Frame Extraction + Bildkompression — Claude Code Prompt

> **Prio 2 — nach CLAUDE.md Update ausführen**
> **Framework:** RISEN
> **Datei:** lib/generate/newsletter.ts → buildImageBlocks Funktion

---

## ROLE

Du bist Senior Full-Stack-Entwickler für den Campaign Manager (Next.js 14, TypeScript, Supabase). Du fixst die Bildverarbeitung in der Newsletter-Generierungs-Pipeline.

---

## SITUATION

Aktuell werden GIFs entweder komplett an die Claude API gesendet (→ Token-Limit-Explosion bei 2-50MB GIFs) oder komplett rausgefiltert (→ Claude kann die Farbwelt des GIFs nicht sehen und der Newsletter sieht generisch aus).

Wir brauchen einen Mittelweg: Claude soll die **Farbwelt** des GIFs sehen können, aber nicht das volle GIF als Vision-Block bekommen.

---

## INSTRUCTIONS

### 1. Sharp installieren (falls noch nicht vorhanden)

```bash
npm install sharp
```

### 2. buildImageBlocks in lib/generate/newsletter.ts ersetzen

Die Funktion muss drei Dinge können:

**A) GIF First-Frame Extraction:**
- Wenn ein Asset ein GIF ist (file_type === 'image/gif' ODER file_url/file_name endet auf .gif):
  - Lade das GIF herunter
  - Extrahiere mit sharp das erste Frame: `sharp(buffer, { animated: false }).jpeg({ quality: 80 }).toBuffer()`
  - Sende dieses JPEG als Vision-Block (type: 'image', media_type: 'image/jpeg')
  - Logge: `[Vision] ${filename}: GIF first frame extracted (${originalSize}kB → ${compressedSize}kB)`

**B) Normale Bildkompression:**
- Alle Nicht-GIF-Bilder: resize auf max 800px Breite, JPEG Quality 70
- Max 300KB pro Bild nach Kompression
- Logge: `[Vision] ${filename}: ${originalSize}kB → ${compressedSize}kB`

**C) Gesamtbudget:**
- Max 1MB für alle Vision-Blöcke zusammen
- Wenn Budget erreicht: restliche Bilder überspringen mit Log-Warnung
- Die übersprungenen Bild-URLs stehen trotzdem im Text-Prompt

### 3. Text-Prompt anpassen

Im User-Prompt (wo die Asset-Informationen als Text stehen) muss bei GIFs ein Hinweis stehen:

```
Bild: [dateiname].gif (animiertes GIF — du siehst das erste Frame zur Farb- und Stilreferenz. Verwende im MJML: <mj-image src="[dateiname].gif">)
```

Damit weiß Claude:
- Es soll die Farbwelt aus dem sichtbaren Frame ableiten
- Es soll im MJML den Original-GIF-Dateinamen als src verwenden (nicht den JPEG-Frame)

### 4. ZIP-Build prüfen

Stelle sicher, dass das Original-GIF (nicht der extrahierte Frame) in die ZIP-Datei kommt. Die ZIP enthält immer die Originaldateien, nicht die komprimierten Vision-Versionen.

---

## NARROWING

- Nur `lib/generate/newsletter.ts` ändern (buildImageBlocks + Text-Prompt-Section)
- Keine Änderungen am MJML-Kompilierungsprozess
- Keine Änderungen am ZIP-Build (der nimmt weiterhin die Originale)
- Sharp ist die einzige neue Dependency
- TypeScript strict mode
- Teste mit: einem 3MB GIF, einem 5MB JPEG, und einem normalen 500KB PNG. Kein Token-Limit-Fehler, alle drei Bilder als Vision-Blöcke vorhanden, GIF-Frame als JPEG erkennbar.

---

## END GOAL

Nach der Implementierung:
1. GIFs werden hochgeladen → erstes Frame wird extrahiert → Claude sieht die Farbwelt → Newsletter-Farben passen zum GIF
2. Große Bilder werden automatisch komprimiert → kein Token-Limit-Problem mehr
3. In der fertigen ZIP liegt trotzdem das Original-GIF → Animation funktioniert im Newsletter
4. Kein manueller Workaround mehr nötig — weder GIF-Konvertierung noch Chat-Ausweichen
