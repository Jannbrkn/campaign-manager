// scripts/seed-campaigns.mjs
// Run with: node --env-file=.env.local scripts/seed-campaigns.mjs
//
// Seeds all 2026 campaign chains based on manufacturer schedule from Excel.
// Skips any postcard that already exists for that manufacturer+date combination.
//
// Schedule logic:
//   Postcard   → Friday (as planned)
//   Newsletter → +5 days (next Wednesday)
//   Reports    → newsletter +5 days (next Monday)

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function monthLabel(dateStr) {
  // Use UTC date to avoid timezone drift
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// ─── 2026 Campaign Schedule ────────────────────────────────────────────────────
// All postcard dates are Fridays.
// Planning rationale: spread campaigns to minimise newsletter conflicts
// (2+ newsletters in the same calendar week). Unavoidable conflicts are grouped
// with same-brand or same-agency pairings where possible.
//
// Conflict weeks (intentional groupings):
//   Feb 06: B&B + B&B Outdoor (same brand family → newsletters Feb 11)
//   Feb 13: Tuuci Norden + Tuuci Südlich (same brand → newsletters Feb 18)
//   Apr 17: Tuuci Norden + Tuuci Südlich (same brand → newsletters Apr 22)
//   Sep 25: Lodes + Magis (same agency Design Collection → newsletters Sep 30)
//   Oct 09: Maxalto + ADL (autumn run → newsletters Oct 14)
//   Nov 06: Barovier & Toso + DePadova (autumn run → newsletters Nov 11)
//   Nov 13: Arflex + Lodes 2nd (same week → newsletters Nov 18)
//   Nov 20: Baxter + Magis 2nd (same week → newsletters Nov 25)

const schedule = [
  // ── Januar ───────────────────────────────────────────────────────────────────
  ['Salvatori',         '2026-01-09'],   // NL Jan 14  · Reports Jan 19
  ['Arflex',            '2026-01-30'],   // NL Feb  4  · Reports Feb  9

  // ── Februar (6 Hersteller, 4 Freitage → 2 Konflikwochen) ──────────────────
  ['B&B',               '2026-02-06'],   // ↓ Konflikt: B&B + B&B Outdoor
  ['B&B Outdoor',       '2026-02-06'],   // NL Feb 11  · Reports Feb 16
  ['Tuuci (Norden)',    '2026-02-13'],   // ↓ gleiche Marke
  ['Tuuci (Südlich)',   '2026-02-13'],   // NL Feb 18  · Reports Feb 23
  ['Promemoria',        '2026-02-20'],   // NL Feb 25  · Reports Mär  2
  ['Maxalto',           '2026-02-27'],   // NL Mär  4  · Reports Mär  9

  // ── März ─────────────────────────────────────────────────────────────────────
  ['Arclinea',          '2026-03-06'],   // NL Mär 11  · Reports Mär 16
  ['Baxter',            '2026-03-13'],   // NL Mär 18  · Reports Mär 23
  ['DePadova',          '2026-03-20'],   // NL Mär 25  · Reports Mär 30

  // ── April (mitte-ende) ───────────────────────────────────────────────────────
  ['Tuuci (Norden)',    '2026-04-17'],   // ↓ gleiche Marke
  ['Tuuci (Südlich)',   '2026-04-17'],   // NL Apr 22  · Reports Apr 27
  ['B&B Outdoor',       '2026-04-24'],   // NL Apr 29  · Reports Mai  4

  // ── Mai ──────────────────────────────────────────────────────────────────────
  ['Marset',            '2026-05-01'],   // NL Mai  6  · Reports Mai 11
  ['Salvatori',         '2026-05-08'],   // NL Mai 13  · Reports Mai 18
  ['B&B',               '2026-05-22'],   // NL Mai 27  · Reports Jun  1

  // ── September (Herbst-Lauf) ──────────────────────────────────────────────────
  ['Barovier & Toso',   '2026-09-04'],   // NL Sep  9  · Reports Sep 14
  ['Baxter',            '2026-09-11'],   // NL Sep 16  · Reports Sep 21
  ['DePadova',          '2026-09-18'],   // NL Sep 23  · Reports Sep 28
  ['Lodes Hamburg/Ost', '2026-09-25'],   // ↓ gleiche Agentur (Design Collection)
  ['Magis Nord/Mitte',  '2026-09-25'],   // NL Sep 30  · Reports Okt  5

  // ── Oktober ──────────────────────────────────────────────────────────────────
  ['Marset',            '2026-10-02'],   // NL Okt  7  · Reports Okt 12
  ['Maxalto',           '2026-10-09'],   // ↓ Konflikt: Maxalto + ADL (Herbst)
  ['ADL',               '2026-10-09'],   // NL Okt 14  · Reports Okt 19
  ['Röthlisberger',     '2026-10-16'],   // NL Okt 21  · Reports Okt 26
  ['Promemoria',        '2026-10-23'],   // NL Okt 28  · Reports Nov  2
  ['B&B',               '2026-10-30'],   // NL Nov  4  · Reports Nov  9

  // ── November (Jahresabschluss) ───────────────────────────────────────────────
  ['Barovier & Toso',   '2026-11-06'],   // ↓ Konflikt: Barovier + DePadova
  ['DePadova',          '2026-11-06'],   // NL Nov 11  · Reports Nov 16
  ['Arflex',            '2026-11-13'],   // ↓ Konflikt: Arflex + Lodes 2nd
  ['Lodes Hamburg/Ost', '2026-11-13'],   // NL Nov 18  · Reports Nov 23
  ['Baxter',            '2026-11-20'],   // ↓ Konflikt: Baxter + Magis 2nd
  ['Magis Nord/Mitte',  '2026-11-20'],   // NL Nov 25  · Reports Nov 30
  ['Terzani',           '2026-11-27'],   // NL Dez  2  · Reports Dez  7
]

async function main() {
  // Load all manufacturers from DB
  const { data: manufacturers, error: mfgErr } = await supabase
    .from('manufacturers')
    .select('id, name')

  if (mfgErr) {
    console.error('Failed to load manufacturers:', mfgErr)
    process.exit(1)
  }

  const mfgMap = {}
  for (const m of manufacturers) {
    mfgMap[m.name] = m.id
  }

  console.log(`Loaded ${manufacturers.length} manufacturers from DB`)
  console.log('Names:', Object.keys(mfgMap).sort().join(', '))
  console.log()

  let created = 0
  let skipped = 0
  let errors = 0

  for (const [mfgName, postcardDate] of schedule) {
    const manufacturerId = mfgMap[mfgName]

    if (!manufacturerId) {
      console.warn(`⚠️  Hersteller nicht gefunden: "${mfgName}" — übersprungen`)
      skipped++
      continue
    }

    const newsletterDate = addDays(postcardDate, 5)   // +5 days → Wednesday
    const reportDate     = addDays(newsletterDate, 5) // +5 days → Monday

    const postcardMonth  = monthLabel(postcardDate)
    const newsletterMonth = monthLabel(newsletterDate)
    const reportMonth    = monthLabel(reportDate)

    // Skip if postcard already exists for this manufacturer+date
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('manufacturer_id', manufacturerId)
      .eq('scheduled_date', postcardDate)
      .eq('type', 'postcard')
      .maybeSingle()

    if (existing) {
      console.log(`⏭  Bereits vorhanden: ${mfgName} – Postkarte ${postcardDate}`)
      skipped++
      continue
    }

    // ── Insert postcard ──────────────────────────────────────────────────────
    const { data: postcard, error: pcErr } = await supabase
      .from('campaigns')
      .insert({
        manufacturer_id:    manufacturerId,
        type:               'postcard',
        title:              `${mfgName} – Postkarte ${postcardMonth}`,
        scheduled_date:     postcardDate,
        status:             'planned',
        notes:              null,
        review_approved:    false,
        auto_send_emails:   null,
        linked_postcard_id: null,
        linked_newsletter_id: null,
      })
      .select('id')
      .single()

    if (pcErr) {
      console.error(`✗ Postkarte ${mfgName} ${postcardDate}:`, pcErr.message)
      errors++
      continue
    }

    // ── Insert newsletter ────────────────────────────────────────────────────
    const { data: newsletter, error: nlErr } = await supabase
      .from('campaigns')
      .insert({
        manufacturer_id:    manufacturerId,
        type:               'newsletter',
        title:              `${mfgName} – Newsletter ${newsletterMonth}`,
        scheduled_date:     newsletterDate,
        status:             'planned',
        notes:              null,
        review_approved:    false,
        auto_send_emails:   null,
        linked_postcard_id: postcard.id,
        linked_newsletter_id: null,
      })
      .select('id')
      .single()

    if (nlErr) {
      console.error(`✗ Newsletter ${mfgName} ${newsletterDate}:`, nlErr.message)
      errors++
      continue
    }

    // ── Insert reports ───────────────────────────────────────────────────────
    const { error: rptErr } = await supabase
      .from('campaigns')
      .insert([
        {
          manufacturer_id:    manufacturerId,
          type:               'report_internal',
          title:              `${mfgName} – Report Intern ${reportMonth}`,
          scheduled_date:     reportDate,
          status:             'planned',
          notes:              null,
          review_approved:    false,
          auto_send_emails:   null,
          linked_postcard_id: null,
          linked_newsletter_id: newsletter.id,
        },
        {
          manufacturer_id:    manufacturerId,
          type:               'report_external',
          title:              `${mfgName} – Report Extern ${reportMonth}`,
          scheduled_date:     reportDate,
          status:             'planned',
          notes:              null,
          review_approved:    false,
          auto_send_emails:   null,
          linked_postcard_id: null,
          linked_newsletter_id: newsletter.id,
        },
      ])

    if (rptErr) {
      console.error(`✗ Reports ${mfgName} ${reportDate}:`, rptErr.message)
      errors++
      continue
    }

    console.log(`✓ ${mfgName.padEnd(20)} Postkarte ${postcardDate}  →  NL ${newsletterDate}  →  Reports ${reportDate}`)
    created++
  }

  console.log()
  console.log(`─────────────────────────────────────────`)
  console.log(`Kampagnenketten erstellt : ${created}`)
  console.log(`Übersprungen             : ${skipped}`)
  console.log(`Fehler                   : ${errors}`)
  console.log(`Gesamt Kampagnen (4×)    : ${created * 4} Einträge`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
