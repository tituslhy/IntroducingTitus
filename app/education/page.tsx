import type { Metadata } from 'next'
import Education from '@/components/Education'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import { SITE_URL } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Education | Titus Lim',
  description: "A Master's in AI at SMU, chemical engineering at NUS with an exchange at UConn and a summer school at Oxford, and the honours along the way.",
  alternates: { canonical: `${SITE_URL}/education` },
}

export default function EducationPage() {
  return (
    <main>
      {/* Sticky year rail — opacity-only reveal keeps it intact, as on Experience */}
      <Reveal variant="fade">
        <Education />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
