import AgencyForm from '@/components/AgencyForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewAgencyPage() {
  return (
    <div>
      <Link
        href="/agencies"
        className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft size={12} />
        Agenturen
      </Link>
      <h1 className="text-2xl font-light text-text-primary mb-8">Neue Agentur</h1>
      <AgencyForm />
    </div>
  )
}
