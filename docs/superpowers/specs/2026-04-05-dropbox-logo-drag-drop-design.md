# Dropbox Logo Drag-and-Drop Fix — Design Spec

**Date:** 2026-04-05  
**Status:** Approved

## Problem

Dragging a file from Dropbox web into a `LogoCard` does nothing. The `onDrop` handler reads `e.dataTransfer.files[0]`, which is empty when dragging from Dropbox — the browser receives a `text/uri-list` URL instead of a real `File` object.

## Solution

Extend the `onDrop` handler in `LogoGrid.tsx` to fall back to `dataTransfer.getData('text/uri-list')` when `files[0]` is absent. Fetch the URL (works because the user is already authenticated in Dropbox in the same browser session), convert the response to a `Blob`, wrap it in a `File`, and pass it to the existing `upload()` function unchanged.

## Changes

### Only file changed: `app/(app)/logos/LogoGrid.tsx`

**`onDrop` handler — new logic:**

```
1. Try e.dataTransfer.files[0] (existing path — works for local files, desktop Dropbox)
2. If no file: read e.dataTransfer.getData('text/uri-list'), take first non-comment line
3. If URL found:
   a. Set a "fetching" state (show spinner)
   b. fetch(url)
   c. On success: response.blob() → new File([blob], filename, { type: blob.type })
      - Derive filename from the URL path (last segment, strip query params)
      - If type is empty/octet-stream, try to infer from filename extension
   d. Pass File to existing upload()
   e. On fetch error: setError('Dropbox-Datei konnte nicht geladen werden')
4. If neither file nor URL: do nothing (same as today)
```

**State additions:**
- `fetching: boolean` — true while downloading from URL; shown as spinner (reuses `uploading` visual pattern)

**No other changes:** `actions.ts`, DB, types — all untouched.

## Error Cases

| Scenario | Behaviour |
|----------|-----------|
| Dropbox URL but not logged in | fetch fails → "Dropbox-Datei konnte nicht geladen werden" |
| URL resolves to non-image | Existing image type check in `upload()` catches it → "Nur Bilddateien (PNG, SVG, JPG)" |
| Local file drag (existing) | `files[0]` path taken, behaviour unchanged |
| Desktop Dropbox app drag | `files[0]` path taken (desktop passes real files), behaviour unchanged |
