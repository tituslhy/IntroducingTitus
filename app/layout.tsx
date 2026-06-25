import type { Metadata } from 'next'
import './globals.css'
import CopilotBubble from '@/components/CopilotBubble'

export const metadata: Metadata = {
  title: 'Titus Lim | GenAI Engineer & Architect',
  description: 'GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.',
  openGraph: {
    title: 'Titus Lim | GenAI Engineer & Architect',
    description: 'GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.',
    url: 'https://introducing-titus.vercel.app',
    siteName: 'Titus Lim',
    type: 'website',
  },
  alternates: {
    canonical: 'https://introducing-titus.vercel.app',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/headshot.jpeg" />
        <link rel="apple-touch-icon" href="/headshot.jpeg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Without JS the IntersectionObserver never fires; force reveals visible. */}
        <noscript>
          <style>{`.reveal,.reveal-soft{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="bg-paper text-ink font-serif antialiased">
        {children}
        <CopilotBubble />
      </body>
    </html>
  )
}
