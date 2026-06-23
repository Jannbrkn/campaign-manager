import { createClient } from '@/lib/supabase/server'
import type { Manufacturer, Agency } from '@/lib/supabase/types'
import QuickReportButton from '@/components/dashboard/QuickReportButton'
import AutoReportsPanel from '@/components/reports/AutoReportsPanel'
import { Zap } from 'lucide-react'

async function getManufacturers() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('manufacturers')
    .select('*, agencies(*)')
    .order('name')
  return (data ?? []) as unknown as (Manufacturer & { agencies: Agency })[]
}

export default async function ReportsPage() {
  const manufacturers = await getManufacturers()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="page-title">Reports</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Lead-Auswertungen aus Mailchimp-Exporten erstellen und automatische Reports verwalten.
        </p>
      </div>

      <div className="space-y-8">
        {/* Schnell-Report — primary action */}
        <div className="card p-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-accent-warm">
                <Zap size={20} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-sm font-medium text-text-primary mb-1">Schnell-Report</h2>
                <p className="text-xs text-text-secondary max-w-prose">
                  Reports aus Mailchimp-CSV-Exporten generieren — ohne Kampagne im Kalender.
                </p>
              </div>
            </div>
            <QuickReportButton manufacturers={manufacturers as any} />
          </div>
        </div>

        {/* Auto-Reports — background batch */}
        <AutoReportsPanel />
      </div>
    </div>
  )
}
