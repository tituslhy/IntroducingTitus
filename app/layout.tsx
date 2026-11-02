import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import CopilotBubble from '@/components/CopilotBubble'
import { PAGE_TARGETS } from '@/lib/profile'
import { SITE_DESCRIPTION, SITE_URL } from '@/lib/content'

// Self-hosted (not next/font/google): a font-fetch failure would otherwise be
// a build-time or first-paint dependency on Google's servers, and typography
// carries this site's entire design. Files in public/fonts are the Google
// Fonts `latin`-subset WOFF2s for Newsreader (variable, upright + italic,
// full weight range) and IBM Plex Mono (400/500/600) — the same families,
// weights, and styles the original Google Fonts `<link>` requested.
const newsreader = localFont({
  src: [
    { path: '../public/fonts/newsreader-normal-variable.woff2', style: 'normal', weight: '200 800' },
    { path: '../public/fonts/newsreader-italic-variable.woff2', style: 'italic', weight: '200 800' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
})

// IBM Plex Mono is used for tags, labels, and folios at 400/500/600 (see
// `font-normal` / `font-medium` / `font-semibold` usage on font-mono text).
const ibmPlexMono = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

const TITLE = 'Titus Lim | GenAI Engineer & Architect'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: 'Titus Lim',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Lim Hsien Yong (Titus) — I build AI systems, from architecture to the boardroom.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: SITE_URL,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${ibmPlexMono.variable}`}>
      <head>
        {/* Without JS the IntersectionObserver never fires; force reveals visible. */}
        <noscript>
          <style>{`.reveal,.reveal-soft{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="bg-paper text-ink font-serif antialiased">
        {children}
        {/* Only id + label cross to the client; copilot-only narrative stays server-side. */}
        <CopilotBubble targets={PAGE_TARGETS.map(({ id, label }) => ({ id, label }))} />
      </body>
    </html>
  )
}
