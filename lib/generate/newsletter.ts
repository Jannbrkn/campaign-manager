// lib/generate/newsletter.ts
// Generates a newsletter via Claude API, compiles MJML, builds a Mailchimp ZIP,
// and creates a Base64 preview HTML.

import Anthropic from '@anthropic-ai/sdk'
// @ts-ignore
import mjml2html from 'mjml'
import JSZip from 'jszip'
import { NEWSLETTER_SYSTEM_PROMPT } from './newsletter-prompt'
import { validateNewsletterHtml } from '@/lib/mailchimp/size-guard'
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

async function buildUserPrompt(input: NewsletterInput): Promise<string> {
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
    for (const a of imageAssets) lines.push(`- ${a.file_name}`)
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
    for (const a of postcardImages) lines.push(`- ${a.file_name}`)
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

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isGif(asset: CampaignAsset): boolean {
  return (
    asset.file_type === 'image/gif' ||
    asset.file_url?.toLowerCase().endsWith('.gif') ||
    asset.file_name?.toLowerCase().endsWith('.gif')
  )
}

async function buildImageBlocks(
  assets: CampaignAsset[],
  postcardAssets: CampaignAsset[]
): Promise<Anthropic.ImageBlockParam[]> {
  const imageAssets = [
    ...assets.filter((a) => a.asset_category === 'image'),
    ...postcardAssets.filter(
      (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
    ),
  // GIFs werden nicht als Vision-Block geladen (zu groß für Token-Limit).
  // Die GIF-URL ist aber im Text-Prompt enthalten — Claude baut das src-Attribut trotzdem korrekt.
  ].filter((a) => !isGif(a))

  const blocks: Anthropic.ImageBlockParam[] = []
  for (const asset of imageAssets) {
    const mediaType = SUPPORTED_IMAGE_TYPES.includes(asset.file_type)
      ? asset.file_type
      : 'image/jpeg'
    // Skip PDFs — Claude vision doesn't support them
    if (asset.file_type === 'application/pdf') continue
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      const b64 = Buffer.from(buf).toString('base64')
      blocks.push({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: b64,
        },
      })
    } catch {
      // Skip image if download fails — generation continues without it
    }
  }
  return blocks
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

// ─── Base64 preview builder ───────────────────────────────────────────────────

async function buildPreview(html: string, imageAssets: CampaignAsset[]): Promise<string> {
  let preview = html
  for (const asset of imageAssets) {
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      const b64 = Buffer.from(buf).toString('base64')
      const dataUrl = `data:${asset.file_type};base64,${b64}`
      // Replace by filename (Claude uses relative paths) AND by URL as fallback
      preview = preview.split(asset.file_name).join(dataUrl)
      preview = preview.split(asset.file_url).join(dataUrl)
    } catch {
      // Skip failed image — preview will have broken img
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

  const textPrompt = await buildUserPrompt(input)
  const allImageBlocks = await buildImageBlocks(input.assets, input.postcardAssets)
  const imageBlocks = allImageBlocks.slice(0, 4)

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
    buildPreview(html, allImageAssets),
    generateSubjectAndPreview(input, client),
  ])

  if (zipWarnings.length > 0) {
    console.warn('[buildZip warnings]', zipWarnings)
  }

  return { mjmlSource, zipBuffer, previewHtml, subjectLine, previewText }
}
