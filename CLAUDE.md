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

> **Source of truth:** `design_handoff_personal_site/README.md` (Editorial Redesign).
> It supersedes any conflicting visual rule below. Decisions ratified from that
> handoff are reflected inline.

### Visual
- **Light (warm cream paper) by default.** Dark mode is an optional toggle, OFF by
  default — skip building the toggle for now unless asked.
- **Accent color: aged amber** `oklch(0.62 0.155 55)` (≈ `#b76a23`). Replaces the
  old `#F59E0B` everywhere — `#F59E0B` is too bright on cream.
- **Second accent: indigo** `oklch(0.34 0.10 254)` — reserved for the Illumina
  project only. Everything else stays on amber.
- **Font pairing: Newsreader** (headings/name — variable serif) + **IBM Plex Mono**
  (body/code/tags). DM Serif Display is dropped.
- **Aesthetic:** Editorial broadsheet — typography-forward, hairline rules, folios,
  drop-caps, pull quotes, single muted amber accent. No rounded cards, no shadows
  on type, no glow.
- **Animation:** Subtle scroll-triggered reveals. Sticky year rail. Quiet looping
  micro-motion (amber pulse-dot, coffee-cup steam, typing dots) — all gated behind
  `prefers-reduced-motion`. No page transitions that make users wait. No particle
  backgrounds.
- **Layout:** Single long-scroll column with sticky anchor nav. Desktop-first.
  Fully responsive.
- **Headshot:** Profile photo in masthead. File: `/public/headshot.jpeg` —
  rectangular 3:4, 1px ink border, `object-position: 50% 30%`, subtle saturate/
  contrast filter. No circle crop, no amber ring/glow.
- **No stock photos. No illustrations. No brand/tech logos.** Typography, headshot,
  and hairline structure carry the weight.

### What This Site Is NOT
- NOT a purple gradient SaaS template
- NOT a generic portfolio with skill bars (meaningless)
- NOT Inter/Roboto/Space Grotesk (banned)
- NOT a glowing dark-terminal portfolio (superseded — the site is cream editorial now)

---

## Site Structure

### Navigation (sticky top nav, anchor links)
`About` | `Stack` | `Experience` | `Projects` | `Writing` + `Get in touch` CTA
- Scroll-spy underlines the active item in amber; nav hides on scroll-down,
  reappears on scroll-up. Folio numbers prefix each item (e.g. "01 About").
- Brand "T·L" at left scrolls to top. Mobile: horizontal scroll list.

### Page 1 — Home
**Hero / Masthead:**
- Headshot: `/public/headshot.jpeg` — rectangular 3:4, 1px ink border, no ring/glow
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
An editorial "Ask Titus" FAB fixed to the bottom-right of every page (ink pill →
drawer that opens upward). Visual shell follows the README; backend is unchanged.

**Behaviour:**
- Click FAB → drawer opens upward (translateY/scale, ~220ms)
- Drawer has a close button; header reads "Ask **Titus**"
- Empty state shows 3 starter prompts
- Typing indicator (3 amber dots) while awaiting response
- Session-only memory (useState, no persistence)
- Markdown rendered via `react-markdown`, restyled editorial (serif, amber `<a>`)
- Mobile responsive

**API Route:**
- `/app/api/chat/route.ts` — server-side proxy to OpenAI
- Reads `OPENAI_API_KEY` from environment (Vercel dashboard)
- Never expose key to browser

**OpenAI Integration:**
- Model: `gpt-6-luna`
- Enable web search tool via Responses API
- System prompt: see `copilot-system-prompt.md`
- Medium profile URL passed as context: https://medium.com/@tituslhy

**Voice:** First-person ("I built…", not "Titus built…"). Dry, precise, lightly
warm. No emoji, no exclamation points. Two short paragraphs max unless asked.

**Scope Rules (enforced via system prompt):**
- Answer ONLY questions about Titus's work, experience, projects, skills, writing
- If answer unknown: "I don't have that on file — feel free to write to me directly at tituslhy@gmail.com"
- Never fabricate experience or skills not in context
- Redirect off-topic questions politely back to my work
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
- OG image: Warm cream editorial card with name + tagline (generate as static asset)
- Canonical URL: https://introducing-titus.vercel.app/

---
