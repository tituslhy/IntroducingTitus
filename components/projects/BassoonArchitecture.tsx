import type { ReactNode } from 'react'

/*
 * fictional-bassoon's architecture (from its README), redrawn in the site's style. The path of one chat
 * message lights up in order (--d), numbered; the rest of the stack lights up after it. Styles: .arch-* in
 * app/globals.css, animated like Illumina's diagrams while the frame is on screen.
 */

/** A box on the message's path, with its step number. */
function Step({ n, d, children, sub }: { n: number; d: number; children: ReactNode; sub?: string }) {
  return (
    <div className="arch-node arch-step" style={{ ['--d' as string]: d }}>
      <span className="arch-n">{n}</span>
      <span>
        {children}
        {sub && <small>{sub}</small>}
      </span>
    </div>
  )
}

/** A supporting piece: a small chip, lit after the message has made its trip. */
function Chip({ children, ext = false }: { children: ReactNode; ext?: boolean }) {
  return <span className={`arch-chip${ext ? ' arch-ext' : ''}`}>{children}</span>
}

function Zone({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="arch-zone">
      <p className="arch-zone-name">{name}</p>
      <div className="arch-zone-body">{children}</div>
    </div>
  )
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="arch-group">
      <span className="arch-group-name">{name}</span>
      <div className="arch-chips">{children}</div>
    </div>
  )
}

export default function BassoonArchitecture() {
  return (
    <div className="arch">
      <p className="arch-title">One chat message, start to finish</p>
      <div className="arch-zones">
        <Zone name="Edge">
          <Step n={1} d={0}>
            Browser
          </Step>
          <Step n={2} d={1}>
            Nginx
          </Step>
        </Zone>
        <Zone name="App">
          <Step n={3} d={2} sub="queues the run, opens a stream">
            FastAPI /chat
          </Step>
          <Step n={8} d={7.6} sub="the stream, rendered live">
            Next.js
          </Step>
          <Chip>FastAPI auth</Chip>
          <Chip>A2A router</Chip>
          <Chip>PostgREST</Chip>
        </Zone>
        <Zone name="Work">
          <Step n={4} d={3.2}>
            RabbitMQ
          </Step>
          <Step n={5} d={4.2}>
            Celery worker
          </Step>
          <Step n={6} d={5.2} sub="thinks, calls tools">
            LangGraph agent
          </Step>
          <Chip ext>Tavily search</Chip>
        </Zone>
        <Zone name="Data">
          <Step n={7} d={6.4} sub="every event, back to FastAPI">
            Redis pub/sub
          </Step>
          <Group name="Redis Sentinel">
            <Chip>primary</Chip>
            <Chip>replica ×2</Chip>
            <Chip>sentinel ×3</Chip>
          </Group>
          <Group name="Postgres">
            <Chip>PgBouncer ×2 pools</Chip>
            <Chip>Citus coordinator</Chip>
            <Chip>Citus worker ×2</Chip>
          </Group>
        </Zone>
        <Zone name="Watching">
          <div className="arch-node" style={{ ['--d' as string]: 5.8 }}>
            <span>
              Langfuse<small>traces the run</small>
            </span>
          </div>
          <Group name="Langfuse storage">
            <Chip>ClickHouse ×3</Chip>
            <Chip>Keeper ×3</Chip>
            <Chip>MinIO</Chip>
            <Chip>Redis</Chip>
          </Group>
          <Group name="LGTM">
            <Chip>Alloy</Chip>
            <Chip>Loki</Chip>
            <Chip>Prometheus</Chip>
            <Chip>Tempo</Chip>
            <Chip>Grafana</Chip>
          </Group>
        </Zone>
      </div>
    </div>
  )
}
