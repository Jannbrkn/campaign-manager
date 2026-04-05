// lib/generate/scoring.ts
// Pure functions for Mailchimp CSV lead scoring and prioritization.
// No I/O — all functions take plain data and return plain data.

export interface Contact {
  email: string
  firstName: string
  lastName: string
  phone: string | null
  opens: number
  clicks: number
}

export type Priority = 'A' | 'B' | 'C'

export interface ScoredContact extends Contact {
  score: number
  priority: Priority
  mailType: 'Persönlich' | 'Info-Adresse'
}

// Prefixes that identify non-personal (info) email addresses.
const INFO_LOCALS = new Set(['info', 'office', 'kontakt', 'contact', 'mail'])

export function isPersonalEmail(email: string): boolean {
  const local = email.split('@')[0].toLowerCase()
  return !INFO_LOCALS.has(local)
}

export function scoreContact(c: Pick<Contact, 'opens' | 'clicks' | 'email'>): number {
  const mailBonus = isPersonalEmail(c.email) ? 2 : 0
  return c.clicks * 3 + c.opens * 1 + mailBonus
}

export function priorityOf(
  c: Pick<Contact, 'clicks' | 'opens' | 'email'>,
  score: number
): Priority {
  if (score >= 8 || (c.clicks >= 1 && isPersonalEmail(c.email))) return 'A'
  if (score >= 5 || c.opens >= 4) return 'B'
  return 'C'
}

/**
 * Deduplicate, score, filter, and sort contacts from a Mailchimp CSV.
 *
 * Rules:
 * - Deduplicate by email (case-insensitive), aggregating opens+clicks
 * - Exclude contacts with ≤ 3 opens AND 0 clicks
 * - Max 30 contacts in result, but additional contacts with clicks ≥ 1 are always included
 * - Sort: score desc → clicks desc → opens desc
 */
export function filterAndScore(contacts: Contact[]): ScoredContact[] {
  // Deduplicate
  const map = new Map<string, Contact>()
  for (const c of contacts) {
    const key = c.email.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.opens += c.opens
      existing.clicks += c.clicks
    } else {
      map.set(key, { ...c })
    }
  }

  // Score and filter
  const scored: ScoredContact[] = []
  const mapValues = Array.from(map.values())
  for (const c of mapValues) {
    if (c.opens <= 3 && c.clicks === 0) continue
    const score = scoreContact(c)
    scored.push({
      ...c,
      score,
      priority: priorityOf(c, score),
      mailType: isPersonalEmail(c.email) ? 'Persönlich' : 'Info-Adresse',
    })
  }

  // Sort
  scored.sort(
    (a, b) => b.score - a.score || b.clicks - a.clicks || b.opens - a.opens
  )

  // Apply limit: top 30 + any additional clickers
  const top30 = scored.slice(0, 30)
  const extraClickers = scored.slice(30).filter((c) => c.clicks > 0)
  return [...top30, ...extraClickers]
}
