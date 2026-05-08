import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Titus Lim | GenAI Engineer & Architect',
  description: 'GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.',
  openGraph: {
    title: 'Titus Lim | GenAI Engineer & Architect',
    description: 'GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.',
    url: 'https://tituslhy.github.io',
    siteName: 'Titus Lim',
    type: 'website',
  },
  alternates: {
    canonical: 'https://tituslhy.github.io',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/headshot.jpeg" />
        <link rel="apple-touch-icon" href="/headshot.jpeg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0a0a0a] text-neutral-200 font-mono antialiased">
        {children}
      </body>
    </html>
  )
}
