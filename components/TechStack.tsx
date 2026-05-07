const STACK_GROUPS = [
  {
    label: 'AI/GenAI Frameworks',
    tags: ['LangChain', 'LangGraph', 'LangFlow', 'LlamaIndex', 'CrewAI', 'Autogen', 'DSPy', 'Giskard', 'MCP', 'A2A'],
  },
  {
    label: 'Languages',
    tags: ['Python (Expert)', 'SQL (Expert)', 'Java (Proficient)'],
  },
  {
    label: 'DevOps',
    tags: ['Docker', 'Kubernetes/Helm', 'GitHub Actions', 'Jenkins', 'vLLM'],
  },
  {
    label: 'Databases',
    tags: ['PostgreSQL', 'MSSQL', 'MySQL', 'Oracle DB', 'Redis', 'MongoDB', 'Qdrant', 'Neo4j', 'TigerGraph'],
  },
  {
    label: 'Observability',
    tags: ['Grafana', 'Prometheus', 'Loki', 'Langfuse', 'Arize Phoenix', 'Elastic', 'Kibana'],
  },
  {
    label: 'Cloud',
    tags: ['AWS', 'GCP', 'Azure', 'Snowflake', 'Cloudera'],
  },
  {
    label: 'Business Intelligence',
    tags: ['Tableau', 'KNIME'],
  },
  {
    label: 'Automation & RPA',
    tags: ['n8n', 'UiPath'],
  },
]

export default function TechStack() {
  return (
    <section className="pt-12 pb-12 px-6 border-t border-[#1f1f1f]">
      <div className="max-w-5xl mx-auto">
        <h2
          className="text-3xl md:text-4xl text-neutral-100 mb-2"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          What I Work With
        </h2>
        <p className="text-sm text-neutral-500 mb-8 tracking-wide">
          Tools I&apos;ve shipped to production
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {STACK_GROUPS.map((group) => (
            <div key={group.label}>
              <p
                className="text-xs uppercase tracking-widest mb-3"
                style={{ color: '#F59E0B' }}
              >
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-3 py-1.5 border border-[#2a2a2a] bg-[#111111] text-neutral-300 hover:border-[#F59E0B]/40 hover:text-neutral-100 transition-all duration-200 tracking-wide"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-[#1f1f1f] flex items-center gap-3">
          <span className="text-amber-500/50 font-mono text-xs shrink-0">✦</span>
          <p className="text-xs text-neutral-600 font-mono tracking-wide">
            Certified Scrum Master (CSM) · Scrum Alliance · 2025
          </p>
        </div>
      </div>
    </section>
  )
}
