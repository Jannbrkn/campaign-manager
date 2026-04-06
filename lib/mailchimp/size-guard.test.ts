// lib/mailchimp/size-guard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNewsletterHtml } from './size-guard.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HtmlOptions = {
  base64?: boolean
  appBase64?: boolean
  relativeImg?: boolean
  mailchimpImg?: boolean
}

function makeHtml(targetTotalKB = 0, options: HtmlOptions = {}): string {
  const img = options.base64
    ? `<img src="data:image/png;base64,iVBORw0KGgo=" alt="test">`
    : options.appBase64
    ? `<img src="data:application/pdf;base64,JVBERi0=" alt="pdf">`
    : options.relativeImg
    ? `<img src="images/photo.jpg" alt="test">`
    : options.mailchimpImg
    ? `<img src="https://mcusercontent.com/abc123/images/photo.jpg" alt="test">`
    : `<img src="https://example.com/photo.jpg" alt="test">`

  const base = `<!DOCTYPE html><html><body>${img}</body></html>`
  if (targetTotalKB <= 0) return base

  // Compute how many 'x' chars are needed to reach the target total size
  const wrapperBytes = 9 // '<!-- ' (5) + ' -->' (4)
  const needed = Math.max(0, targetTotalKB * 1024 - base.length - wrapperBytes)
  return `<!DOCTYPE html><html><body>${img}<!-- ${'x'.repeat(needed)} --></body></html>`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('clean production HTML passes with no errors or warnings', () => {
  const result = validateNewsletterHtml(makeHtml())
  assert.equal(result.passed, true)
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 0)
  assert.equal(result.details.hasBase64Images, false)
})

test('Base64 image HTML is blocked with a descriptive error', () => {
  const result = validateNewsletterHtml(makeHtml(0, { base64: true }))
  assert.equal(result.passed, false)
  assert.ok(result.errors.length >= 1, `Expected at least 1 error, got ${result.errors.length}`)
  assert.equal(result.details.hasBase64Images, true)
  assert.equal(result.details.base64Count, 1)
  assert.match(result.errors[0], /Base64/)
})

test('application/pdf base64 embed is blocked', () => {
  const result = validateNewsletterHtml(makeHtml(0, { appBase64: true }))
  assert.equal(result.passed, false)
  assert.equal(result.details.hasBase64Images, true)
  assert.match(result.errors[0], /Base64/)
})

test('oversized HTML (> 102kB) is blocked', () => {
  const result = validateNewsletterHtml(makeHtml(110))
  assert.equal(result.passed, false)
  assert.match(result.errors[0], /Gmail/)
  assert.ok(result.htmlSizeKB > 102, `Expected htmlSizeKB > 102, got ${result.htmlSizeKB}`)
})

test('HTML in 80–102kB range passes but emits a size warning', () => {
  const result = validateNewsletterHtml(makeHtml(85))
  assert.equal(result.passed, true)
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.some((w) => w.includes('knapp')), 'Expected a "knapp" size warning')
})

test('relative image paths trigger an unresolved-URL warning', () => {
  const result = validateNewsletterHtml(makeHtml(0, { relativeImg: true }))
  assert.equal(result.passed, true)
  assert.equal(result.details.unresolvedUrls.length, 1)
  assert.ok(result.warnings.some((w) => w.includes('relativ')), 'Expected a relative-path warning')
})

test('Mailchimp CDN URLs are counted and do not trigger warnings', () => {
  const result = validateNewsletterHtml(makeHtml(0, { mailchimpImg: true }))
  assert.equal(result.passed, true)
  assert.equal(result.details.mailchimpCdnUrls, 1)
  assert.equal(result.details.unresolvedUrls.length, 0)
  assert.equal(result.warnings.length, 0)
})

test('filename containing "preview" emits a warning', () => {
  const result = validateNewsletterHtml(makeHtml(), 'newsletter-preview.html')
  assert.equal(result.passed, true)
  assert.ok(result.warnings.some((w) => w.includes('preview')), 'Expected a preview-filename warning')
})
