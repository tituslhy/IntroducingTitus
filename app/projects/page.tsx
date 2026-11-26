import type { Metadata } from 'next'
import Projects from '@/components/Projects'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Projects | Titus Lim',
  description: 'Things I have built, at work and for myself: featured projects, earlier machine learning work, and my open-source contributions.',
  alternates: { canonical: `${SITE_URL}/projects` },
}

export default function ProjectsPage() {
  return (
    <main>
      <Projects />
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
