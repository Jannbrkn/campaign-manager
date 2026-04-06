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
  const base64Matches = html.match(/data:(image|application)\/[^"'\s>]+/g) ?? []
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
  const imgSrcMatches: RegExpExecArray[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = imgRegex.exec(html)) !== null) {
    imgSrcMatches.push(match)
  }

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
