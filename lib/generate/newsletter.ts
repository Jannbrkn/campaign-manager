// lib/generate/newsletter.ts
// Generates a newsletter via Claude API, compiles MJML, builds a Mailchimp ZIP,
// and creates a Base64 preview HTML.

import Anthropic from '@anthropic-ai/sdk'
// @ts-ignore
import mjml2html from 'mjml'
import JSZip from 'jszip'
import { NEWSLETTER_SYSTEM_PROMPT } from './newsletter-prompt'
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
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildUserPrompt(input: NewsletterInput): string {
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
    `Logo-URL: ${agency?.logo_url ?? '(kein Logo)'}`,
    `Adresse: ${agency?.address ?? ''}`,
    `E-Mail: ${agency?.order_email ?? ''}`,
    `Telefon: ${agency?.phone ?? ''}`,
    '',
    '## HERSTELLER',
    `Name: ${mfg?.name ?? ''}`,
    `Kategorie: ${mfg?.category ?? ''}`,
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

  if (textAssets.length > 0) {
    lines.push('## TEXTENTWURF (hochgeladene Assets)')
    lines.push('(Als zusätzliche Basis verwenden, humanisieren)')
    for (const a of textAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
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

async function buildImageBlocks(
  assets: CampaignAsset[],
  postcardAssets: CampaignAsset[]
): Promise<Anthropic.ImageBlockParam[]> {
  const imageAssets = [
    ...assets.filter((a) => a.asset_category === 'image'),
    ...postcardAssets.filter(
      (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
    ),
  ]

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
  imageAssets: CampaignAsset[]
): Promise<{ zipBuffer: Buffer; warnings: string[] }> {
  const zip = new JSZip()
  const warnings: string[] = []
  let htmlWithRelativePaths = html

  for (const asset of imageAssets) {
    try {
      const res = await fetch(asset.file_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      zip.file(asset.file_name, buf)
      // Replace all occurrences of the absolute URL with the relative filename
      htmlWithRelativePaths = htmlWithRelativePaths.split(asset.file_url).join(asset.file_name)
    } catch (e: any) {
      warnings.push(`Bild übersprungen: ${asset.file_name} (${e.message})`)
    }
  }

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

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateNewsletter(input: NewsletterInput): Promise<NewsletterOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const textPrompt = buildUserPrompt(input)
  const imageBlocks = await buildImageBlocks(input.assets, input.postcardAssets)

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

  const [{ zipBuffer }, previewHtml] = await Promise.all([
    buildZip(html, allImageAssets),
    buildPreview(html, allImageAssets),
  ])

  return { mjmlSource, zipBuffer, previewHtml }
}
