# Personal Website — Requirements Document
**Owner:** Titus Lim Hsien Yong  
**Last Updated:** 4 May 2026  
**Build Pipeline:** Claude Code (Ralph Wiggum loop) → CodeRabbit audit → Claude Code fixes → Cursor unit tests → Deploy

---

## 1. Project Overview

A professional portfolio website serving as a web-form resume and personal brand presence. Primary audience: hiring managers, technical leads, C-suite sponsors, and collaborators. Secondary audience: the GenAI/ML community who may find Titus via Medium or GitHub.

**Tone:** Direct. Confident. Slightly warm. No corporate fluff. No buzzwords unless they're accurate. No family details.

---

## 2. Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel (required for copilot feature; handles env vars cleanly)
- **Components:** shadcn/ui where needed
- **Static assets:** `/public/` directory in repo

---

## 3. Design Specification

### Visual Direction
- **Mode:** Dark mode only. No toggle.
- **Aesthetic:** Technical confidence. Typography-forward. Clean grid with deliberate accent moments.
- **NOT:** Purple gradients. Generic SaaS look. Particle backgrounds. Overused fonts (Inter, Roboto, Space Grotesk).
- **Font pairing:** Distinctive display font for name/headings + refined mono or sans for body. Suggest: DM Serif Display + IBM Plex Mono, or similar with strong character.
- **Accent color:** Electric blue (`#3B82F6` range) OR warm amber (`#F59E0B` range). Pick one. Commit.
- **Animation:** Subtle scroll-triggered reveals. No page transitions that make you wait. No autoplay anything.
- **Layout:** Single-column with anchor nav. Desktop-first. Fully responsive.
- **No stock photos. No illustrations. No avatars.** Typography and structure carry the weight.

### Navigation
- Fixed top nav with anchor links
- Nav items: Home | Experience | Projects | Writing | Contact
- On mobile: hamburger or scroll-snap sections

---

## 4. Page Structure

### Page 1 — Home (Cover + About)

#### Hero Section
- Name: **Lim Hsien Yong (Titus)**
- Title: **GenAI Engineer & Architect**
- Tagline: **"I build AI systems. Then I explain them. Then I sell them."**
- Sub-tagline (optional smaller text): *8+ years building production AI. 50 technical articles. Solo from zero to production.*
- CTA buttons: `View Experience` | `Read Writing` | `GitHub` | `LinkedIn` | `Medium`
- Resume: **"Resume available on request"** — styled as a subtle text link or badge, NOT a primary CTA

#### Technology Stack Section
- Section title: **"What I Work With"**
- Grouped icon/tag grid — NOT a skill bar chart (those are meaningless)
- Groups:
  - **AI/GenAI Frameworks:** LangChain, LangGraph, LlamaIndex, CrewAI, Autogen, DSPy, MCP, A2A
  - **Languages:** Python (Expert), SQL (Expert), Java (Proficient)
  - **Infrastructure:** Docker, Kubernetes/Helm, GitHub Actions, Jenkins, vLLM
  - **Databases:** PostgreSQL, Oracle DB, Redis, MongoDB, Qdrant, Neo4j
  - **Observability:** Grafana, Prometheus, Loki, Langfuse, Arize Phoenix, ELK
  - **Cloud:** AWS, GCP, Azure, Snowflake

#### Passions / What Drives Me Section
- 3–4 punchy bullet points or card items. Suggested copy (adjust freely):
  - *Building production AI systems that actually work under real constraints*
  - *Writing technical content that explains complex systems to humans*
  - *Open-source contributions to the frameworks I use*
  - *Closing the gap between AI research and engineering reality*

#### Social Links / Footer of Page 1
- GitHub: https://github.com/tituslhy
- LinkedIn: https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/
- Medium: https://medium.com/@tituslhy
- Email: tituslhy@gmail.com

---

### Page 2 — Experience (Web Resume)

Timeline or card layout. Reverse chronological. Each role card contains:
- Company | Role | Dates | Location
- **3-line summary** (architecture-level, no client-sensitive specifics)
- **Tech Stack used** (inline tags)
- Optional: key metric or achievement callout

#### Role Cards (content)

---

**Mastercard Asia/Pacific — Singapore**  
*Lead AI Engineer* | Jul 2026 – Present  
Summary:
> Leading AI engineering for Mastercard's Asia/Pacific division as an individual contributor, with responsibility for building and growing a team. Focused on applying production AI capabilities at enterprise scale within a global payments network.

Tech: *(to be updated post-onboarding)*

---

**United Overseas Bank — Singapore**  
*Vice President, Generative AI* | Jun 2025 – Jul 2026  
Summary:
> Technical lead for a real-time GenAI-driven contact centre platform supporting in-call and post-call agent assistance under strict latency and accuracy SLAs. Architected and delivered UOB's enterprise multi-agent platform (BYOA) enabling cross-framework agent interoperability and dynamic tool discovery.

Tech: Java (Spring Boot), React, Redis, Oracle DB, ELK Stack, Docker, vLLM, Helm, Jenkins, LangChain, MCP

---

**Illumina — Singapore**  
*Senior Data Scientist* | Jan 2023 – Jun 2025  
Summary:
> Solo-architected and deployed a 16-component production agentic RAG system for field service engineers, featuring semantic chunking, HyDE, hybrid search, reranking, prompt compression, and an iterative agentic retrieval loop. Delivered a separate Generative BI assistant supporting 800+ metrics with human-in-the-loop design. Anticipated to save USD 9 million upon full deployment.

Tech: Python, LlamaIndex, Qdrant, AWS Bedrock, RabbitMQ, Docker+CUDA, GitHub Actions, SonarQube, Grafana/Prometheus/Loki, Chainlit, DSPy, Giskard

*Note: This is the crown jewel. Give it the most visual real estate on the page.*

---

**Energy Market Authority — Singapore**  
*Principal Engineer, Research & Statistics* | Apr 2018 – Aug 2022  
Summary:
> Developed and presented national electricity and gas demand forecast models to Ministers and Permanent Secretaries. Drove the Authority's AI and data strategy roadmap. Built ML models for power plant trip prediction and electricity spot price forecasting with external partners.

Tech: Python, XGBoost, Neural Networks, DataRobot, Linear Regression, ARIMA

---

**CK Delta — Singapore**  
*Data Scientist* | Sep 2022 – Jan 2023  
Summary:
> Validated and enhanced MRT station crowdedness forecasting models and tightened data engineering workflows for streaming data. Model deployed on the MyTransportSG app.

Tech: Python, ML forecasting, streaming data pipelines

---

**JobTech Pte Ltd — Singapore**  
*Data Scientist* | Apr 2017 – Aug 2017  
Summary:
> Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals. Findings published in a national report on Indonesia's labour market.

Tech: Python, NLP, regex-based entity extraction

---

**Toyota Tsusho Asia Pacific — Singapore**  
*Demand & Supply Analyst* | Jun 2015 – Apr 2017  
Summary:
> Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques. Improved long-term forecast accuracy by ~25% for Toyota automotive distributors across the region.

Tech: VBA, Excel, Exponential Smoothing, Holt-Winters

---

#### Education (bottom of Experience page or sidebar)
- **Singapore Management University** — Master of IT in Business (AI Track) | 2021–2022 | GPA 3.98 / 4.0 | Dean's List | SMU AI Talent Development Grant
- **National University of Singapore** — BEng Chemical Engineering (2nd Upper Hons) | 2011–2015 | NUS Undergraduate Scholarship

---

### Page 3 — Projects

#### Project Cards

**fictional-bassoon**
> A solo-built 54-container distributed AI platform, vibe-coded end-to-end with LLMs and audited by CodeRabbit. Features a full production stack: FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, LGTM observability stack, and a Next.js 14 frontend behind Nginx. 90%+ test coverage. Unhinged by design.

Tags: Python, LangGraph, Postgres, ClickHouse, Docker, Langfuse, Next.js

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
- Display: Featured article grid (pull top articles via Medium RSS or hardcode 6 featured)

---

### Page 4 — Copilot (AI Chat) *(Phase 2)*

**Description:** An AI chat bubble / full-page interface that answers questions about Titus using RAG over his resume.

**Implementation:**
- RAG source: Titus' resume PDF (stored in `/public/resume.pdf` or embedded as text)
- LLM: OpenAI API (GPT-4o or similar)
- Interface: Chat bubble on all pages OR dedicated `/copilot` route
- Disclaimer: *"Ask me anything about Titus. I'm an AI assistant powered by his resume."*

**Deployment note:** Requires Vercel (env var: `OPENAI_API_KEY`). Do NOT commit API key to repo. Store in Vercel environment variables only.

**Phase gating:** Build Pages 1–3 first. Add Copilot in Phase 2 once core site is deployed and stable.

---

## 5. Resume Availability

- **No PDF hosted publicly on GitHub repo** (resume is a living document)
- All pages: *"Resume available on request"* — mailto link to tituslhy@gmail.com
- Exception: Copilot feature may use resume content internally as RAG source

---

## 6. SEO & Meta

- Title: `Titus Lim | GenAI Engineer & Architect`
- Description: `GenAI engineer and architect with 8+ years building production AI systems. 50 technical articles. Open source contributor.`
- OG image: Dark card with name + tagline (generate as static asset)
- Canonical URL: to be set post-deployment

---

## 7. What This Site Is NOT

- Not a blog (Medium handles that)
- Not a CV dump (curated, not exhaustive)
- Not a personal diary (no family content, no personal life)
- Not a tutorial site
- Not a dark-mode toggle debate

---

## 8. Build Order for Claude Code

1. Scaffold Next.js 14 project with Tailwind + shadcn/ui
2. Build Page 1 (Home/Cover) — Hero + Stack + Passions + Links
3. Build Page 2 (Experience) — Timeline cards
4. Build Page 3 (Projects + Writing)
5. Deploy to Vercel, test
6. Phase 2: Build Copilot page with OpenAI RAG
7. CodeRabbit audit after each major page
8. Cursor for unit tests on utility functions

---

## 9. Open Questions (Decide Before Build)

- [ ] Accent color: Electric blue OR warm amber?
- [ ] Font pairing: confirm before scaffolding (drives whole aesthetic)
- [ ] Featured Medium articles: list 6 to hardcode OR use RSS feed?
- [ ] Copilot route: floating bubble on all pages OR dedicated `/copilot` page?
- [ ] Domain: custom domain or Vercel subdomain for now?
