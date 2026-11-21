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

## Issue Agent (GitHub Actions)
One Haiku 5.5 agent, opt-in and owner-only: label **your own** issue (`.github/workflows/issue-agent.yml`; ≤50 turns for bugs, ≤15 per feature run; 20-min agent step inside a 25-min job).
- `agent:bug` → triages, attempts the smallest fix (up to ~12 files) with regression tests, runs lint/test/build, re-reads its diff, opens a PR (`Fixes #N`; draft if not green). Too big → triage comment and stops. Behaviour: `.github/issue-agent/bug.md`.
- `agent:feature` → one question per run until you reply `approved` to its scope summary, then posts a **to-do comment** on the issue and labels it `agent:ready`. No repo changes. Implement locally with `implement issue #N` (needs `gh`: `brew install gh && gh auth login`). Behaviour: `.github/issue-agent/feature.md`.
- Status labels `agent:waiting-on-titus`, `agent:pr-open`, `agent:ready`; `agent:off` stops it on that issue. A merged/closed bug PR ends the bug track; re-add the label with a new comment to restart. If a run errors or hits its limit, it comments with the run link.
- Every outward action goes through validated scripts in `.github/issue-agent/` (`thread.sh` drops non-owner comments; `comment.sh`, `label.sh`, `push.sh`, `pr.sh` act only on this issue and its `agent/issue-N-*` branch). Runner permissions: `managed-settings.{bug,feature}.json`, installed as Claude Code managed policy (overrides `.claude/settings.json`). The scripts and policy shape the agent's normal path; they don't contain an agent that goes rogue while running tests it wrote, so **branch protection on `main` is required**. On the runner the agent writes its own regression tests (cost); locally the unit-test-writer rule above still applies. Tests: `__tests__/issue-agent-{workflow,scripts}.test.ts`.

One-time setup:
```bash
claude setup-token                      # copy the token, then:
gh secret set CLAUDE_CODE_OAUTH_TOKEN
for l in agent:bug agent:feature agent:waiting-on-titus agent:pr-open agent:ready agent:off; do gh label create "$l" --force; done
```
Plus Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests", and **branch protection on `main`** (Settings → Rules → require a PR before merging).

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
- **Layout:** A short front page plus six routes (`/experience`, `/education`, `/projects`, `/writing`,
  `/about`, `/colophon`), with a sticky nav. Desktop-first. Fully responsive.
  Front page design: `docs/superpowers/specs/2026-11-21-front-page-redesign-design.md`.
- **Headshot:** Profile photo in masthead. File: `/public/headshot.jpeg` —
  rectangular 3:4, 1px ink border, `object-position: 50% 30%`, subtle saturate/
  contrast filter. No circle crop, no amber ring/glow.
- **No stock photos. No illustrations. Tech logos only in the front-page hero animation**
  (files in `public/logos/`, credits in `public/logos/CREDITS.md`, never a tool I haven't used).
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

*(See requirements.md for full role content)*

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
- Tools (hand-written loop in `lib/copilot-loop.ts`, ≤4 rounds, no agent framework):
  `show_on_page` and `search_writing` (my Medium articles via Jev, cited as `[n]`).
  No web search. Corpus: `npm run articles:build` from `resources/medium-export.zip`.
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
- Title: `Titus Lim | Lead AI Engineer` (from `SITE_TITLE` in `lib/profile.ts`, follows the top role)
- Description: `Lead AI Engineer with 8+ years building production AI systems. 65 technical articles. Open source contributor.` (`SITE_DESCRIPTION`, role and count derived)
- OG image: Warm cream editorial card with name + tagline (generate as static asset)
- Canonical URL: https://introducing-titus.vercel.app/

---
