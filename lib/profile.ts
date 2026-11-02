/**
 * Structured profile data — the single source of truth for every fact that
 * appears both on the page and in the copilot's system prompt.
 *
 * Components render from these arrays, and `lib/copilot-prompt.ts` renders
 * the same arrays into `copilot-system-prompt.md`'s {{TOKENS}}. Edit a role,
 * project, article, or link here once and both the site and the copilot pick
 * it up — no hand-copied duplicates to drift out of sync.
 *
 * Fields named `copilot` are copilot-only, first-person narrative (the "why"
 * behind the work). They never render on the page; they sit next to the facts
 * they describe so the two get updated together.
 */
import {
  AGENT_SUITE_URL,
  FICTIONAL_BASSOON_COVERAGE,
  ILLUMINA_SAVINGS_FIGURE,
  ILLUMINA_SAVINGS_PROSE,
} from './content'

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export const EMAIL = 'tituslhy@gmail.com'

export const SOCIAL = {
  github: 'https://github.com/tituslhy',
  linkedin: 'https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/',
  medium: 'https://medium.com/@tituslhy',
  coffee: 'https://buymeacoffee.com/tituslhy',
  email: EMAIL,
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export type Role = {
  /** Stable id: the page anchor is `role-${slug}`. */
  slug: string
  years: string
  company: string
  location: string
  role: string
  dates: string
  /** One-line summary. Plain text so the copilot can quote it verbatim. */
  deck: string
  /** Optional inline link: the first occurrence of `text` in `deck` becomes a link. */
  deckLink?: { text: string; href: string }
  body?: string
  tech: string[]
  techNote?: string
  pullQuote?: string
  incoming?: boolean
  /** Lower-signal / older roles get a more compact visual footprint. */
  compact?: boolean
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
}

export const ROLES: Role[] = [
  {
    slug: 'mastercard',
    years: '2026',
    company: 'Mastercard',
    location: 'Singapore',
    role: 'Lead AI Engineer',
    dates: 'Jul 2026 — Present',
    deck: "Working on Agent Suite at the R&D Foundry — Mastercard's platform for enterprises to build, test, and deploy AI agents.",
    deckLink: { text: 'Agent Suite', href: AGENT_SUITE_URL },
    body: 'Architected and built the core SDK and CLI for Agent Suite: a shared foundation that replaces one-off agent builds with a common, governed standard. Teams declare agents in YAML, then chat with them in the terminal or serve them as an API. Assistant skills ship inside the packages, and contributor tooling keeps both codebases consistent.',
    tech: ['Python', 'LangChain', 'Typer', 'FastAPI', 'Docker', 'Helm Charts', 'GitHub Actions', 'Apache Jenkins'],
    copilot: `Agent Suite was publicly announced in January 2026. I do not claim to have launched it; I started in July 2026. The SDK is agent-suite-core, a LangChain-based layer that makes governed, standards-compliant agent-building the default. The CLI is agent-suite-cli, built on Typer, which serves an agent as an ASGI app. I do not discuss internal compliance controls or implementation details beyond this.`,
  },
  {
    slug: 'uob',
    years: '2025',
    company: 'United Overseas Bank',
    location: 'Singapore',
    role: 'Vice President, Generative AI',
    dates: 'Jun 2025 — Jul 2026',
    deck: 'Technical lead for a real-time GenAI contact-centre platform supporting in-call and post-call agent assistance under strict latency and accuracy SLAs.',
    body: "Developed UOB's enterprise multi-agent GenAI platform, enabling teams to build, deploy, and orchestrate agents with cross-framework interoperability and dynamic tool/agent discovery.",
    tech: ['Java (Spring Boot)', 'React', 'Redis', 'Oracle DB', 'ELK Stack', 'Docker', 'vLLM', 'Helm Charts', 'Apache Jenkins', 'LangChain', 'MCP'],
    copilot: 'The multi-agent platform is called BYOA (Build Your Own Agents).',
  },
  {
    slug: 'illumina',
    years: '2023',
    company: 'Illumina',
    location: 'Singapore',
    role: 'Senior Data Scientist',
    dates: 'Jan 2023 — Jun 2025',
    deck: "Solo-architected and shipped two production AI systems as the company's sole data scientist.",
    body: 'An agentic document-retrieval platform for global field service engineers — sixteen components: semantic chunking, HyDE, hybrid search, Cohere reranking, prompt compression, an iterative agentic retrieval loop, blue-green vector collection swap. Plus a separate Generative BI assistant covering 800+ business metrics with human-in-the-loop design.',
    tech: ['Python', 'LlamaIndex', 'Qdrant', 'AWS Bedrock', 'RabbitMQ', 'Docker+CUDA', 'GitHub Actions', 'SonarQube', 'Grafana', 'Prometheus', 'Loki', 'Chainlit', 'DSPy', 'Giskard'],
    pullQuote: `Anticipated to save ${ILLUMINA_SAVINGS_PROSE} upon full deployment.`,
    copilot: [
      "This is widely considered my crown jewel — and the reason is not just the tech, it's the context. I was the company's only data scientist. No team. No senior engineer to review my PRs. Solo from architecture to production.",
      'The retrieval platform serves field service engineers supporting DNA sequencing equipment (NovaSeq, NextSeq). Engineers query equipment guides in natural language via Microsoft Teams, getting accurate answers fast enough to be useful mid-customer-call.',
      "What made it technically distinct: I didn't stop at naive RAG. Semantic double-merge chunking and chunk dreaming keep context intact at chunk boundaries; HyDE, hybrid search and Cohere reranking lift recall and precision; prompt compression keeps context windows lean; an iterative multi-hop loop handles questions no single retrieval can answer. The blue-green vector collection swap — zero-downtime index updates — I invented from first principles before I'd seen it documented anywhere.",
      'The Generative BI assistant uses Llama Guard for responsible-AI guardrails and Arize Phoenix for tracing.',
    ].join('\n\n'),
  },
  {
    slug: 'ck-delta',
    years: '2022',
    company: 'CK Delta',
    location: 'Singapore',
    role: 'Data Scientist',
    dates: 'Sep 2022 — Jan 2023',
    deck: 'Validated and enhanced MRT station crowdedness forecasting; tightened streaming data pipelines.',
    body: 'Model shipped to the MyTransportSG app.',
    tech: ['Python', 'ML Forecasting', 'Streaming Pipelines'],
    compact: true,
  },
  {
    slug: 'ema',
    years: '2018',
    company: 'Energy Market Authority',
    location: 'Singapore',
    role: 'Principal Engineer, Research & Statistics',
    dates: 'Apr 2018 — Aug 2022',
    deck: "Developed and presented national electricity and gas demand forecasts to Ministers and Permanent Secretaries; drove the Authority's AI and data strategy roadmap.",
    body: 'Built ML models for power-plant trip prediction and electricity spot-price forecasting with external partners.',
    tech: ['Python', 'XGBoost', 'Neural Networks', 'DataRobot', 'ARIMA'],
    compact: true,
    copilot: "Those national demand forecasts informed Singapore's climate change policy decisions.",
  },
  {
    slug: 'jobtech',
    years: '2017',
    company: 'JobTech Pte Ltd',
    location: 'Singapore',
    role: 'Data Scientist',
    dates: 'Apr 2017 — Aug 2017',
    deck: 'Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals.',
    body: "Findings published in a Business Insider report on Indonesia's labour market.",
    tech: ['Python', 'NLP', 'Regex Entity Extraction'],
    compact: true,
  },
  {
    slug: 'toyota-tsusho',
    years: '2015',
    company: 'Toyota Tsusho Asia Pacific',
    location: 'Singapore',
    role: 'Demand & Supply Analyst',
    dates: 'Jun 2015 — Apr 2017',
    deck: 'Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques.',
    body: 'Served Toyota automotive distributors across the Asia Pacific region.',
    tech: ['VBA', 'Excel', 'Exponential Smoothing', 'Holt-Winters'],
    pullQuote: 'Improved long-term forecast accuracy by ~25%.',
    compact: true,
    copilot: 'Where it started.',
  },
]

/** The role the copilot introduces as "currently". */
export const CURRENT_ROLE = ROLES[0]

// ---------------------------------------------------------------------------
// Education & credentials
// ---------------------------------------------------------------------------

export type Education = {
  institution: string
  degree: string
  dates: string
  honors: string[]
  /** Copilot-only honours — true, but not given page space. */
  copilotHonors?: string[]
}

export const EDUCATION: Education[] = [
  {
    institution: 'Singapore Management University',
    degree: 'Master of IT in Business — AI Track',
    dates: '2021 — 2022',
    honors: ['GPA 3.98 / 4.0', "Dean's List", 'SMU AI Talent Development Grant'],
    copilotHonors: ['MITB Scholarship'],
  },
  {
    institution: 'National University of Singapore',
    degree: 'BEng Chemical Engineering, 2nd Upper Honours',
    dates: '2011 — 2015',
    honors: ['NUS Undergraduate Scholarship'],
    copilotHonors: [
      'Barco-Santander Scholarship',
      'IE Singapore Young Talent Program Market Immersion Award',
    ],
  },
]

/** Copilot-only credentials that have no section on the page. */
export const OTHER_CREDENTIALS = ['Oxford IARU Global Summer Programme — 1 of 14 selected worldwide.']

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

/** Separator between a skill and its proficiency, e.g. "Python ◆ Expert". */
export const PROFICIENCY_SEPARATOR = ' ◆ '

export type StackGroup = {
  label: string
  /** Shown on the page. */
  items: string[]
  /** Copilot-only: real experience, but not curated onto the page. */
  more?: string[]
  /** Copilot-only group, not rendered on the page. */
  copilotOnly?: boolean
}

export const STACK_GROUPS: StackGroup[] = [
  {
    label: 'AI / GenAI Frameworks',
    items: ['LangChain', 'LangGraph', 'LlamaIndex', 'CrewAI', 'Autogen', 'DSPy', 'MCP', 'A2A'],
    more: ['LangFlow', 'Giskard'],
  },
  {
    label: 'Languages',
    items: [`Python${PROFICIENCY_SEPARATOR}Expert`, `SQL${PROFICIENCY_SEPARATOR}Expert`, `Java${PROFICIENCY_SEPARATOR}Proficient`],
  },
  {
    label: 'Infrastructure',
    items: ['Docker', 'Kubernetes / Helm', 'GitHub Actions', 'Jenkins', 'vLLM'],
  },
  {
    label: 'Databases',
    items: ['PostgreSQL', 'Oracle DB', 'Redis', 'MongoDB', 'Qdrant', 'Neo4j'],
    more: ['MSSQL', 'MySQL', 'TigerGraph'],
  },
  {
    label: 'Observability',
    items: ['Grafana', 'Prometheus', 'Loki', 'Langfuse', 'Arize Phoenix', 'ELK'],
  },
  {
    label: 'Cloud',
    items: ['AWS', 'GCP', 'Azure', 'Snowflake'],
    more: ['Cloudera'],
  },
  { label: 'BI', items: ['Tableau', 'KNIME'], copilotOnly: true },
  { label: 'Automation', items: ['n8n', 'UiPath'], copilotOnly: true },
]

/** Groups rendered on the page. */
export const SITE_STACK_GROUPS = STACK_GROUPS.filter((g) => !g.copilotOnly)

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type MarginNote = {
  constraint: string
  decision: string
  outcome: string
}

export type Project = {
  slug: string
  title: string
  sub: string
  body: string
  figure: { label: string; value: string }
  secondary: { label: string; value: string }
  tags: string[]
  github?: string | null
  demo?: string | null
  accent: 'amber' | 'blue'
  marginNote?: MarginNote
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
}

export const PROJECTS: Project[] = [
  {
    slug: 'fictional-bassoon',
    title: 'fictional-bassoon',
    sub: 'A fifty-four-container LLM harness, vibe-coded end-to-end',
    body: `Fifty-four containers, deliberately: a full production-realistic stack — FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, an LGTM observability stack, and a Next.js 14 frontend behind Nginx — built to exercise a realistic multi-service architecture end-to-end, not overengineering for its own sake. Solo-built and vibe-coded end-to-end with LLMs, then audited by CodeRabbit, with ${FICTIONAL_BASSOON_COVERAGE} test coverage.`,
    figure: { label: 'containers', value: '54' },
    secondary: { label: 'test coverage', value: FICTIONAL_BASSOON_COVERAGE },
    tags: ['Python', 'LangGraph', 'Postgres', 'ClickHouse', 'Docker', 'Langfuse', 'Next.js'],
    github: 'https://github.com/tituslhy/fictional-bassoon',
    accent: 'amber',
    marginNote: {
      constraint: 'Solo build, no team — needed to prove real distributed-systems competency, not a toy demo.',
      decision: 'Built the full production stack anyway: queues, caches, a distributed Postgres, an observability stack, and a proxy — one service per real-world concern.',
      outcome: `${FICTIONAL_BASSOON_COVERAGE} test coverage, CodeRabbit-audited, public repo.`,
    },
    copilot: 'Named after a woodwind instrument I thought was a bear. Canon forever.',
  },
  {
    slug: 'illumina-rag',
    title: 'Illumina Agentic RAG',
    sub: 'A sixteen-component production retrieval platform',
    body: 'Production-grade agentic RAG for enterprise field-service engineering. Features semantic double-merge chunking, chunk dreaming, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.',
    figure: { label: 'components', value: '16' },
    secondary: { label: 'anticipated savings', value: ILLUMINA_SAVINGS_FIGURE },
    tags: ['LlamaIndex', 'Qdrant', 'AWS Bedrock', 'Docker+CUDA', 'Grafana', 'SonarQube'],
    github: null,
    accent: 'blue',
    marginNote: {
      constraint: 'Sole data scientist, production SLAs, no dedicated ML team to lean on for retrieval quality.',
      decision: 'A 16-component pipeline — semantic chunking, HyDE, hybrid search, reranking, prompt compression, iterative retrieval — plus a blue-green vector collection swap invented from first principles for safe reindexing.',
      outcome: `Anticipated to save ${ILLUMINA_SAVINGS_FIGURE} upon full deployment.`,
    },
    copilot: 'See the Illumina role above. When discussing this, explain the *why* behind each retrieval stage — don\'t just list techniques.',
  },
  {
    slug: 'margin-call',
    title: 'TheMarginCall',
    sub: 'Six specialists arguing about your portfolio',
    body: 'A multi-agent investment guidance crew built on Autogen. Six specialists collaborate in a group chat: a statistical analyst, a technical analyst (RSI, Bollinger, Ichimoku), a fundamental analyst, a researcher that reads SEC filings via RAG, a finance professor for concepts, and a reporter that writes and emails the findings.',
    figure: { label: 'agents', value: '6' },
    secondary: { label: 'modes', value: 'II' },
    tags: ['Python', 'Autogen', 'LlamaIndex', 'Qdrant', 'RAG', 'Tavily', 'Gmail'],
    github: 'https://github.com/tituslhy/TheMarginCall',
    demo: 'https://www.youtube.com/watch?v=uLtMD3J4U40',
    accent: 'amber',
    copilot: 'Ships with a group chat mode and a self-service analysis workspace.',
  },
]

// ---------------------------------------------------------------------------
// Open source & writing
// ---------------------------------------------------------------------------

export type OpenSourceContribution = { project: string; text: string; href: string }

export const OPEN_SOURCE: OpenSourceContribution[] = [
  { project: 'LlamaIndex', text: 'Integration with Microsoft LLMLingua2 prompt compression', href: 'https://github.com/run-llama/llama_index/pull/17531' },
  { project: 'LlamaIndex', text: 'Gmail Tool bug fix', href: 'https://github.com/run-llama/llama_index/commit/d5c0fe12a278a332e5d007a3742902e1b36c068f' },
  { project: 'Unsloth', text: 'Retrieval Augmented Finetuning cookbook', href: 'https://github.com/unslothai/notebooks/pull/51' },
  { project: 'IBM ACP', text: 'Agent Communication Protocol LlamaIndex example', href: 'https://github.com/i-am-bee/acp/pull/176' },
  { project: 'Giskard', text: 'RAGET bug fix', href: 'https://github.com/Giskard-AI/giskard-oss/pull/2178' },
  { project: 'Chainlit', text: 'Chainlit-LlamaIndex cookbook', href: 'https://github.com/Chainlit/cookbook/pull/138' },
]

export type Article = { n: number; title: string; venue: string; read: string; href: string }

export const FEATURED_ARTICLES: Article[] = [
  { n: 1, title: 'Agent Memory: The underrated superpower of agentic apps', venue: 'MITB for All', read: '11 min', href: 'https://medium.com/mitb-for-all/agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435' },
  { n: 2, title: 'How to Train Your LLM: Low-Rank Adaptation Finetuning using Unsloth', venue: 'MITB for All', read: '14 min', href: 'https://medium.com/mitb-for-all/how-to-train-your-llm-teaching-toothless-to-bite-8d9f56fe4b2a' },
  { n: 3, title: 'How to RAFT your LLM: Retrieval Augmented Finetuning using Unsloth', venue: 'MITB for All', read: '12 min', href: 'https://medium.com/mitb-for-all/how-to-raft-your-llm-retrieval-augmented-finetuning-using-unsloth-4c3844a9a6e3' },
  { n: 4, title: 'A second look at LangGraph: When “Command-Send” becomes “common sense”', venue: 'MITB for All', read: '9 min', href: 'https://medium.com/mitb-for-all/a-second-look-at-langgraph-when-command-sends-becomes-common-sense-720a851cf8a8' },
  { n: 5, title: 'Helm Charts: The Multi-Server Orchestra Conductor', venue: 'MITB for All', read: '10 min', href: 'https://medium.com/mitb-for-all/helm-charts-the-multi-server-orchestra-conductor-18dc88665fc1' },
  { n: 6, title: 'A gentle introduction to LiteLLM', venue: 'MITB for All', read: '7 min', href: 'https://medium.com/mitb-for-all/a-gentle-introduction-to-litellm-649d48a0c2c7' },
  { n: 7, title: 'Your agent needs a bouncer', venue: 'MITB for All', read: '13 min', href: 'https://medium.com/mitb-for-all/your-ai-agent-needs-a-bouncer-f115d5ddac55' },
]

export const FEATURED_BY = ['Singapore Management University', 'Unsloth', 'LlamaIndex', 'IBM', 'FlowerAI']

/** Writing topics, for the copilot. */
export const WRITING_TOPICS = [
  'blockchain',
  'RAG architectures',
  'agent memory',
  'LangGraph',
  'Helm',
  'LiteLLM',
  'finetuning',
  'LLMOps',
  'software engineering',
  'AI architecture',
]

// ---------------------------------------------------------------------------
// Page targets — what the copilot's show_on_page tool may point at
// ---------------------------------------------------------------------------

export type PageTarget = {
  /** DOM id on the page. */
  id: string
  /** Short label for the "See on page" control, e.g. "Illumina, 2023". */
  label: string
  /** What lives there, for the model. */
  about: string
}

/**
 * Every anchor the copilot may scroll to. Generated from the same arrays the
 * page renders, so a new role or project is targetable the moment it exists.
 */
export const PAGE_TARGETS: PageTarget[] = [
  { id: 'lede', label: 'About', about: 'my short bio and how I work' },
  { id: 'stack', label: 'Stack', about: 'the tools, languages, and platforms I work with' },
  { id: 'dossier', label: 'Experience', about: 'my full career timeline' },
  ...ROLES.map((r) => ({
    id: `role-${r.slug}`,
    label: `${r.company}, ${r.years}`,
    about: `my ${r.role} role at ${r.company} (${r.dates})`,
  })),
  { id: 'education', label: 'Education', about: 'my degrees and honours' },
  { id: 'projects', label: 'Projects', about: 'the things I have built on my own' },
  ...PROJECTS.map((p) => ({ id: `project-${p.slug}`, label: p.title, about: `${p.title}: ${p.sub}` })),
  { id: 'open-source', label: 'Open source', about: 'my open-source contributions' },
  { id: 'writing', label: 'Writing', about: 'my featured Medium articles' },
]

export const PAGE_TARGET_IDS = PAGE_TARGETS.map((t) => t.id)
