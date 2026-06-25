const STACK_GROUPS = [
  {
    label: 'AI / GenAI Frameworks',
    items: ['LangChain', 'LangGraph', 'LlamaIndex', 'CrewAI', 'Autogen', 'DSPy', 'MCP', 'A2A'],
  },
  {
    label: 'Languages',
    items: ['Python ◆ Expert', 'SQL ◆ Expert', 'Java ◆ Proficient'],
  },
  {
    label: 'Infrastructure',
    items: ['Docker', 'Kubernetes / Helm', 'GitHub Actions', 'Jenkins', 'vLLM'],
  },
  {
    label: 'Databases',
    items: ['PostgreSQL', 'Oracle DB', 'Redis', 'MongoDB', 'Qdrant', 'Neo4j'],
  },
  {
    label: 'Observability',
    items: ['Grafana', 'Prometheus', 'Loki', 'Langfuse', 'Arize Phoenix', 'ELK'],
  },
  {
    label: 'Cloud',
    items: ['AWS', 'GCP', 'Azure', 'Snowflake'],
  },
]

export default function TechStack() {
  return (
    <section id="stack" className="bg-paper-deep text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(40px,5vw,72px)] pb-[clamp(40px,5vw,72px)]">
        {/* Section marker */}
        <header className="mb-[clamp(28px,4vw,56px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">02</span>
            <span className="font-medium text-ink">Stack</span>
            <span className="h-px flex-1 self-center bg-rule" />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            What I <em className="italic text-amber">work with</em>.
          </h2>
        </header>

        <p className="mb-9 max-w-[52ch] font-serif text-[22px] italic leading-[1.35] text-ink">
          Tools, not religions. Picked because they fit the job, replaced when they
          don&apos;t.
        </p>

        {/* Hairline grid of stack groups */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] border-l border-t border-rule">
          {STACK_GROUPS.map((g, i) => (
            <div
              key={g.label}
              className="border-b border-r border-rule bg-paper px-[22px] pt-[22px] pb-7 transition-colors duration-200 hover:bg-paper-deep"
            >
              <div className="mb-3.5 flex items-baseline gap-2.5">
                <span className="font-mono text-[10.5px] tracking-[0.08em] text-amber">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="m-0 font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">
                  {g.label}
                </h3>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((it) => (
                  <li
                    key={it}
                    className="py-0.5 font-mono text-[12.5px] tracking-[0.02em] text-ink"
                  >
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
