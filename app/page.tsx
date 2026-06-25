import Navigation from '@/components/Navigation'
import Hero from '@/components/Hero'
import About from '@/components/About'
import TechStack from '@/components/TechStack'
import Footer from '@/components/Footer'
import Experience from '@/components/Experience'
import ProjectsWriting from '@/components/ProjectsWriting'
import Reveal from '@/components/Reveal'

export default function Home() {
  return (
    <main>
      <Navigation />
      <Hero />
      <Reveal>
        <About />
      </Reveal>
      <Reveal>
        <TechStack />
      </Reveal>
      {/* Experience has a sticky year rail — opacity-only reveal keeps it intact */}
      <Reveal variant="fade">
        <Experience />
      </Reveal>
      <Reveal>
        <ProjectsWriting />
      </Reveal>
      <Reveal>
        <Footer />
      </Reveal>
    </main>
  )
}
