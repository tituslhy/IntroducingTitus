import type { Metadata } from 'next'
import { Projects } from '@/components/ProjectsWriting'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

// Part 1 of the redesign moves this section here unchanged; Part 2 redesigns the page.
export const metadata: Metadata = {
  title: 'Projects | Titus Lim',
  description: 'Selected projects, at work, in public, and for fun, plus my open-source contributions.',
  alternates: { canonical: `${SITE_URL}/projects` },
}

export default function ProjectsPage() {
  return (
    <main>
      <Reveal>
        <Projects />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
