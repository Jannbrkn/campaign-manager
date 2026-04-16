// lib/mailchimp/matching.ts
// Match DB newsletter campaigns to Mailchimp campaigns via scored heuristics.
//
// Scoring philosophy:
// - Strong signals (collapsed-name match in MC title) dominate
// - Weak signals (token in subject, date proximity) accumulate
// - Hard requirement: within 30 days of scheduled_date
// - Minimum score threshold prevents noise matches

export interface NormalizedString {
  full: string      // all lowercase alphanum, no spaces: "bbitalia"
  tokens: string[]  // ["b", "b", "italia"] — tokens ≥2 chars only
}

export interface McCampaignLike {
  id: string
  web_id: number | string
  send_time: string
  status?: string
  settings?: {
    title?: string | null
    subject_line?: string | null
  }
}

export interface DbCampaignLike {
  id: string
  title: string
  scheduled_date: string
  manufacturer_name: string
}

export interface MatchResult {
  mc: McCampaignLike
  score: number
  diffDays: number
  reasons: string[]  // for debugging / transparency
}

/** Normalize a string for fuzzy comparison. Strips parens content, punctuation, collapses spaces. */
export function normalize(s: string | null | undefined): NormalizedString {
  const cleaned = (s ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')       // strip parens content: "Tuuci (Südlich)" → "tuuci"
    .replace(/[\/|\\]/g, ' ')       // replace slashes with space: "Lodes Hamburg/Ost" → "lodes hamburg ost"
    .replace(/[^a-z0-9äöüß\s]/g, ' ') // strip remaining punctuation, keep umlauts
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned.split(' ').filter((t) => t.length >= 2)
  const full = cleaned.replace(/\s/g, '')

  return { full, tokens }
}

export function daysBetween(a: string | number | Date, b: string | number | Date): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}

/**
 * Score a single MC candidate against a DB campaign.
 * Returns 0 if beyond 30-day window (hard limit). Higher score = better match.
 */
export function scoreMatch(db: DbCampaignLike, mc: McCampaignLike): { score: number; diffDays: number; reasons: string[] } {
  const reasons: string[] = []
  const diffDays = daysBetween(db.scheduled_date, mc.send_time)
  if (diffDays > 30) return { score: 0, diffDays, reasons: ['>30d'] }

  const mfgNorm = normalize(db.manufacturer_name)
  const dbTitleNorm = normalize(db.title)
  const mcTitleNorm = normalize(mc.settings?.title ?? '')
  const mcSubjectNorm = normalize(mc.settings?.subject_line ?? '')

  let score = 0

  // Strongest: full collapsed manufacturer name in MC title (handles "De Padova" = "depadova")
  if (mfgNorm.full.length >= 4 && mcTitleNorm.full.includes(mfgNorm.full)) {
    score += 10
    reasons.push(`title~"${mfgNorm.full}" (+10)`)
  } else if (mfgNorm.full.length >= 4 && mcSubjectNorm.full.includes(mfgNorm.full)) {
    score += 7
    reasons.push(`subject~"${mfgNorm.full}" (+7)`)
  }

  // Token-level matches (≥3 chars to avoid false positives from "bb")
  for (const tok of mfgNorm.tokens) {
    if (tok.length < 3) continue
    if (mcTitleNorm.tokens.includes(tok)) {
      score += 5
      reasons.push(`title:"${tok}" (+5)`)
    } else if (mcSubjectNorm.tokens.includes(tok)) {
      score += 3
      reasons.push(`subject:"${tok}" (+3)`)
    }
  }

  // DB title's non-manufacturer tokens found in MC title (e.g. "Mai", "Messe", "2026")
  for (const tok of dbTitleNorm.tokens) {
    if (tok.length < 4) continue
    if (mfgNorm.tokens.includes(tok)) continue  // already counted
    if (mcTitleNorm.tokens.includes(tok)) score += 1
  }

  // Date proximity: linear bonus 0-7 points, plus bonus for very close
  score += Math.max(0, 14 - diffDays) * 0.5
  if (diffDays <= 7) score += 3
  if (diffDays <= 2) score += 2

  return { score: Math.round(score * 10) / 10, diffDays: Math.round(diffDays * 10) / 10, reasons }
}

/**
 * Find the best-matching MC campaign from a pool. Returns null if no candidate
 * crosses the minimum score threshold (default 5 — requires at least a name hit
 * or very tight date alignment).
 */
export function findBestMatch(
  db: DbCampaignLike,
  pool: McCampaignLike[],
  minScore: number = 5
): MatchResult | null {
  let best: MatchResult | null = null

  for (const mc of pool) {
    if (mc.status && mc.status !== 'sent') continue
    if (!mc.send_time) continue

    const { score, diffDays, reasons } = scoreMatch(db, mc)
    if (score < minScore) continue
    if (!best || score > best.score) {
      best = { mc, score, diffDays, reasons }
    }
  }

  return best
}
