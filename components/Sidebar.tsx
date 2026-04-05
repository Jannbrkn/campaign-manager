'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Building2, Factory, Settings, LogOut, ImageIcon, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AlertsPanel from './AlertsPanel'

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/performance',   label: 'Performance',  icon: BarChart2 },
  { href: '/calendar',      label: 'Kalender',     icon: CalendarDays },
  { href: '/agencies',      label: 'Agenturen',    icon: Building2 },
  { href: '/manufacturers', label: 'Hersteller',   icon: Factory },
  { href: '/logos',         label: 'Logos',        icon: ImageIcon },
  { href: '/settings',      label: 'Einstellungen', icon: Settings },
]

export default function Sidebar({ alertCount }: { alertCount: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 bg-surface border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-7 border-b border-border">
        <span className="text-xs tracking-[0.2em] uppercase text-text-secondary">
          Campaign Manager
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                active
                  ? 'bg-[#EDE8E3]/10 text-accent-warm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Alerts + Sign out */}
      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <AlertsPanel initialCount={alertCount} />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          <LogOut size={16} strokeWidth={1.5} />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
