import { render } from '@testing-library/react'
import { IlluminaAnswer, IlluminaReady } from './IlluminaDiagrams'

/** The text of each box, in the order it appears on the page (the text before any small note). */
const boxes = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.dg-node')).map((n) => n.childNodes[0].textContent)
/** The light-up delay of each box, in seconds, as set by --d. */
const delays = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.dg-node')).map((n) => Number(n.style.getPropertyValue('--d')))
const box = (root: HTMLElement, text: string) => Array.from(root.querySelectorAll<HTMLElement>('.dg-node')).find((n) => n.childNodes[0].textContent === text)!

describe('IlluminaReady', () => {
  it('is labelled as getting ready, and runs from documents to vector collections', () => {
    const { container } = render(<IlluminaReady />)
    expect(container.querySelector('.dg-ln')).toHaveTextContent('Getting ready')
    expect(boxes(container)).toEqual([
      'Documents',
      'Semantic double-merge chunking',
      'Chunk dreaming',
      'Metadata engineering',
      'Contextual retrieval',
      'Vector collections',
    ])
  })

  it('groups the three enrichment steps under “Enrich each chunk”', () => {
    const { container } = render(<IlluminaReady />)
    const group = container.querySelector('.dg-group') as HTMLElement
    expect(group.querySelector('.dg-group-label')).toHaveTextContent('Enrich each chunk')
    expect(Array.from(group.querySelectorAll('.dg-node')).map((n) => n.childNodes[0].textContent)).toEqual([
      'Chunk dreaming',
      'Metadata engineering',
      'Contextual retrieval',
    ])
  })

  it('says what the metadata, the contextual summary and the collection swap do', () => {
    const { container } = render(<IlluminaReady />)
    expect(box(container, 'Metadata engineering')).toHaveTextContent('questions this chunk can answer')
    expect(box(container, 'Contextual retrieval')).toHaveTextContent('a concise summary at the top of the chunk')
    expect(box(container, 'Vector collections')).toHaveTextContent('blue-green swap')
  })

  it('lights the boxes in order, so no box comes on before the one before it', () => {
    const { container } = render(<IlluminaReady />)
    const d = delays(container)
    expect(d).toEqual([0, 1, 2, 2, 2, 3])
    d.forEach((v, i) => i > 0 && expect(v).toBeGreaterThanOrEqual(d[i - 1]))
  })

  it('marks the first box as plain, not as a step', () => {
    const { container } = render(<IlluminaReady />)
    expect(box(container, 'Documents')).toHaveClass('dg-node', 'dg-plain')
  })
})

describe('IlluminaAnswer', () => {
  it('is labelled as answering, fan out and fan in', () => {
    const { container } = render(<IlluminaAnswer />)
    expect(container.querySelector('.dg-ln')).toHaveTextContent('Answering a question · fan out, fan in')
  })

  it('starts from the question, and splits it into sub-questions', () => {
    const { container } = render(<IlluminaAnswer />)
    expect(boxes(container).slice(0, 2)).toEqual(['The question', 'Split into sub-questions'])
  })

  it('runs three sub-question lanes, each with the same four steps', () => {
    const { container } = render(<IlluminaAnswer />)
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.dg-lane'))
    expect(lanes).toHaveLength(3)
    lanes.forEach((lane, i) => {
      expect(lane.querySelector('.dg-group-label')).toHaveTextContent(`Sub-question ${i + 1}`)
      expect(Array.from(lane.querySelectorAll<HTMLElement>('.dg-node')).map((n) => n.childNodes[0].textContent)).toEqual([
        'HyDE + hybrid search',
        'Re-rank',
        'Prompt compression',
        'Sub-answer',
      ])
    })
  })

  it('names the search as keyword plus vector', () => {
    const { container } = render(<IlluminaAnswer />)
    expect(box(container, 'HyDE + hybrid search')).toHaveTextContent('keyword + vector')
  })

  it('runs the lanes in parallel: each lane lights its steps at the same times', () => {
    const { container } = render(<IlluminaAnswer />)
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('.dg-lane'))
    const laneDelays = lanes.map((lane) => delays(lane))
    expect(laneDelays[0]).toEqual([2, 2.6, 3.2, 3.8])
    expect(laneDelays[1]).toEqual(laneDelays[0])
    expect(laneDelays[2]).toEqual(laneDelays[0])
  })

  it('combines the lanes, then checks the result, then gives the answer', () => {
    const { container } = render(<IlluminaAnswer />)
    const combine = Number(box(container, 'Combine').style.getPropertyValue('--d'))
    const check = Number(box(container, 'Does it answer the question?').style.getPropertyValue('--d'))
    const answer = Number(box(container, 'The answer').style.getPropertyValue('--d'))
    expect(combine).toBeLessThan(check)
    expect(check).toBeLessThan(answer)
    expect(box(container, 'Does it answer the question?')).toHaveClass('dg-check')
    expect(box(container, 'The answer')).toHaveClass('dg-out')
  })

  it('shows the loop back when the check says not yet, after the check and before the answer', () => {
    const { container } = render(<IlluminaAnswer />)
    const loop = container.querySelector<HTMLElement>('.dg-loop')!
    expect(loop).toHaveTextContent('↺ Not yet: ask a follow-up, and go round again')
    const check = Number(box(container, 'Does it answer the question?').style.getPropertyValue('--d'))
    const answer = Number(box(container, 'The answer').style.getPropertyValue('--d'))
    const at = Number(loop.style.getPropertyValue('--d'))
    expect(at).toBeGreaterThan(check)
    expect(at).toBeLessThan(answer)
  })
})
