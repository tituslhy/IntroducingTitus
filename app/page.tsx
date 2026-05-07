import Navigation from '@/components/Navigation'
import Hero from '@/components/Hero'
import TechStack from '@/components/TechStack'
import Passions from '@/components/Passions'
import SocialLinks from '@/components/SocialLinks'
import Experience from '@/components/Experience'
import ProjectsWriting from '@/components/ProjectsWriting'

export default function Home() {
  return (
    <main>
      <Navigation />
      <Hero />
      <Passions />
      <TechStack />
      <Experience />
      <ProjectsWriting />
      <SocialLinks />
    </main>
  )
}
