import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Fonts are loaded via next/font/google in app/layout.tsx, which exposes
        // them as CSS variables (--font-newsreader / --font-ibm-plex-mono) on
        // the <html> element rather than literal family-name strings.
        serif: ['var(--font-newsreader)', '"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Paper / ink / rule reference the CSS custom properties in app/globals.css
        // (single source of truth). Enables bg-paper, text-ink-soft, border-rule, etc.
        paper: {
          DEFAULT: 'var(--paper)',
          deep: 'var(--paper-deep)',
          band: 'var(--paper-band)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
        },
        indigo: 'var(--indigo)',
        amber: {
          DEFAULT: 'oklch(0.62 0.155 55)', // aged editorial amber — replaces #F59E0B
          400: 'var(--amber-line)',
          500: 'oklch(0.62 0.155 55)',
          600: 'oklch(0.62 0.155 55)',
          soft: 'var(--amber-soft)',
          line: 'var(--amber-line)',
        },
      },
    },
  },
  plugins: [],
}
export default config
