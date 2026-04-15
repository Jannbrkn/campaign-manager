# Mailchimp Size Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block oversized, Base64-containing, or malformed HTML from ever reaching Mailchimp by running a validation gate in the ZIP-export pipeline and in the Mailchimp upload route.

**Architecture:** A pure `validateNewsletterHtml(html, filename?)` utility in `lib/mailchimp/size-guard.ts` is called (1) in `buildZip` before returning, and (2) in `app/api/send/mailchimp/route.ts` before the API PUT. The Mailchimp route is also fixed to build production HTML from stored MJML + fresh signed image URLs (replacing the current bug where the Base64 preview is uploaded instead).

**Tech Stack:** Next.js 14, TypeScript, Node.js built-ins (`node:test`, `node:assert`), existing `mjml` and `@supabase/supabase-js` packages.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/mailchimp/size-guard.ts` | **Create** | Pure validation utility — no I/O, no side effects |
| `lib/mailchimp/size-guard.test.ts` | **Create** | 5 unit tests using `node:test` + `node:assert` |
| `lib/generate/newsletter.ts` | **Modify** | Call guard in `buildZip`, surface errors + warnings |
| `app/api/send/mailchimp/route.ts` | **Modify** | Fix HTML source (MJML → production HTML), call guard |
| `package.json` | **Modify** | Add `"test"` script |

---

## Task 1: Create the size-guard utility

**Files:**
- Create: `lib/mailchimp/size-guard.ts`

- [ ] **Step 1: Write the file**

```typescript
// lib/mailchimp/size-guard.ts
// Pure validation — no I/O, no side effects.

export interface SizeGuardResult {
  passed: boolean
  htmlSizeKB: number
  warnings: string[]
  errors: string[]
  details: {
    hasBase64Images: boolean
    base64Count: number
    imgTags: number
    unresolvedUrls: string[]
    mailchimpCdnUrls: number
  }
}

const GMAIL_CLIP_KB = 102
const GMAIL_WARN_KB = 80
const MAILCHIMP_CDN = ['mcusercontent.com', 'gallery.mailchimp.com']

export function validateNewsletterHtml(html: string, filename?: string): SizeGuardResult {
  const warnings: string[] = []
  const errors: string[] = []

  // 1. Size check
  const htmlSizeKB = Buffer.byteLength(html, 'utf8') / 1024

  if (htmlSizeKB > GMAIL_CLIP_KB) {
    errors.push(
      `HTML ist ${htmlSizeKB.toFixed(1)}kB groß und überschreitet das Gmail-Limit von ${GMAIL_CLIP_KB}kB. ` +
      `Mails über diesem Limit werden in Gmail abgeschnitten. Bilder müssen als externe URLs eingebunden sein, nicht inline.`
    )
  } else if (htmlSizeKB > GMAIL_WARN_KB) {
    warnings.push(`HTML ist ${htmlSizeKB.toFixed(1)}kB — knapp unter dem Gmail-Clipping-Limit von ${GMAIL_CLIP_KB}kB.`)
  }

  // 2. Base64 detection
  const base64Matches = html.match(/data:(image|application)\/[^;]+;base64,/g) ?? []
  const hasBase64Images = base64Matches.length > 0

  if (hasBase64Images) {
    errors.push(
      `Diese Datei enthält eingebettete Base64-Bilder (${base64Matches.length} gefunden) und ist für die ` +
      `lokale Vorschau gedacht — nicht für Mailchimp. Verwende die Production-HTML ohne eingebettete Bilder.`
    )
  }

  // 3. Filename heuristic
  if (filename?.includes('preview')) {
    warnings.push(`Dateiname enthält "preview" — prüfe ob dies die Production-HTML ist.`)
  }

  // 4. Image URL analysis
  const imgSrcMatches = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)]
  const imgTags = imgSrcMatches.length
  let mailchimpCdnUrls = 0
  const unresolvedUrls: string[] = []

  for (const match of imgSrcMatches) {
    const src = match[1]
    if (src.startsWith('data:')) continue // already caught above
    if (MAILCHIMP_CDN.some((cdn) => src.includes(cdn))) {
      mailchimpCdnUrls++
    } else if (!src.startsWith('http://') && !src.startsWith('https://')) {
      unresolvedUrls.push(src)
    } else {
      // External non-Mailchimp URL — valid for upload, Mailchimp will host it
    }
  }

  if (unresolvedUrls.length > 0) {
    warnings.push(
      `${unresolvedUrls.length} Bild(er) mit relativem oder unaufgelöstem Pfad: ${unresolvedUrls.slice(0, 3).join(', ')}${unresolvedUrls.length > 3 ? ` (+${unresolvedUrls.length - 3} weitere)` : ''}`
    )
  }

  return {
    passed: errors.length === 0,
    htmlSizeKB: Math.round(htmlSizeKB * 10) / 10,
    warnings,
    errors,
    details: {
      hasBase64Images,
      base64Count: base64Matches.length,
      imgTags,
      unresolvedUrls,
      mailchimpCdnUrls,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mailchimp/size-guard.ts
git commit -m "feat: add validateNewsletterHtml size guard utility"
```

---

## Task 2: Unit tests

**Files:**
- Create: `lib/mailchimp/size-guard.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "npx tsx --test lib/mailchimp/size-guard.test.ts"
```

- [ ] **Step 2: Write the test file**

```typescript
// lib/mailchimp/size-guard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNewsletterHtml } from './size-guard.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHtml(extraKB = 0, options: { base64?: boolean; relativeImg?: boolean } = {}): string {
  const img = options.base64
    ? `<img src="data:image/png;base64,iVBORw0KGgo=" alt="test">`
    : options.relativeImg
    ? `<img src="images/photo.jpg" alt="test">`
    : `<img src="https://example.com/photo.jpg" alt="test">`
  const padding = extraKB > 0 ? '<!-- ' + 'x'.repeat(extraKB * 1024) + ' -->' : ''
  return `<!DOCTYPE html><html><body>${img}${padding}</body></html>`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('clean production HTML passes with no errors or warnings', () => {
  const result = validateNewsletterHtml(makeHtml())
  assert.equal(result.passed, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 0)
  assert.equal(result.details.hasBase64Images, false)
})

test('Base64 HTML is blocked with a descriptive error', () => {
  const result = validateNewsletterHtml(makeHtml(0, { base64: true }), 'newsletter-preview.html')
  assert.equal(result.passed, false)
  assert.equal(result.errors.length >= 1, true)
  assert.equal(result.details.hasBase64Images, true)
  assert.equal(result.details.base64Count, 1)
  assert.match(result.errors[0], /Base64/)
})

test('oversized HTML (> 102kB) is blocked', () => {
  const result = validateNewsletterHtml(makeHtml(110))
  assert.equal(result.passed, false)
  assert.match(result.errors[0], /Gmail/)
  assert.equal(result.htmlSizeKB > 102, true)
})

test('HTML in 80–102kB range passes but emits a size warning', () => {
  const result = validateNewsletterHtml(makeHtml(85))
  assert.equal(result.passed, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.some((w) => w.includes('knapp')), true)
})

test('relative image paths trigger an unresolved-URL warning', () => {
  const result = validateNewsletterHtml(makeHtml(0, { relativeImg: true }))
  assert.equal(result.passed, true) // warnings don't block
  assert.equal(result.details.unresolvedUrls.length, 1)
  assert.equal(result.warnings.some((w) => w.includes('relativ')), true)
})
```

- [ ] **Step 3: Run tests and verify all 5 pass**

```bash
npm test
```

Expected output: 5 passing, 0 failing.

- [ ] **Step 4: Commit**

```bash
git add lib/mailchimp/size-guard.test.ts package.json
git commit -m "test: add size-guard unit tests (node:test)"
```

---

## Task 3: Integrate guard into ZIP export

**Files:**
- Modify: `lib/generate/newsletter.ts` (function `buildZip`, lines ~187–211)

The guard runs on `htmlWithRelativePaths` (production HTML with relative image paths) after all URL replacements. Relative image paths are expected here — don't error on them. Base64 and size are the meaningful checks at this stage.

- [ ] **Step 1: Add the import at the top of `lib/generate/newsletter.ts`**

Below the existing imports, add:
```typescript
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
```

- [ ] **Step 2: Replace the `buildZip` return statement**

Current code (around line 207–210):
```typescript
  zip.file('newsletter.html', htmlWithRelativePaths)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { zipBuffer: Buffer.from(buf), warnings }
```

Replace with:
```typescript
  // Validate before packaging — catches accidental Base64 leakage and size issues
  const guard = validateNewsletterHtml(htmlWithRelativePaths, 'newsletter.html')
  if (!guard.passed) {
    throw new Error('SIZE_GUARD_ERROR:' + guard.errors.join(' | '))
  }
  for (const w of guard.warnings) warnings.push(`[Size Guard] ${w}`)

  zip.file('newsletter.html', htmlWithRelativePaths)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { zipBuffer: Buffer.from(buf), warnings }
```

- [ ] **Step 3: Handle `SIZE_GUARD_ERROR` in `app/api/generate/newsletter/route.ts`**

In the catch block (around line 146), add a new `else if` before the final `return`:

```typescript
    if (err.message?.startsWith('SIZE_GUARD_ERROR:')) {
      await admin
        .from('campaigns')
        .update({ status: 'assets_pending', notes: `Export blockiert: ${err.message.replace('SIZE_GUARD_ERROR:', '')}` })
        .eq('id', campaign_id)
      return NextResponse.json({ error: err.message.replace('SIZE_GUARD_ERROR:', '') }, { status: 422 })
    }
```

- [ ] **Step 4: Commit**

```bash
git add lib/generate/newsletter.ts app/api/generate/newsletter/route.ts
git commit -m "feat: run size guard in buildZip, surface errors to UI"
```

---

## Task 4: Fix Mailchimp route + integrate guard

**Files:**
- Modify: `app/api/send/mailchimp/route.ts`

**Root cause being fixed:** The route currently fetches `newsletter_preview` (the Base64 preview HTML). This must never go to Mailchimp. Instead, load `newsletter.mjml` from storage, sign all campaign image asset URLs fresh, substitute filenames in MJML with those URLs, compile to HTML, then validate and upload.

- [ ] **Step 1: Add imports to `app/api/send/mailchimp/route.ts`**

```typescript
// @ts-ignore
import mjml2html from 'mjml'
import { signStorageUrl } from '@/lib/supabase/storage'
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
```

- [ ] **Step 2: Replace the entire HTML-loading block**

Remove lines 32–58 (loading `newsletter_preview`, fetching its HTML). Replace with:

```typescript
  // Load MJML source and image assets
  const admin = createAdminClient()

  const [{ data: mjmlAsset }, { data: rawImageAssets }] = await Promise.all([
    supabase
      .from('campaign_assets')
      .select('file_url, file_name')
      .eq('campaign_id', campaign_id)
      .eq('asset_category', 'text')
      .eq('is_output', true)
      .eq('file_name', 'newsletter.mjml')
      .single(),
    supabase
      .from('campaign_assets')
      .select('file_name, file_url, file_type')
      .eq('campaign_id', campaign_id)
      .eq('asset_category', 'image')
      .eq('is_output', false),
  ])

  if (!mjmlAsset) {
    return NextResponse.json({ error: 'Kein generierter Newsletter gefunden. Bitte zuerst generieren.' }, { status: 422 })
  }

  // Fetch MJML source text with a fresh signed URL
  const mjmlMarker = '/campaign-assets/'
  const mjmlIdx = mjmlAsset.file_url.indexOf(mjmlMarker)
  let mjmlSource = ''
  if (mjmlIdx !== -1) {
    const mjmlPath = decodeURIComponent(mjmlAsset.file_url.slice(mjmlIdx + mjmlMarker.length).split('?')[0])
    const { data: mjmlSigned } = await admin.storage.from('campaign-assets').createSignedUrl(mjmlPath, 300)
    if (mjmlSigned?.signedUrl) {
      const mjmlRes = await fetch(mjmlSigned.signedUrl)
      if (mjmlRes.ok) mjmlSource = await mjmlRes.text()
    }
  }

  if (!mjmlSource) {
    return NextResponse.json({ error: 'MJML-Quelle konnte nicht geladen werden.' }, { status: 500 })
  }

  // Replace relative filenames in MJML with fresh signed URLs for each image asset
  const imageAssets = rawImageAssets ?? []
  let mjmlWithUrls = mjmlSource
  for (const asset of imageAssets) {
    const signedUrl = await signStorageUrl(admin, asset.file_url)
    mjmlWithUrls = mjmlWithUrls.split(asset.file_name).join(signedUrl)
  }

  // Compile MJML → production HTML
  const compiled = mjml2html(mjmlWithUrls, { validationLevel: 'soft' })
  if (!compiled.html) {
    return NextResponse.json({ error: 'MJML konnte nicht kompiliert werden.' }, { status: 500 })
  }
  const htmlContent = compiled.html

  // Guard: block Base64 and oversized HTML before uploading
  const guard = validateNewsletterHtml(htmlContent, 'newsletter-mailchimp.html')
  if (!guard.passed) {
    return NextResponse.json({ error: guard.errors.join(' | ') }, { status: 422 })
  }
```

- [ ] **Step 3: Remove the now-redundant `const admin = createAdminClient()` line**

The existing `const admin = createAdminClient()` is at ~line 20. The new block above now defines `admin` earlier. Remove the original declaration.

- [ ] **Step 4: Commit**

```bash
git add app/api/send/mailchimp/route.ts
git commit -m "fix: use production MJML HTML for Mailchimp upload, add size guard"
```

---

## Task 5: UI feedback in CampaignSidePanel

**Files:**
- Modify: `components/calendar/CampaignSidePanel.tsx`

The guard errors are returned as `json.error` from both the generation route (status 422) and the Mailchimp route (status 422). The existing `genError` and `mailchimpError` states already display errors in red. No new state needed — just improve the display for guard messages.

The guard errors are long and descriptive. They will display correctly in the existing `{mailchimpError && <p className="text-xs text-[#E65100]">{mailchimpError}</p>}` elements. No layout changes needed.

However, the generation route now also returns guard warnings in the `notes` column. To surface these in the UI without additional API calls, add a `sizeGuardWarning` state that is populated from the guard's `warnings` array when the Mailchimp route responds with `warnings` in its JSON.

- [ ] **Step 1: Return warnings from the Mailchimp route**

In `app/api/send/mailchimp/route.ts`, update the success response:

```typescript
  return NextResponse.json({
    success: true,
    campaignId: created.id,
    editUrl,
    warnings: guard.warnings,
  })
```

- [ ] **Step 2: Add `sizeWarnings` state to CampaignSidePanel**

In `components/calendar/CampaignSidePanel.tsx`, near the other mailchimp state variables:

```typescript
const [sizeWarnings, setSizeWarnings] = useState<string[]>([])
```

- [ ] **Step 3: Populate from handleSendToMailchimp response**

In `handleSendToMailchimp`, update the success branch:

```typescript
      setMailchimpUrl(json.editUrl)
      setSizeWarnings(json.warnings ?? [])
```

- [ ] **Step 4: Populate from handleOpenMailchimp (auto-recreate) response**

In `handleOpenMailchimp`, update the success branch after `setMailchimpUrl(createJson.editUrl)`:

```typescript
      setSizeWarnings(createJson.warnings ?? [])
```

- [ ] **Step 5: Render warnings in the Mailchimp section**

Below the "In Mailchimp ansehen" button block (after the `{mailchimpError && ...}` line in the `mailchimpUrl ? (...)` branch), add:

```tsx
                  {sizeWarnings.length > 0 && (
                    <div className="space-y-1">
                      {sizeWarnings.map((w, i) => (
                        <p key={i} className="text-xs text-[#C4A87C]">{w}</p>
                      ))}
                    </div>
                  )}
```

- [ ] **Step 6: Reset warnings when campaign changes**

In the `useEffect` that resets state on `campaign.id` change, add:

```typescript
    setSizeWarnings([])
```

- [ ] **Step 7: Commit**

```bash
git add components/calendar/CampaignSidePanel.tsx app/api/send/mailchimp/route.ts
git commit -m "feat: surface size guard warnings in Mailchimp UI"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `validateNewsletterHtml` with correct signature — Task 1
- ✅ Base64 detection (`data:image/`, `data:application/`) — Task 1
- ✅ Size check: green <80kB, warn 80–102kB, block >102kB — Task 1
- ✅ Image URL validation (Mailchimp CDN, relative, Base64) — Task 1
- ✅ Filename heuristic for "preview" — Task 1
- ✅ ZIP export integration — Task 3
- ✅ Mailchimp API upload integration — Task 4
- ✅ UI feedback (green/warn/error) — Task 5
- ✅ 5 unit tests (clean, Base64, oversized, warn-range, relative-img) — Task 2
- ✅ No new runtime dependencies — all tasks use existing packages

**Type consistency:** `SizeGuardResult` defined in Task 1, used in Tasks 3, 4, 5 — consistent.

**Placeholder scan:** None found.
