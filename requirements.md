# Personal Website — Requirements Document
**Owner:** Titus Lim Hsien Yong  
**Last Updated:** 7 May 2026  
**Build Pipeline:** Claude Code (Ralph Wiggum loop) → CodeRabbit audit → Claude Code fixes → Deploy to Vercel

---

## 1. Project Overview

A professional portfolio website serving as a web-form resume and personal brand presence. Primary audience: hiring managers, technical leads, C-suite sponsors, and collaborators. Secondary audience: the GenAI/ML community who may find Titus via Medium or GitHub.

**Tone:** Direct. Confident. Slightly warm. No corporate fluff. No buzzwords unless they're accurate. No family details.

---

## 2. Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **Components:** shadcn/ui where needed
- **Static assets:** `/public/` directory in repo

Remove static export config. Vercel supports full Next.js features including API routes:
```js
// next.config.js
const nextConfig = {
  images: { unoptimized: true },
  basePath: '',
}
```

---

## 3. Design Specification

> **Source of truth:** `design_handoff_personal_site/README.md` (Editorial Redesign)
> supersedes this section where they conflict. The spec below is updated to match.

### Visual Direction
- **Mode:** Light (warm cream paper) by default. Optional dark toggle, OFF by default — skip for now.
- **Aesthetic:** Editorial serif type on cream paper with soft rounded tiles (adopted 2026-11-21, mock `design/rethink/site-style.html`). Inner pages share one grammar: name pinned left; a dark results row; one dark headline tile per item (amber figure, slow glow, count-up); cream tiles for details; latte boxes for nested or earlier items; small-capital mono group labels; tools as rounded pills; an "Ask about X →" pill that opens Ask Titus. Single amber accent. No shadows on type.
- **NOT:** Purple gradients. Generic SaaS look. Overused fonts (Inter, Roboto, Space Grotesk). Glowing dark-terminal look.
- **Font pairing:** Newsreader (headings/name — variable serif) + IBM Plex Mono (body/code/tags). DM Serif Display dropped.
- **Accent color:** Aged amber `oklch(0.62 0.155 55)` (≈ `#b76a23`). Replaces `#F59E0B` everywhere.
- **Second accent:** Indigo `oklch(0.34 0.10 254)` — the Illumina project on Projects only (its Experience tile is amber).
- **Layout:** A short front page plus six routes (/experience, /education, /projects, /writing, /about, /colophon) with a sticky nav. Desktop-first. Fully responsive.
- **Headshot:** Profile photo in masthead. File: `/public/headshot.jpeg`. Rectangular 3:4, 1px ink border, `object-position: 50% 30%`, subtle saturate/contrast filter. No circle crop, no amber ring/glow.
- **No stock photos. No illustrations, with one exception: the fictional-bassoon bear (`public/projects/bassoon-bear.webp`), the first still on that project's projector on Projects. Tech logos only in the front-page hero animation** (tools I've actually used; credits in public/logos/CREDITS.md). Elsewhere, typography, headshot, and hairline structure carry the weight.

### Navigation
- Sticky, opaque top nav with page links; the current page is underlined amber; hides on scroll-down
- Nav items: 01 Experience | 02 Education | 03 Projects | 04 Writing | 05 About | 06 Ask Titus (→ /colophon), plus a "Get in touch" CTA
- Brand "T·L" goes to the front page
- On mobile: two rows, all links visible

---

## 4. Page Structure

### Page 1 — Home (Cover + About)

#### Hero / Masthead Section
- Headshot: `/public/headshot.jpeg` — rectangular 3:4, 1px ink border, no ring/glow
- Name: **Lim Hsien Yong (Titus)**
- Tagline: **"I build AI systems — from architecture to the boardroom."**
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
- LinkedIn: https://www.linkedin.com/in/titus-lim-hsien-yong/
- Medium: https://medium.com/@tituslhy
- Email: tituslhy@gmail.com

---

### Page 2 — Experience (Web Resume)

Layout (redesigned 2026-11-21; mock `design/rethink/experience-passes.html`): a results row, then a desk of **staff passes**, one per role, fanned out oldest-left. Each pass carries the company's logo (`public/logos/companies/`) and colour (`brand` on each role), my name, the title and "Valid from … to …". Picking one up lifts it, rings it in its colour, swaps its dates for the role's highlight (or how long the role lasted), and shows that role right under the desk, one at a time (no scrolling). A "Show all 7 roles" switch lists every role, newest first, each under a "Pass N of 7" header in its colour; with it on, picking a pass jumps to its role. The results row and Ask Titus can still reach a hidden role (it is shown first); there is no separate "Earlier roles" box. On phones the passes sit in a row you swipe.

Each role:
- Company | Role | Dates | Location
- 3-line summary (architecture-level, no client-sensitive specifics)
- Tech stack (inline tags)
- Optional: key metric or achievement callout

#### Role Cards

**Mastercard Asia/Pacific — Singapore**
*Lead AI Engineer* | Jul 2026 – Present
> Leading AI engineering for Mastercard's Asia/Pacific division as an individual contributor, with responsibility for building and growing a team. Focused on applying production AI capabilities at enterprise scale within a global payments network.
Architected and built the core SDK and CLI for Agent Suite: a shared foundation that replaces one-off agent builds with a common, governed standard. Teams declare agents in YAML, then chat with them in the terminal or serve them as an API. Assistant skills ship inside the packages, and contributor tooling keeps both codebases consistent.
Tech: Python, LangChain, Typer, FastAPI, Docker, Helm Charts, GitHub Actions, Apache Jenkins

---

**United Overseas Bank — Singapore**
*Vice President, Generative AI* | Jun 2025 – Jul 2026
> Sole engineer on a real-time GenAI contact-centre platform: live call transcripts, in-call assistance and policy search for agents, and post-call summaries with red-flag and promise checks. Picked up Java to take over its Spring Boot microservices, and cut false positives in its post-call checks by 80% with an LLM-driven prompt-optimisation loop on the bank's self-hosted models. Also built the MCP service behind UOB's customer onboarding workflow (BYOC). (BYOA, UOB's planned multi-agent platform, which I worked on early, is known to Ask Titus but not shown on the page.)
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
> Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals. Findings published in a Business Insider report on Indonesia's labour market.
Tech: Python, NLP, regex-based entity extraction

---

**Toyota Tsusho Asia Pacific — Singapore**
*Demand & Supply Analyst* | Jun 2015 – Apr 2017
> Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques. Improved long-term forecast accuracy by ~25% for Toyota automotive distributors across the region.
Tech: VBA, Excel, Exponential Smoothing, Holt-Winters

---

#### Education (its own page, `/education`)
Content lives in `EDUCATION` and `CERTIFICATIONS` (`lib/profile.ts`); honours listed are only things selected, ranked or awarded. Every school reads in the same order: **Results** (class or GPA, on the dark tile) → **Scholarships** → **Achievements**, then an Ask pill.
- **Singapore Management University** — Master of IT in Business (AI track) | 2021–2022 | GPA 3.98 (Dean's List), scholarships, two competition placings
- **National University of Singapore** — BEng Chemical Engineering | 2011–2015 | 2nd Upper Class Honours; "During NUS" latte boxes: UConn exchange (2013), Oxford IARU summer school (2014), NUS Suzhou Research Institute winter school (Dec 2014)
- **Anderson Junior College** — GCE 'A' Levels | 2007–2008 | Top Student Award
- **Certifications:** Certified ScrumMaster
- A results row at the top (`educationResults()` in `lib/education.ts`) is derived from the data, never typed in. Experience has the same row (`experienceResults()` in `lib/experience.ts`, from each role's `highlight`).

---

### Page 3 — Projects & Writing

#### Project Cards

Display (/projects, redesigned 2026-11-22; mock `design/rethink/projects-reel.html`): the page is a cinema.
- Each featured project has a **projector**: a screen over a strip of film. Its title card (the project's figure, on the
  dark tile) plays first, then its frames (`frames` in `lib/profile.ts`): fictional-bassoon's bear, then its README
  architecture redrawn as a diagram (one chat message, start to finish; `components/projects/BassoonArchitecture`,
  sized to the projector's own width), then its README screenshots; TheMarginCall's YouTube demo (plays on the page); Illumina, built at work, two diagrams (getting ready;
  answering: fan out, fan in) instead of screenshots, full width.
- It plays by itself while half on screen, loops, pauses on mouse hover, a frame pick or Pause, and starts paused for
  reduced motion. Off-screen frames are `hidden`, so the results row can ask for the title card (lib/reveal).
- Earlier work shares one projector; the frame on screen is written up beside it. Open source is the closing credits.
- A sticky programme row (1 fictional-bassoon, 2 Illumina, 3 TheMarginCall, Earlier work, Open source) jumps between
  sections and fills in the one being read.

**fictional-bassoon**
> A solo-built 54-container distributed AI platform, vibe-coded end-to-end with LLMs and audited by CodeRabbit. Features a full production stack: FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, LGTM observability stack, and a Next.js 14 frontend behind Nginx. 90%+ test coverage. Unhinged by design.
Tags: Python, LangGraph, Postgres, ClickHouse, Docker, Langfuse, Next.js
GitHub: https://github.com/tituslhy/fictional-bassoon

---

**Illumina Agentic RAG System**
> A 16-component agentic RAG system, deployed in Microsoft Teams, that answers field service engineers' questions from troubleshooting documents. An answer can be three lines or thirty pages, so it splits each question, answers the parts in parallel, combines them and checks the result, asking a follow-up if needed. Features semantic double-merge chunking, chunk dreaming, metadata engineering, contextual retrieval, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.
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
- 65 published technical articles (8 on blockchain)
- Featured by: Singapore Management University, Unsloth, LlamaIndex, IBM, FlowerAI
- Link: https://medium.com/@tituslhy
- Display (/writing, redesigned 2026-11-21; mock `design/rethink/writing-paper.html`): the page is a newspaper, **The Titus Times**, same palette and tiles as the rest of the site with a newspaper's furniture:
  - Nameplate between a heavy rule and a hairline; ears hold a dark count-up tile ("N technical articles since <first year>") and "Ask what to read first →".
  - Dateline: Singapore · the newest article's date in view (never today's date) · "<year> edition · N articles".
  - **Editions:** one per year (back issues). **Desks:** one per theme in `content/article-themes.json`, alphabetical; every article sits under exactly one desk. Desks: Agent Applications, Agent Frameworks, Agent Patterns and Protocols, Blockchain, Copilots, Evaluating and Testing Agents, RAG Applications, Software Engineering, Training LLMs, Working Life.
  - Front page: the **latest story** (headline, one-line standfirst, cover picture, byline, drop-cap opening, "Continue reading on Medium", Ask pill), three stories down the side (the first with a picture), three across with pictures, the rest "In brief" as text.
  - Pictures are each post's first figure on Medium's CDN (`cover` in `content/articles.json`, set by `npm run articles:build`). No read times (Medium's own aren't in the export).
  - Corrections box (`CORRECTIONS` in `lib/profile.ts`: fixes made by the issue agent) and Featured by.
  - Late edition: after 7pm Singapore time the page is a shade darker with a "LATE EDITION" stamp.
- The 7 featured articles (`FEATURED_ARTICLES`) stay as Ask Titus context only.
---

### Copilot Bubble — Phase 2 ✅ NOW IN SCOPE

A floating "Ask me anything" chat bubble fixed to the bottom-right of every page.

#### UI Behaviour
- Editorial "Ask Titus" FAB (ink pill), fixed bottom-right, all pages
- Click → drawer opens upward (translateY/scale, ~220ms)
- Header: "Ask **Titus**" with label "Powered by GPT-4o mini"
- Empty state: 4 starter prompts
- Input placeholder: "Ask about my work…"
- Typing indicator (3 amber dots) while awaiting response
- Close button on drawer
- Session-only memory via `useState` — no persistence, no DB
- Markdown rendered via `react-markdown`, restyled editorial (serif, amber `<a>`)
- Mobile responsive

#### API Architecture
- **Route:** `/app/api/chat/route.ts`
- **Method:** POST
- **Request body:** `{ messages: [{role, content}] }`
- **Server reads:** `OPENAI_API_KEY` from Vercel environment variables
- **Never expose API key to browser**

#### OpenAI Integration
- **Model:** `gpt-4o-mini`
- **API:** OpenAI Responses API
- **Tools:** `show_on_page` and `search_writing` (answers from my own Medium articles via Jev, with `[n]` footnotes). `web_search_preview` removed. See `drawer-plans/ask-titus-agent.md`.
- **Medium context:** `https://medium.com/@tituslhy` stays in the system prompt as the fallback pointer when no article covers a question
- **System prompt:** See `copilot-system-prompt.md`

#### Scope Enforcement (via system prompt)
- **Voice:** First-person ("I built…", not "Titus built…"). Dry, precise, lightly warm. No emoji, no exclamation points. Two short paragraphs max unless asked.
- Answer ONLY about Titus's work, experience, projects, skills, writing
- Unknown answers → "I don't have that on file — feel free to write to me directly at tituslhy@gmail.com"
- Never fabricate skills or experience not in context
- Off-topic questions → politely redirect to my work
- Salary / availability / personal → redirect to email

---

### Satellite page — `/colophon` (How Ask Titus works)
- One satellite page, linked from the drawer, the footer and the main nav (last item, "Ask Titus")
- Sections: the short version, anatomy of a reply, one source of truth, guardrails, recruiter mode, how it's tested (hidden until `content/eval-results.json` exists), what it won't do, stack
- Spec: `drawer-plans/ask-titus-agent.md` (Phase 3)

---

## 5. Resume Availability
- No PDF hosted publicly
- All pages: *"Resume available on request"* → mailto:tituslhy@gmail.com

---

## 6. SEO & Meta
- Title: `Titus Lim | Lead AI Engineer` (follows the top role's exact title)
- Description: `Lead AI Engineer with 8+ years building production AI systems. 65 technical articles. Open source contributor.`
- OG image: Dark card with name + tagline
- Canonical URL: *(update after Vercel URL confirmed)*

---

## 7. What This Site Is NOT
- Not a blog (Medium handles that)
- Not a CV dump (curated, not exhaustive)
- Not a personal diary (no family content, no personal life)
- Not a tutorial site
- Not a dark-mode toggle debate

---

## 8. Build Order
1. ~~Scaffold Next.js 14 with Tailwind + shadcn/ui~~ ✅ Done
2. ~~Page 1: Home — Hero + Stack + Passions + Links~~ ✅ Done
3. ~~Page 2: Experience — Timeline cards + Education~~ ✅ Done
4. ~~Page 3: Projects + Writing~~ ✅ Done
5. ~~Deploy to GitHub Pages~~ ✅ Done
6. **Migrate to Vercel** ← Current step
7. **Build copilot bubble** ← Next step after migration
8. CodeRabbit audit
9. Claude Code fixes

---

## 9. Resolved Decisions
- [x] Design source of truth: **`design_handoff_personal_site/README.md`** (Editorial Redesign) — supersedes prior visual rules
- [x] Mode: **Light (warm cream paper) default**; dark toggle optional, skipped for now
- [x] Accent color: **aged amber** `oklch(0.62 0.155 55)` (≈ `#b76a23`), replacing `#F59E0B`
- [x] Second accent: **indigo** `oklch(0.34 0.10 254)` — Illumina project only
- [x] Font pairing: **Newsreader + IBM Plex Mono** (DM Serif Display dropped)
- [x] Headshot: **rectangular 3:4, 1px ink border** (no circle/ring)
- [x] Nav: **About | Stack | Experience | Projects | Writing + Get in touch CTA**
- [x] Copilot: **"Powered by GPT-4o mini" label, first-person voice** (backend `/api/chat` unchanged)
- [x] Featured Medium articles: **7 hardcoded**
- [x] Copilot: **Phase 2, now in scope**
- [x] Deployment: **Vercel** (migrated from GitHub Pages)
- [ ] `/colophon`: one satellite page, linked from the drawer, the footer and the main nav (last item, "Ask Titus")
- [x] Headshot: **Yes, in hero** → `/public/headshot.jpeg`
- [x] fictional-bassoon: **Public** → https://github.com/tituslhy/fictional-bassoon
- [x] Tagline updated: **"I build AI systems — from architecture to the boardroom."**

## 10. Still Pending
- [ ] Mastercard tech stack — update after onboarding (Jul 2026)
- [ ] Update canonical URL after Vercel deployment confirmed
- [ ] Add `OPENAI_API_KEY` to Vercel environment variables before copilot build