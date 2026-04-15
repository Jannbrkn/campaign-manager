# Campaign Manager — Upgrade-Plan (Prioritätenliste)

Benutze Claude Code im **Planmode** und arbeite diese Liste Schritt für Schritt ab.

---

## Prio 1: CLAUDE.md updaten ✍️
**Datei:** `CLAUDE_MD_Newsletter_Update.md` (heruntergeladen)
**Was tun:** Öffne CLAUDE.md im Projekt. Füge den kompletten Inhalt der heruntergeladenen Datei als neuen Abschnitt ein. Wenn es bereits einen Newsletter-Abschnitt gibt, ersetze ihn komplett.
**Warum zuerst:** Claude Code liest CLAUDE.md bei JEDER Session. Alle nachfolgenden Schritte profitieren von den neuen Regeln.

**Prompt für Claude Code:**
```
Öffne die CLAUDE.md. Ersetze den bestehenden Newsletter-Abschnitt (oder füge einen neuen ein) mit dem Inhalt aus der Datei CLAUDE_MD_Newsletter_Update.md. Achte darauf, dass keine alten widersprüchlichen Regeln stehen bleiben (z.B. "Agentur-Logo im Header").
```

---

## Prio 2: GIF First-Frame + Bildkompression 🖼️
**Datei:** `PROMPT_GIF_FirstFrame_Fix.md` (heruntergeladen)
**Was tun:** Den Prompt 1:1 an Claude Code geben.
**Warum:** Ohne diesen Fix kannst du keine GIFs hochladen ohne Token-Fehler, und Claude kann die Farbwelt von GIFs nicht ableiten.

---

## ~~Prio 3: Newsletter-Generator Skill korrigieren~~ ✅ ERLEDIGT
Logo-Platzierung in Skill-Datei, newsletter-prompt.ts, Spec- und Plan-Docs korrigiert.
Hersteller-Logo im Header (160–220px, auf #ffffff), Agentur-Logo NUR im Footer (140–160px, auf #ffffff).

---

## Prio 4: newsletter-prompt.ts Kreativität einbauen 🎨
**Datei:** `lib/generate/newsletter-prompt.ts`
**Was tun:** Den System-Prompt der an die Claude API geht so anpassen, dass die kreativen Freiheiten aus Zone 2 (CLAUDE.md) auch im API-Prompt ankommen.

**Prompt für Claude Code:**
```
Öffne lib/generate/newsletter-prompt.ts. Dieser Prompt geht als System-Prompt an die Claude API für Newsletter-Generierung. Passe ihn an die neuen Regeln aus CLAUDE.md an:

1. Farbwelt: Statt fester Farbzuordnungen → "Leite die Farbwelt aus den hochgeladenen Bildern ab. Die Tabelle ist nur ein Fallback."
2. Typografie: Statt "immer Montserrat" → "Montserrat ist der Default. Wenn eine andere Google Font besser zur Marke passt, darfst du wechseln. Fallback-Stack immer angeben."
3. Layout: Statt immer gleichem Aufbau → "Variiere das Layout im Mittelteil aktiv. Nicht immer alternierende Zweispalter. Wähle basierend auf Bildanzahl und Content-Art."
4. Logo-Regeln: Stelle sicher, dass der Prompt klar sagt: NUR Hersteller-Logo im Header, Agentur-Logo NUR im Footer.
5. Kreativitäts-Check: Füge am Ende des Prompts hinzu: "Bevor du das MJML finalisierst, frage dich: Sieht dieser Newsletter anders aus als ein Standard-Template? Wenn nicht — ändere etwas."
```

---

## Prio 5: Size Guard implementieren 🛡️
**Datei:** `PROMPT_Mailchimp_Size_Guard.md` (bereits im Projekt)
**Was tun:** Den bestehenden Prompt an Claude Code geben.
**Warum:** Verhindert, dass Preview-HTML oder zu große Dateien an Mailchimp gehen.

---

## Prio 6: Campaign Manager Preview fixen 👁️
**Was tun:** buildPreview so anpassen, dass relative Dateinamen durch signed Supabase URLs ersetzt werden.

**Prompt für Claude Code:**
```
Die Newsletter-Preview im Campaign Manager zeigt Broken-Image-Icons. Grund: buildPreview kann relative Dateinamen wie "hero.jpg" nicht auflösen.

Fix: In buildPreview alle relativen src-Attribute durch signed Supabase URLs der campaign_assets ersetzen. Matche den Dateinamen im src mit dem file_name der Assets. Signed URL Dauer: 1 Stunde.
```

---

## Abschluss-Test nach allen Prios

Erstelle einen Test-Newsletter mit folgenden Bedingungen:
1. Ein GIF als Hero (z.B. Produktanimation)
2. 2-3 normale Produktbilder
3. Briefing mit konkretem Thema und Links

Prüfe:
- [ ] Kein Token-Limit-Fehler
- [ ] Farbwelt passt zum GIF/Bildern (nicht generisch)
- [ ] Layout ist NICHT der Standard-Zweispalter
- [ ] Footer komplett (alle Pflichtfelder)
- [ ] Header = nur Hersteller-Logo auf weiß
- [ ] ZIP < 102KB (Production-HTML)
- [ ] Preview zeigt Bilder korrekt an
