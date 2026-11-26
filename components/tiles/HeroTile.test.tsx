import { render, screen, within } from '@testing-library/react'
import HeroTile from './HeroTile'

describe('HeroTile', () => {
  it('shows the caption beneath the figure', () => {
    render(<HeroTile figure="3.98" caption="GPA out of 4.0" />)
    expect(screen.getByText('GPA out of 4.0')).toBeInTheDocument()
  })

  it('shows the whole figure as plain text, so screen readers get it once', () => {
    const { container } = render(<HeroTile figure="3.98" caption="GPA out of 4.0" />)
    expect(within(container).getByText('3.98')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden]')).toBeNull()
    expect(container.querySelector('.sr-only')).toBeNull()
  })

  it('shows a word figure in full', () => {
    render(<HeroTile figure="Top Student" caption="Award" />)
    expect(screen.getByText('Top Student')).toBeInTheDocument()
  })

  it('shows its corner note when one is given', () => {
    render(<HeroTile figure="3.98" caption="GPA out of 4.0" note="Dean's List" />)
    expect(screen.getByText("Dean's List")).toBeInTheDocument()
  })

  it('leaves out the corner note when none is given', () => {
    render(<HeroTile figure="2nd Upper" caption="Class Honours" />)
    expect(screen.queryByText("Dean's List")).toBeNull()
  })

  it('carries the data-tech key a results-row result points at', () => {
    const { container } = render(<HeroTile figure="3.98" caption="GPA out of 4.0" dataTech="3.98 gpa out of 4.0" />)
    expect(container.querySelector('[data-tech="3.98 gpa out of 4.0"]')).toHaveTextContent('GPA out of 4.0')
  })

  it('has no data-tech when no key is given, so the row cannot point at it', () => {
    const { container } = render(<HeroTile figure="3.98" caption="GPA out of 4.0" />)
    expect(container.querySelector('[data-tech]')).toBeNull()
  })

  it('puts the corner note’s own key on the note, so the row can ring it', () => {
    const { container } = render(
      <HeroTile figure="54" caption="containers" note="90%+ test coverage" dataTech="fictional-bassoon figure" noteTech="fictional-bassoon secondary" />,
    )
    expect(container.querySelector('[data-tech="fictional-bassoon secondary"]')).toHaveTextContent('90%+ test coverage')
    expect(container.querySelector('[data-tech="fictional-bassoon figure"]')).toHaveTextContent('containers')
  })

  it('leaves the note without a data-tech when no noteTech is given', () => {
    const { container } = render(<HeroTile figure="54" caption="containers" note="90%+ test coverage" />)
    expect(container.querySelector('[data-tech]')).toBeNull()
  })

  describe('tone', () => {
    it('is amber by default: amber figure, no indigo glow', () => {
      const { container } = render(<HeroTile figure="54" caption="containers" />)
      expect(container.querySelector('.glow-tile')).not.toHaveClass('glow-tile-indigo')
      expect(container.querySelector('.font-serif')).toHaveClass('text-amber-hi')
    })

    it('is amber when tone is set to amber', () => {
      const { container } = render(<HeroTile figure="54" caption="containers" tone="amber" />)
      expect(container.querySelector('.glow-tile')).not.toHaveClass('glow-tile-indigo')
      expect(container.querySelector('.font-serif')).toHaveClass('text-amber-hi')
    })

    it('is indigo when tone is indigo: indigo glow, and the figure in the indigo colour rather than amber', () => {
      const { container } = render(<HeroTile figure="16" caption="components" tone="indigo" />)
      expect(container.querySelector('.glow-tile')).toHaveClass('glow-tile-indigo')
      const figure = container.querySelector('.font-serif')
      expect(figure).toHaveClass('text-[oklch(0.82_0.08_254)]')
      expect(figure).not.toHaveClass('text-amber-hi')
    })

    it('keeps the indigo tile’s caption and corner note unchanged', () => {
      render(<HeroTile figure="16" caption="components" note="$9M anticipated savings" tone="indigo" />)
      expect(screen.getByText('components')).toBeInTheDocument()
      expect(screen.getByText('$9M anticipated savings')).toBeInTheDocument()
    })
  })
})
