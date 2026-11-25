import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { COLOPHON_PATH } from '@/lib/content'
import { openCopilot } from '@/lib/copilot-events'
import { STARTER_PROMPTS } from '@/lib/starter-prompts'
import HeroAsk from './HeroAsk'

jest.mock('@/lib/copilot-events', () => ({
  ...jest.requireActual('@/lib/copilot-events'),
  openCopilot: jest.fn(),
}))

describe('HeroAsk (the phones-only Ask Titus card in the hero)', () => {
  beforeEach(() => {
    jest.mocked(openCopilot).mockClear()
  })

  describe('layout', () => {
    it('is hidden from 900px up, where the front page door takes over', () => {
      const { container } = render(<HeroAsk />)
      expect(container.firstElementChild).toHaveClass('min-[900px]:hidden')
    })

    it('shows the Ask Titus label and the one-line deck', () => {
      render(<HeroAsk />)
      expect(screen.getByText('Ask Titus')).toBeInTheDocument()
      expect(screen.getByText('Ask me anything about my work. Answers come from this site and my articles, with sources.')).toBeInTheDocument()
    })

    it('is a plain div, not a labelled region, so the front page has no Ask Titus region', () => {
      const { container } = render(<HeroAsk />)
      expect(container.firstElementChild?.tagName).toBe('DIV')
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Ask Titus' })).not.toBeInTheDocument()
    })
  })

  describe('starter prompts', () => {
    it('renders a button for each of the first two STARTER_PROMPTS, in a list', () => {
      render(<HeroAsk />)
      const list = screen.getByRole('list')
      const buttons = within(list).getAllByRole('button')
      expect(buttons).toHaveLength(2)
      expect(buttons[0]).toHaveTextContent(STARTER_PROMPTS[0])
      expect(buttons[1]).toHaveTextContent(STARTER_PROMPTS[1])
      expect(screen.getByRole('button', { name: STARTER_PROMPTS[0] })).toHaveAttribute('type', 'button')
      expect(screen.getByRole('button', { name: STARTER_PROMPTS[1] })).toHaveAttribute('type', 'button')
    })

    it('leaves out the third and fourth prompts', () => {
      render(<HeroAsk />)
      expect(screen.queryByText(STARTER_PROMPTS[2])).not.toBeInTheDocument()
      expect(screen.queryByText(STARTER_PROMPTS[3])).not.toBeInTheDocument()
    })

    it('calls openCopilot in chat mode with the first prompt when it is clicked', async () => {
      const user = userEvent.setup()
      render(<HeroAsk />)
      await user.click(screen.getByRole('button', { name: STARTER_PROMPTS[0] }))
      expect(openCopilot).toHaveBeenCalledTimes(1)
      expect(openCopilot).toHaveBeenCalledWith('chat', STARTER_PROMPTS[0])
    })

    it('calls openCopilot in chat mode with the second prompt when it is clicked', async () => {
      const user = userEvent.setup()
      render(<HeroAsk />)
      await user.click(screen.getByRole('button', { name: STARTER_PROMPTS[1] }))
      expect(openCopilot).toHaveBeenCalledTimes(1)
      expect(openCopilot).toHaveBeenCalledWith('chat', STARTER_PROMPTS[1])
    })
  })

  describe('how it works', () => {
    it('links "How it works" to the colophon', () => {
      render(<HeroAsk />)
      expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', COLOPHON_PATH)
      expect(COLOPHON_PATH).toBe('/colophon')
    })

    it('does not open the copilot when the link is clicked', async () => {
      const user = userEvent.setup()
      render(<HeroAsk />)
      await user.click(screen.getByRole('link', { name: 'How it works' }))
      expect(openCopilot).not.toHaveBeenCalled()
    })
  })
})
