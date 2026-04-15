// lib/generate/newsletter.ts
// Generates a newsletter via Claude API, compiles MJML, builds a Mailchimp ZIP,
// and creates a preview HTML with signed Supabase URLs.

import Anthropic from '@anthropic-ai/sdk'
// @ts-ignore
import mjml2html from 'mjml'
import JSZip from 'jszip'
import sharp from 'sharp'
import { NEWSLETTER_SYSTEM_PROMPT } from './newsletter-prompt'
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
import { signStorageUrl } from '@/lib/supabase/storage'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CampaignWithManufacturer, CampaignAsset, NewsletterBriefing } from '@/lib/supabase/types'

export interface NewsletterInput {
  campaign: CampaignWithManufacturer
  assets: CampaignAsset[]          // Own campaign assets (input only)
  postcardAssets: CampaignAsset[]  // Linked postcard assets for style reference
  briefing?: NewsletterBriefing    // Structured briefing from the form
  feedback?: string                 // Optional regeneration feedback
}

export interface NewsletterOutput {
  mjmlSource: string
  zipBuffer: Buffer
  previewHtml: string
  subjectLine: string
  previewText: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

async function buildUserPrompt(
  input: NewsletterInput,
  imageInfo?: { gifFiles: Set<string>; skippedFiles: Set<string> }
): Promise<string> {
  const { campaign, assets, postcardAssets, briefing, feedback } = input
  const mfg = campaign.manufacturers as any
  const agency = mfg?.agencies as any

  const textAssets = assets.filter((a) => a.asset_category === 'text' && !a.is_output)
  const imageAssets = assets.filter((a) => a.asset_category === 'image')
  const ctaAssets = assets.filter((a) => a.asset_category === 'cta' || a.asset_category === 'link')
  const postcardImages = postcardAssets.filter(
    (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
  )

  const lines: string[] = [
    '## AGENTUR',
    `Name: ${agency?.name ?? ''}`,
    `Logo-URL: ${agency?.logo_url ? 'agency-logo.png' : '(kein Logo)'}`,
    agency?.website_url
      ? `Website (für klickbares Agentur-Logo im Footer): ${agency.website_url}`
      : '(Keine Agentur-Website hinterlegt — Agentur-Logo im Footer ohne href)',
    `Adresse: ${agency?.address ?? ''}`,
    `Telefon: ${agency?.phone ?? ''}`,
    agency?.contact_email
      ? `Kontakt-E-Mail (Footer): ${agency.contact_email}`
      : '(Keine Agentur-Kontakt-Mail hinterlegt — E-Mail im Footer weglassen)',
    '',
    '## HERSTELLER',
    `Name: ${mfg?.name ?? ''}`,
    `Kategorie: ${mfg?.category ?? ''}`,
    mfg?.logo_url
      ? `Logo-URL (Header — zentriert, klickbar auf website_url): manufacturer-logo.png`
      : '(Kein Hersteller-Logo vorhanden — Header ohne Logo aufbauen)',
    mfg?.website_url
      ? `Website (für klickbares Hersteller-Logo im Header + CTAs): ${mfg.website_url}`
      : '(Keine Website hinterlegt — Logo nicht verlinken)',
    mfg?.contact_email
      ? `Kontakt-Mail (Hersteller, für CTA/Kontaktzeile im Body verwenden): ${mfg.contact_email}`
      : '(Keine Hersteller-Kontaktmail — keine Kontaktadresse im Newsletter-Body nennen)',
    '',
    '## KAMPAGNE',
    `Titel: ${campaign.title}`,
    `Datum: ${campaign.scheduled_date}`,
    campaign.notes ? `Hinweis: ${campaign.notes}` : '',
    '',
  ]

  // Briefing fields (structured input from the briefing form)
  if (briefing?.product) {
    lines.push('## PRODUKT / THEMA')
    lines.push(briefing.product)
    lines.push('')
  }

  if (briefing?.draft) {
    lines.push('## TEXTENTWURF (Briefing)')
    lines.push('(Als direkte Basis verwenden — nah am Original bleiben, humanisieren)')
    lines.push(briefing.draft)
    lines.push('')
  }

  if (briefing?.cta_text || briefing?.cta_link) {
    lines.push('## HAUPT-CTA')
    if (briefing.cta_text) lines.push(`Text: ${briefing.cta_text}`)
    if (briefing.cta_link) lines.push(`Link: ${briefing.cta_link}`)
    lines.push('')
  }

  if (briefing?.extra_links?.length) {
    lines.push('## WEITERE LINKS')
    for (const l of briefing.extra_links) {
      if (l.label || l.url) lines.push(`- ${l.label}: ${l.url}`)
    }
    lines.push('')
  }

  if (briefing?.hints) {
    lines.push('## EXTRA-HINWEISE')
    lines.push(briefing.hints)
    lines.push('')
  }

  // Fetch text asset content — URLs alone are not readable by the model
  if (textAssets.length > 0) {
    lines.push('## TEXTENTWURF (hochgeladene Assets)')
    lines.push('(Als zusätzliche Basis verwenden, humanisieren)')
    for (const a of textAssets) {
      try {
        const res = await fetch(a.file_url)
        if (res.ok) {
          const content = await res.text()
          lines.push(`--- ${a.file_name} ---`)
          lines.push(content)
        } else {
          lines.push(`- ${a.file_name}: (Nicht abrufbar — HTTP ${res.status})`)
        }
      } catch {
        lines.push(`- ${a.file_name}: (Fehler beim Laden)`)
      }
    }
    lines.push('')
  }

  if (imageAssets.length > 0) {
    lines.push('## BILDER (eigene Kampagne)')
    lines.push('(Bilder sind als Vision-Blöcke beigefügt — verwende die Dateinamen als src-Attribut: src="dateiname.jpg")')
    for (const a of imageAssets) {
      if (imageInfo?.gifFiles.has(a.file_name)) {
        lines.push(`- ${a.file_name} (animiertes GIF — du siehst das erste Frame zur Farb-/Stilreferenz. Verwende im MJML: <mj-image src="${a.file_name}">)`)
      } else if (imageInfo?.skippedFiles.has(a.file_name)) {
        lines.push(`- ${a.file_name} (nicht als Vision-Block — nur Dateiname für src-Attribut)`)
      } else {
        lines.push(`- ${a.file_name}`)
      }
    }
    lines.push('')
  }

  if (ctaAssets.length > 0) {
    lines.push('## CTA-LINKS (Assets)')
    for (const a of ctaAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (postcardImages.length > 0) {
    lines.push('## POSTKARTE (Stil-Referenz — Newsletter muss visuell passen)')
    lines.push('(Postkarten-Bilder sind als Vision-Blöcke beigefügt)')
    for (const a of postcardImages) {
      if (imageInfo?.gifFiles.has(a.file_name)) {
        lines.push(`- ${a.file_name} (animiertes GIF — erstes Frame als Referenz)`)
      } else if (imageInfo?.skippedFiles.has(a.file_name)) {
        lines.push(`- ${a.file_name} (nicht als Vision-Block — Budget erreicht)`)
      } else {
        lines.push(`- ${a.file_name}`)
      }
    }
    lines.push('')
  }

  if (feedback) {
    lines.push('## FEEDBACK ZUR VORHERIGEN VERSION')
    lines.push(feedback)
    lines.push('')
  }

  return lines.filter((l) => l !== null).join('\n')
}

// ─── Image content blocks for vision ─────────────────────────────────────────

const MAX_VISION_BUDGET_BYTES = 1024 * 1024 // 1MB total for all vision blocks
const MAX_SINGLE_IMAGE_BYTES = 300 * 1024   // 300KB per image after compression

function isGif(asset: CampaignAsset): boolean {
  return (
    asset.file_type === 'image/gif' ||
    asset.file_url?.toLowerCase().endsWith('.gif') ||
    asset.file_name?.toLowerCase().endsWith('.gif')
  )
}

interface ImageProcessingResult {
  blocks: Anthropic.ImageBlockParam[]
  gifFiles: Set<string>
  skippedFiles: Set<string>
}

async function compressImage(buf: Buffer, filename: string): Promise<Buffer> {
  const compressed = await sharp(buf)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer()
  console.log(`[Vision] ${filename}: ${Math.round(buf.length / 1024)}kB → ${Math.round(compressed.length / 1024)}kB`)
  return compressed
}

async function extractGifFirstFrame(buf: Buffer, filename: string): Promise<Buffer> {
  const frame = await sharp(buf, { animated: false })
    .jpeg({ quality: 80 })
    .toBuffer()
  console.log(`[Vision] ${filename}: GIF first frame extracted (${Math.round(buf.length / 1024)}kB → ${Math.round(frame.length / 1024)}kB)`)
  return frame
}

async function buildImageBlocks(
  assets: CampaignAsset[],
  postcardAssets: CampaignAsset[]
): Promise<ImageProcessingResult> {
  const imageAssets = [
    ...assets.filter((a) => a.asset_category === 'image'),
    ...postcardAssets.filter(
      (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
    ),
  ]

  const blocks: Anthropic.ImageBlockParam[] = []
  const gifFiles = new Set<string>()
  const skippedFiles = new Set<string>()
  let totalBytes = 0

  for (const asset of imageAssets) {
    // Skip PDFs — Claude vision doesn't support them
    if (asset.file_type === 'application/pdf') continue

    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) continue
      const rawBuf = Buffer.from(await res.arrayBuffer())

      let compressed: Buffer
      if (isGif(asset)) {
        gifFiles.add(asset.file_name)
        compressed = await extractGifFirstFrame(rawBuf, asset.file_name)
      } else {
        compressed = await compressImage(rawBuf, asset.file_name)
      }

      // Enforce per-image limit
      if (compressed.length > MAX_SINGLE_IMAGE_BYTES) {
        compressed = await sharp(compressed)
          .jpeg({ quality: 50 })
          .toBuffer()
      }

      // Check total budget before adding
      if (totalBytes + compressed.length > MAX_VISION_BUDGET_BYTES) {
        console.warn(`[Vision] Budget reached (${Math.round(totalBytes / 1024)}kB) — skipping ${asset.file_name}`)
        skippedFiles.add(asset.file_name)
        continue
      }

      totalBytes += compressed.length
      blocks.push({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: compressed.toString('base64'),
        },
      })
    } catch (e) {
      console.warn(`[Vision] Failed to process ${asset.file_name}:`, e)
    }
  }

  console.log(`[Vision] ${blocks.length} blocks, ${Math.round(totalBytes / 1024)}kB total`)
  return { blocks, gifFiles, skippedFiles }
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

async function buildZip(
  html: string,
  imageAssets: CampaignAsset[],
  logoUrls?: { manufacturerLogo?: string; agencyLogo?: string }
): Promise<{ zipBuffer: Buffer; warnings: string[] }> {
  const zip = new JSZip()
  const warnings: string[] = []
  let htmlWithRelativePaths = html

  // --- Handle campaign image assets ---
  for (const asset of imageAssets) {
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      zip.file(asset.file_name, buf)

      htmlWithRelativePaths = htmlWithRelativePaths.split(asset.file_url).join(asset.file_name)

      const urlWithoutToken = asset.file_url.split('?')[0]
      htmlWithRelativePaths = htmlWithRelativePaths.split(urlWithoutToken).join(asset.file_name)

      const encodedName = encodeURIComponent(asset.file_name)
      const supabasePattern = new RegExp(
        `https?://[^"'\\s]*?/${encodedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\\s]*`,
        'g'
      )
      htmlWithRelativePaths = htmlWithRelativePaths.replace(supabasePattern, asset.file_name)
    } catch (e: any) {
      warnings.push(`Bild übersprungen: ${asset.file_name} (${e.message})`)
    }
  }

  // --- Handle logo URLs (unique filenames to avoid collision) ---
  const logoMap: { url: string; filename: string }[] = []
  if (logoUrls?.manufacturerLogo) {
    logoMap.push({ url: logoUrls.manufacturerLogo, filename: 'manufacturer-logo.png' })
  }
  if (logoUrls?.agencyLogo) {
    logoMap.push({ url: logoUrls.agencyLogo, filename: 'agency-logo.png' })
  }

  for (const logo of logoMap) {
    try {
      const res = await fetch(logo.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      zip.file(logo.filename, buf)

      // Replace full signed URL
      htmlWithRelativePaths = htmlWithRelativePaths.split(logo.url).join(logo.filename)
      // Replace URL without token
      const urlWithoutToken = logo.url.split('?')[0]
      htmlWithRelativePaths = htmlWithRelativePaths.split(urlWithoutToken).join(logo.filename)
    } catch (e: any) {
      warnings.push(`Logo übersprungen: ${logo.filename} (${e.message})`)
    }
  }

  // Catch-all: replace ANY remaining Supabase storage URLs
  htmlWithRelativePaths = htmlWithRelativePaths.replace(
    /https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\/[^"'\s]+/g,
    (match) => {
      const decoded = decodeURIComponent(match.split('/').pop()?.split('?')[0] ?? '')
      warnings.push(`[Catch-all] Supabase URL ersetzt → ${decoded}`)
      return decoded
    }
  )

  const guard = validateNewsletterHtml(htmlWithRelativePaths, 'newsletter.html', { allowRelativePaths: true })
  if (!guard.passed) {
    throw new Error('SIZE_GUARD_ERROR:' + guard.errors.join(' | '))
  }
  for (const w of guard.warnings) warnings.push(`[Size Guard] ${w}`)

  zip.file('newsletter.html', htmlWithRelativePaths)
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return { zipBuffer: Buffer.from(buf), warnings }
}

// ─── Preview builder (signed URLs) ───────────────────────────────────────────

async function buildPreview(
  html: string,
  imageAssets: CampaignAsset[],
  logoUrls?: { manufacturerLogo?: string; agencyLogo?: string }
): Promise<string> {
  const admin = createAdminClient()
  let preview = html

  // Replace campaign image filenames with signed URLs
  for (const asset of imageAssets) {
    try {
      const signedUrl = await signStorageUrl(admin, asset.file_url)
      preview = preview.split(asset.file_name).join(signedUrl)
    } catch {
      // Skip failed image — preview will have broken img
    }
  }

  // Replace logo filenames with signed URLs
  const logoMap: { filename: string; url: string }[] = []
  if (logoUrls?.manufacturerLogo) {
    logoMap.push({ filename: 'manufacturer-logo.png', url: logoUrls.manufacturerLogo })
  }
  if (logoUrls?.agencyLogo) {
    logoMap.push({ filename: 'agency-logo.png', url: logoUrls.agencyLogo })
  }

  for (const logo of logoMap) {
    try {
      const signedUrl = await signStorageUrl(admin, logo.url)
      preview = preview.split(logo.filename).join(signedUrl)
    } catch {
      // Skip failed logo
    }
  }

  return preview
}

// ─── Subject line + preview text generator ────────────────────────────────────

async function generateSubjectAndPreview(
  input: NewsletterInput,
  client: Anthropic
): Promise<{ subjectLine: string; previewText: string }> {
  const { campaign, briefing } = input
  const mfg = campaign.manufacturers as any

  const lines = [
    `Hersteller: ${mfg?.name ?? ''}`,
    `Kampagne: ${campaign.title}`,
  ]
  if (briefing?.product) lines.push(`Produkt/Thema: ${briefing.product}`)
  if (briefing?.draft)   lines.push(`Textentwurf (Auszug): ${briefing.draft.slice(0, 400)}`)
  if (briefing?.cta_text) lines.push(`CTA: ${briefing.cta_text}`)

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `Du generierst E-Mail-Betreffs und Preview-Texte für B2B-Newsletter an Architekten und Designer im Luxusmöbelbereich.
Antworte ausschließlich mit einem JSON-Objekt (kein Markdown-Wrapper): {"subject_line": "...", "preview_text": "..."}
- subject_line: max. 60 Zeichen, konkret, kein Clickbait
- preview_text: max. 100 Zeichen, ergänzt den Betreff, zeigt konkreten Mehrwert`,
      messages: [{ role: 'user', content: lines.join('\n') }],
    })
    const parsed = JSON.parse((res.content[0] as Anthropic.TextBlock).text.trim())
    return {
      subjectLine: parsed.subject_line ?? campaign.title,
      previewText: parsed.preview_text ?? '',
    }
  } catch {
    return { subjectLine: campaign.title, previewText: '' }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateNewsletter(input: NewsletterInput): Promise<NewsletterOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Process images first so we know which are GIFs / skipped (for text prompt annotations)
  const { blocks: imageBlocks, gifFiles, skippedFiles } = await buildImageBlocks(input.assets, input.postcardAssets)
  const textPrompt = await buildUserPrompt(input, { gifFiles, skippedFiles })

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: textPrompt },
    ...imageBlocks,
  ]

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const mjmlSource = (response.content[0] as Anthropic.TextBlock).text.trim()

  if (!mjmlSource.startsWith('<mjml')) {
    throw new Error('INVALID_MJML:' + mjmlSource)
  }

  let compiled = mjml2html(mjmlSource, { validationLevel: 'strict' })

  if (compiled.errors && compiled.errors.length > 0) {
    // Fallback: retry with soft validation so the user still gets output
    compiled = mjml2html(mjmlSource, { validationLevel: 'soft' })
    if (!compiled.html) {
      const msg = compiled.errors.map((e: any) => e.formattedMessage ?? e.message).join('; ')
      throw new Error('MJML_ERROR:' + msg + '|||' + mjmlSource)
    }
  }

  const { html } = compiled

  const allImageAssets = [
    ...input.assets.filter((a) => a.asset_category === 'image'),
    ...input.postcardAssets.filter((a) => a.asset_category === 'image'),
  ]

  const mfg = input.campaign.manufacturers as any
  const agency = mfg?.agencies as any

  const [{ zipBuffer, warnings: zipWarnings }, previewHtml, { subjectLine, previewText }] = await Promise.all([
    buildZip(html, allImageAssets, {
      manufacturerLogo: mfg?.logo_url,
      agencyLogo: agency?.logo_url,
    }),
    buildPreview(html, allImageAssets, {
      manufacturerLogo: mfg?.logo_url,
      agencyLogo: agency?.logo_url,
    }),
    generateSubjectAndPreview(input, client),
  ])

  if (zipWarnings.length > 0) {
    console.warn('[buildZip warnings]', zipWarnings)
  }

  return { mjmlSource, zipBuffer, previewHtml, subjectLine, previewText }
}
