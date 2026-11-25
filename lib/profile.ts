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
import { TOOLS, toolTargetId } from './about'
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
  /** The name on its staff pass, e.g. "UOB". */
  short: string
  /** The staff pass's colour (taken from the company's logo) and logo file under public/logos/companies/. */
  brand: { color: string; logo: string }
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
  /**
   * The role's headline. Featured roles show it huge on the dark tile; earlier roles as their box's big line.
   * `brief` labels it in the page's results row when the figure is a number, e.g. "fewer false positives, UOB".
   */
  highlight?: { figure: string; caption: string; brief?: string }
  /** The question its "Ask about …" pill sends to Ask Titus. */
  ask?: AskPrompt
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
    short: 'Mastercard',
    brand: { color: 'oklch(0.64 0.2 42)', logo: 'mastercard.svg' },
    location: 'Singapore',
    role: 'Lead AI Engineer',
    dates: 'Jul 2026 — Present',
    deck: "Working on Agent Suite at the R&D Foundry — Mastercard's platform for enterprises to build, test, and deploy AI agents.",
    deckLink: { text: 'Agent Suite', href: AGENT_SUITE_URL },
    body: 'Architected and built the SDK and CLI, including a bespoke package-manager setup: a shared foundation that replaces one-off agent builds with a common, governed standard. Agents are built declaratively: teams declare them in YAML, then chat with them in the terminal or serve them as an API. Assistant skills ship inside the packages, and contributor tooling keeps both codebases consistent.',
    tech: ['Python', 'LangChain', 'Typer', 'FastAPI', 'Docker', 'Helm Charts', 'GitHub Actions', 'Apache Jenkins'],
    highlight: { figure: 'Tech lead', caption: 'and anchor contributor for the core SDK behind Agent Suite' },
    ask: { label: 'Agent Suite', question: 'What do you do on Agent Suite?' },
    copilot: `Agent Suite was publicly announced in January 2026. I do not claim to have launched it; I started in July 2026. I am the tech lead and an anchor contributor for its core SDK, agent-suite-core, a LangChain-based layer that makes governed, standards-compliant agent-building the default. The CLI is agent-suite-cli, built on Typer, which serves an agent as an ASGI app. I do not discuss internal compliance controls or implementation details beyond this.`,
  },
  {
    slug: 'uob',
    years: '2025',
    company: 'United Overseas Bank',
    short: 'UOB',
    brand: { color: 'oklch(0.5 0.15 262)', logo: 'uob.png' },
    location: 'Singapore',
    role: 'Vice President, Generative AI',
    dates: 'Jun 2025 — Jul 2026',
    deck: 'Sole engineer on a real-time GenAI contact-centre platform: live call transcripts, in-call assistance and policy search for agents, and post-call summaries with red-flag and promise checks.',
    body: "Picked up Java to take over its Spring Boot microservices, and cut false positives in its post-call checks by 80% with an LLM-driven prompt-optimisation loop on the bank's self-hosted models. Also built the MCP service behind UOB's customer onboarding workflow: a deterministic LangGraph workflow that handles incomplete and inconsistent documents, with LLM reasoning where it helps.",
    tech: ['Java (Spring Boot)', 'React', 'Redis', 'Oracle DB', 'ELK Stack', 'Splunk', 'Docker', 'Red Hat OpenShift', 'vLLM', 'Helm Charts', 'Apache Jenkins', 'LangChain', 'LangGraph', 'MCP'],
    highlight: { figure: '80%', caption: 'fewer false positives in post-call checks', brief: 'fewer false positives, UOB' },
    ask: { label: 'the contact-centre platform', question: 'How did you cut false positives at UOB?' },
    copilot: "I also worked on the early design and build of BYOA (Build Your Own Agents), UOB's planned multi-agent platform, meant to let teams build, deploy, and orchestrate agents with cross-framework interoperability and dynamic tool and agent discovery. The customer onboarding workflow app is BYOC (Build Your Own Case): rather than handing an agent full control, it keeps the workflow deterministic and uses the LLM's reasoning at set points. My main part was the MCP server behind it, which connects it to its tools and does the computation. I was not involved in BYOB, UOB's bot builder.",
  },
  {
    slug: 'illumina',
    years: '2023',
    company: 'Illumina',
    short: 'Illumina',
    brand: { color: 'oklch(0.72 0.16 65)', logo: 'illumina.png' },
    location: 'Singapore',
    role: 'Senior Data Scientist',
    dates: 'Jan 2023 — Jun 2025',
    deck: "Solo-architected and shipped two production AI systems as the company's sole data scientist.",
    body: 'An agentic document-retrieval platform for global field service engineers — sixteen components: semantic chunking, HyDE, hybrid search, Cohere reranking, prompt compression, an iterative agentic retrieval loop, blue-green vector collection swap. Plus a separate Generative BI assistant covering 800+ business metrics with human-in-the-loop design. Before GenAI, classic data science: computer vision (staff-photo checks, live fall detection on warehouse CCTV, document understanding on scanned shipment papers, wafer defect detection), anomaly detection along each wafer’s manufacturing journey, and a supply-planning optimisation proof of concept.',
    tech: ['Python', 'LlamaIndex', 'Qdrant', 'AWS Bedrock', 'RabbitMQ', 'Docker+CUDA', 'GitHub Actions', 'SonarQube', 'Grafana', 'Prometheus', 'Loki', 'Chainlit', 'DSPy', 'Giskard', 'OpenCV', 'PaddlePaddle', 'NetworkX', 'Pyomo'],
    highlight: { figure: ILLUMINA_SAVINGS_FIGURE, caption: 'anticipated savings upon full deployment', brief: 'anticipated savings, Illumina' },
    ask: { label: 'the retrieval platform', question: 'How does the Illumina retrieval platform work?' },
    pullQuote: `Anticipated to save ${ILLUMINA_SAVINGS_PROSE} upon full deployment.`,
    copilot: [
      "This is widely considered my crown jewel — and the reason is not just the tech, it's the context. I was the company's only data scientist. No team. No senior engineer to review my PRs. Solo from architecture to production.",
      'The retrieval platform serves field service engineers supporting DNA sequencing equipment (NovaSeq, NextSeq). Engineers query equipment guides in natural language via Microsoft Teams, getting accurate answers fast enough to be useful mid-customer-call.',
      "What made it technically distinct: I didn't stop at naive RAG. Semantic double-merge chunking and chunk dreaming keep context intact at chunk boundaries; HyDE, hybrid search and Cohere reranking lift recall and precision; prompt compression keeps context windows lean; an iterative multi-hop loop handles questions no single retrieval can answer. The blue-green vector collection swap — zero-downtime index updates — I invented from first principles before I'd seen it documented anywhere.",
      'The Generative BI assistant uses Llama Guard for responsible-AI guardrails and Arize Phoenix for tracing.',
      "Before GenAI took over my work there, I was a data scientist in the full sense, and much of it was computer vision. Staff photo checks: Haar cascades to detect the face, a check that the face is straight-on rather than in profile, local binary features to trace the face, and a check that the background is white. Live fall detection on warehouse CCTV, chaining three PaddlePaddle models I trained with its SDK: human detection (a YOLO model), keypoint detection and pose estimation. Document understanding: I fine-tuned YOLO to find specific parts of scanned shipment documents, so their key information could be matched across documents. And defect detection on wafer chips with OpenCV.",
      "Beyond vision: I traced each wafer's manufacturing journey as a graph with NetworkX and ran statistical anomaly detection on every step, which helped investigations. And I piloted an optimisation model in Pyomo to reduce purchases of supply parts and optimise profit, given sales forecasts and constrained by storage space. It was a proof of concept.",
    ].join('\n\n'),
  },
  {
    slug: 'ck-delta',
    years: '2022',
    company: 'CK Delta',
    short: 'CK Delta',
    brand: { color: 'oklch(0.2 0.01 60)', logo: 'ck-delta.png' },
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
    short: 'EMA',
    brand: { color: 'oklch(0.55 0.17 25)', logo: 'ema.png' },
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
    short: 'JobTech',
    brand: { color: 'oklch(0.6 0.14 145)', logo: 'jobtech.png' },
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
    short: 'Toyota Tsusho',
    brand: { color: 'oklch(0.48 0.16 258)', logo: 'toyota-tsusho.png' },
    location: 'Singapore',
    role: 'Demand & Supply Analyst',
    dates: 'Jun 2015 — Apr 2017',
    deck: 'Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques.',
    body: 'Served Toyota automotive distributors across the Asia Pacific region.',
    tech: ['VBA', 'Excel', 'Exponential Smoothing', 'Holt-Winters'],
    highlight: { figure: '~25%', caption: 'better long-term forecast accuracy', brief: 'better forecast accuracy, Toyota Tsusho' },
    pullQuote: 'Improved long-term forecast accuracy by ~25%.',
    copilot: 'Where it started.',
  },
]

/** My name as it reads on a staff pass. */
export const NAME = { preferred: 'Titus Lim', full: 'Lim Hsien Yong' }

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
/** A question the "Ask about …" pill sends to Ask Titus. */
export type AskPrompt = { label: string; question: string }

/**
 * Honours, grouped so every school reads in the same order: scholarships, then achievements.
 * Everything here was selected, ranked or awarded; taking part alone doesn't make the list.
 * Write the result first: the text before the first comma is shown large, the rest as its context.
 */
export type HonorGroups = {
  /** Scholarships, grants and funded awards. */
  scholarships?: string[]
  /** Competitions, selections and rankings. */
  achievements?: string[]
}

/** A programme taken during a degree (exchange, summer or winter school). */
export type EducationPart = HonorGroups & {
  institution: string
  /** Short name for labels, e.g. "UConn". */
  short: string
  programme: string
  dates: string
  /** The big line in its box: the grade, or the selection when there was no grade. */
  standing: string
  ask: AskPrompt
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
}

export type Education = HonorGroups & {
  /** Stable id: the page anchor is `edu-${slug}`. */
  slug: string
  /** The start year, used in nav and Ask Titus labels (e.g. "SMU, 2021"). */
  years: string
  institution: string
  /** Short name for labels, e.g. "SMU". */
  short: string
  degree: string
  dates: string
  location: string
  /** The class of degree or GPA, shown huge on the dark tile; `note` sits in its corner. */
  standing: { figure: string; caption: string; note?: string }
  ask: AskPrompt
  /** A public piece about me and this degree, linked beside the ask pill, e.g. the school's interview. */
  feature?: { label: string; href: string }
  parts?: EducationPart[]
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
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
    standing: { figure: '3.98', caption: 'GPA out of 4.0', note: "Dean's List" },
    scholarships: ['MITB Scholarship', 'SMU AI Talent Development Grant'],
    achievements: ['1st place, Food Image Classification competition', '3rd place, Recommender Systems competition'],
    ask: { label: 'my Master’s', question: 'What did you study in your Master’s at SMU?' },
    feature: { label: 'Watch SMU’s interview with me', href: 'https://youtu.be/SvFH6uKAyfE' },
    copilot:
      'My joke answer for why I studied artificial intelligence: there was no master’s in actual intelligence. The real answer: the degree was the realisation of my dream of becoming a data scientist, and I wanted to do it all. Not just classical machine learning, but deep learning; learning from unstructured data such as images, in computer vision; recommender systems, where the data has many gaps (collaborative filtering is amazing); machine-learning engineering pipelines; AI security; and multi-agent systems, the ant-colony-optimisation kind, like those used to train StarCraft II AIs. I also learned IoT and built my own pipe-sensor pipeline. Every module stuck with me. Since I work on agents now, I use the thinking more than the specific skills, feature engineering above all. In both competitions every team got the same problem: classify a set of fruit images with a computer-vision model, and get the best recommendations out of a generic recommender-systems problem set. My approach was experimental: once I had the basic shape of a solution, most of the gains came from tuning, such as training for more epochs, adjusting the learning rate, adding parameters, and ensembling.',
  },
  {
    slug: 'nus',
    years: '2011',
    institution: 'National University of Singapore',
    short: 'NUS',
    degree: 'BEng Chemical Engineering',
    dates: '2011 — 2015',
    location: 'Singapore',
    standing: { figure: '2nd Upper', caption: 'Class Honours' },
    scholarships: ['NUS Undergraduate Scholarship'],
    achievements: [
      'Selected to present, Shell Global Energy, Water & Food Security Roundtable',
      '88th percentile globally, Bloomberg Aptitude Test',
    ],
    ask: { label: 'NUS', question: 'What did you do at NUS?' },
    copilot:
      'Why chemical engineering: I wanted to help solve climate change, and I was interested in all the sciences (chemistry, maths, physics, biology); chemical engineering felt like the marriage of all of them. What still shows in how I work is the engineering approach to problems: decompose them recursively into smaller sub-problems, and solve those. My final-year project was in Prof Neal Chung’s membrane group, on pressure-retarded osmosis with sewage water. The main problem was designing membrane modules that could withstand fouling from the contaminants and still generate clean, usable energy. Prof Chung’s group was the world’s best membrane research team at the time, so I was very fortunate to get a place. I learned the small details behind membrane design, and how to build experiments iteratively, each one improving on the last. I also interned in Prof Mark Saeys’ catalysis team, on catalyst design for Fischer–Tropsch synthesis, mainly trying new catalyst designs and running simulations. Neither line of research panned out, but both were ambitious and I’m glad I tried them. At the Shell Global Energy, Water & Food Security Roundtable I framed sustainability as a game-theory problem. My point wasn’t that the science isn’t there; it’s that there’s no incentive to change globally. It is always more convenient to kick the can down the road, and pursuing long-term goals brings short-term costs such as lost voter confidence and inflation. That lack of incentive percolates down to businesses and to individuals. I’m honestly not sure how I was picked.',
    parts: [
      {
        institution: 'University of Connecticut',
        short: 'UConn',
        programme: 'Exchange, Chemical & Biomolecular Engineering',
        dates: '2013',
        standing: 'First Class with Distinction',
        scholarships: ['NUS Scholars Enrichment Grant'],
        achievements: [
          'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer',
          'Top 10 in two PhD modules, taken in year 2',
          '"Most Inspiring Student", AIChE UConn chapter',
        ],
        ask: { label: 'UConn', question: 'What was your exchange at UConn like?' },
        copilot:
          'I took PhD modules in catalysis and polymer chemistry, mainly to push beyond my comfort zone, and to keep up with cutting-edge research in case I wanted to join one of those research teams for a PhD (in the end I didn’t do one). I was well stretched: everyone else in the class was a domain expert with novel research ideas, and I benefited just from being in the room. The “Most Inspiring Student” award from the AIChE student chapter was for my results in class and my project presentations. As a year 2, I did the equivalent of the final-year capstone with the year 4 students, designing a power plant in Aspen HYSYS, and did well.',
      },
      {
        institution: 'University of Oxford',
        short: 'Oxford',
        programme: 'IARU Global Summer School, Global Challenges of the 21st Century',
        dates: '2014',
        standing: 'First Class with Distinction',
        scholarships: ['IARU-Santander Scholarship'],
        achievements: ['1 of 14 selected worldwide'],
        ask: { label: 'Oxford', question: 'What did you do at the Oxford summer school?' },
        copilot:
          'The programme explored global challenges and their solutions through four topics. Urbanisation: heavy migration from rural areas to cities for better jobs raises the cost of living, strains city infrastructure and pushes city boundaries outward, which cuts domestic farm output (usually rural) and leaves a country leaning more on imports. Waste management: the 3Rs (reduce, reuse, recycle), why they work and why they often don’t, and the circular economy. Overfishing and water pollution. Climate change. For each topic we worked in teams: we prepared cases, debated for and against each position, and wrote essays and gave presentations. A lot of work for a summer school, and honestly very fun; the preparation was very rich.',
      },
      {
        institution: 'NUS Suzhou Research Institute',
        short: 'Suzhou',
        programme: 'Winter school, immersion in Chinese business culture',
        dates: '2014',
        standing: '1 of 3 chemical engineers selected',
        scholarships: ['Market Immersion Award, IE Singapore Young Talent Programme'],
        ask: { label: 'Suzhou', question: 'What was the Suzhou winter school about?' },
        copilot:
          'The winter school was about how business is done in China: how cultural beliefs, modern and traditional, shape the way people there think about different issues, and why they are so assiduous about some matters and laissez-faire about others. It was like an MBA industry visit: we saw how they worked and learned from it. One lesson stayed with me: neither raw intelligence nor vision decides success there. 关系 (guanxi) does, the ability to build relationships and draw on other people’s strengths to succeed.',
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
    standing: { figure: 'Top Student', caption: 'Award' },
    achievements: [
      'Certificate of Distinction, Alpha Students Programme',
      'Chess Club President, College Colours',
      'Platinum Award, Community Involvement Programme',
      'Sports Leaders Award',
    ],
    ask: { label: 'Anderson JC', question: 'What did you do at Anderson Junior College?' },
    copilot:
      'Top Student: I was one of seven in my cohort to score straight As, in Physics, Chemistry, Mathematics and Economics, alongside the compulsory common curriculum. Honestly, all I did was study hard and give myself a lot of positive affirmation. The Alpha Students Programme is for academically gifted students, and I was enrolled in it; its students are expected to give back. I was chess club president and class monitor, led my class’s volunteering initiative, and joined the college’s wider initiatives. My studies together with those awards earned the Certificate of Distinction. As chess club president I started cross-learning between the chess and xiangqi (Chinese chess) sides, and grew enrolment from 4 to 50 in xiangqi alone, and from 1 to 40 in chess. That was mainly creative marketing: I networked to get us a good booth position at the open house and ran a blitz exhibition; people loved watching players hit the clocks and make good moves. We also won every national competition, every one of them, so one morning our results took up the whole assembly’s announcements, which was good publicity. I played on the xiangqi side and led by example, captaining the team to every win while playing well myself. The Sports Leaders Award was for chess. Yes, it counts as a sport. For the Community Involvement Programme I volunteered with Lions Befrienders, keeping elderly people company, and spent time with children with special needs (I don’t remember that organisation’s name). It made me sad that some people seem left behind in society, and in every stint I did my best to bring them warmth and joy.',
  },
]

/** Shown at the foot of the Education page. */
export const CERTIFICATIONS = ['Certified ScrumMaster']

// Every tool I've used lives in lib/about.ts (the About page's periodic table), which also feeds Ask Titus.

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type MarginNote = {
  constraint: string
  decision: string
  outcome: string
}

/**
 * A frame on a project's projector (Projects), after the title card (its figure, always first).
 * `image`: a still. `video`: a short silent loop (plays only while showing; its poster for reduced motion). `demo`: a YouTube demo, played on the page. `diagram`: one of the drawn diagrams in
 * components/projects (IlluminaDiagrams: a work project shows how it fits together, not screenshots;
 * BassoonArchitecture: fictional-bassoon's stack, following one chat message).
 */
export type ProjectFrame =
  | { kind: 'image'; src: string; caption: string; ms?: number }
  | { kind: 'video'; src: string; poster: string; caption: string; ms?: number }
  | { kind: 'demo'; youtubeId: string; caption: string }
  | { kind: 'diagram'; diagram: 'illumina-ready' | 'illumina-answer' | 'bassoon-architecture'; label: string; caption: string; ms?: number }

export type Project = {
  slug: string
  title: string
  sub: string
  /** Small label over the name on Projects, e.g. "Personal · solo". */
  context: string
  /** The dark tile's caption under figure.value, e.g. "containers, one per real-world concern". */
  caption: string
  /** First line of "What it is", set larger. */
  lead: string
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
  /** The "Ask about X →" pill that closes the project. */
  ask: AskPrompt
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
  /** What plays on the project's projector after its title card. */
  frames: ProjectFrame[]
  /** Full width on Projects, under its write-up, for a projector of wide diagrams (Illumina). */
  wide?: boolean
}

export const PROJECTS: Project[] = [
  {
    slug: 'fictional-bassoon',
    title: 'fictional-bassoon',
    sub: 'A fifty-four-container LLM harness, vibe-coded end-to-end',
    context: 'Personal · solo',
    caption: 'containers, one per real-world concern',
    lead: 'A full production-realistic stack, built to exercise a real multi-service architecture end to end, not overengineering for its own sake.',
    body: `FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, an LGTM observability stack, and a Next.js 14 frontend behind Nginx. Solo-built and vibe-coded end-to-end with LLMs, then audited by CodeRabbit, with ${FICTIONAL_BASSOON_COVERAGE} test coverage.`,
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
    ask: { label: 'fictional-bassoon', question: 'Why does fictional-bassoon have 54 containers?' },
    copilot: [
      'Named after a woodwind instrument I thought was a bear. Canon forever.',
      'The aim: a showcase of distributed-systems engineering applied to AI agents. The app inside it is called Relay, a full-stack chat app with streamed answers, visible internet-search activity, saved conversations and local tracing dashboards.',
      'How one message travels: the browser posts to FastAPI, which subscribes to a Redis pub/sub channel for that job and queues the work on RabbitMQ. A Celery worker runs the LangGraph deep agent (Tavily for internet search), which publishes every event to Redis, and FastAPI re-emits each one to the browser as Server-Sent Events.',
      'It speaks three open agent protocols, each version-pinned. AG-UI is the event stream to the browser (run, step, reasoning, tool-call and text events). A2UI lets the model write interactive screens itself: ask it to compare FastAPI, Flask and Django and let you pick, and it lays out cards and a choice list, your pick goes back as one action, and it tailors a follow-up. That is a restricted A2UI v1.0 profile (six components, one select_option action), validated on the server and again in the browser, and never executable. A2A lets other agents discover and call it (an Agent Card plus JSON-RPC, JWT auth); it is an A2A server only and does not call other agents.',
      'Design choices: SSE over WebSockets, because updates only flow server to client and SSE rides plain HTTP. Celery and RabbitMQ so a long agent run never holds an HTTP request open. Redis Sentinel for resilient pub/sub. Two PgBouncer pools: transaction mode for short API queries, session mode for the agent’s long-lived state connections. Citus sharded by thread_id, with threads and messages colocated and users as a reference table. Langfuse on ClickHouse and MinIO for LLM tracing, and the LGTM stack (Loki, Grafana, Tempo, Prometheus) for the infrastructure. Both halves hold a 90% test-coverage gate.',
      'What is honestly unfinished, as the README records it: LangGraph’s checkpoint tables cannot be distributed in Citus yet, so they fall back to the coordinator; Grafana’s log panel has no data yet; AG-UI reasoning events have not been seen in a live run; A2UI is a restricted candidate profile, not full conformance; and A2A task status lives in one process and does not survive a restart.',
    ].join('\n\n'),
    frames: [
      // The one illustration on the site (see CLAUDE.md): the name, as a bear playing it. Made with Qwen.
      {
        kind: 'video',
        src: '/projects/bassoon-bear.mp4',
        poster: '/projects/bassoon-bear-poster.webp',
        caption: 'The name: a woodwind instrument I once thought was a bear · video made with Qwen',
        ms: 5000,
      },
      { kind: 'diagram', diagram: 'bassoon-architecture', label: 'Architecture', caption: 'The architecture: one chat message, start to finish', ms: 11000 },
    ],
  },
  {
    slug: 'illumina-rag',
    title: 'Illumina Agentic RAG',
    sub: 'A sixteen-component production retrieval platform',
    context: 'At work · Illumina',
    caption: 'components between a question and its answer',
    lead: 'Agentic RAG, deployed in Microsoft Teams, that answers field service engineers’ questions from troubleshooting documents. The right answer might be three lines long or thirty pages, so it splits each question, answers the parts in parallel, and checks the result before replying.',
    body: 'Features semantic double-merge chunking, chunk dreaming, metadata engineering, contextual retrieval, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.',
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
    ask: { label: 'the Illumina RAG', question: 'Isn’t sixteen components overkill for the Illumina RAG?' },
    copilot:
      'See the Illumina role above. When discussing this, explain the *why* behind each retrieval stage — don\'t just list techniques. ' +
      'Why it is not overkill: field service engineers ask it questions from troubleshooting documents, and the right answer can be three lines or thirty pages. ' +
      'So it works like map-reduce: it splits a question into sub-questions; each one runs HyDE plus hybrid (keyword + vector) search, a re-rank, prompt compression and its own answer, in parallel; ' +
      'the sub-answers are combined; then an LLM checks whether that answers the question, and if not, asks a follow-up and goes round again. ' +
      'Before any of that, each chunk is enriched: chunk dreaming, metadata engineering (questions the chunk can answer) and contextual retrieval (a concise summary at the top of the chunk).',
    wide: true,
    frames: [
      { kind: 'diagram', diagram: 'illumina-ready', label: 'Getting ready', caption: 'Getting ready: documents into searchable collections', ms: 5500 },
      {
        kind: 'diagram',
        diagram: 'illumina-answer',
        label: 'Answering',
        caption: 'An answer can be three lines or thirty pages: split, answer the parts in parallel, combine, check',
        ms: 9000,
      },
    ],
  },
  {
    slug: 'margin-call',
    title: 'TheMarginCall',
    sub: 'Six specialists arguing about your portfolio',
    context: 'Personal',
    caption: 'agents in one investment group chat',
    lead: 'A multi-agent investment guidance crew built on Autogen.',
    body: 'Six specialists collaborate in a group chat: a statistical analyst, a technical analyst (RSI, Bollinger, Ichimoku), a fundamental analyst, a researcher that reads SEC filings via RAG, a finance professor for concepts, and a reporter that writes and emails the findings.',
    figure: { label: 'agents', value: '6' },
    secondary: { label: 'modes', value: 'II' },
    tags: ['Python', 'Autogen', 'LlamaIndex', 'Qdrant', 'RAG', 'Tavily', 'Gmail'],
    preview: 'six agents arguing about your portfolio',
    github: 'https://github.com/tituslhy/TheMarginCall',
    demo: 'https://www.youtube.com/watch?v=uLtMD3J4U40',
    accent: 'amber',
    ask: { label: 'TheMarginCall', question: 'How do the agents in TheMarginCall work together?' },
    copilot: [
      'The aim: a group of LLM agents that help someone make better investment decisions. There is a demo on YouTube: https://www.youtube.com/watch?v=uLtMD3J4U40. Two modes: a group chat with every agent, run by Autogen’s group chat manager, and a workspace where an analyst asks questions of a SQL database in plain English and explores the Plotly charts it draws (VannaAI with ChromaDB). The front end is Chainlit.',
      'The agents are LlamaIndex agents wrapped in Autogen’s LLamaIndexConversableAgent. The data analyst (statistics such as correlations and compound annual growth) is a ReAct agent, because data analysis is the broadest job and has the most tools. The technical analyst (stochastic RSI, Bollinger bands, Ichimoku cloud) and the fundamental analyst have one tool each, so they are simple function-calling agents. The researcher, the professor and the reporter are ReAct agents, because they juggle several tools and their reasoning helps them pick the right one. The researcher reads SEC filings through RAG (SEC API, LlamaIndex’s simple vector store, Cohere rerank, prompt compression with GPT-2) and searches the web with Tavily. The professor answers concept questions from Investopedia articles in Qdrant, with dense and BM42 hybrid search, and reviews the analysts’ recommendations. The reporter writes the report, then drafts and sends emails through Gmail.',
      'What I tried and dropped: LangGraph or CrewAI for the group chat, because I could not show the agents’ intermediate messages cleanly; DSPy prompt optimisation for the professor, shelved after breaking changes in LlamaIndex and DSPy; and a Neo4j property-graph index for the professor, because building the knowledge graph cost too much. The open problem I named in the repo: choosing the right tool inside an agent, and the right agent inside the group chat.',
    ].join('\n\n'),
    frames: [{ kind: 'demo', youtubeId: 'uLtMD3J4U40', caption: 'The demo · press play to watch it here' }],
  },
]

/** A project from before GenAI, from my first portfolio site (github.com/tituslhy/Portfolio). */
export type EarlierProject = {
  title: string
  /** Two topic labels, e.g. ["Computer vision", "Video"]. */
  topics: [string, string]
  blurb: string
  /** Missing when the repo is gone (a teammate's, since taken down). */
  github?: string
  /** The repo's own cover picture. */
  image: string
  /** Logos and drawings are shown whole on white; photos are shown whole on black (the projector's screen). */
  fit?: 'contain'
  /** A result worth a big number, when the project reported one. */
  result?: { value: string; label: string }
  /** Copilot-only, first-person narrative. Not rendered on the page. */
  copilot?: string
}

const PORTFOLIO_IMG = 'https://raw.githubusercontent.com/tituslhy/Portfolio/main/portfolio/static/imgs'

export const EARLIER_PROJECTS: EarlierProject[] = [
  { title: 'GiftMaker', topics: ['Speech recognition', 'NLP'], blurb: 'Stitches recorded video messages together, transcribes them with Whisper, and has an LLM write something new from what was said.', github: 'https://github.com/tituslhy/GiftMaker', image: `${PORTFOLIO_IMG}/AI_gift.png`, fit: 'contain', copilot: 'I tested it on my own collection of video montages from friends appreciating other friends. The LLM step can be ChatGPT, or Falcon on Hugging Face with Flan-T5 as the fallback when Falcon’s free calls run out; it can also skip the LLM and just return the stitched video and transcript. The fun example: writing a friend’s whole dating profile, in HTML, from what everyone said about them.' },
  { title: 'You Only Edit Once', topics: ['Computer vision', 'Video'], blurb: 'An AI video editor for leisure divers: object detection trims underwater footage and picks out frames to beautify.', github: 'https://github.com/teyang-lau/you-only-edit-once', image: `${PORTFOLIO_IMG}/YOEO.png`, fit: 'contain', copilot: 'A team project: I was one of the anchor contributors and the de facto scrum master, facilitating the team’s exchanges; I built most of the modules and reviewed the others’ work.' },
  { title: 'The AI Backdoor Catcher', topics: ['Computer vision', 'AI security'], blurb: 'Finds backdoors hidden in vision models by reconstructing their triggers, using neural attention distillation and mean absolute deviation.', image: `${PORTFOLIO_IMG}/backdoor.png`, copilot: 'A team project: I was one of the anchor contributors and the de facto scrum master, facilitating the team’s exchanges; I built most of the modules and reviewed the others’ work.' },
  { title: 'Skimlit', topics: ['NLP', 'Streamlit'], blurb: 'Makes long medical abstracts skimmable, following the PubMed 200k RCT paper on its own data.', github: 'https://github.com/tituslhy/Skimlit', image: `${PORTFOLIO_IMG}/skimlit.png`, result: { value: '84.8%', label: 'test accuracy' }, copilot: 'Each sentence of an abstract is labelled with its role (background, objective, methods, results, conclusions), so you can skim it. I compared models on 10% of the data for 3 epochs: a Naive Bayes TF-IDF baseline (72.2%), Conv1D on learned word embeddings (79.7%), frozen Universal Sentence Encoder embeddings (71.2%), character embeddings alone (65.2%), and a word-and-character hybrid (73.1%). The winner was a tribrid model that also takes each sentence’s position and the abstract’s length (83.0%); trained on all the data for 5 epochs it reached 84.8% test accuracy. The lesson: where a sentence sits matters a lot. It runs as a FastAPI backend with a Streamlit front end.' },
  { title: 'A Song for Singapore', topics: ['NLP', 'Generative'], blurb: 'GPT-2, trained on Singapore’s patriotic songs, writes new lyrics; OpenAI’s Jukebox tries to set them to music.', github: 'https://github.com/quekhyg/NLP-Lyric-Generator', image: `${PORTFOLIO_IMG}/Singapore.jpeg`, copilot: 'A team project: I was one of the anchor contributors and the de facto scrum master, facilitating the team’s exchanges; I built most of the modules and reviewed the others’ work.' },
  { title: 'Barista Board', topics: ['Recommender systems', 'NLP'], blurb: 'Recommends cafés from scraped Yelp reviews, with matrix and tensor factorisation over ratings, text, images, dates and places.', github: 'https://github.com/teyang-lau/Coffee_Joint_Recommender_System', image: `${PORTFOLIO_IMG}/coffee.jpeg`, copilot: 'A team project: I was one of the anchor contributors and the de facto scrum master, facilitating the team’s exchanges; I built most of the modules and reviewed the others’ work.' },
  { title: 'Facemask classification', topics: ['Computer vision', 'MLOps'], blurb: 'A light classifier for the edge, with a GCP pipeline that retrains it when misclassification climbs, and quantisation to shrink it.', github: 'https://github.com/tituslhy/Face-mask-classification', image: `${PORTFOLIO_IMG}/facemask.jpeg`, copilot: 'Built as an end-to-end MLOps exercise on Google Cloud Vertex AI: a training pipeline, a continuous-monitoring pipeline that watches the model and its data, and a monitoring dashboard.' },
  { title: 'Watchlist', topics: ['Full stack', 'MongoDB'], blurb: 'My first full-stack app: log the films you love, and play a clip from each one’s page.', github: 'https://github.com/tituslhy/watchlist', image: `${PORTFOLIO_IMG}/movie.png`, copilot: 'Built with Flask and Flask-WTF on MongoDB. Passwords are stored only as hashes. You can edit any film’s details, and there is a dark mode, just for fun. It was a proof of concept, so I never deployed it.' },
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

/** A fix to this site, printed on the Writing page like a newspaper correction. */
export type Correction = { text: string; by: string; ref: string; href: string }

/** Fixes made by the site's issue agent (.github/issue-agent), newest first. Add one when an agent fix merges. */
export const CORRECTIONS: Correction[] = [
  {
    text: 'An earlier edition of this site hid the navigation bar until readers had scrolled a long way back up. It now returns on any upward scroll.',
    by: 'this site’s issue agent',
    ref: '#14',
    href: 'https://github.com/tituslhy/IntroducingTitus/pull/14',
  },
]

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
  /** A tile in the About page's periodic table. Several in one reply share one stop under the answer. */
  tool?: true
}

/**
 * Every anchor the copilot may scroll to. Generated from the same arrays the
 * page renders, so a new role or project is targetable the moment it exists.
 */
export const PAGE_TARGETS: PageTarget[] = [
  { id: 'lede', path: '/about', label: 'About', about: 'how I went from chemical engineering to AI, and what drives me' },
  { id: 'stack', path: '/about', label: 'Stack', about: 'every tool I have used, as a periodic table that lights up in the order I picked each one up, with what I use every day' },
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
    about: `${e.degree} at ${e.institution} (${e.dates})${e.parts?.length ? `, including ${new Intl.ListFormat('en').format(e.parts.map((p) => p.institution))}` : ''}`,
  })),
  { id: 'projects', path: '/projects', label: 'Projects', about: 'the things I have built, at work and on my own' },
  ...PROJECTS.map((p) => ({ id: `project-${p.slug}`, path: '/projects' as const, label: p.title, about: `${p.title}: ${p.sub}` })),
  { id: 'earlier-work', path: '/projects', label: 'Earlier work', about: 'my projects from before GenAI' },
  { id: 'open-source', path: '/projects', label: 'Open source', about: 'my open-source contributions' },
  { id: 'writing', path: '/writing', label: 'Writing', about: 'my featured Medium articles' },
  ...TOOLS.map((t) => ({ id: toolTargetId(t), path: '/about' as const, label: t.name, about: `${t.name} in the periodic table`, tool: true as const })),
]

export const PAGE_TARGET_IDS = PAGE_TARGETS.map((t) => t.id)
