import type { Metadata } from 'next'
import About from '@/components/About'
import TechStack from '@/components/TechStack'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

// Part 1 of the redesign moves this section here unchanged; Part 2 redesigns the page.
export const metadata: Metadata = {
  title: 'About | Titus Lim',
  description: 'Chemical engineer turned AI engineer: how I work, and the tools I work with.',
  alternates: { canonical: `${SITE_URL}/about` },
}

export default function AboutPage() {
  return (
    <main>
      <Reveal>
        <About />
      </Reveal>
      <Reveal>
        <TechStack />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
