'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import QuickReportModal from './QuickReportModal'
import type { Manufacturer, Agency } from '@/lib/supabase/types'

interface ManufacturerWithAgency extends Manufacturer {
  agencies: Agency
}

export default function QuickReportButton({
  manufacturers,
}: {
  manufacturers: ManufacturerWithAgency[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary border border-border rounded-sm hover:border-accent-warm/50 hover:text-accent-warm transition-colors"
      >
        <FileSpreadsheet size={14} />
        Schnell-Report
      </button>

      {open && (
        <QuickReportModal manufacturers={manufacturers} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
