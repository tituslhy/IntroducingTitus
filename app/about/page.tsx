import type { Metadata } from 'next'
import About from '@/components/About'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

export const metadata: Metadata = {
  title: 'About | Titus Lim',
  description: 'Chemical engineer turned AI engineer: every tool I have picked up since 2015, as a periodic table, and what drives me.',
  alternates: { canonical: `${SITE_URL}/about` },
}

export default function AboutPage() {
  return (
    <main>
      <Reveal>
        <About />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
