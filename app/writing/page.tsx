import type { Metadata } from 'next'
import { Writing } from '@/components/ProjectsWriting'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

// Part 1 of the redesign moves this section here unchanged; Part 2 redesigns the page.
export const metadata: Metadata = {
  title: 'Writing | Titus Lim',
  description: 'Technical articles on Medium about building AI systems.',
  alternates: { canonical: `${SITE_URL}/writing` },
}

export default function WritingPage() {
  return (
    <main>
      <Reveal>
        <Writing />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
