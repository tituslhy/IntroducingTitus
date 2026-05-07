# Personal Website — Requirements Document
**Owner:** Titus Lim Hsien Yong  
**Last Updated:** 5 May 2026  
**Build Pipeline:** Claude Code (Ralph Wiggum loop) → CodeRabbit audit → Claude Code fixes → Cursor unit tests → Deploy to GitHub Pages

---

## 1. Project Overview

A professional portfolio website serving as a web-form resume and personal brand presence. Primary audience: hiring managers, technical leads, C-suite sponsors, and collaborators. Secondary audience: the GenAI/ML community who may find Titus via Medium or GitHub.

**Tone:** Direct. Confident. Slightly warm. No corporate fluff. No buzzwords unless they're accurate. No family details.

---

## 2. Tech Stack

- **Framework:** Next.js 14 (App Router, static export)
- **Styling:** Tailwind CSS
- **Deployment:** GitHub Pages (`tituslhy.github.io`)
- **Components:** shadcn/ui where needed
- **Static assets:** `/public/` directory in repo

Static export config required:
```js
// next.config.js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '',
}
```

---

## 3. Design Specification

### Visual Direction
- **Mode:** Dark mode only. No toggle.
- **Aesthetic:** Technical confidence. Typography-forward. Clean grid with deliberate accent moments.
- **NOT:** Purple gradients. Generic SaaS look. Particle backgrounds. Overused fonts (Inter, Roboto, Space Grotesk).
- **Font pairing:** DM Serif Display (headings/name) + IBM Plex Mono (body/code/tags)
- **Accent color:** Warm amber (`#F59E0B` range). Decided. Committed. Non-negotiable.
- **Animation:** Subtle scroll-triggered reveals. No page transitions that make you wait. No autoplay anything.
- **Layout:** Single-column with anchor nav. Desktop-first. Fully responsive.
- **Headshot:** Profile photo in hero. File: `/public/headshot.jpeg`. Circular or slightly rounded with amber ring/glow.
- **No stock photos. No illustrations.** Typography, headshot, and structure carry the weight.

### Navigation
- Fixed top nav with anchor links
- Nav items: Home | Experience | Projects | Writing | Contact
- On mobile: hamburger menu

---

## 4. Page Structure

### Page 1 — Home (Cover + About)

#### Hero Section
- Headshot: `/public/headshot.jpeg`
- Name: **Lim Hsien Yong (Titus)**
- Title: **GenAI Engineer & Architect**
- Tagline: **"I build AI systems. Then I explain them. Then I sell them."**
- Sub-tagline: *8+ years building production AI. 50 technical articles. Solo from zero to production.*
- CTA buttons: `View Experience` | `Read Writing` | `GitHub` | `LinkedIn` | `Medium`
- Resume: **"Resume available on request"** — styled as a subtle text link or badge, NOT a primary CTA

#### Technology Stack Section
- Section title: **"What I Work With"**
- Grouped tag grid — NOT skill bars
- Groups:
  - **AI/GenAI Frameworks:** LangChain, LangGraph, LlamaIndex, CrewAI, Autogen, DSPy, MCP, A2A
  - **Languages:** Python (Expert), SQL (Expert), Java (Proficient)
  - **Infrastructure:** Docker, Kubernetes/Helm, GitHub Actions, Jenkins, vLLM
  - **Databases:** PostgreSQL, Oracle DB, Redis, MongoDB, Qdrant, Neo4j
  - **Observability:** Grafana, Prometheus, Loki, Langfuse, Arize Phoenix, ELK
  - **Cloud:** AWS, GCP, Azure, Snowflake

#### Passions / What Drives Me Section
- 3–4 punchy cards:
  - *Building production AI systems that actually work under real constraints*
  - *Writing technical content that explains complex systems to humans*
  - *Open-source contributions to the frameworks I use*
  - *Closing the gap between AI research and engineering reality*

#### Social Links
- GitHub: https://github.com/tituslhy
- LinkedIn: https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/
- Medium: https://medium.com/@tituslhy
- Email: tituslhy@gmail.com

---

### Page 2 — Experience (Web Resume)

Timeline or card layout. Reverse chronological. Each role card:
- Company | Role | Dates | Location
- 3-line summary (architecture-level, no client-sensitive specifics)
- Tech stack (inline tags)
- Optional: key metric or achievement callout

#### Role Cards

**Mastercard Asia/Pacific — Singapore**
*Lead AI Engineer* | Jul 2026 – Present
> Leading AI engineering for Mastercard's Asia/Pacific division as an individual contributor, with responsibility for building and growing a team. Focused on applying production AI capabilities at enterprise scale within a global payments network.
Tech: *(to be updated post-onboarding)*

---

**United Overseas Bank — Singapore**
*Vice President, Generative AI* | Jun 2025 – Jul 2026
> Technical lead for a real-time GenAI-driven contact centre platform supporting in-call and post-call agent assistance under strict latency and accuracy SLAs. Architected and delivered UOB's enterprise multi-agent platform (BYOA) enabling cross-framework agent interoperability and dynamic tool discovery.
Tech: Java (Spring Boot), React, Redis, Oracle DB, ELK Stack, Docker, vLLM, Helm, Jenkins, LangChain, MCP

---

**Illumina — Singapore** ⭐ CROWN JEWEL — maximum visual real estate
*Senior Data Scientist* | Jan 2023 – Jun 2025
> Solo-architected and deployed a 16-component production agentic RAG system for field service engineers, featuring semantic chunking, HyDE, hybrid search, reranking, prompt compression, and an iterative agentic retrieval loop. Delivered a separate Generative BI assistant supporting 800+ metrics with human-in-the-loop design. Anticipated to save USD 9 million upon full deployment.
Tech: Python, LlamaIndex, Qdrant, AWS Bedrock, RabbitMQ, Docker+CUDA, GitHub Actions, SonarQube, Grafana/Prometheus/Loki, Chainlit, DSPy, Giskard

---

**Energy Market Authority — Singapore**
*Principal Engineer, Research & Statistics* | Apr 2018 – Aug 2022
> Developed and presented national electricity and gas demand forecast models to Ministers and Permanent Secretaries. Drove the Authority's AI and data strategy roadmap. Built ML models for power plant trip prediction and electricity spot price forecasting with external partners.
Tech: Python, XGBoost, Neural Networks, DataRobot, Linear Regression, ARIMA

---

**CK Delta — Singapore**
*Data Scientist* | Sep 2022 – Jan 2023
> Validated and enhanced MRT station crowdedness forecasting models and tightened data engineering workflows for streaming data. Model deployed on the MyTransportSG app.
Tech: Python, ML forecasting, streaming data pipelines

---

**JobTech Pte Ltd — Singapore**
*Data Scientist* | Apr 2017 – Aug 2017
> Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals. Findings published in a national report on Indonesia's labour market.
Tech: Python, NLP, regex-based entity extraction

---

**Toyota Tsusho Asia Pacific — Singapore**
*Demand & Supply Analyst* | Jun 2015 – Apr 2017
> Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques. Improved long-term forecast accuracy by ~25% for Toyota automotive distributors across the region.
Tech: VBA, Excel, Exponential Smoothing, Holt-Winters

---

#### Education
- **Singapore Management University** — Master of IT in Business (AI Track) | 2021–2022 | GPA 3.98/4.0 | Dean's List | SMU AI Talent Development Grant
- **National University of Singapore** — BEng Chemical Engineering (2nd Upper Hons) | 2011–2015 | NUS Undergraduate Scholarship

---

### Page 3 — Projects & Writing

#### Project Cards

**fictional-bassoon**
> A solo-built 54-container distributed AI platform, vibe-coded end-to-end with LLMs and audited by CodeRabbit. Features a full production stack: FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, LGTM observability stack, and a Next.js 14 frontend behind Nginx. 90%+ test coverage. Unhinged by design.
Tags: Python, LangGraph, Postgres, ClickHouse, Docker, Langfuse, Next.js
GitHub: https://github.com/tituslhy/fictional-bassoon

---

**Illumina Agentic RAG System**
> Production-grade 16-component agentic RAG system for enterprise field service engineering. Features semantic double-merge chunking, chunk dreaming, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.
Tags: LlamaIndex, Qdrant, AWS Bedrock, Docker+CUDA, Grafana, SonarQube

---

**Open Source Contributions**
- LlamaIndex integration with Microsoft LLMLingua2 prompt compression
- LlamaIndex Gmail Tool bug fix
- Unsloth Retrieval Augmented Finetuning cookbook
- IBM Agent Communication Protocol (ACP) LlamaIndex example
- Giskard RAGET bug fix
- Chainlit-LlamaIndex cookbook

---

**Writing — Medium**
- 50+ published technical articles
- Featured by: Singapore Management University, Unsloth, LlamaIndex, IBM, FlowerAI
- Link: https://medium.com/@tituslhy
- Display: 6 hardcoded featured articles:
  1. [Agent Memory: The underrated superpower of agentic apps](https://medium.com/mitb-for-all/agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435)
  2. [How to Train Your LLM: Low Rank Adaptation Finetuning using Unsloth!](https://medium.com/mitb-for-all/how-to-train-your-llm-teaching-toothless-to-bite-8d9f56fe4b2a)
  3. [How to RAFT your LLM: Retrieval Augmented Finetuning using Unsloth!](https://medium.com/mitb-for-all/how-to-raft-your-llm-retrieval-augmented-finetuning-using-unsloth-4c3844a9a6e3)
  4. [A second look at LangGraph: When "Command-Send" becomes "common sense"](https://medium.com/mitb-for-all/a-second-look-at-langgraph-when-command-sends-becomes-common-sense-720a851cf8a8)
  5. [Helm Charts: The Multi-Server Orchestra Conductor](https://medium.com/mitb-for-all/helm-charts-the-multi-server-orchestra-conductor-18dc88665fc1)
  6. [A gentle introduction to LiteLLM](https://medium.com/mitb-for-all/a-gentle-introduction-to-litellm-649d48a0c2c7)

---

### Page 4 — Copilot *(Phase 2 — NOT in current build)*
Deferred. Build Pages 1–3 and deploy to GitHub Pages first.
Revisit when ready to add OpenAI RAG chatbot on resume content.

---

## 5. Resume Availability
- No PDF hosted publicly
- All pages: *"Resume available on request"* → mailto:tituslhy@gmail.com

---

## 6. SEO & Meta
- Title: `Titus Lim | GenAI Engineer & Architect`
- Description: `GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.`
- OG image: Dark card with name + tagline
- Canonical URL: https://tituslhy.github.io

---

## 7. What This Site Is NOT
- Not a blog (Medium handles that)
- Not a CV dump (curated, not exhaustive)
- Not a personal diary (no family content, no personal life)
- Not a tutorial site
- Not a dark-mode toggle debate
- Not a Vercel deployment (GitHub Pages only for now)

---

## 8. Build Order
1. Scaffold Next.js 14 with Tailwind + shadcn/ui (static export config)
2. Page 1: Home — Hero (headshot) + Stack + Passions + Links
3. Page 2: Experience — Timeline cards + Education
4. Page 3: Projects + Writing (6 hardcoded articles)
5. Deploy to GitHub Pages, test at tituslhy.github.io
6. CodeRabbit audit after each major page
7. Cursor for unit tests on utility functions

---

## 9. Resolved Decisions
- [x] Accent color: **Warm amber** (`#F59E0B`)
- [x] Font pairing: **DM Serif Display + IBM Plex Mono**
- [x] Featured Medium articles: **6 hardcoded** (listed above)
- [x] Copilot route: **Deferred to Phase 2**
- [x] Domain: **tituslhy.github.io** for now
- [x] Deployment: **GitHub Pages** (static export)
- [x] Headshot: **Yes, in hero** → `/public/headshot.jpeg`
- [x] fictional-bassoon: **Public** → https://github.com/tituslhy/fictional-bassoon

## 10. Still Pending
- [ ] Mastercard tech stack — update after onboarding (Jul 2026)
- [ ] fictional-bassoon exact repo URL — confirm it's `tituslhy/fictional-bassoon`
- [ ] Drop headshot as `/public/headshot.jpeg` before scaffolding