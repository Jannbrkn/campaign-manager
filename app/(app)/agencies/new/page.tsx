import AgencyForm from '@/components/AgencyForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewAgencyPage() {
  return (
    <div className="p-8">
      <div className="max-w-xl">
        <Link
          href="/agencies"
          className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
          Agenturen
        </Link>
        <div className="mb-8">
          <h1 className="page-title">Neue Agentur</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Lege eine neue Agentur mit Kontakt- und Rechnungsdaten an.
          </p>
        </div>
        <AgencyForm />
      </div>
    </div>
  )
}
