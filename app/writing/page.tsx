import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import WritingPaper from '@/components/writing/WritingPaper'
import { SITE_URL } from '@/lib/content'
import { CORRECTIONS, FEATURED_BY, SOCIAL, pageFolio } from '@/lib/profile'
import { desks, editions, stories } from '@/lib/writing-paper'

export const metadata: Metadata = {
  title: 'Writing | Titus Lim',
  description: 'Technical articles on Medium about building AI systems, set out as a newspaper: an edition per year, a desk per theme.',
  alternates: { canonical: `${SITE_URL}/writing` },
}

export default function WritingPage() {
  const all = stories()
  return (
    <main>
      <WritingPaper
        stories={all}
        desks={desks(all)}
        editions={editions(all)}
        folio={pageFolio('/writing')}
        featuredBy={FEATURED_BY}
        corrections={CORRECTIONS}
        mediumUrl={SOCIAL.medium}
      />
      <Footer />
    </main>
  )
}
