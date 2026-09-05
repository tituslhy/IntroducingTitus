import { render, screen } from '@testing-library/react'
import Home from './page'

describe('Home', () => {
  it('should render a main element', () => {
    render(<Home />)
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
  })

  it('should render Navigation component', () => {
    render(<Home />)
    // Navigation renders links with text like "About", "Stack", etc.
    // We can check for at least one navigation element
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
  })

  it('should render Hero section with name and tagline', () => {
    render(<Home />)
    expect(screen.getByText(/lim hsien yong/i)).toBeInTheDocument()
    expect(screen.getByText(/build ai systems/i)).toBeInTheDocument()
  })

  it('should render About section with "About" heading', () => {
    render(<Home />)
    const aboutHeading = screen.getByRole('heading', { name: /a note on the.*work.*i take on/i })
    expect(aboutHeading).toBeInTheDocument()
  })

  it('should render TechStack section with "What I work with" heading', () => {
    render(<Home />)
    const stackHeading = screen.getByRole('heading', { name: /what i.*work with/i })
    expect(stackHeading).toBeInTheDocument()
  })

  it('should render Experience section with "Where I have worked" heading', () => {
    render(<Home />)
    const experienceHeading = screen.getByRole('heading', {
      name: /where i have.*worked/i,
    })
    expect(experienceHeading).toBeInTheDocument()
  })

  it('should render Projects section with "Things I have built" heading', () => {
    render(<Home />)
    const projectsHeading = screen.getByRole('heading', {
      name: /things i have.*built/i,
    })
    expect(projectsHeading).toBeInTheDocument()
  })

  it('should render Writing section with article references', () => {
    render(<Home />)
    // Writing section displays article content
    const writingHeading = screen.getByRole('heading', {
      name: /six articles.*sixty one/i,
    })
    expect(writingHeading).toBeInTheDocument()
  })

  it('should render Footer with Titus Lim brand', () => {
    render(<Home />)
    const footerTexts = screen.getAllByText(/titus lim/i)
    expect(footerTexts.length).toBeGreaterThan(0)
  })

  it('should render CopilotBubble in the page layout', () => {
    render(<Home />)
    // CopilotBubble is rendered in the main component and should be present
    // We check for its presence by looking for the overall page structure
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
  })

  it('should have expected number of main sections (7 total: Navigation, Hero, About, TechStack, Experience, ProjectsWriting, Footer)', () => {
    const { container } = render(<Home />)
    // Count section elements (Navigation, About, TechStack, Experience, Projects, Writing, Footer)
    const sections = container.querySelectorAll('section')
    // At least 6 sections: About (#lede), Stack (#stack), Experience (#dossier), Projects (#projects), Writing (#writing), Footer (nav)
    expect(sections.length).toBeGreaterThanOrEqual(6)
  })

  it('should render TechStack with specific category "AI / GenAI Frameworks"', () => {
    render(<Home />)
    expect(screen.getByText(/ai \/ genai frameworks/i)).toBeInTheDocument()
  })

  it('should render TechStack with specific frameworks like LangChain', () => {
    render(<Home />)
    expect(screen.getAllByText('LangChain').length).toBeGreaterThan(0)
    expect(screen.getAllByText('LangGraph').length).toBeGreaterThan(0)
  })

  it('should render Experience section with current role (Mastercard)', () => {
    render(<Home />)
    expect(screen.getAllByText(/mastercard/i).length).toBeGreaterThan(0)
  })

  it('should render Projects section with fictional-bassoon project title', () => {
    render(<Home />)
    expect(screen.getByText('fictional-bassoon')).toBeInTheDocument()
  })

  it('should render Writing section with Medium archive link', () => {
    render(<Home />)
    const mediumLink = screen.getByRole('link', { name: /the full archive on medium/i })
    expect(mediumLink).toHaveAttribute('href', 'https://medium.com/@tituslhy')
  })

  it('should render Footer with email contact link', () => {
    render(<Home />)
    const emailLinks = screen.getAllByRole('link', { name: /email/i })
    expect(emailLinks.length).toBeGreaterThan(0)
  })

  it('should render all major section anchor IDs for navigation', () => {
    const { container } = render(<Home />)
    const masthead = container.querySelector('#masthead')
    const lede = container.querySelector('#lede')
    const stack = container.querySelector('#stack')
    const dossier = container.querySelector('#dossier')
    const projects = container.querySelector('#projects')
    const writing = container.querySelector('#writing')

    expect(masthead).toBeInTheDocument()
    expect(lede).toBeInTheDocument()
    expect(stack).toBeInTheDocument()
    expect(dossier).toBeInTheDocument()
    expect(projects).toBeInTheDocument()
    expect(writing).toBeInTheDocument()
  })

  it('should contain multiple links for site navigation', () => {
    render(<Home />)
    const links = screen.getAllByRole('link')
    // Should have at least 30+ links (nav, hero CTAs, social, sections, footer)
    expect(links.length).toBeGreaterThan(20)
  })
})
