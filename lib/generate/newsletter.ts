// lib/generate/newsletter.ts
// Generates a newsletter via Claude API, compiles MJML, builds a Mailchimp ZIP,
// and creates a Base64 preview HTML.

import Anthropic from '@anthropic-ai/sdk'
// @ts-ignore
import mjml2html from 'mjml'
import JSZip from 'jszip'
import { NEWSLETTER_SYSTEM_PROMPT } from './newsletter-prompt'
import type { CampaignWithManufacturer, CampaignAsset } from '@/lib/supabase/types'

export interface NewsletterInput {
  campaign: CampaignWithManufacturer
  assets: CampaignAsset[]          // Own campaign assets (input only)
  postcardAssets: CampaignAsset[]  // Linked postcard assets for style reference
  feedback?: string                 // Optional regeneration feedback
}

export interface NewsletterOutput {
  mjmlSource: string
  zipBuffer: Buffer
  previewHtml: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildUserPrompt(input: NewsletterInput): string {
  const { campaign, assets, postcardAssets, feedback } = input
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
    '',
    '## KAMPAGNE',
    `Titel: ${campaign.title}`,
    `Datum: ${campaign.scheduled_date}`,
    campaign.notes ? `Hinweis: ${campaign.notes}` : '',
    '',
  ]

  if (textAssets.length > 0) {
    lines.push('## TEXTENTWURF')
    lines.push('(Texte aus hochgeladenen Assets — als Basis verwenden, humanisieren)')
    for (const a of textAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (imageAssets.length > 0) {
    lines.push('## BILDER (eigene Kampagne)')
    for (const a of imageAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (ctaAssets.length > 0) {
    lines.push('## CTA-LINKS')
    for (const a of ctaAssets) lines.push(`- ${a.file_name}: ${a.file_url}`)
    lines.push('')
  }

  if (postcardImages.length > 0) {
    lines.push('## POSTKARTE (Stil-Referenz — Newsletter muss visuell passen)')
    for (const a of postcardImages) lines.push(`- ${a.file_name}: ${a.file_url}`)
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

function buildImageBlocks(
  assets: CampaignAsset[],
  postcardAssets: CampaignAsset[]
): Anthropic.ImageBlockParam[] {
  const imageAssets = [
    ...assets.filter((a) => a.asset_category === 'image'),
    ...postcardAssets.filter(
      (a) => a.asset_category === 'image' || a.asset_category === 'postcard_pdf'
    ),
  ]
  return imageAssets.map((a) => ({
    type: 'image' as const,
    source: {
      type: 'url' as const,
      url: a.file_url,
    },
  }))
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
      preview = preview.split(asset.file_url).join(`data:${asset.file_type};base64,${b64}`)
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
  const imageBlocks = buildImageBlocks(input.assets, input.postcardAssets)

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: textPrompt },
    ...imageBlocks,
  ]

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: NEWSLETTER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const mjmlSource = (response.content[0] as Anthropic.TextBlock).text.trim()

  if (!mjmlSource.startsWith('<mjml')) {
    throw new Error('INVALID_MJML:' + mjmlSource)
  }

  const { html, errors } = mjml2html(mjmlSource, { validationLevel: 'strict' })

  if (errors && errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage ?? e.message).join('; ')
    throw new Error('MJML_ERROR:' + msg + '|||' + mjmlSource)
  }

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
