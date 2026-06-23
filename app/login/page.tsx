export const dynamic = 'force-dynamic'

import { LayoutGrid } from 'lucide-react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Logo + Brand */}
        <div className="mb-10 text-center">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
            <LayoutGrid size={22} strokeWidth={1.75} className="text-accent-warm" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
            Collezioni Design Syndicate
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Bitte melde dich an, um deine Kampagnen zu verwalten.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}
