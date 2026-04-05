// app/api/planning/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

const MONTH_MAP: Record<string, number> = {
  Januar: 0, Februar: 1, März: 2, April: 3, Mai: 4, Juni: 5,
  Juli: 6, August: 7, September: 8, Oktober: 9, November: 10, Dezember: 11,
}

const MONTH_SHORT: Record<number, string> = {
  0: 'Jan', 1: 'Feb', 2: 'Mär', 3: 'Apr', 4: 'Mai', 5: 'Jun',
  6: 'Jul', 7: 'Aug', 8: 'Sep', 9: 'Okt', 10: 'Nov', 11: 'Dez',
}

/** Returns all Fridays (as Date objects) in a given month/year. */
function getFridaysInMonth(year: number, month: number): Date[] {
  const fridays: Date[] = []
  const d = new Date(year, month, 1)
  // Advance to first Friday (day 5)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month) {
    fridays.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return fridays
}

/** Formats a Date as YYYY-MM-DD string (local time). */
function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Adds N days to a date, returns a new Date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const year = Number(body.year)
  if (!year || year < 2020 || year > 2040) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load all manufacturers
  const { data: manufacturers, error: mfgErr } = await admin
    .from('manufacturers')
    .select('id, name, postcard_months')
    .order('name')
  if (mfgErr || !manufacturers) {
    return NextResponse.json({ error: 'Failed to load manufacturers' }, { status: 500 })
  }

  // Load all campaigns in the target year to determine which manufacturers to skip
  const { data: existing } = await admin
    .from('campaigns')
    .select('manufacturer_id')
    .gte('scheduled_date', `${year}-01-01`)
    .lte('scheduled_date', `${year}-12-31`)

  const skipSet = new Set((existing ?? []).map((c: { manufacturer_id: string }) => c.manufacturer_id))

  // Build month → sorted manufacturer list (for Friday spreading)
  const monthGroups: Map<number, { id: string; name: string; postcard_months: string | null }[]> = new Map()
  for (const mfg of manufacturers) {
    if (skipSet.has(mfg.id)) continue
    if (!mfg.postcard_months) continue
    const months = mfg.postcard_months.split(',').map((s: string) => s.trim())
    for (const monthName of months) {
      const monthIdx = MONTH_MAP[monthName]
      if (monthIdx === undefined) continue
      if (!monthGroups.has(monthIdx)) monthGroups.set(monthIdx, [])
      monthGroups.get(monthIdx)!.push(mfg)
    }
  }
  // Each month group is already sorted alphabetically because manufacturers were fetched with .order('name')

  let created = 0
  const skipped = skipSet.size
  const errors: string[] = []

  for (const [monthIdx, mfgs] of Array.from(monthGroups.entries())) {
    const fridays = getFridaysInMonth(year, monthIdx)
    if (fridays.length === 0) continue
    const monthLabel = `${MONTH_SHORT[monthIdx]} ${year}`

    for (let i = 0; i < mfgs.length; i++) {
      const mfg = mfgs[i]
      const postcardDate = fridays[i % fridays.length]
      const newsletterDate = addDays(postcardDate, 5)  // Wednesday after
      const reportDate = addDays(newsletterDate, 5)    // Monday after newsletter

      try {
        // Insert postcard
        const { data: postcard, error: pcErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'postcard',
            title: `${mfg.name} Postkarte ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(postcardDate),
            linked_postcard_id: null,
            linked_newsletter_id: null,
          })
          .select('id')
          .single()
        if (pcErr || !postcard) throw new Error(pcErr?.message ?? 'postcard insert failed')

        // Insert newsletter
        const { data: newsletter, error: nlErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'newsletter',
            title: `${mfg.name} Newsletter ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(newsletterDate),
            linked_postcard_id: postcard.id,
            linked_newsletter_id: null,
          })
          .select('id')
          .single()
        if (nlErr || !newsletter) throw new Error(nlErr?.message ?? 'newsletter insert failed')

        // Insert internal report
        const { error: irErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'report_internal',
            title: `${mfg.name} Report intern ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(reportDate),
            linked_postcard_id: null,
            linked_newsletter_id: newsletter.id,
          })
        if (irErr) throw new Error(irErr.message)

        // Insert external report
        const { error: erErr } = await admin
          .from('campaigns')
          .insert({
            manufacturer_id: mfg.id,
            type: 'report_external',
            title: `${mfg.name} Report extern ${monthLabel}`,
            status: 'planned',
            scheduled_date: toDateString(reportDate),
            linked_postcard_id: null,
            linked_newsletter_id: newsletter.id,
          })
        if (erErr) throw new Error(erErr.message)

        created += 4
      } catch (err: any) {
        errors.push(`${mfg.name} ${monthLabel}: ${err.message}`)
      }
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
