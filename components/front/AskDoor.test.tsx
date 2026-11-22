import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openCopilot } from '@/lib/copilot-events'
import { ASK_FOLIO } from '@/lib/profile'
import { STARTER_PROMPTS } from '@/lib/starter-prompts'
import AskDoor from './AskDoor'
import { DOOR_BOX } from './door-box'

jest.mock('@/lib/copilot-events', () => ({
  ...jest.requireActual('@/lib/copilot-events'),
  openCopilot: jest.fn(),
}))

const door = (container: HTMLElement) => container.querySelector<HTMLElement>('#ask') as HTMLElement

describe('AskDoor (the Ask Titus door on the front page)', () => {
  beforeEach(() => {
    jest.mocked(openCopilot).mockClear()
  })

  describe('layout', () => {
    it('is a div with the id ask, which the page can link to', () => {
      const { container } = render(<AskDoor />)
      expect(door(container).tagName).toBe('DIV')
    })

    it('shows the Ask Titus folio, one after the last page, from ASK_FOLIO', () => {
      const { container } = render(<AskDoor />)
      expect(within(door(container)).getByText(ASK_FOLIO)).toBeInTheDocument()
      expect(ASK_FOLIO).toBe('06')
    })

    it('has the heading Ask Titus as an h3 with the id ask-heading', () => {
      const { container } = render(<AskDoor />)
      const heading = container.querySelector('#ask-heading')
      expect(heading?.tagName).toBe('H3')
      expect(heading).toHaveTextContent('Ask Titus')
    })

    it('sends the heading link to the colophon, which explains how Ask Titus works', () => {
      render(<AskDoor />)
      const link = screen.getByRole('link', { name: 'Ask Titus' })
      expect(link).toHaveAttribute('href', '/colophon')
      expect(within(link).getByRole('heading', { level: 3 })).toBeInTheDocument()
    })

    it('shows the italic deck', () => {
      render(<AskDoor />)
      expect(screen.getByText('Ask me anything about my work. Answers come from this site and my articles, with sources.')).toBeInTheDocument()
    })

    it('marks the arrows as decorative', () => {
      const { container } = render(<AskDoor />)
      const arrows = Array.from(container.querySelectorAll('[aria-hidden="true"]')).map((el) => el.textContent)
      expect(arrows).toEqual(['→', 'ask →', 'ask →', 'ask →'])
    })
  })

  describe('starter prompts', () => {
    it('shows the first three prompts from the shared list, as buttons', () => {
      render(<AskDoor />)
      for (const prompt of STARTER_PROMPTS.slice(0, 3)) {
        const button = screen.getByRole('button', { name: prompt })
        expect(button).toHaveAttribute('type', 'button')
      }
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    it('leaves out the fourth prompt', () => {
      render(<AskDoor />)
      expect(screen.queryByText(STARTER_PROMPTS[3])).not.toBeInTheDocument()
    })

    it('lists the prompts in a list, one item each', () => {
      const { container } = render(<AskDoor />)
      const items = container.querySelectorAll('ul > li')
      expect(items).toHaveLength(3)
      items.forEach((li) => expect(li.querySelector('button')).not.toBeNull())
    })

    it('keeps the buttons outside the heading link, so no interactive control nests in a link', () => {
      const { container } = render(<AskDoor />)
      expect(container.querySelector('a button')).toBeNull()
      expect(container.querySelectorAll('a')).toHaveLength(1)
    })

    it('opens the drawer in chat mode with the clicked prompt', async () => {
      const user = userEvent.setup()
      render(<AskDoor />)

      await user.click(screen.getByRole('button', { name: STARTER_PROMPTS[2] }))

      expect(openCopilot).toHaveBeenCalledTimes(1)
      expect(openCopilot).toHaveBeenCalledWith('chat', STARTER_PROMPTS[2])
    })

    it('sends each prompt its own text, not the one before', async () => {
      const user = userEvent.setup()
      render(<AskDoor />)

      for (const prompt of STARTER_PROMPTS.slice(0, 3)) {
        await user.click(screen.getByRole('button', { name: prompt }))
      }

      expect(jest.mocked(openCopilot).mock.calls.map(([, prompt]) => prompt)).toEqual(STARTER_PROMPTS.slice(0, 3))
    })

    it('opens the drawer from the keyboard as well', async () => {
      const user = userEvent.setup()
      render(<AskDoor />)

      screen.getByRole('button', { name: STARTER_PROMPTS[0] }).focus()
      await user.keyboard('{Enter}')

      expect(openCopilot).toHaveBeenCalledWith('chat', STARTER_PROMPTS[0])
    })
  })

  describe('shared door box', () => {
    it('sits in the same rounded box as the page doors', () => {
      const { container } = render(<AskDoor />)
      expect(container.querySelector('#ask')).toHaveClass(...DOOR_BOX.split(' '))
    })
  })
})
