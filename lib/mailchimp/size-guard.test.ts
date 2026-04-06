// lib/mailchimp/size-guard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNewsletterHtml } from './size-guard.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHtml(extraKB = 0, options: { base64?: boolean; relativeImg?: boolean; appBase64?: boolean } = {}): string {
  const img = options.base64
    ? `<img src="data:image/png;base64,iVBORw0KGgo=" alt="test">`
    : options.appBase64
    ? `<img src="data:application/pdf;base64,JVBERi0=" alt="test">`
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

test('Base64 image HTML is blocked with a descriptive error', () => {
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
