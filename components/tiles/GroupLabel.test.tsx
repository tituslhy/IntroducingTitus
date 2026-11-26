import { render, screen } from '@testing-library/react'
import GroupLabel from './GroupLabel'

describe('GroupLabel', () => {
  it('renders its children as a level-4 heading', () => {
    render(<GroupLabel>Scholarships</GroupLabel>)
    expect(screen.getByRole('heading', { level: 4, name: 'Scholarships' })).toBeInTheDocument()
  })

  it('carries the id it is given, so something can be labelled by it', () => {
    render(<GroupLabel id="results-label">Results</GroupLabel>)
    expect(screen.getByRole('heading', { name: 'Results' })).toHaveAttribute('id', 'results-label')
  })

  it('renders in either tone without changing its text', () => {
    const { rerender } = render(<GroupLabel tone="paper">During NUS</GroupLabel>)
    expect(screen.getByRole('heading', { name: 'During NUS' })).toBeInTheDocument()
    rerender(<GroupLabel tone="latte">During NUS</GroupLabel>)
    expect(screen.getByRole('heading', { name: 'During NUS' })).toBeInTheDocument()
  })
})
