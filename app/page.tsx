import Hero from '@/components/Hero'
import OpeningLine from '@/components/front/OpeningLine'
import Doors from '@/components/front/Doors'
import Footer from '@/components/Footer'

/** The front page: who I am, what I build with, and a door to each page. */
export default function Home() {
  return (
    <main>
      <Hero />
      <OpeningLine />
      <Doors />
      <Footer />
    </main>
  )
}
