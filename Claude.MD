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

## Sub-Agent Routing Rules
- ALL test writing, test generation, and coverage improvement tasks → unit-test-writer agent
- After any new component, API route, or utility function is written → unit-test-writer agent
- Never handle test work in the main thread directly
- Skip for pure Tailwind/styling-only changes

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui where needed
- **Deployment:** Vercel (migrated from GitHub Pages)
- **Static assets:** `/public/` directory

Remove static export config. Vercel supports full Next.js — no `output: 'export'` needed:
```js
// next.config.js
const nextConfig = {
  images: { unoptimized: true },
  basePath: '',
}
```

API routes are now supported. Use `/app/api/` for server-side logic.

Do not deviate from this stack unless explicitly instructed.

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
- Tagline: "I build AI systems — from architecture to the boardroom."
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

*(See requirements.md for full role content)*

---

### Copilot Bubble (Floating, All Pages)
A floating amber chat bubble fixed to the bottom-right of every page.

**Behaviour:**
- Click bubble → opens chat panel (slide up or expand)
- Chat panel has close button
- "Ask me anything about my work" as placeholder/prompt
- Typing indicator while awaiting response
- Session-only memory (useState, no persistence)
- Mobile responsive

**API Route:**
- `/app/api/chat/route.ts` — server-side proxy to OpenAI
- Reads `OPENAI_API_KEY` from environment (Vercel dashboard)
- Never expose key to browser

**OpenAI Integration:**
- Model: `gpt-4o-mini`
- Enable web search tool via Responses API
- System prompt: see `copilot-system-prompt.md`
- Medium profile URL passed as context: https://medium.com/@tituslhy

**Scope Rules (enforced via system prompt):**
- Answer ONLY questions about Titus's work, experience, projects, skills, writing
- If answer unknown: "I don't have that information — feel free to email Titus at tituslhy@gmail.com"
- Never fabricate experience or skills not in context
- Redirect off-topic questions politely back to Titus's work
- Redirect salary/availability/personal questions to email

**Copilot system prompt file:** `/copilot-system-prompt.md` — create this file if it doesn't exist, using the scope rules defined below as the basis.

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
- Canonical URL: https://introducing-titus.vercel.app/

---
