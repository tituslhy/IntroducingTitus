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
  ARTICLE_COUNT_SHORT,
  FICTIONAL_BASSOON_COVERAGE,
  ILLUMINA_SAVINGS_FIGURE,
  ILLUMINA_SAVINGS_PROSE,
  YEARS_EXPERIENCE,
} from './content'

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export const EMAIL = 'tituslhy@gmail.com'

export const SOCIAL = {
  github: 'https://github.com/tituslhy',
  linkedin: 'https://www.linkedin.com/in/titus-lim-hsien-yong/',
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
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
}

/** The latest roles shown in full; older ones sit under "Earlier roles" (and in the front page's "+ N earlier roles"). */
export const FEATURED_ROLE_COUNT = 3

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
    body: 'Tech lead and anchor contributor for the core SDK behind Agent Suite. Architected and built the SDK and CLI, including a bespoke package-manager setup: a shared foundation that replaces one-off agent builds with a common, governed standard. Agents are built declaratively: teams declare them in YAML, then chat with them in the terminal or serve them as an API. Assistant skills ship inside the packages, and contributor tooling keeps both codebases consistent.',
    tech: ['Python', 'LangChain', 'Typer', 'FastAPI', 'Docker', 'Helm Charts', 'GitHub Actions', 'Apache Jenkins'],
    copilot: `Agent Suite was publicly announced in January 2026. I do not claim to have launched it; I started in July 2026. I am the tech lead and an anchor contributor for its core SDK, agent-suite-core, a LangChain-based layer that makes governed, standards-compliant agent-building the default. The CLI is agent-suite-cli, built on Typer, which serves an agent as an ASGI app. I do not discuss internal compliance controls or implementation details beyond this.`,
  },
  {
    slug: 'uob',
    years: '2025',
    company: 'United Overseas Bank',
    location: 'Singapore',
    role: 'Vice President, Generative AI',
    dates: 'Jun 2025 — Jul 2026',
    deck: 'Sole engineer on a real-time GenAI contact-centre platform: live call transcripts, in-call assistance and policy search for agents, and post-call summaries with red-flag and promise checks.',
    body: "Picked up Java to take over its Spring Boot microservices, and cut false positives in its post-call checks by 80% with an LLM-driven prompt-optimisation loop on the bank's self-hosted models. Also built the MCP service behind UOB's customer onboarding workflow: a deterministic LangGraph workflow that handles incomplete and inconsistent documents, with LLM reasoning where it helps.",
    tech: ['Java (Spring Boot)', 'React', 'Redis', 'Oracle DB', 'ELK Stack', 'Splunk', 'Docker', 'Red Hat OpenShift', 'vLLM', 'Helm Charts', 'Apache Jenkins', 'LangChain', 'LangGraph', 'MCP'],
    copilot: "I also worked on the early design and build of BYOA (Build Your Own Agents), UOB's planned multi-agent platform, meant to let teams build, deploy, and orchestrate agents with cross-framework interoperability and dynamic tool and agent discovery. The customer onboarding workflow app is BYOC (Build Your Own Case): rather than handing an agent full control, it keeps the workflow deterministic and uses the LLM's reasoning at set points. My main part was the MCP server behind it, which connects it to its tools and does the computation. I was not involved in BYOB, UOB's bot builder.",
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
    copilot: 'Where it started.',
  },
]

/** The role the copilot introduces as "currently". */
export const CURRENT_ROLE = ROLES[0]

/**
 * My sign-off everywhere (hero label, footer, page title, OG card): the exact
 * title at the top of my experience list, so it changes when my role does.
 */
export const SIGN_OFF_TITLE = CURRENT_ROLE.role

/** Canonical page title, shared by app/layout.tsx metadata (title, OG, Twitter). */
export const SITE_TITLE = `Titus Lim | ${SIGN_OFF_TITLE}`

/** Canonical SEO description, shared by app/layout.tsx metadata (title, OG, Twitter). */
export const SITE_DESCRIPTION = `${SIGN_OFF_TITLE} with ${YEARS_EXPERIENCE} building production AI systems. ${ARTICLE_COUNT_SHORT}. Open source contributor.`

// ---------------------------------------------------------------------------
// Education & credentials
// ---------------------------------------------------------------------------

/** A programme taken during a degree (an exchange, a summer school), shown inside that degree. */
export type EducationPart = {
  institution: string
  /** Short name for labels, e.g. "UConn". */
  short: string
  programme: string
  dates: string
  honors: string[]
}

export type Education = {
  /** Stable id: the page anchor is `edu-${slug}`. */
  slug: string
  /** The year in the rail. */
  years: string
  institution: string
  /** Short name for labels, e.g. "SMU". */
  short: string
  degree: string
  dates: string
  location: string
  /**
   * Everything here was selected, ranked or awarded; taking part alone doesn't make the list.
   * Write the result first: the text before the first comma is shown large, the rest as its context.
   */
  honors: string[]
  parts?: EducationPart[]
}

export const EDUCATION: Education[] = [
  {
    slug: 'smu',
    years: '2021',
    institution: 'Singapore Management University',
    short: 'SMU',
    degree: 'Master of IT in Business, AI track',
    dates: '2021 — 2022',
    location: 'Singapore',
    honors: [
      'GPA 3.98 / 4.0',
      "Dean's List",
      'SMU AI Talent Development Grant',
      'MITB Scholarship',
      '1st place, Food Image Classification',
      '3rd place, Recommender Systems',
    ],
  },
  {
    slug: 'nus',
    years: '2011',
    institution: 'National University of Singapore',
    short: 'NUS',
    degree: 'BEng Chemical Engineering, 2nd Upper Honours',
    dates: '2011 — 2015',
    location: 'Singapore',
    honors: [
      'NUS Undergraduate Scholarship',
      'IE Singapore Young Talent Programme Market Immersion Award',
      '1 of 3 chemical engineers selected, NUS Suzhou winter programme',
      'Selected to present, Shell Global Energy, Water & Food Security Roundtable',
      '88th percentile globally, Bloomberg Aptitude Test',
    ],
    parts: [
      {
        institution: 'University of Connecticut',
        short: 'UConn',
        programme: 'Exchange, Chemical & Biomolecular Engineering',
        dates: '2013',
        honors: [
          'First Class with Distinction',
          'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer',
          'Top 10 in two PhD modules, taken in year 2',
          '"Most Inspiring Student", AIChE UConn chapter',
        ],
      },
      {
        institution: 'University of Oxford',
        short: 'Oxford',
        programme: 'IARU Global Summer School, Global Challenges of the 21st Century',
        dates: '2014',
        honors: ['First Class with Distinction', '1 of 14 selected worldwide', 'IARU-Santander Scholarship', 'NUS Scholars Enrichment Grant'],
      },
    ],
  },
  {
    slug: 'ajc',
    years: '2007',
    institution: 'Anderson Junior College',
    short: 'AJC',
    degree: "GCE 'A' Levels, Physical Sciences",
    dates: '2007 — 2008',
    location: 'Singapore',
    honors: [
      'Top Student Award',
      'Chess Club President, College Colours',
      'Certificate of Distinction, Alpha Students Programme',
      'Platinum Award, Community Involvement Programme',
      'Sports Leaders Award',
    ],
  },
]

/** Shown at the foot of the Education page. */
export const CERTIFICATIONS = ['Certified ScrumMaster']

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
  /** One short line for the front page's Projects door. */
  preview: string
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
    preview: 'an LLM platform in 54 containers',
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
    preview: 'a 16-part retrieval platform',
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
    preview: 'six agents arguing about your portfolio',
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
// Site pages — the nav, in order. Ask Titus (the colophon) comes last.
// ---------------------------------------------------------------------------

export type SitePath = '/experience' | '/education' | '/projects' | '/writing' | '/about'

export const SITE_PAGES: { path: SitePath; label: string; folio: string }[] = [
  { path: '/experience', label: 'Experience', folio: '01' },
  { path: '/education', label: 'Education', folio: '02' },
  { path: '/projects', label: 'Projects', folio: '03' },
  { path: '/writing', label: 'Writing', folio: '04' },
  { path: '/about', label: 'About', folio: '05' },
]

/** Ask Titus (the colophon) comes after the pages, in the nav and on the front page. */
export const ASK_FOLIO = String(SITE_PAGES.length + 1).padStart(2, '0')

/** A page's number, as the nav shows it; the page's own section marker uses the same one. */
export const pageFolio = (path: SitePath) => SITE_PAGES.find((p) => p.path === path)!.folio

// ---------------------------------------------------------------------------
// Page targets — what the copilot's show_on_page tool may point at
// ---------------------------------------------------------------------------

export type PageTarget = {
  /** DOM id on its page. */
  id: string
  /** The route the anchor lives on; show_on_page navigates there first. */
  path: SitePath
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
  { id: 'lede', path: '/about', label: 'About', about: 'my short bio and how I work' },
  { id: 'stack', path: '/about', label: 'Stack', about: 'the tools, languages, and platforms I work with' },
  { id: 'dossier', path: '/experience', label: 'Experience', about: 'my full career timeline' },
  ...ROLES.map((r) => ({
    id: `role-${r.slug}`,
    path: '/experience' as const,
    label: `${r.company}, ${r.years}`,
    about: `my ${r.role} role at ${r.company} (${r.dates})`,
  })),
  { id: 'education', path: '/education', label: 'Education', about: 'my degrees, honours and certifications' },
  ...EDUCATION.map((e) => ({
    id: `edu-${e.slug}`,
    path: '/education' as const,
    label: `${e.short}, ${e.years}`,
    about: `${e.degree} at ${e.institution} (${e.dates})${e.parts?.length ? `, including ${e.parts.map((p) => p.institution).join(' and ')}` : ''}`,
  })),
  { id: 'projects', path: '/projects', label: 'Projects', about: 'the things I have built on my own' },
  ...PROJECTS.map((p) => ({ id: `project-${p.slug}`, path: '/projects' as const, label: p.title, about: `${p.title}: ${p.sub}` })),
  { id: 'open-source', path: '/projects', label: 'Open source', about: 'my open-source contributions' },
  { id: 'writing', path: '/writing', label: 'Writing', about: 'my featured Medium articles' },
]

export const PAGE_TARGET_IDS = PAGE_TARGETS.map((t) => t.id)
