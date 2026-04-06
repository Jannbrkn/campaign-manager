# Dropbox Logo Drag-and-Drop Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix logo drag-and-drop so files dragged from Dropbox web upload correctly instead of silently doing nothing.

**Architecture:** Extend the `onDrop` handler in `LogoCard` to fall back to `dataTransfer.getData('text/uri-list')` when no real `File` is present. Fetch the URL, convert to a `File`, and pass it to the existing `upload()` function. One new `fetching` state drives the spinner during the network fetch.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `app/(app)/logos/LogoGrid.tsx` | Only file changed — extend `LogoCard` drop handler and add `fetching` state |

---

### Task 1: Extend LogoCard to handle Dropbox URL drops

**Files:**
- Modify: `app/(app)/logos/LogoGrid.tsx`

The entire `LogoCard` function needs three targeted edits. Read the file first to confirm line numbers, then apply each edit.

---

**Edit 1 — Add `fetching` state**

Current state block (around lines 21–25):
```tsx
const [dragging, setDragging] = useState(false)
const [uploading, setUploading] = useState(false)
const [preview, setPreview] = useState<string | null>(currentLogoUrl)
const [success, setSuccess] = useState(false)
const [error, setError] = useState<string | null>(null)
```

Replace with:
```tsx
const [dragging, setDragging] = useState(false)
const [uploading, setUploading] = useState(false)
const [fetching, setFetching] = useState(false)
const [preview, setPreview] = useState<string | null>(currentLogoUrl)
const [success, setSuccess] = useState(false)
const [error, setError] = useState<string | null>(null)
```

---

**Edit 2 — Replace `onDrop` with URL-aware version**

Current `onDrop` (around lines 60–65):
```tsx
function onDrop(e: React.DragEvent) {
  e.preventDefault()
  setDragging(false)
  const file = e.dataTransfer.files[0]
  if (file) upload(file)
}
```

Replace with:
```tsx
async function onDrop(e: React.DragEvent) {
  e.preventDefault()
  setDragging(false)

  // Path 1: real File object (local drag, desktop Dropbox app)
  const file = e.dataTransfer.files[0]
  if (file) {
    upload(file)
    return
  }

  // Path 2: URL from Dropbox web (text/uri-list)
  const uriList = e.dataTransfer.getData('text/uri-list')
  const url = uriList.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'))
  if (!url) return

  setFetching(true)
  setError(null)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Fetch fehlgeschlagen')
    const blob = await res.blob()

    // Derive filename from URL, fall back to 'logo'
    const rawName = url.split('/').pop()?.split('?')[0] ?? 'logo'
    const name = rawName || 'logo'

    // If content-type is missing/generic, try to infer from extension
    let type = blob.type
    if (!type || type === 'application/octet-stream') {
      const ext = name.split('.').pop()?.toLowerCase()
      const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' }
      type = (ext && map[ext]) ? map[ext] : blob.type
    }

    const fetchedFile = new File([blob], name, { type })
    upload(fetchedFile)
  } catch {
    setError('Dropbox-Datei konnte nicht geladen werden')
  } finally {
    setFetching(false)
  }
}
```

---

**Edit 3 — Show spinner while fetching**

Current status block in JSX (around lines 114–123):
```tsx
<div className="h-5 flex items-center justify-center">
  {uploading && <Loader2 size={12} className="animate-spin text-text-secondary" />}
  {success && <CheckCircle2 size={12} className="text-[#2E7D32]" />}
  {!uploading && !success && (
    <span className="text-[10px] text-text-secondary/50 flex items-center gap-1">
      <Upload size={9} />
      {preview ? 'Ersetzen' : 'Logo ablegen'}
    </span>
  )}
</div>
```

Replace with:
```tsx
<div className="h-5 flex items-center justify-center">
  {(uploading || fetching) && <Loader2 size={12} className="animate-spin text-text-secondary" />}
  {success && <CheckCircle2 size={12} className="text-[#2E7D32]" />}
  {!uploading && !fetching && !success && (
    <span className="text-[10px] text-text-secondary/50 flex items-center gap-1">
      <Upload size={9} />
      {preview ? 'Ersetzen' : 'Logo ablegen'}
    </span>
  )}
</div>
```

---

- [ ] **Step 1: Apply Edit 1** — add `fetching` state after `uploading`

- [ ] **Step 2: Apply Edit 2** — replace `onDrop` with the async URL-aware version

- [ ] **Step 3: Apply Edit 3** — update the spinner to cover `fetching` state

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "C:/Users/Jann Brunken/campaign-manager"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Open the app and navigate to `/logos`
2. Open Dropbox web in the same browser (must be logged in)
3. Find a PNG or JPG logo file in Dropbox
4. Drag it from the Dropbox file browser onto any logo card
5. Expected: spinner appears briefly, then the logo preview updates and a green checkmark shows
6. Refresh the page — logo should still be there (confirms it was saved)
7. Also confirm local file drag still works: drag a local image file onto a card

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/logos/LogoGrid.tsx
git commit -m "fix: support Dropbox web drag-and-drop for logo upload"
```
