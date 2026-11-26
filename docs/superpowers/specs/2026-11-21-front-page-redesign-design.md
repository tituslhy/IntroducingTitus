# Front page redesign (Part 1 of the site redesign): design

**Status:** approved by Titus (2026-11-21), implemented on `redesign` · **Branch:** `redesign` · **Date:** 2026-11-21
**Reference mock:** `design/front-page/front-page-mock.html` (open it in a browser; the animation is live)

## Intent and why

The site today is one long editorial scroll. Titus wants a site that makes a visitor go "ooh" and then
explore: a short front page that says who he is, shows what he builds with, and sends people to separate
pages for Experience, Projects, Writing, About and Ask Titus. The centrepiece is a moving composition of
the real tools he has used, which assemble, one real project or article at a time, into the system that
project used.

The redesign is split in two:

- **Part 1 (this doc):** the new front page, the new nav, and the move from one page to several routes.
  The inner pages keep their current content in Part 1, moved to their own routes.
- **Part 2 (later doc):** redesigning Experience (a ledger with "+" expanders), Projects, Writing
  (grouped by 8 themes) and About. Needs its own conversation first.

## Goals

- A front page a hiring manager reads in under a minute and wants to click further into.
- The hero animation as specified below: real logos, ink while drifting, colour once assembled, captions
  naming real projects and articles.
- Every number on the page comes from data. None is typed into a component.
- Every link lands cleanly: on its own page, or on a section's top edge just under the nav.
- Ask Titus is a first-class part of the site (nav item 05, and the closing door on the front page).

## Non-goals (Part 1)

- Redesigning the inner pages (Part 2).
- Dark mode.
- Changing the copilot's backend, models or retrieval.

## Anti-goals (these make it a failure even if it works)

- Revealing anything sensitive about work systems. Work tools appear only as tools, never tied to a named
  internal system. Titus's words: "it cannot be revealing sensitive information - like ... 'the SDK behind
  agent suite'". The framing for work beats is "I build agents at work with these".
- Showing a tool he hasn't actually used, or a project that is a learning repo (course repos, numbered
  tutorial repos). No tool comes from his GitHub README badge list alone.
- Cheeky or zingy copy. No "Pick one.", no "Four ways in".
- The animation slowing the page down: the name, tagline and photo must appear before any logo loads.
- Looking like a SaaS template.

## Constraints

- Stack unchanged: Next.js 14 App Router, Tailwind, Vercel. Existing palette, Newsreader + IBM Plex Mono.
- **Rules this lifts.** CLAUDE.md and AGENTS.md currently say "No brand/tech logos" and "Single long-scroll
  column with sticky anchor nav". Both are lifted by this redesign. Update both files (and requirements.md)
  to say: tech logos are allowed in the hero animation only; the site is a front page plus five routes.
  Rewrite the Navigation section of both files to the new nav (below). The quiet-motion rule was already
  removed (uncommitted on this branch).
- **Logo licensing.** Logos are shown nominatively, to say "I've used this tool". Keep a credits file
  (`public/logos/CREDITS.md`) listing each logo's source and licence: Simple Icons (CC0), Devicon (MIT),
  Lobe Icons (MIT), or the project's own brand asset. Add one line to the colophon: "Tool logos are
  trademarks of their owners, shown to indicate tools I've used." The LangChain4j logo is the project's
  own artwork, served as its own file, never inlined.
- Sensitivity, family and resume rules in CLAUDE.md stay as they are.
- Tests go through the unit-test-writer agent (CLAUDE.md routing rule).

## Approaches considered (for the hero animation)

1. **Port the mock's canvas code into a client component, with logos as static files** (chosen, my call).
   The mock already works and has been tuned beat by beat with Titus. One `<canvas>` draws 67 logos and the
   connecting lines cheaply.
2. Animate 67 DOM/SVG elements with CSS or a motion library. Easier to inspect, but heavy with 67 moving
   elements plus lines, and it means re-tuning everything already approved.
3. Pre-render a video or Lottie. Smallest code, but it loses the crisp ink-to-colour switch, can't keep
   logos out of the text and photo at every width, and every beat change needs a re-render.

## The design, top to bottom

Exact visual values (sizes, spacing, colours) are in the mock. Treat the mock as the source of truth for
the look and the copy below as the source of truth for wording.

### Nav (all pages)

`T·L` | `01 Experience` | `02 Projects` | `03 Writing` | `04 About` | `05 Ask Titus` + `Get in touch`

- Routes: `/experience`, `/projects`, `/writing`, `/about`, and `05` goes to `/colophon` (`COLOPHON_PATH`).
- The current page's item gets the amber underline (replaces scroll-spy). Keep hide-on-scroll-down,
  show-on-scroll-up.
- The nav is fully opaque, so nothing shows through it.
- Mobile: the existing horizontal-scroll list.

### Hero

- Eyebrow: `{CURRENT_ROLE.role} · {company} · Singapore`.
- Name: `Lim Hsien Yong (Titus)`, with "(Titus)" in amber italic.
- Tagline: "I build AI systems — *from architecture to the boardroom.*"
- Buttons: **View experience →** (solid ink, to `/experience`) and **Read the writing →** (outlined, to
  `/writing`). Then GitHub · LinkedIn · Medium as plain text links. Underneath, small: "Resume available
  on request" (mailto).
- Photo on the right: `/public/headshot.jpeg`, 3:4, 1px ink border, as now.
- Behind and around all of that: the animation (next section). The logo field fades out over the bottom
  ~14% of the hero, with no rule line under it.

### Hero animation

The reference implementation is `design/front-page/hero-animation-template.html` (the `SYSTEMS` beats,
layout, drawing and the blockchain sequence) and `design/front-page/build_logos.py` (how each logo's ink
and colour versions are made from `design/front-page/logo-src/`). Port its behaviour faithfully.

- **Logos.** 67 logos. Each has an ink version (single dark tone on the paper) and a colour version.
  While drifting at rest, all are ink. When a beat assembles, its tools turn to colour and connect.
- **Beats.** 45 beats, each lasting 5.4 s. A beat names a real project or article (caption) with a small
  line above it (source, e.g. "Medium · LLM Operations" or "3rd place, hackathon"). Its tools fly to a
  zig-zag chain, connect with amber lines, then release.
- **Special beats.** The blockchain beat draws five blocks (Genesis, Block 1 to 4) linked by amber arrows,
  each hash scrambling and then locking. Beats flagged `all` or `grid` use the alternative layouts in the
  template.
- **Bounds.** Logos never cover the eyebrow, name, tagline, buttons, resume line or photo. The keep-out
  boxes are measured from the real DOM at runtime, so this holds at every width. Logos stay inside the
  hero, clear of its edges, without big empty gaps.
- **Data.** Beats live in a data file (e.g. `content/hero-beats.ts`): `{ cap, sub, tools[], all?, grid?,
  chain? }`, plus the `EXTRA` resting-only logos. Logo files live in `public/logos/` (an ink and a colour
  file each, or one SVG with both).
- **Loading.** The hero text and photo render server-side. The animation starts after the logos have
  loaded, and never blocks the first paint.
- **Reduced motion** (my call): under `prefers-reduced-motion`, show the logos at rest in ink, with no drift
  and no beats.
- **Small screens** (my call, open to change): below 900px, the hero stacks (name, buttons, photo) and the
  animation runs in its own band below the photo, about 360px tall, with the same beats.

### Opening sentence

Large serif, numbers in amber:

> {Years in words} years putting AI into production. **{articles}** articles explaining how it works.
> **{repos}** public repos, and **{contributions}** contributions back to the open-source tools I build with.

Below it, a round button with a double down-chevron that bobs gently. It has no words. Clicking it scrolls
so the "On this site" label sits 16px under the nav. At a 1306×865 window, the top of the dark Ask Titus
band (with "05 Ask Titus →") must be visible after that scroll, so people can see there's more below.

### "On this site": four doors

A small amber label "On this site", then a 2×2 grid with hairline rules. Each door is a link to its page,
with a folio number, a heading with an arrow, an italic one-line deck, and a short preview:

- **01 Experience:** deck "{N in words} roles, from supply-chain forecasting to leading AI engineering."
  Preview: the latest three ROLES (start year, title and company, duration; the current one says "now"),
  then "+ {N−3} earlier roles · the ledger →".
- **02 Projects:** deck "What I've built: at work, in public, and for fun." Preview: the entries in
  `PROJECTS`, each with its key figure and where it lives (GitHub / work).
- **03 Writing:** deck "{articles} technical articles on Medium, grouped by theme." Preview: the 8 theme
  chips with counts, from `content/article-themes.json`.
- **04 About:** deck "Chemical engineer turned AI engineer." A two-sentence bio from `EDUCATION`, then
  "Featured by" and `FEATURED_BY`.

### 05 Ask Titus: the dark band

Full-width dark band, styled as the fifth door.

- Folio "05", heading **Ask Titus →** (links to `/colophon`), italic deck "Ask me anything *about my
  work.*", and the line "The assistant answers from this site and my articles, cites what it uses, and
  takes you to the right page."
- On the right: the first three `STARTER_PROMPTS` from the drawer (one shared list). Clicking one opens the
  drawer and sends it.
- **How it works** row, with "Read the full production note →" (to `/colophon`) on the right. Seven numbered
  steps on an amber line:
  1. **Guards:** Origin check, rate and size limits, before any model sees the question.
  2. **Plan:** GPT splits the question into topics and searches each one separately.
  3. **Filter:** One yes-or-no per article, judged on its title and summary. Most fall away.
  4. **Rank:** Survivors are scored 0–3. The best three go on.
  5. **Read:** Only the relevant sections come back, with the full outline.
  6. **Answer:** In my voice, citing the articles as [1], [2].
  7. **Check:** Only sources the server actually sent can become links.
- **What it won't do:** Invent a project, skill or article · Rate me against candidates it can't see ·
  Talk salary or availability · Remember you between visits.
- No eval numbers here (only the colophon shows them, and only from `content/eval-results.json`).

### Footer and floating button

- Footer as now: © Titus Lim · How Ask Titus works · GitHub · LinkedIn · Medium, and "Resume available on
  request" on the right.
- The floating "Ask Titus" button sits 44px above the bottom edge (plus the safe-area inset), with a faint
  light outline so it stays visible over the dark band.

## Where every number comes from

| On the page | Source |
|---|---|
| Years | `YEARS_EXPERIENCE` (lib/content.ts) |
| Articles | `ARTICLE_COUNT_NUMBER` |
| Public repos | new: `content/github-meta.json`, written by a script (`npm run github:meta`) from the public GitHub API, committed. Same pattern as `articles-meta.json`. |
| Open-source contributions | `OPEN_SOURCE.length` |
| Roles, earlier roles | `ROLES.length` |
| Theme counts | `content/article-themes.json` |

A test fails the build if any component hard-codes one of these.

## Routes and the copilot in Part 1

- `/` is the new front page. The current sections move, unchanged, to their routes: `/experience`
  (Experience, with education), `/projects` (projects and open source), `/writing` (writing),
  `/about` (About and the stack). Part 2 redesigns these pages.
- `PAGE_TARGETS` gains a `path` for each target. `show_on_page` navigates to that page and then scrolls to
  the anchor. This is how "Ask Titus answers about every page and takes you there" works.
- Sitemap and metadata cover the new routes.
- The `redesign` branch merges to `main` only when Titus approves it.

## Settled after the builder review (my calls unless marked)

- **Numbers in beat captions.** Site statistics in a caption (the first beat's "65 articles and 122 repos,
  all public") are filled in from data at render time: `ARTICLE_COUNT_NUMBER` and `github-meta.json`.
  Numbers that describe the thing itself ("54 containers", "part 4") are facts about that project or
  article, so they stay as written. The no-hard-coded-numbers test covers site statistics only.
- **Beat content ships as written.** Titus reviewed the 45 beats one by one in the mock, and that review is
  the sensitivity check (answered in conversation). The builder copies captions, sources and tool lists
  verbatim, apart from the templated statistics above.
- **Years.** Add a numeric `YEARS_EXPERIENCE_NUMBER = 8` in `lib/content.ts` and derive `YEARS_EXPERIENCE`
  ('8+ years') from it. The opening sentence says "Eight years", as in the mock Titus approved.
- **Starter prompts.** `STARTER_PROMPTS` moves to `lib/` so the drawer and the dark band share one list.
  How the band opens the drawer and sends a prompt (context or a custom event) is the builder's choice.
- **The copilot across pages.** The drawer lives in the root layout, so it stays open, and keeps the
  conversation, while the visitor moves between pages (it is still lost on reload or on closing the tab,
  as now). `show_on_page` does a client-side navigation to the target's `path`, then scrolls to the anchor
  once it is rendered. `lede` and `stack` map to `/about`; `dossier`, `role-*` and `education` to
  `/experience`; `projects`, `project-*` and `open-source` to `/projects`; `writing` to `/writing`. Update
  the system prompt's description of the tool and its tests to match.
- **Logo pipeline.** The generated logo files are committed to `public/logos/`. `build_logos.py` stays a
  developer tool under `design/front-page/`; Python is not part of the Next.js build. The builder adapts the
  script to write files instead of one JS object. Licences for `CREDITS.md` follow each logo's source kind
  in the script: `si` = Simple Icons (CC0), `dev` = Devicon (MIT), `lobe` = Lobe Icons (MIT); `own`, `png`,
  `png2`, `art` and `tile` are the projects' own brand assets.
- **The "band peeks after the chevron" check** is a manual acceptance check at 1306×865, done in a
  browser before merging. It doesn't need a new test dependency.

## What's left to the builder

- Component boundaries, file names, and how the canvas code is organised.
- The logo file format (separate ink/colour files or one SVG with both), as long as it renders as in the
  mock.
- How the keep-out boxes are re-measured on resize.
- The exact mobile layout values, within the stacking described above.

## Answered by Titus

1. **LinkedIn URL:** `https://www.linkedin.com/in/titus-lim-hsien-yong/` is current. Update `SOCIAL.linkedin`
   in `lib/profile.ts` and the expectations in `components/Hero.test.tsx` and `components/Footer.test.tsx`
   (CLAUDE.md, AGENTS.md and requirements.md are already updated).
2. **StockMCPService:** stays as a beat, as in the mock.
