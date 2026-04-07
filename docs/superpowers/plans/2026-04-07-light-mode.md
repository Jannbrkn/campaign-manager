# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a one-click light/dark theme toggle that persists across sessions.

**Architecture:** CSS custom properties power all colors — `:root` holds dark values (current look), `html.light` overrides them with warm light values. Tailwind reads the same semantic class names (`bg-surface`, `text-text-primary` etc.) via CSS variable references, so zero component rewrites needed. A ThemeProvider client component manages the `light` class on `<html>` and persists to localStorage. Sidebar gets the toggle button plus two conditional class fixes for its opacity-based hover/active states.

**Tech Stack:** Next.js 14, Tailwind CSS v3, React context, localStorage

---

## Files

| File | Action |
|---|---|
| `app/globals.css` | Add CSS variable definitions (dark + light) |
| `tailwind.config.ts` | Point custom colors at CSS vars |
| `components/ThemeProvider.tsx` | New — context + toggle logic |
| `app/layout.tsx` | Wrap body with ThemeProvider |
| `components/Sidebar.tsx` | Add toggle button + fix opacity classes |

---

### Task 1: CSS variables + Tailwind config

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace globals.css with variable-aware version**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Dark theme (default) ──────────────────────────────── */
:root {
  --color-background:    #0A0A0A;
  --color-surface:       #1A1A1A;
  --color-border:        #2A2A2A;
  --color-text-primary:  #FFFFFF;
  --color-text-secondary:#999999;
  --color-accent-warm:   #EDE8E3;
  --color-accent-gold:   #C4A87C;
  --color-success:       #2E7D32;
  --color-warning:       #E65100;
}

/* ── Light theme ───────────────────────────────────────── */
html.light {
  --color-background:    #F5F4F2;
  --color-surface:       #FFFFFF;
  --color-border:        #E4E0DB;
  --color-text-primary:  #1A1A1A;
  --color-text-secondary:#6B6B6B;
  --color-accent-warm:   #5C4D42;
  --color-accent-gold:   #B8953E;
  --color-success:       #2E7D32;
  --color-warning:       #E65100;
}

* {
  box-sizing: border-box;
}

body {
  background-color: var(--color-background);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track  { background: var(--color-background); }
::-webkit-scrollbar-thumb  { background: var(--color-border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary); }
```

- [ ] **Step 2: Update tailwind.config.ts to reference CSS vars**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background:       'var(--color-background)',
        surface:          'var(--color-surface)',
        border:           'var(--color-border)',
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'accent-warm':    'var(--color-accent-warm)',
        'accent-gold':    'var(--color-accent-gold)',
        success:          'var(--color-success)',
        warning:          'var(--color-warning)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(theme): CSS variables for dark/light color tokens"
```

---

### Task 2: ThemeProvider component

**Files:**
- Create: `components/ThemeProvider.tsx`

- [ ] **Step 1: Create ThemeProvider**

```tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'light') {
      setTheme('light')
      document.documentElement.classList.add('light')
    }
  }, [])

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      document.documentElement.classList.toggle('light', next === 'light')
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ThemeProvider.tsx
git commit -m "feat(theme): ThemeProvider with localStorage persistence"
```

---

### Task 3: Wire ThemeProvider into root layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update root layout**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ThemeProvider from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Campaign Manager — Collezioni Design Syndicate',
  description: 'Kampagnen-Management für Luxusmöbel-Agenturen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.className} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(theme): wrap root layout with ThemeProvider"
```

---

### Task 4: Sidebar toggle button + theme-aware classes

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar with toggle and conditional hover/active classes**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Building2, Factory, Settings, LogOut, ImageIcon, BarChart2, CalendarPlus, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AlertsPanel from './AlertsPanel'
import { useTheme } from './ThemeProvider'

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/performance',   label: 'Performance',   icon: BarChart2 },
  { href: '/planning',      label: 'Jahresplanung', icon: CalendarPlus },
  { href: '/calendar',      label: 'Kalender',      icon: CalendarDays },
  { href: '/agencies',      label: 'Agenturen',     icon: Building2 },
  { href: '/manufacturers', label: 'Hersteller',    icon: Factory },
  { href: '/logos',         label: 'Logos',         icon: ImageIcon },
  { href: '/settings',      label: 'Einstellungen', icon: Settings },
]

export default function Sidebar({ alertCount }: { alertCount: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const hoverBg = isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
  const hoverText = 'hover:text-text-primary'

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
                  ? `${isLight ? 'bg-accent-warm/10' : 'bg-[#EDE8E3]/10'} text-accent-warm`
                  : `text-text-secondary ${hoverText} ${hoverBg}`
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Alerts + Theme toggle + Sign out */}
      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <AlertsPanel initialCount={alertCount} />
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-sm text-sm text-text-secondary ${hoverText} ${hoverBg} transition-colors`}
        >
          {isLight ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
          {isLight ? 'Dark Mode' : 'Light Mode'}
        </button>
        <button
          onClick={handleSignOut}
          className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-sm text-sm text-text-secondary ${hoverText} ${hoverBg} transition-colors`}
        >
          <LogOut size={16} strokeWidth={1.5} />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit and push**

```bash
git add components/Sidebar.tsx
git commit -m "feat(theme): add Sun/Moon toggle to sidebar"
git push origin master
```
