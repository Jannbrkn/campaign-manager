// scripts/seed-manufacturer-tags.mjs
// Run with: node --env-file=.env.local scripts/seed-manufacturer-tags.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const tags = [
  {
    name: 'Röthlisberger',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Agentur (order@)',
  },
  {
    name: 'Arclinea',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Ladenbau, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Agentur (order@), Ladenbau',
  },
  {
    name: 'Promemoria',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Agentur (order@)',
  },
  {
    name: 'Marset',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Landschaftsarchitekt, Lichtarchitekt, HH-Lichtarchitekt, Objekthändler, Hotelbau, Botique, Ladenbau, Schiffsbauer, Outdoor Potent, Agentur, Hotelkette',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, HH-Lichtarchitekt, Landschaftsarchitekt, Lichtarchitekt, Objekthändler, Hotelbau, Botique, Ladenbau, Realestate, Schiffsbauer, Outdoor Potent, Hotelkette, Agentur (order@)',
  },
  {
    name: 'Maxalto',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Botique, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Objekthändler, Hotelbau, Botique, Ladenbau, Realestate, Schiffsbauer, Hotelkette',
  },
  {
    name: 'B&B Outdoor',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Landschaftsarchitekt, Outdoor Potent, Schiffsbauer, Hotelkette, Hotelbau, Botique, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Outdoor Potent, Schiffsbauer, Hotelbau, Botique, Realestate, Objekthändler, Landschaftsarchitekt, Hotelkette',
  },
  {
    name: 'Tuuci (Norden)',
    postcard_tags: 'Interessenten, A-Architekt, B-Architekt, Botique, Hotelbau, Agentur, Landschaftsarchitekt, Outdoor Potent, Schiffsbauer, Realestate, Kunde',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Landschaftsarchitekt, Objekthändler, Hotelbau, Botique, Realestate, Schiffsbauer, Outdoor Potent, Hotelkette, Agentur (order@)',
  },
  {
    name: 'B&B',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Schiffsbauer, Ladenbau, Realestate, Hotelbau, Botique, Hotelkette, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Hotelbau, Ladenbau, Realestate, Schiffsbauer, Botique, Objekthändler, Hotelkette',
  },
  {
    name: 'Lodes Hamburg/Ost',
    postcard_tags: 'Kunde, Interessenten, HH-Lichtarchitekt, Lichtarchitekt, A-Architekt, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, HH-Lichtarchitekt, Lichtarchitekt, Objekthändler, Hotelbau, Botique, Ladenbau, Hotelkette, Agentur (order@), Schiffsbauer, Realestate',
  },
  {
    name: 'Magis Nord/Mitte',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Objekthändler, Agentur, Hotelkette',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Objekthändler, Hotelkette, Agentur (order@), Outdoor Potent',
  },
  {
    name: 'Salvatori',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Hotelbau, Botique, Realestate, Agentur',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Hotelbau, Hotelkette, Botique, Realestate, Agentur (order@), C-Architekt',
  },
  {
    name: 'Barovier & Toso',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, HH-Lichtarchitekt, Lichtarchitekt, Botique, Agentur, Schiffsbauer',
    newsletter_tags: 'Interessenten, Kunde, A-Architekt, B-Architekt, C-Architekt, HH-Lichtarchitekt, Lichtarchitekt, Botique, Hotelbau, Hotelkette, Agentur (order@), Schiffsbauer',
  },
  {
    name: 'Arflex',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Hotelbau, Botique, Hotelkette, Agentur, Ladenbau',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Hotelbau, Botique, Ladenbau, Hotelkette, Agentur (order@)',
  },
  {
    name: 'Baxter',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Hotelbau, Botique, Agentur, Hotelkette',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Hotelbau, Botique, Hotelkette, Agentur (order@)',
  },
  {
    name: 'ADL',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Agentur, Objekthändler',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Objekthändler, Hotelbau, Botique, Hotelkette, Ladenbau, Agentur (order@), Realestate',
  },
  {
    name: 'Terzani',
    postcard_tags: 'Kunde, Interessenten, Agentur, HH-Lichtarchitekt, Lichtarchitekt',
    newsletter_tags: 'Kunde, Interessenten, HH-Lichtarchitekt, Lichtarchitekt, Objekthändler, Hotelbau, Botique, Ladenbau, Schiffsbauer, Hotelkette, Agentur (order@)',
  },
  {
    name: 'Tuuci (Südlich)',
    postcard_tags: 'Interessenten, A-Architekt, B-Architekt, Botique, Hotelbau, Agentur, Landschaftsarchitekt, Outdoor Potent, Schiffsbauer, Realestate, Kunde',
    newsletter_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, C-Architekt, Landschaftsarchitekt, Objekthändler, Hotelbau, Botique, Realestate, Schiffsbauer, Outdoor Potent, Agentur (order@), Hotelkette',
  },
  {
    name: 'DePadova',
    postcard_tags: 'Kunde, Interessenten, A-Architekt, B-Architekt, Botique, Agentur',
    newsletter_tags: 'Kunde, Interessenten, B-Architekt, A-Architekt, C-Architekt, Botique, Agentur (order@), Hotelbau, Hotelkette, Schiffsbauer, Realestate, Ladenbau',
  },
]

async function main() {
  let updated = 0
  let notFound = 0

  for (const { name, postcard_tags, newsletter_tags } of tags) {
    const { data, error } = await supabase
      .from('manufacturers')
      .update({ postcard_tags, newsletter_tags })
      .eq('name', name)
      .select('id')

    if (error) {
      console.error(`✗ ${name}:`, error.message)
    } else if (!data || data.length === 0) {
      console.warn(`⚠️  Nicht gefunden: "${name}"`)
      notFound++
    } else {
      console.log(`✓ ${name}`)
      updated++
    }
  }

  console.log(`\nAktualisiert: ${updated} / Nicht gefunden: ${notFound}`)
}

main().catch(console.error)
