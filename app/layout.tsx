import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import ThemeProvider from '@/components/ThemeProvider'
import './globals.css'

// Body / UI typeface — variable, exposes --font-sans for Tailwind `font-sans`.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

// Display typeface — luxury serif for page titles, the brand wordmark and large
// figures. Exposes --font-display for Tailwind `font-display`.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'Campaign Manager — Collezioni Design Syndicate',
  description: 'Kampagnen-Management für Luxusmöbel-Agenturen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
