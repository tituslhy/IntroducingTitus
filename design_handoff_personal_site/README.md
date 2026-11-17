# Handoff — Personal Site Redesign (Editorial Direction)

A full redesign of **introducing-titus.vercel.app** in an editorial / broadsheet
direction — light & warm cream paper, oversized italic serif headlines, hairline
rules, a typographic timeline, and a real Claude-powered "Ask Titus" assistant.

---

## About the design files

The files in `source/` are **design references built as a single-file HTML +
React-via-Babel prototype**. They are not production code to copy directly.

The task is to **recreate this design inside the existing `tituslhy/IntroducingTitus`
Next.js 14 codebase**, using Tailwind, shadcn/ui where appropriate, and the
established component patterns in `components/`.

The prototype:
- Loads React 18 + Babel from a CDN and transpiles JSX in the browser
- Uses raw CSS (`styles.css`) with custom properties instead of Tailwind
- Hard-codes content in `source/data.jsx`
- Faked the Copilot call with `window.claude.complete` — the real site already
  has a working `/api/chat` route on top of OpenAI `gpt-4o-mini` that should
  continue to be used. The Copilot's **visual treatment** is what changes.

The build pipeline (Next.js 14, Tailwind, shadcn/ui, Vercel) does not change.

---

## Fidelity

**High-fidelity.** Colors, type, spacing, and motion in `source/styles.css`
are final. Recreate the look pixel-for-pixel using Tailwind utility classes +
arbitrary values where Tailwind tokens don't cover it. The design tokens below
should be added to `tailwind.config.ts` and `app/globals.css` so the rest of the
site can reference them by name.

---

## Visual direction (one-paragraph brief)

A warm-cream editorial broadsheet. Headlines in **Newsreader** (Google Fonts —
variable axes: optical size 6–72, italic 0/1, weight 300–700) carry the design.
Body and labels in **IBM Plex Mono** (kept from the previous site for engineer-y
continuity). One muted amber accent (`oklch(0.62 0.155 55)` ≈ `#b76a23`) for
emphasis. Hairline ink rules everywhere. Folio numbers as quiet structural
guides. No gradients, no shadows on type, no rounded "card" containers — the
look is composed from typography, rules, and grid.

---

## Design tokens

### Color palette (CSS custom properties; light/paper mode is default)

```css
:root {
  /* Paper & ink */
  --paper:       oklch(0.972 0.012 78);   /* main bg, warm cream */
  --paper-deep:  oklch(0.945 0.014 78);   /* section bands, hover */
  --paper-band:  oklch(0.928 0.018 78);   /* deeper band */
  --ink:         oklch(0.16 0.012 60);    /* primary text */
  --ink-soft:    oklch(0.42 0.012 60);    /* body / muted text */
  --ink-faint:   oklch(0.60 0.012 60);    /* captions / dates */
  --rule:        oklch(0.80 0.012 78);    /* hairline rules */
  --rule-strong: oklch(0.65 0.012 78);    /* stronger hairlines */

  /* Accents */
  --amber:       oklch(0.62 0.155 55);    /* signature accent — aged amber */
  --amber-soft:  oklch(0.92 0.05 75);     /* paper wash on hover */
  --amber-line:  oklch(0.78 0.10 65);     /* underline amber */
  --indigo:      oklch(0.34 0.10 254);    /* secondary accent (Illumina project) */
}
```

**Note:** The old `#F59E0B` amber is too bright on cream. Replace with the new
`--amber`. The Tailwind config's existing `amber.500: '#F59E0B'` should be
remapped (or augmented) to the new accent.

### Dark mode token override (optional toggle, off by default)

```css
body.theme-dark {
  --paper: oklch(0.18 0.012 60);
  --paper-deep: oklch(0.22 0.012 60);
  --paper-band: oklch(0.26 0.012 60);
  --ink: oklch(0.96 0.012 78);
  --ink-soft: oklch(0.72 0.012 78);
  --ink-faint: oklch(0.52 0.012 78);
  --rule: oklch(0.32 0.012 60);
  --rule-strong: oklch(0.45 0.012 60);
  --amber-soft: oklch(0.35 0.10 65);
}
```

The prototype shipped a tweaks panel with a paper/dark toggle. **In production,
default to paper (light) mode.** A dark toggle is optional and not currently in
the requirements doc — only add it if Titus asks.

### Typography

```ts
// tailwind.config.ts — fontFamily.extend
fontFamily: {
  serif: ['"Newsreader"', '"Source Serif Pro"', 'Georgia', 'serif'],
  mono:  ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
},
```

Google Fonts URL (replace existing `<link>` in `app/layout.tsx`):

```
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

**Drop DM Serif Display** — the new design uses Newsreader for headlines.

### Type scale

| Role | Family | Style | Size | Line-height | Letter-spacing | Notes |
|---|---|---|---|---|---|---|
| Hero name | Newsreader | Roman, 500 | `clamp(60px, 10.5vw, 184px)` | 0.88 | -0.035em | Three lines: "Lim" / "Hsien Yong" / "(Titus)" italic |
| Section title | Newsreader | Roman, 500 (with italic accent words) | `clamp(34px, 5vw, 68px)` | 1.04 | -0.025em | Italic words colored `--amber` |
| Project title | Newsreader | Roman, 500 | `clamp(34px, 4.4vw, 56px)` | 1.02 | -0.025em | |
| Project number figure | Newsreader | Italic, 500 | `clamp(80px, 12vw, 144px)` | 0.9 | -0.04em | The big "54" / "16" / "6" |
| Role company | Newsreader | Roman, 500 | `clamp(24px, 2.6vw, 32px)` | 1.1 | -0.015em | |
| Role year (sticky rail) | Newsreader | Italic, 400 | 44px | 1 | -0.02em | |
| Lede body | Newsreader | Roman, 400 | 19px | 1.62 | 0 | First paragraph has drop-cap |
| Drop cap | Newsreader | Italic, 500 | `clamp(56px, 7.4vw, 92px)` | 0.82 | 0 | Color `--amber`, floats left |
| Pull quote | Newsreader | Italic, 400 | 18px | 1.4 | 0 | |
| Tagline | Newsreader | Roman, 400 | `clamp(26px, 3.2vw, 38px)` | 1.18 | -0.012em | Final phrase after em-dash in `--amber` italic |
| Body | Newsreader | Roman, 400 | 16-17px | 1.55-1.6 | 0 | |
| Mono labels | IBM Plex Mono | 400-500 | 10.5-12px | 1.4 | 0.06-0.18em (UPPERCASE) | Folios, kickers, tags, dates |
| Footer mark | Newsreader | Roman, 500 | 28px | 1 | -0.015em | "Titus Lim" |

**Important font-feature settings on body:** `"kern", "liga", "calt", "onum", "ss01"` — old-style numerals (`onum`) make folios and dates feel editorial. Apply on `<body>`.

### Spacing & rhythm

- Container max width: **1280px**, `mx-auto`, gutter `clamp(18px, 4vw, 56px)`
- Section vertical padding: `clamp(56px, 8vw, 110px)`
- Inter-section divider: 1px solid `--rule` (NOT a thick black bar)
- Masthead bottom rule is the only thick (1px solid `--ink`) inter-section rule
- Grid: editorial 12-col equivalent; specific sections use `5fr/7fr` (masthead),
  `7fr/5fr` (lede), `4fr/8fr` alternating (projects)

### Hairlines

All `border` and `background-color` rule lines are **1px solid `--rule`** by
default. Stronger rules (e.g. above section markers, top of dossier, around
masthead bar) are **1px solid `--ink`**. There are no thick bars > 1px anywhere
on the page.

---

## Section-by-section spec

The single long-scroll page has six anchored sections plus a slim footer:

1. **Masthead** (`#masthead`) — hero with portrait + name + tagline + CTAs
2. **About** (`#lede`) — drop-cap intro paragraph + "What drives me" sidebar
3. **Stack** (`#stack`) — bordered grid of tech categories (6 groups)
4. **Experience** (`#dossier`) — sticky-rail timeline of 7 roles + education
5. **Projects** (`#projects`) — 3 alternating feature spreads + OSS list
6. **Writing** (`#writing`) — leader-dotted list of 6 articles
7. **Footer** (`#colophon`) — slim footer with mark, social row, resume line

Sticky top nav with brand + 5 anchor items + "Get in touch" CTA. Scroll-spy
underlines the active item in `--amber`. Hides on scroll-down, reappears on
scroll-up.

### 1. Masthead (`#masthead`)

**Layout (≥880px):** 12-col grid as `5fr / 7fr`. Top status bar above; bottom
ends naturally (no contents strip).

**Top status bar:** Mono uppercase 11px. Left: animated amber pulse-dot (6px,
`box-shadow` pulse 2.4s) + "Singapore · Lead AI Engineer, Mastercard
Asia/Pacific". Right: "2026". 1px hairline rule below.

**Left column (portrait + kickers):**
- Portrait: `aspect-ratio: 3/4`, 1px ink border, `object-fit: cover`,
  `object-position: 50% 30%`, `filter: saturate(0.85) contrast(1.04)`,
  hover `transform: scale(1.02)` over 800ms. Source: `/public/headshot.jpeg`.
- Below portrait: 3 kicker rows separated by 1px `--rule`. Each row is
  `100px auto` grid: mono amber label (kicker) + serif text. Content:
  - "Eight years" — "of production AI, shipped solo and in teams"
  - "Fifty" — "technical articles, featured by IBM, LlamaIndex, Unsloth"
  - "Currently" — "Lead AI Engineer at Mastercard Asia/Pacific"

**Right column (headline + CTAs):**
- Eyebrow: 36px amber rule + "GenAI Engineer & Architect" in mono uppercase
- Name display:
  - `<span>Lim</span>` on line 1
  - `<span>Hsien Yong</span>` on line 2 with `padding-left: 0.6em` (only ≥1100px;
    indent collapses on narrower screens to prevent clipping)
  - `<span>(Titus)</span>` italic, smaller (0.78em), color `--ink-soft`, with
    "Titus" specifically in `--amber`
- 1px rule below name
- Tagline with drop-cap "I", final phrase after `—` italic in `--amber`
- Subhead: muted ink-soft paragraph
- CTA row: black-fill "View experience" → primary, "Read writing" outline
  secondary, `/` separator (italic serif), "Resume on request" quiet underline
- Social row: github / linkedin / medium / coffee / email — each is mono lowercase
  text with a small 15px stroke icon. Dot separators between. Hover lifts -1px
  and tints amber.

**No watermarks on portrait. No publication conceits.** The status bar is the
only top metadata.

### 2. About / Lede (`#lede`)

**Layout:** `7fr / 5fr` two-column grid.

**Left (body):**
- Section marker: `01  ·  About` mono row + 1px `--rule` + section title
  ("A note on the *work* I take on." with "work" italic amber)
- Opening paragraph 19px Newsreader with **drop-cap "A"** (92px italic amber,
  floats left, padding `8px 14px 0 0`). Bold-italic emphasis on the phrase
  "the interesting problems are rarely the model".
- Second paragraph follows.

**Right (sidebar — "What drives me"):**
- 1px ink top border
- Mono small-caps label "What drives me"
- Numbered list with Roman numerals (`i.`, `ii.`, `iii.`, `iv.`) in italic amber.
  Each row separated by 1px `--rule`. Each has a short bold title and 2-line body.

### 3. Stack (`#stack`)

**Background:** full-bleed `--paper-deep` band (lighter than main paper).

**Layout:** `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))` with
1px hairlines on top + left of grid container, 1px right + bottom on each cell.

**Standfirst:** italic serif 22px above the grid — "Tools, not religions. Picked
because they fit the job, replaced when they don't."

**Per cell:**
- 22-28px padding
- Header row: mono amber 2-digit number ("01", "02", …) + serif group title
- Item list: mono 12.5px, one per line, 6px gap

Groups (6, from `data.jsx`):
1. AI / GenAI Frameworks — LangChain, LangGraph, LlamaIndex, CrewAI, Autogen, DSPy, MCP, A2A
2. Languages — Python ◆ Expert, SQL ◆ Expert, Java ◆ Proficient
3. Infrastructure — Docker, Kubernetes / Helm, GitHub Actions, Jenkins, vLLM
4. Databases — PostgreSQL, Oracle DB, Redis, MongoDB, Qdrant, Neo4j
5. Observability — Grafana, Prometheus, Loki, Langfuse, Arize Phoenix, ELK
6. Cloud — AWS, GCP, Azure, Snowflake

**Do NOT add brand logos.** Stay typographic — the engineer-y monolist is the
point.

### 4. Experience (`#dossier`)

**Layout:** Roles list with each role as `110px / 1fr` two-column grid. Top
border 1px `--ink`. Each role separated by 1px `--rule`.

**Sticky left rail (per role):**
- `position: sticky; top: 80px` — year stays visible while text scrolls
- Year in italic Newsreader 44px (e.g. "2026", "2025", "2023", "2022", "2018",
  "2017", "2015")
- Below: 32px × 1px amber line

**Right body:**
- Head row: company name (large serif) — left; dates in mono — right
- Optional "Incoming" pill (only Mastercard) — amber-bordered mono uppercase,
  next to company name
- Sub-row: mono `role · location`
- Deck: 19px serif (the headline summary)
- Body: 16px ink-soft (additional detail)
- Optional pull quote (Illumina, Toyota Tsusho): inset `--paper-deep` block with
  3px amber left border, italic serif 18px
- Tech tags: inline mono 11.5px list separated by amber dots (using a `::before`
  pseudo with `·`)

**Crown jewel role (Illumina):** No special tag, no special background. The
$9M pull quote and the longer body do the heavy lifting.

**Education subsection (`03a  Education`):**
- Two-column grid of edu cards
- Each card: 22px padding, 1px `--rule` border, dates in mono, institution in
  serif, degree italic, honors as mono pill-tags

Data: SMU MITB AI Track 2021-2022; NUS BEng ChemE 2011-2015. Honors as listed
in `requirements.md`.

### 5. Projects (`#projects`)

**Layout:** Each project alternates 4fr/8fr (figure on left for odd) and 8fr/4fr
(figure on right for even, via `project-flipped` class).

**Project figure (the "big number" panel):**
- 4:5 aspect ratio
- 1px `--rule` border
- Striped overlay: `repeating-linear-gradient(135deg, transparent 0 22px, color-mix(in oklch, var(--ink) 5%, transparent) 22px 23px)` at 40% opacity
- Centered content: mono label (uppercase), giant italic number, 36px rule,
  secondary mono label, secondary italic value
- Color: amber for projects 1 & 3, indigo (`--indigo`) for Illumina RAG (project 2)

**Project text:**
- Eyebrow: `01` amber + 24px amber rule
- Title: serif 56px
- Sub: italic serif 21px ink-soft (the one-line description)
- Body: 16.5px ink (the longer description)
- Tags: mono 11px in 1px `--rule` bordered chips, hover tint amber/indigo per project
- CTA row: "View source ↗" / "Watch demo ↗" — mono uppercase with 1px ink
  underline, hover amber/indigo + arrow translates up-right

Projects in order (data hard-coded in `data.jsx`):
1. **fictional-bassoon** (amber) — figure: "54 containers" / "90% test coverage"
2. **Illumina Agentic RAG** (indigo) — figure: "16 components" / "$9M anticipated savings"
3. **TheMarginCall** (amber) — figure: "6 agents" / "II modes"

**Open-source subsection (`04a  Open-source contributions`):**
- 6-row table (140px / auto / 1fr / auto grid per row): project label (mono
  amber uppercase) — link text (serif) — leader dots — "↗"
- Each row 1px `--rule` bottom border
- Row hover: `--amber-soft` wash background

### 6. Writing (`#writing`)

**Background:** full-bleed `--paper-deep` band.

**Standfirst:** italic 19px — "Featured by *Singapore Management University*,
*Unsloth*, *LlamaIndex*, *IBM*, *FlowerAI*. The full archive lives on Medium."

**Writing list:** 6 rows, each is a 4-column grid:
- 60px italic amber numeral ("01", "02", …)
- Title (serif 22px) + sub-line (mono small: "MITB for All · 11 min")
- Leader dots (1px dotted `--rule-strong`) filling the gap
- "Read ↗" mono uppercase

Hover: `--amber-soft` wash, "Read ↗" tints amber.

**Bottom CTA:** "The full archive on Medium →" — 1px ink-bordered mono uppercase
button, hover inverts.

Articles in `data.jsx` (same 6 as `requirements.md`).

### 7. Footer (`#colophon`)

**Top:** 1px `--ink` rule.

**3-column grid (collapses to single column < 880px):**
- Brand: serif "Titus Lim" 28px + mono small uppercase "GenAI Engineer & Architect"
- Social: github / linkedin / medium / coffee / email row with icons (same as masthead)
- Resume line: italic "Resume on request" + amber-bordered email link

**Meta row** below: mono 10.5px ink-faint, centered — "© 2026 Lim Hsien Yong
(Titus) · Singapore".

---

## Navigation

Sticky top nav, `position: sticky; top: 0`, 56px tall.

- Background: `color-mix(in oklch, var(--paper) 88%, transparent)` + 10px backdrop blur
- Bottom border: 1px `--rule`
- 3-column grid: brand (left) — anchor list (centered ≥1080px, left-aligned below) — CTA (right)
- Brand: "T·L" italic serif 22px with amber dot separator + mono uppercase small
  caps "Titus Lim · Personal site". Clickable → scroll to top.
- Anchor list: 5 items as buttons. Each shows a mono 10px folio number + label
  (e.g. "01 About"). Active item has a 2px amber underline at the bottom of the
  button (12px inset).
- "Get In Touch" CTA: 1px ink border, mono uppercase 11.5px, 7×14 padding,
  amber pulse-dot to the left. `white-space: nowrap`. Hover inverts to ink fill.
- Scroll behavior: hides (`translateY(-110%)`) on scroll-down, reveals on
  scroll-up; always visible in top 80px of page.
- Scroll-spy via `IntersectionObserver` with `rootMargin: "-40% 0px -55% 0px"`.

---

## Interactions & behavior

### Scroll reveals

Each section starts at `opacity: 0.001; transform: translateY(10px);` and
transitions to `opacity: 1; transform: none` over 600ms when an `IntersectionObserver`
adds the `.revealed` class. Threshold: 0.12.

The masthead is always visible (no reveal).

`@media (prefers-reduced-motion: reduce)` disables this.

### Sticky year rail (Experience)

Each role's year is `position: sticky; top: 80px` so it pins while the role
body scrolls. On mobile (<720px) the rail switches to inline horizontal layout
at the top of each role.

### Animated amber dot

The pulse-dot in the nav CTA and masthead status bar is a 6px amber dot with a
`box-shadow` outer halo that pulses between `3px @ 22%` and `6px @ 8%` over
2.4s. Disabled under `prefers-reduced-motion`.

### Coffee cup steam

Two `<path>` strokes inside the coffee SVG animate `translateY(-1px)` and opacity
between 0.6 and 1 on a 1.8s loop, staggered by 0.6s.

### Hover states

- Social icons: `translateY(-1px)` + amber tint
- Project tags: 1px border tints to project accent
- Writing rows: `--amber-soft` wash
- OSS rows: `--amber-soft` wash
- Stack cells: `--paper-deep` fill
- CTA primary: amber fill replaces ink fill
- CTA secondary: ink fill inverts to paper text

### Copilot

Floating FAB at bottom-right (`fixed`, `z-index: 60`). Closed: black pill with
mono "ASK TITUS" label and chat-bubble line icon. Open: drawer (420×640px,
responsive to viewport) opens upward with a `translateY/scale` transform over 220ms.

**Server-side architecture is unchanged.** Continue using `/app/api/chat/route.ts`
with OpenAI `gpt-4o-mini`. **Only the UI shell changes.**

Drawer composition:
- Header: `--paper-deep` band with 1px ink bottom border
  - Mono row: "Personal assistant · Powered by Claude" (or "Powered by GPT-4o"
    if keeping OpenAI — adjust label as appropriate)
  - Serif row: "Ask **Titus**" with "Titus" italic amber
  - Sub: italic serif 13px — "A small assistant trained on this page. It answers about my work."
  - Close button top-right
- 1px amber rule below header
- Scroll area: messages list
  - Empty state: mono small-caps "Start with one of these" + 4 starter buttons
    (serif 14.5px, italic amber `→` mark, dotted `--rule` separators).
    Starters:
      - "What did you build at Illumina?"
      - "Tell me about fictional-bassoon"
      - "Which of your articles should I read first?"
      - "What's your take on multi-agent frameworks?"
  - Message labels: mono small-caps "You" / "Titus" above each
  - User messages: `--paper-deep` block with 2px ink left border, italic
  - Assistant messages: serif body 15.5px, plain
  - Typing indicator: 3 amber dots, 1.1s loop
- Form: `--paper-deep` band
  - Italic-placeholder textarea (1px `--rule` border, amber focus)
  - "Send →" mono uppercase button (ink fill, amber on hover)
- Foot: mono 10px right-aligned — "Trained on this page · won't answer off-topic"

**Markdown:** The OpenAI route currently streams markdown which the existing
`CopilotBubble.tsx` renders via `react-markdown`. Keep that rendering pipeline;
restyle the markdown elements per the editorial system (serif, no rounded corners,
amber underlines on `<a>`).

**System prompt:** The visual redesign does NOT replace the existing
`copilot-system-prompt.md`. Keep the existing one — only update the assistant's
**voice** if Titus wants: shift to first-person "I" instead of third-person "Titus did X",
keep dry/precise/lightly-warm tone, no emoji, no exclamation points, two short
paragraphs max.

---

## State management

The prototype uses local React state. In Next.js:
- All sections are server components except where interactivity is needed
- `'use client'` boundaries: `Nav` (scroll-spy + scroll-hide), `Hero` (only if
  scroll-driven), each section that uses `useReveal` (the IntersectionObserver
  hook), `Experience` roles (for the sticky year sentinel — optional, sticky is
  pure CSS so this can stay server), `CopilotBubble`
- Reveal hook is local — no global state
- No data fetching beyond the existing `/api/chat` for Copilot

---

## Assets

- **Headshot:** `source/assets/headshot.jpeg` (same image as
  `IntroducingTitus/public/headshot.jpeg`, no change). Place at
  `/public/headshot.jpeg` as today.
- **Icons:** All inline SVG components — see `source/icons.jsx`. Five icons:
  `IconGithub`, `IconLinkedin`, `IconMedium`, `IconCoffee`, `IconMail`. Each is
  15×15, `fill="currentColor"` (or stroke for coffee/mail line icons). The
  coffee icon includes two animated steam paths.
- **No raster or external assets** beyond the headshot. No tech-stack logos. No
  company logos. The design is intentionally typographic.

---

## Translation map — prototype → existing Next.js components

| Prototype file | Maps to (in `IntroducingTitus`) | Action |
|---|---|---|
| `source/personal-site.html` | `app/page.tsx` + `app/layout.tsx` | Update layout fonts; page renders the new sections |
| `source/styles.css` | `app/globals.css` + Tailwind arbitrary classes | Lift CSS custom properties; apply via `bg-[var(--paper)]` etc. or extend `tailwind.config.ts` |
| `source/data.jsx` | New `lib/content.ts` (or inline) | Lift typed constants for roles, projects, articles, stack groups, passions |
| `source/nav.jsx` | `components/Navigation.tsx` | Full rewrite — scroll-spy, scroll-hide, folio labels |
| `source/masthead.jsx` | `components/Hero.tsx` | Full rewrite — new portrait/kicker/headline composition |
| `source/sections.jsx` → Lede | New `components/About.tsx` (or in `Hero.tsx`) | New section between Hero and Experience |
| `source/sections.jsx` → Stack | New `components/Stack.tsx` | Replaces old `components/TechStack.tsx` |
| `source/sections.jsx` → Passions | New `components/Passions.tsx` (or part of About sidebar) | Update existing `components/Passions.tsx` — new card design (numbered Roman list) |
| `source/sections.jsx` → Dossier | `components/Experience.tsx` | Full rewrite — sticky year rail, pull quotes, inline tech tags |
| `source/sections.jsx` → Projects | `components/ProjectsWriting.tsx` (split) | Full rewrite as feature spreads with alternating sides + big-number figures |
| `source/sections.jsx` → Writing | `components/ProjectsWriting.tsx` (split) | Full rewrite as leader-dotted list |
| `source/sections.jsx` → Colophon | New `components/Footer.tsx` | Replace the implicit footer in `app/layout.tsx` |
| `source/copilot.jsx` | `components/CopilotBubble.tsx` | Restyle the shell only — keep `/api/chat` integration |
| `source/icons.jsx` | `components/icons/*.tsx` (or inline) | Lift each as a typed React component |
| `source/app.jsx` | `app/page.tsx` | The new page composition; drop the Tweaks panel (it's a prototype-only thing) |
| `source/tweaks-panel.jsx` | — | **Skip.** Prototype-only. |

---

## What changes in the existing repo

1. **`app/layout.tsx`** — Replace the Google Fonts `<link>` with the new
   Newsreader + IBM Plex Mono URL (drop DM Serif Display). Update `<body>`
   font-family fallback.
2. **`app/globals.css`** — Replace the existing `:root` block with the new
   palette tokens. Remove the dark-mode-by-default styling. Add the optional
   `body.theme-dark` override only if a toggle is wanted.
3. **`tailwind.config.ts`** — Update `fontFamily` to Newsreader/Plex Mono.
   Remove the `amber` color object (or remap `amber.500` to the new accent).
   Add color tokens for `paper`, `ink`, `rule` if you want Tailwind-style
   utilities like `bg-paper`, `text-ink-soft`, etc.
4. **All 8 components in `components/`** — Rewrite per the section specs above.
   Use Tailwind utilities with arbitrary values for non-token sizes
   (`text-[clamp(34px,5vw,68px)]`, `border-[var(--rule)]`, etc.).
5. **Update `requirements.md`** — change "Dark mode only. No toggle." to
   "Light (warm cream) by default. Optional dark toggle." Update the
   "Aesthetic" section to "Editorial broadsheet — typography-forward, hairline
   rules, single muted amber accent." Update font pairing.
6. **Keep `app/api/chat/route.ts` as is.** No backend changes.
7. **Keep test files in `*.test.tsx`** — but expect every component test to
   need updating because the DOM structure has changed. Recommend a pass with
   the `unit-test-writer` subagent after the redesign is in.

---

## Suggested implementation order

1. Tokens first — fonts, palette, globals
2. Footer + Nav (small, self-contained — get the chrome right early)
3. Hero / Masthead (biggest visual lift)
4. About / Lede + Stack + Passions (typographic body sections)
5. Experience (sticky rail is the trickiest layout)
6. Projects (big figures + alternating layout)
7. Writing (mostly type)
8. CopilotBubble restyle (last — keep streaming behavior, just restyle)
9. Tests
10. CodeRabbit + Sonar pass

---

## Files in this bundle

| Path | Purpose |
|---|---|
| `README.md` | This file |
| `source/personal-site.html` | The composed prototype — open in a browser to see the design |
| `source/styles.css` | All CSS for the prototype (CSS custom properties + raw selectors) |
| `source/app.jsx` | React bootstrap + tweaks panel (prototype-only) |
| `source/data.jsx` | All content as JS constants — lift this into `lib/content.ts` |
| `source/nav.jsx` | Sticky top nav |
| `source/masthead.jsx` | Hero/masthead composition |
| `source/sections.jsx` | Lede, Stack, Dossier, Projects, Writing, Footer (Colophon) |
| `source/copilot.jsx` | Ask-Titus drawer shell |
| `source/icons.jsx` | 5 inline social SVG icons |
| `source/tweaks-panel.jsx` | Prototype tweaks shell — **skip in production** |
| `source/assets/headshot.jpeg` | Headshot image (same as existing `public/headshot.jpeg`) |

---

## Suggested Claude Code prompt to kick off

```
Read design_handoff_personal_site/README.md end-to-end, then read every file
in source/. The HTML/CSS/JSX is a design reference — your task is to recreate
this design in the existing Next.js 14 + Tailwind + shadcn/ui codebase,
following the Translation Map and Suggested Implementation Order in the README.

Start with tokens (fonts, palette, globals.css, tailwind.config.ts). Show me
the diff before moving to components. Do not touch app/api/chat/route.ts.
```
