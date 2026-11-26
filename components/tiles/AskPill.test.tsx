import { fireEvent, render, screen } from '@testing-library/react'
import { COPILOT_OPEN_EVENT, type CopilotOpenDetail } from '@/lib/copilot-events'
import AskPill from './AskPill'

const ask = { label: 'the retrieval platform', question: 'How does the Illumina retrieval platform work?' }

/** Collects every copilot:open event fired while the test runs. */
function listen() {
  const events: CustomEvent<CopilotOpenDetail>[] = []
  const handler = (e: Event) => events.push(e as CustomEvent<CopilotOpenDetail>)
  window.addEventListener(COPILOT_OPEN_EVENT, handler)
  return { events, stop: () => window.removeEventListener(COPILOT_OPEN_EVENT, handler) }
}

describe('AskPill', () => {
  it('is a button labelled with the item it asks about', () => {
    render(<AskPill ask={ask} />)
    const button = screen.getByRole('button', { name: 'Ask about the retrieval platform' })
    expect(button).toHaveAttribute('type', 'button')
  })

  it('opens Ask Titus in chat mode with the item’s question when clicked', () => {
    const { events, stop } = listen()
    render(<AskPill ask={ask} />)
    fireEvent.click(screen.getByRole('button', { name: /Ask about/ }))
    stop()

    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ mode: 'chat', prompt: ask.question })
  })

  it('sends the question once per click, and fires nothing until clicked', () => {
    const { events, stop } = listen()
    render(<AskPill ask={ask} />)
    expect(events).toHaveLength(0)
    const button = screen.getByRole('button', { name: /Ask about/ })
    fireEvent.click(button)
    fireEvent.click(button)
    stop()
    expect(events).toHaveLength(2)
  })

  it('renders the same button in the latte tone, still naming its item', () => {
    render(<AskPill ask={ask} tone="latte" />)
    expect(screen.getByRole('button', { name: 'Ask about the retrieval platform' })).toBeInTheDocument()
  })

  it('hides the arrow from screen readers, so the name is just the label', () => {
    render(<AskPill ask={ask} />)
    expect(screen.getByRole('button', { name: 'Ask about the retrieval platform' }).querySelector('[aria-hidden="true"]')).toHaveTextContent('→')
  })

  describe('with its own wording (text)', () => {
    it('shows the text in place of the “Ask about” wording', () => {
      render(<AskPill ask={ask} text="Ask what to read first" />)
      expect(screen.getByRole('button', { name: 'Ask what to read first' })).toBeInTheDocument()
      expect(screen.queryByText(/Ask about/)).not.toBeInTheDocument()
    })

    it('still asks the item’s question when clicked', () => {
      const { events, stop } = listen()
      render(<AskPill ask={ask} text="Ask what to read first" />)
      fireEvent.click(screen.getByRole('button', { name: 'Ask what to read first' }))
      stop()
      expect(events).toHaveLength(1)
      expect(events[0].detail).toEqual({ mode: 'chat', prompt: ask.question })
    })

    it('keeps the arrow hidden from screen readers after custom text', () => {
      render(<AskPill ask={ask} text="Ask what to read first" />)
      const button = screen.getByRole('button', { name: 'Ask what to read first' })
      expect(button.querySelector('[aria-hidden="true"]')).toHaveTextContent('→')
      expect(button).toHaveTextContent('Ask what to read first→')
    })

    it('uses the custom text in the latte tone too', () => {
      render(<AskPill ask={ask} tone="latte" text="Ask what to read first" />)
      expect(screen.getByRole('button', { name: 'Ask what to read first' })).toBeInTheDocument()
    })

    it('keeps the default “Ask about” wording when text is left undefined', () => {
      render(<AskPill ask={ask} text={undefined} />)
      expect(screen.getByRole('button', { name: 'Ask about the retrieval platform' })).toBeInTheDocument()
    })
  })

  describe('layout', () => {
    it.each(['paper', 'latte'] as const)('never wraps the label onto two lines (%s tone)', (tone) => {
      render(<AskPill ask={ask} tone={tone} text="Ask what to read first" />)
      expect(screen.getByRole('button')).toHaveClass('whitespace-nowrap')
    })

    it('keeps whitespace-nowrap on the default wording too', () => {
      render(<AskPill ask={ask} />)
      expect(screen.getByRole('button')).toHaveClass('whitespace-nowrap')
    })
  })
})
