# UI Style Guide — Campaign Manager

Modernized look for the dark-luxury Campaign Manager. This is the single source of
truth for visual treatment across the app. It exists so the UI stays consistent and
so inexperienced colleagues find the tool clear and easy to use.

> **Golden rule:** these are **presentational** changes only. Never change behaviour,
> data flow, logic, props, state, hooks, event handlers, server actions, fetching, or
> the `'use client'` directive. If you can't restyle something without touching logic,
> leave the logic exactly as-is.

---

## 1. Design tokens (use the Tailwind class, never hard-coded hex)

| Purpose | Tailwind class |
|---|---|
| Page background | `bg-background` |
| Card / panel surface | `bg-surface` |
| Elevated surface (modals, popovers, card-on-card) | `bg-surface-2` |
| Hover/active fill on interactive surfaces | `bg-surface-hover` |
| Hairline border / divider | `border-border` |
| Stronger border (hover, emphasis) | `border-border-strong` |
| Primary text | `text-text-primary` |
| Secondary / meta / labels | `text-text-secondary` |
| Warm accent (primary actions, active state) | `accent-warm` |
| Gold accent (premium badges) | `accent-gold` |
| Success | `success` · Warning/danger | `warning` |

**Replace hard-coded hex with tokens.** e.g. `bg-[#1A1A1A]` → `bg-surface`,
`text-[#999999]` → `text-text-secondary`, `border-[#2A2A2A]` → `border-border`,
`bg-[#EDE8E3]` → `bg-accent-warm`, `text-[#C4A87C]` → `text-accent-gold`,
`text-[#2E7D32]` → `text-success`, `text-[#E65100]` → `text-warning`.
This keeps light-mode working automatically. (Performance components that encode
data-meaning in color may keep specific hexes if a token doesn't fit — but prefer tokens.)

---

## 2. Border radius (the headline change — "more rounded corners")

Replace the old uniform `rounded-sm` (2px) with contextual radii:

| Element | Radius |
|---|---|
| Cards, panels, modals, large surfaces | `rounded-2xl` (16px) |
| Inputs, selects, textareas, buttons, dropdowns, segmented controls | `rounded-xl` (12px) |
| Small controls, tiny buttons, icon buttons, inline chips | `rounded-lg` (8px) |
| Pills, status badges, dots, avatars, toggles | `rounded-full` |

There should be **no `rounded-sm` or `rounded-none` left** unless a square is truly intended.

---

## 3. Depth & shadows

Dark mode is mostly flat by design; add depth sparingly:
- **Modals / popovers / dropdowns:** `bg-surface-2` + `shadow-elevated` (they float over a dimmed backdrop).
- **Cards that should lift on hover:** add `.card-interactive` (border + fill transition). Optional `hover:shadow-card`.
- Don't put shadows on everything — most page cards stay flat with just a border.

---

## 4. Typography

- Body/UI is **Inter** (`font-sans`, already the default — you don't need to set it).
- **`font-display`** (Fraunces serif) is for prominence only: **page H1 titles, the brand
  wordmark, and large KPI/stat figures.** Never use it for body text, labels, table cells, or buttons.
- Stop using thin `font-light` for headings — it reads weak. Page titles use the
  `.page-title` class; section eyebrows use `.section-title`.
- Hierarchy through size/weight/color, not all three at once. De-emphasize labels
  (small, uppercase, `text-text-secondary`); emphasize values.

---

## 5. Shared component classes (prefer these over re-inventing)

Defined in `app/globals.css`. Use them; add layout utilities (flex/grid/gap/spacing) around them.

| Class | Use for |
|---|---|
| `.card` | a panel/card surface (`bg-surface border rounded-2xl`). Add `p-6` for padding. |
| `.card-interactive` | add to a `.card` that is clickable/hoverable |
| `.field-label` | the small uppercase label above a form field |
| `.field-input` | text inputs, selects, textareas (rounded-xl, focus ring) |
| `.btn-primary` | the one main action (filled warm). Max one per view/section. |
| `.btn-secondary` | secondary action (outline) — e.g. Cancel |
| `.btn-ghost` | tertiary/low-emphasis action, icon+text in toolbars |
| `.badge` | status pills / meta chips (rounded-full) |
| `.page-title` | the page `<h1>` (Fraunces, semibold) |
| `.section-title` | small uppercase eyebrow above a section |

You may extend a component class with extra utilities, e.g. `className="btn-primary w-full"`.

---

## 6. Icons

- Library is **lucide-react** (already a dependency) — import what you need.
- Sizes: inline-with-text `size={16}`, buttons `size={16-18}`, section/feature `size={20-24}`,
  empty-state illustration `size={28-40}`. `strokeWidth={1.75}` is the default; `2` for active/emphasis.
- **Every icon-only button must have a `title` and `aria-label`** so beginners (and screen
  readers) know what it does. Where a text label fits, prefer **icon + text** over icon alone.
- Replace any emoji or text-glyph "icons" (e.g. `×`, `→`, `•` used as UI) with lucide icons
  (`X`, `ArrowRight`, etc.) where it reads as a control.

---

## 7. Spacing & whitespace ("more breathing room")

- Use the scale only: `1`(4) `2`(8) `3`(12) `4`(16) `5`(20) `6`(24) `8`(32) `10`(40) `12`(48).
- Page content padding: `p-8` minimum, `p-10`/`p-12` on wide pages. Currently many use `p-8` — good; don't reduce.
- Group spacing > inner spacing: `gap-6`/`gap-8` between sections, `gap-2`/`gap-3` within a group.
- Constrain forms to `max-w-lg`/`max-w-xl`; text blocks to `max-w-prose`. Don't stretch full-width.
- Card padding `p-5`/`p-6` (not less). Add vertical rhythm between page sections (`mb-8`/`space-y-8`).

---

## 8. Beginner-friendly UX (the most important goal)

Make every page self-explanatory for someone who has never used the tool:

1. **Page header pattern** — every page starts with a clear header:
   ```tsx
   <div className="mb-8">
     <h1 className="page-title">Hersteller</h1>
     <p className="mt-1.5 text-sm text-text-secondary">
       Alle Marken und ihre Kampagnen-Einstellungen verwalten.
     </p>
   </div>
   ```
   Add a **one-line description** that says what the page is for (German, neutral tone matching
   the existing copy — NOT customer "Sie"-form). Keep it short and concrete.

2. **Primary action is obvious** — the main "create/add" action is a `.btn-primary` with an
   icon + clear label (e.g. `<Plus/> Neue Agentur`), placed top-right of the header.

3. **Empty states guide the user** — replace bare "Noch keine X" text with a friendly block:
   centered, a muted lucide icon, a short line of what's missing, and a primary action to fix it.
   ```tsx
   <div className="flex flex-col items-center justify-center text-center py-16 px-6">
     <Inbox size={32} className="text-text-secondary/50 mb-4" strokeWidth={1.5} />
     <p className="text-text-primary text-sm font-medium">Noch keine Kampagnen geplant</p>
     <p className="text-text-secondary text-sm mt-1 max-w-sm">Lege deine erste Kampagne an, um sie hier zu sehen.</p>
     {/* keep/route to the existing action if one exists */}
   </div>
   ```

4. **Tooltips & labels** — icon-only buttons get `title` + `aria-label`. Status badges keep their
   text. Don't rely on color alone to convey meaning.

5. **Helper text** — keep existing helper hints; add a short hint under non-obvious fields.

6. **States** — preserve existing loading spinners/disabled states; keep destructive actions
   behind their existing confirm step. Buttons show a clear disabled style (already in the classes).

Keep all copy in **German**, matching the existing neutral/informal tone. Do not translate or
restructure existing labels — only add brief, helpful descriptions/empty-state copy.

---

## 9. HARD RULES (do / don't)

**DO**
- Only change `className`, inline `style`→`className`, JSX wrappers for layout, icons, and
  helpful copy additions (page descriptions, empty-state text, tooltips).
- Keep the file's `'use client'` / server-component nature exactly as it is.
- Keep every prop, hook, state variable, handler, server action call, `key`, `ref`,
  `aria-*`, form `name`, and data binding identical.
- Convert inline `style={{…}}` (e.g. in `LoginForm.tsx`, `login/page.tsx`) to Tailwind classes
  using the tokens above, preserving exact behaviour (focus handlers can be replaced by
  `focus:` classes only if the visual result matches).
- Run a mental check: "If I removed all my changes' logic impact, is it zero?" It must be.

**DON'T**
- Don't rename components, change exports, props interfaces, or function signatures.
- Don't add new dependencies (lucide-react and the fonts are already available).
- Don't change German wording of existing labels/buttons, routes, or data.
- Don't introduce new client/server boundary changes, `useEffect`, or data fetching.
- Don't remove `title`/`aria`/`name`/`type` attributes or form semantics.
- Don't touch: `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`,
  `components/ThemeProvider.tsx` (already done — the design system).

---

## 10. Quick before → after

```tsx
// Card
- <div className="bg-surface border border-border rounded-sm p-6">
+ <div className="card p-6">

// Stat / KPI number
- <p className="text-3xl font-light text-text-primary">{value}</p>
+ <p className="font-display text-3xl font-semibold text-text-primary">{value}</p>

// Input + label
- <label className="block text-xs tracking-wider uppercase text-text-secondary mb-2">Name</label>
- <input className="w-full bg-surface border border-border ... rounded-sm ..." />
+ <label className="field-label">Name</label>
+ <input className="field-input" />

// Primary button
- <button className="bg-accent-warm text-background text-sm font-medium px-6 py-2.5 rounded-sm hover:bg-white ...">Speichern</button>
+ <button className="btn-primary"><Save size={16}/> Speichern</button>

// Secondary / cancel
- <button className="text-sm text-text-secondary hover:text-text-primary px-4 py-2.5">Abbrechen</button>
+ <button className="btn-secondary">Abbrechen</button>

// Status pill
- <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-accent-warm">{status}</span>
+ <span className="badge text-accent-warm">{status}</span>

// Modal panel
- <div className="... bg-surface border border-border rounded-sm shadow-2xl">
+ <div className="... bg-surface-2 border border-border rounded-2xl shadow-elevated">

// Icon-only button (add tooltip + a11y)
- <button onClick={…}><Pencil size={13} /></button>
+ <button onClick={…} title="Bearbeiten" aria-label="Bearbeiten" className="btn-ghost p-2"><Pencil size={16} /></button>
```
