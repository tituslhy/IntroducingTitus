# AGENTS.md — Personal Website (tituslhy)

## Ralph Wiggum Protocol (READ THIS FIRST)
Before writing ANY code:
1. Read `CLAUDE.md` completely, and `lib/profile.ts` for career facts (the single source of roles, projects and copy)
2. Confirm your understanding of what is being asked
3. Ask clarifying questions if anything is ambiguous
4. Only then write code

Do not skip step 1. Do not assume. Read the project first.

---

## Who This Is For
You are building the personal website of **Lim Hsien Yong (Titus)** — Lead AI Engineer (sign-off = the top role's exact title, `SIGN_OFF_TITLE` in `lib/profile.ts`).
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
  project on Projects only. Everything else, including Illumina's Experience tile, stays
  on amber; latte (`--latte*`) is a neutral tone, not an accent.
- **Font pairing: Newsreader** (headings/name — variable serif) + **IBM Plex Mono**
  (body/code/tags). DM Serif Display is dropped.
- **Aesthetic:** Editorial serif type on cream paper, brought to life with soft rounded
  tiles (adopted 2026-11-21; mock: `design/rethink/site-style.html`). Inner pages share
  one grammar, built from `components/tiles/`:
  - **Item layout:** name pinned on the left (300px column), content on the right.
  - **Results row:** dark tiles at the top of a page; clicking one scrolls to and rings its source.
  - **Dark tile** (`HeroTile`, `.glow-tile`): the one headline per item, figure huge in
    amber-hi over a slow amber glow; figures fade and rise into place on first view (`RiseIn`; never a count-up, which shows false numbers mid-count).
  - **Cream tiles** (`bg-paper-deep`, radius 20): the details. **Latte boxes** (`bg-latte`,
    radius 28): anything nested under something bigger, or earlier.
  - **Small capital mono labels** (`GroupLabel`) head each group; tools are rounded pills.
  - **Ask pill** (`AskPill`) closes an item: "Ask about X →" opens Ask Titus with its question.
  - Hover lifts tiles 3px; all motion respects reduced motion. No shadows on type.
  - **Same same but different:** each page keeps this grammar but may add its own flair. Writing is a
    newspaper (*The Titus Times*, mock `design/rethink/writing-paper.html`): editions by year, one desk per theme.
    Experience is a desk of **staff passes** (mock `design/rethink/experience-passes.html`), one per role in its
    company's colour and logo; picking one up shows that role right under the desk, one at a time, and "Show all roles" lists every one. Projects is a cinema
    (mock `design/rethink/projects-reel.html`): each project has a **projector** (`components/projects/Projector`) that plays
    its title card then its stills by itself while on screen (pauses on hover, a frame pick or Pause; starts paused for
    reduced motion); fictional-bassoon also plays its architecture diagram; Illumina, built at work, plays two diagrams instead of screenshots; earlier work shares one projector;
    open source is the closing credits; a sticky programme row jumps between sections. Education keeps
    the plain tile grammar.
- **Layout:** A short front page plus six routes (`/experience`, `/education`, `/projects`, `/writing`,
  `/about`, `/colophon`), with a sticky nav. Desktop-first. Fully responsive.
  Front page design: `docs/superpowers/specs/2026-11-21-front-page-redesign-design.md`.
- **Headshot:** Profile photo in masthead. File: `/public/headshot.jpeg` —
  rectangular 3:4, 1px ink border, `object-position: 50% 30%`, subtle saturate/
  contrast filter. No circle crop, no amber ring/glow.
- **No stock photos. No illustrations, with one exception: the fictional-bassoon bear (`public/projects/bassoon-bear.mp4`, a 5-second silent loop made with Qwen, poster `bassoon-bear-poster.webp`), the first frame after the title card on that project's projector on Projects. Tech logos only in the front-page hero animation**
  (files in `public/logos/`, credits in `public/logos/CREDITS.md`, never a tool I haven't used).
  **Employer logos** appear only on the Experience staff passes (`public/logos/companies/`), small and unaltered.
  Elsewhere, typography, headshot, and hairline structure carry the weight.

### What This Site Is NOT
- NOT a purple gradient SaaS template
- NOT a generic portfolio with skill bars (meaningless)
- NOT Inter/Roboto/Space Grotesk (banned)
- NOT a glowing dark-terminal portfolio (superseded — the site is cream editorial now)

---

## Site Structure

### Navigation (sticky top nav, page links)
`T·L` | `01 Experience` | `02 Education` | `03 Projects` | `04 Writing` | `05 About` | `06 Ask Titus` (→ `/colophon`) + `Get in touch` CTA
- The current page's item is underlined in amber; nav is opaque, hides on scroll-down,
  reappears on scroll-up. Pages live in `SITE_PAGES` (`lib/profile.ts`).
- Brand "T·L" at left goes to the front page. Mobile: two rows, all links visible.

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
- LinkedIn: https://www.linkedin.com/in/titus-lim-hsien-yong/
- Medium: https://medium.com/@tituslhy
- Email: tituslhy@gmail.com

---

### Page 2 — Experience
Reverse chronological timeline/card layout. Each card:
- Company | Role | Dates | Location
- 3-line architecture-level summary (no client-sensitive specifics)
- Tech stack as inline tags
- Optional: key metric/achievement callout

*(See `lib/profile.ts` for full role content)*

---

### Satellite page — `/colophon` ("How Ask Titus works")
One satellite page, linked from the drawer ("How this works"), the footer, and the main nav (last item, "Ask Titus").
The production note for the copilot: same editorial system, ~68ch reading column. Its "How it's tested"
scorecard reads `content/eval-results.json` (written only by `npm run eval:writing`) and is hidden when that
file is missing. Never show a number a script didn't produce; never publish the system prompt verbatim.

---

### Copilot Bubble (Floating, All Pages)
An editorial "Ask Titus" FAB fixed to the bottom-right of every page (ink pill →
drawer that opens upward). Visual shell follows the README; backend is unchanged.

**Behaviour:**
- Click FAB → drawer opens upward (translateY/scale, ~220ms)
- Drawer has a close button; header reads "Ask **Titus**"
- Empty state shows 3 starter prompts
- Typing indicator (3 amber dots) while awaiting response, captioned with what is really happening: a plain waiting word (Thinking, Reasoning… changing every 3s) until the model's reasoning-summary headline arrives (bold title only, never the paragraph), then one line per tool step ("Searching my writing for …"). Steps fold into one line above the reply ("Searched my writing · read 3 articles"), opening to list them
- Session-only memory (useState, no persistence)
- Markdown rendered via `react-markdown`, restyled editorial (serif, amber `<a>`)
- Mobile responsive

**API Route:**
- `/app/api/chat/route.ts` — server-side proxy to OpenAI
- Reads `OPENAI_API_KEY` from environment (Vercel dashboard)
- Never expose key to browser

**OpenAI Integration:**
- Model: `gpt-6-luna`
- Tools (hand-written loop in `lib/copilot-loop.ts`, ≤4 rounds, no agent framework):
  `show_on_page` and `search_writing` (my Medium articles via Jev, cited as `[n]`).
  No web search. Corpus: `npm run articles:build` from `resources/medium-export.zip`.
- System prompt: see `prompts/copilot-system-prompt.md`
- Medium profile URL passed as context: https://medium.com/@tituslhy

**Voice:** First-person ("I built…", not "Titus built…"). Dry, precise, lightly
warm. No emoji, no exclamation points. Two short paragraphs max unless asked, except questions about a specific school, programme, project or role: those get the story behind the headline, two to four short paragraphs.

**Scope Rules (enforced via system prompt):**
- Answer ONLY questions about Titus's work, experience, projects, skills, writing
- If answer unknown: "I don't have that on file — feel free to write to me directly at tituslhy@gmail.com"
- Never fabricate experience or skills not in context
- Redirect off-topic questions politely back to my work
- Redirect salary/availability/personal questions to email

**Copilot system prompt file:** `prompts/copilot-system-prompt.md` (a template; its `{{TOKENS}}` are filled from `lib/profile.ts`). The fit brief lives beside it in `prompts/copilot-fit-prompt.md`.

---

## Content Rules
- **Tone:** Direct. Confident. Slightly warm. No corporate fluff. No buzzwords unless accurate.
- **No family details.** Ever.
- **No resume PDF hosted publicly.** All pages say: "Resume available on request" → mailto:tituslhy@gmail.com
- **No client-sensitive project specifics** in experience summaries.

---

## SEO & Meta
- Title: `Titus Lim | Lead AI Engineer` (from `SITE_TITLE` in `lib/profile.ts`, follows the top role)
- Description: `Lead AI Engineer with 8+ years building production AI systems. 65 technical articles. Open source contributor.` (`SITE_DESCRIPTION`, role and count derived)
- OG image: Warm cream editorial card with name + tagline (generate as static asset)
- Canonical URL: https://introducing-titus.vercel.app/

---
