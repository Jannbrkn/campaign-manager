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
        'surface-2':      'var(--color-surface-2)',
        'surface-hover':  'var(--color-surface-hover)',
        border:           'var(--color-border)',
        'border-strong':  'var(--color-border-strong)',
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'accent-warm':    'var(--color-accent-warm)',
        'accent-gold':    'var(--color-accent-gold)',
        ring:             'var(--color-ring)',
        success:          'var(--color-success)',
        warning:          'var(--color-warning)',
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Cambria', 'serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Tuned for a near-black surface: a tight crisp shadow + a soft halo.
        soft:     '0 1px 2px 0 rgba(0,0,0,0.30)',
        card:     '0 1px 3px 0 rgba(0,0,0,0.35), 0 8px 24px -8px rgba(0,0,0,0.45)',
        elevated: '0 12px 32px -8px rgba(0,0,0,0.60), 0 24px 48px -12px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
}

export default config
