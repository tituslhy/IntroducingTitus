import { render, screen, within } from '@testing-library/react'
import BassoonArchitecture from './BassoonArchitecture'

const renderDiagram = () => render(<BassoonArchitecture />)

/** The numbered steps, as their numbers in DOM order. */
const stepNumbers = (container: HTMLElement) => Array.from(container.querySelectorAll('.arch-step .arch-n')).map((n) => Number(n.textContent))

/** The step with this number, e.g. 3 is FastAPI /chat. */
const stepFor = (container: HTMLElement, n: number) =>
  Array.from(container.querySelectorAll<HTMLElement>('.arch-step')).find((s) => s.querySelector('.arch-n')?.textContent === String(n)) as HTMLElement

/** A step's name, without its number or its sub-line. */
const stepName = (step: HTMLElement) => {
  const body = step.lastElementChild as HTMLElement
  const sub = body.querySelector('small')
  return (body.textContent ?? '').replace(sub?.textContent ?? '', '')
}

/** The chips under a named group (Redis Sentinel, Postgres, ...), in order. */
const groupChips = (container: HTMLElement, name: string) => {
  const label = within(container).getByText(name)
  expect(label).toHaveClass('arch-group-name')
  return Array.from(label.closest('.arch-group')!.querySelectorAll('.arch-chip')).map((c) => c.textContent)
}

describe('BassoonArchitecture: the frame', () => {
  it('has the title: one chat message, start to finish', () => {
    renderDiagram()
    expect(screen.getByText('One chat message, start to finish')).toHaveClass('arch-title')
  })

  it('lists the five zones in order: Edge, App, Work, Data, Watching', () => {
    const { container } = renderDiagram()
    const zones = Array.from(container.querySelectorAll('.arch-zone-name')).map((z) => z.textContent)
    expect(zones).toEqual(['Edge', 'App', 'Work', 'Data', 'Watching'])
  })
})

describe('BassoonArchitecture: the message’s path', () => {
  it('has eight numbered steps, 1 to 8, each once', () => {
    const { container } = renderDiagram()
    expect(container.querySelectorAll('.arch-step')).toHaveLength(8)
    expect([...stepNumbers(container)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('names each step: 1 Browser, 2 Nginx, 3 FastAPI /chat, 4 RabbitMQ, 5 Celery worker, 6 LangGraph agent, 7 Redis pub/sub, 8 Next.js', () => {
    const { container } = renderDiagram()
    const names = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => stepName(stepFor(container, n)))
    expect(names).toEqual(['Browser', 'Nginx', 'FastAPI /chat', 'RabbitMQ', 'Celery worker', 'LangGraph agent', 'Redis pub/sub', 'Next.js'])
  })

  it('lights each step after the one before it: its --d rises with the step number', () => {
    const { container } = renderDiagram()
    const delays = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => Number(stepFor(container, n).style.getPropertyValue('--d')))
    expect(delays.every((d) => Number.isFinite(d))).toBe(true)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1])
    }
  })

  it('gives some steps a sub-line saying what they do, and leaves the others bare', () => {
    const { container } = renderDiagram()
    expect(stepFor(container, 3).querySelector('small')).toHaveTextContent('queues the run, opens a stream')
    expect(stepFor(container, 8).querySelector('small')).toHaveTextContent('the stream, rendered live')
    expect(stepFor(container, 6).querySelector('small')).toHaveTextContent('thinks, calls tools')
    expect(stepFor(container, 7).querySelector('small')).toHaveTextContent('every event, back to FastAPI')
    expect(stepFor(container, 1).querySelector('small')).toBeNull()
    expect(stepFor(container, 2).querySelector('small')).toBeNull()
  })
})

describe('BassoonArchitecture: the supporting pieces', () => {
  it('groups Redis Sentinel as a primary, two replicas and three sentinels', () => {
    const { container } = renderDiagram()
    expect(groupChips(container, 'Redis Sentinel')).toEqual(['primary', 'replica ×2', 'sentinel ×3'])
  })

  it('groups Postgres as two PgBouncer pools, a Citus coordinator and two Citus workers', () => {
    const { container } = renderDiagram()
    expect(groupChips(container, 'Postgres')).toEqual(['PgBouncer ×2 pools', 'Citus coordinator', 'Citus worker ×2'])
  })

  it('groups the Langfuse storage as ClickHouse, Keeper, MinIO and Redis', () => {
    const { container } = renderDiagram()
    expect(groupChips(container, 'Langfuse storage')).toEqual(['ClickHouse ×3', 'Keeper ×3', 'MinIO', 'Redis'])
  })

  it('groups LGTM as Alloy, Loki, Prometheus, Tempo and Grafana', () => {
    const { container } = renderDiagram()
    expect(groupChips(container, 'LGTM')).toEqual(['Alloy', 'Loki', 'Prometheus', 'Tempo', 'Grafana'])
  })

  it('draws Tavily search as the one external chip (dashed), and no other chip is external', () => {
    const { container } = renderDiagram()
    const ext = container.querySelectorAll('.arch-ext')
    expect(ext).toHaveLength(1)
    expect(ext[0]).toHaveClass('arch-chip')
    expect(ext[0]).toHaveTextContent('Tavily search')
  })
})

describe('BassoonArchitecture: Langfuse', () => {
  it('is a node that watches the run, but is not one of the numbered steps', () => {
    const { container } = renderDiagram()
    const langfuse = Array.from(container.querySelectorAll<HTMLElement>('.arch-node')).find((n) => n.textContent?.startsWith('Langfuse'))!
    expect(langfuse).toBeInTheDocument()
    expect(langfuse).not.toHaveClass('arch-step')
    expect(langfuse.querySelector('.arch-n')).toBeNull()
    expect(langfuse).toHaveTextContent('traces the run')
    expect(stepNumbers(container)).toHaveLength(8)
  })
})
