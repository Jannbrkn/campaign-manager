import { createClient } from '@/lib/supabase/server'
import type { Manufacturer, Agency } from '@/lib/supabase/types'
import QuickReportButton from '@/components/dashboard/QuickReportButton'
import AutoReportsPanel from '@/components/reports/AutoReportsPanel'

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
      <h1 className="text-2xl font-light text-text-primary mb-8">Reports</h1>

      <div className="space-y-4">
        {/* Schnell-Report — primary action */}
        <div className="bg-surface border border-border rounded-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-text-primary mb-1">Schnell-Report</h2>
              <p className="text-xs text-text-secondary">
                Reports aus Mailchimp-CSV-Exporten generieren — ohne Kampagne im Kalender.
              </p>
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
