# CLAUDE.md — Personal Website (tituslhy)

## Ralph Wiggum Protocol (READ THIS FIRST)
Before writing ANY code:
1. Read `requirements.md` completely
2. Confirm understanding of requirements
3. Ask clarifying questions if anything is ambiguous
4. Only then write code

Do not skip step 1. Do not assume. Read the paper first.

---

## Who This Is For
You are building the personal website of **Lim Hsien Yong (Titus)** — GenAI Engineer & Architect.
Primary audience: hiring managers, technical leads, C-suite sponsors, GenAI/ML community.
This site is a professional brand presence and web-form resume. Not a blog. Not a diary.

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui where needed
- **Deployment:** GitHub Pages (static export)
- **Static assets:** `/public/` directory

Do not deviate from this stack unless explicitly instructed.

Next.js must be configured for static export:
```js
// next.config.js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '',
}
```

---

## Design Rules (Non-Negotiable)

### Visual
- **Dark mode only.** No toggle. No light mode. Ever.
- **Accent color: Warm amber** (`#F59E0B` range). One accent. Commit to it.
- **Font pairing: DM Serif Display** (headings/name) + **IBM Plex Mono** (body/code/tags)
- **Aesthetic:** Technical confidence. Typography-forward. Clean grid with deliberate accent moments.
- **Animation:** Subtle scroll-triggered reveals only. No page transitions that make users wait. No autoplay. No particle backgrounds.
- **Layout:** Single-column with anchor nav. Desktop-first. Fully responsive.
- **Headshot:** Profile photo in hero section. File: `/public/headshot.jpeg`
- **No stock photos. No illustrations.** Typography, headshot, and structure carry the weight.

### What This Site Is NOT
- NOT a purple gradient SaaS template
- NOT a generic portfolio with skill bars (meaningless)
- NOT Inter/Roboto/Space Grotesk (banned)
- NOT a dark-mode toggle debate

---

## Site Structure

### Navigation (fixed top nav, anchor links)
`Home` | `Experience` | `Projects` | `Writing` | `Contact`
Mobile: hamburger menu

### Page 1 — Home
**Hero:**
- Headshot: `/public/headshot.jpeg` — circular or slightly rounded, amber ring/glow accent
- Name: Lim Hsien Yong (Titus)
- Title: GenAI Engineer & Architect
- Tagline: "I build AI systems. Then I explain them. Then I sell them."
- Sub-tagline: *8+ years building production AI. 50 technical articles. Solo from zero to production.*
- CTAs: `View Experience` | `Read Writing` | `GitHub` | `LinkedIn` | `Medium`
- Resume: "Resume available on request" — subtle text link/badge only, NOT a primary CTA

**Tech Stack Section ("What I Work With"):**
Grouped tag grid (NO skill bars):
- AI/GenAI Frameworks: LangChain, LangGraph, LlamaIndex, CrewAI, Autogen, DSPy, MCP, A2A
- Languages: Python (Expert), SQL (Expert), Java (Proficient)
- Infrastructure: Docker, Kubernetes/Helm, GitHub Actions, Jenkins, vLLM
- Databases: PostgreSQL, Oracle DB, Redis, MongoDB, Qdrant, Neo4j
- Observability: Grafana, Prometheus, Loki, Langfuse, Arize Phoenix, ELK
- Cloud: AWS, GCP, Azure, Snowflake

**Passions ("What Drives Me"):**
3–4 punchy cards:
- Building production AI systems that actually work under real constraints
- Writing technical content that explains complex systems to humans
- Open-source contributions to the frameworks I use
- Closing the gap between AI research and engineering reality

**Social links:**
- GitHub: https://github.com/tituslhy
- LinkedIn: https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/
- Medium: https://medium.com/@tituslhy
- Email: tituslhy@gmail.com

---

### Page 2 — Experience
Reverse chronological timeline/card layout. Each card:
- Company | Role | Dates | Location
- 3-line architecture-level summary (no client-sensitive specifics)
- Tech stack as inline tags
- Optional: key metric/achievement callout

**Roles (in order):**

**Mastercard Asia/Pacific — Singapore**
*Lead AI Engineer* | Jul 2026 – Present
> Leading AI engineering for Mastercard's Asia/Pacific division as an individual contributor, with responsibility for building and growing a team. Focused on applying production AI capabilities at enterprise scale within a global payments network.
Tech: *(to be updated post-onboarding)*

**United Overseas Bank — Singapore**
*Vice President, Generative AI* | Jun 2025 – Jul 2026
> Technical lead for a real-time GenAI-driven contact centre platform supporting in-call and post-call agent assistance under strict latency and accuracy SLAs. Architected and delivered UOB's enterprise multi-agent platform (BYOA) enabling cross-framework agent interoperability and dynamic tool discovery.
Tech: Java (Spring Boot), React, Redis, Oracle DB, ELK Stack, Docker, vLLM, Helm, Jenkins, LangChain, MCP

**Illumina — Singapore** ⭐ CROWN JEWEL — give maximum visual real estate
*Senior Data Scientist* | Jan 2023 – Jun 2025
> Solo-architected and deployed a 16-component production agentic RAG system for field service engineers, featuring semantic chunking, HyDE, hybrid search, reranking, prompt compression, and an iterative agentic retrieval loop. Delivered a separate Generative BI assistant supporting 800+ metrics with human-in-the-loop design. Anticipated to save USD 9 million upon full deployment.
Tech: Python, LlamaIndex, Qdrant, AWS Bedrock, RabbitMQ, Docker+CUDA, GitHub Actions, SonarQube, Grafana/Prometheus/Loki, Chainlit, DSPy, Giskard

**Energy Market Authority — Singapore**
*Principal Engineer, Research & Statistics* | Apr 2018 – Aug 2022
> Developed and presented national electricity and gas demand forecast models to Ministers and Permanent Secretaries. Drove the Authority's AI and data strategy roadmap. Built ML models for power plant trip prediction and electricity spot price forecasting with external partners.
Tech: Python, XGBoost, Neural Networks, DataRobot, ARIMA

**CK Delta — Singapore**
*Data Scientist* | Sep 2022 – Jan 2023
> Validated and enhanced MRT station crowdedness forecasting models and tightened data engineering workflows for streaming data. Model deployed on the MyTransportSG app.
Tech: Python, ML forecasting, streaming data pipelines

**JobTech Pte Ltd — Singapore**
*Data Scientist* | Apr 2017 – Aug 2017
> Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals. Findings published in a national report on Indonesia's labour market.
Tech: Python, NLP, regex-based entity extraction

**Toyota Tsusho Asia Pacific — Singapore**
*Demand & Supply Analyst* | Jun 2015 – Apr 2017
> Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques. Improved long-term forecast accuracy by ~25% for Toyota automotive distributors across the region.
Tech: VBA, Excel, Exponential Smoothing, Holt-Winters

**Education:**
- Singapore Management University — Master of IT in Business (AI Track) | 2021–2022 | GPA 3.98/4.0 | Dean's List | SMU AI Talent Development Grant
- National University of Singapore — BEng Chemical Engineering (2nd Upper Hons) | 2011–2015 | NUS Undergraduate Scholarship

---

### Page 3 — Projects & Writing

**Project Cards:**

**fictional-bassoon**
> A solo-built 54-container distributed AI platform, vibe-coded end-to-end with LLMs and audited by CodeRabbit. Features a full production stack: FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, LGTM observability stack, and a Next.js 14 frontend behind Nginx. 90%+ test coverage. Unhinged by design.
Tags: Python, LangGraph, Postgres, ClickHouse, Docker, Langfuse, Next.js
GitHub: https://github.com/tituslhy/fictional-bassoon

**Illumina Agentic RAG System**
> Production-grade 16-component agentic RAG system for enterprise field service engineering. Features semantic double-merge chunking, chunk dreaming, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.
Tags: LlamaIndex, Qdrant, AWS Bedrock, Docker+CUDA, Grafana, SonarQube

**Open Source Contributions:**
- LlamaIndex integration with Microsoft LLMLingua2 prompt compression
- LlamaIndex Gmail Tool bug fix
- Unsloth Retrieval Augmented Finetuning cookbook
- IBM Agent Communication Protocol (ACP) LlamaIndex example
- Giskard RAGET bug fix
- Chainlit-LlamaIndex cookbook

**Writing — Medium:**
- 50+ published technical articles
- Featured by: Singapore Management University, Unsloth, LlamaIndex, IBM, FlowerAI
- Link: https://medium.com/@tituslhy
- Display: 6 hardcoded featured articles:
  1. Agent Memory: The underrated superpower of agentic apps — https://medium.com/mitb-for-all/agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435
  2. How to Train Your LLM: Low Rank Adaptation Finetuning using Unsloth! — https://medium.com/mitb-for-all/how-to-train-your-llm-teaching-toothless-to-bite-8d9f56fe4b2a
  3. How to RAFT your LLM: Retrieval Augmented Finetuning using Unsloth! — https://medium.com/mitb-for-all/how-to-raft-your-llm-retrieval-augmented-finetuning-using-unsloth-4c3844a9a6e3
  4. A second look at LangGraph: When "Command-Send" becomes "common sense" — https://medium.com/mitb-for-all/a-second-look-at-langgraph-when-command-sends-becomes-common-sense-720a851cf8a8
  5. Helm Charts: The Multi-Server Orchestra Conductor — https://medium.com/mitb-for-all/helm-charts-the-multi-server-orchestra-conductor-18dc88665fc1
  6. A gentle introduction to LiteLLM — https://medium.com/mitb-for-all/a-gentle-introduction-to-litellm-649d48a0c2c7

---

## Content Rules
- **Tone:** Direct. Confident. Slightly warm. No corporate fluff. No buzzwords unless accurate.
- **No family details.** Ever.
- **No resume PDF hosted publicly.** All pages say: "Resume available on request" → mailto:tituslhy@gmail.com
- **No client-sensitive project specifics** in experience summaries.

---

## SEO & Meta
- Title: `Titus Lim | GenAI Engineer & Architect`
- Description: `GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.`
- OG image: Dark card with name + tagline (generate as static asset)
- Canonical URL: https://tituslhy.github.io

---

## Build Order
Follow this sequence strictly. Do not skip ahead.

1. Scaffold Next.js 14 project with Tailwind + shadcn/ui (static export config)
2. Page 1: Home — Hero (with headshot) → Tech Stack → Passions → Social Links
3. Page 2: Experience — Timeline cards + Education
4. Page 3: Projects + Writing (6 hardcoded Medium articles)
5. Deploy to GitHub Pages, test
6. CodeRabbit audit after each major page
7. Cursor for unit tests on utility functions

---

## Open Items
- [ x ] fictional-bassoon GitHub URL — confirm exact repo name: https://github.com/tituslhy/fictional-bassoon
- [ x ] Mastercard tech stack — update after onboarding (Jul 2026)
- [ ] Headshot file — drop as `/public/headshot.jpeg` before scaffolding