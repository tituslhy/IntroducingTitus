import type { Metadata } from 'next'
import Experience from '@/components/Experience'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Experience | Titus Lim',
  description: 'My roles, from supply-chain forecasting to leading AI engineering.',
  alternates: { canonical: `${SITE_URL}/experience` },
}

export default function ExperiencePage() {
  return (
    <main>
      {/* Experience has a sticky year rail — opacity-only reveal keeps it intact */}
      <Reveal variant="fade">
        <Experience />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
