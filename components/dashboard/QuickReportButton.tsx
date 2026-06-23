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
        title="Schnell-Report erstellen"
        aria-label="Schnell-Report erstellen"
        className="btn-secondary"
      >
        <FileSpreadsheet size={16} strokeWidth={1.75} />
        Schnell-Report
      </button>

      {open && (
        <QuickReportModal manufacturers={manufacturers} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
