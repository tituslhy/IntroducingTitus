# Drawer plan: "How Ask Titus works", a colophon page for the bot

**Status:** planned, not started · **Owner:** Titus (building locally)
**Depends on:** nothing to start. Sections marked *(after writing route)* fill
in once [`search-my-writing.md`](./search-my-writing.md) ships.

---

## Why

For most visitors the bot is a nice touch. For the audience I most want to
impress (technical leads, GenAI hiring managers), *how* it's built is the
portfolio piece: a small, honest, well-guarded agent instead of a prompt in a
trench coat. Right now none of that is visible. This page makes it visible
in one screen and a half, without turning the site into a blog.

In newspapers, the **colophon** is the note on how the paper was made. It's the
right name and the right tone: a short, confident production note, not a
tutorial.

## Where it lives

- **Route:** `/colophon`, a single editorial page. Title: *How **Ask Titus**
  works*. (Alternative: `/bot`. The colophon name fits the broadsheet.)
- **This deviates from "single long-scroll page"** in `CLAUDE.md` /
  `requirements.md`. Record the decision there when building: *one
  satellite page, linked from the drawer and footer, not in the main nav.*
- **Entry points:**
  - Drawer header: a quiet mono link under the "Grounded in my public work…"
    line: `How this works ↗`.
  - Footer colophon block: `How the assistant works →`.
  - The bot itself: a short "About me, the bot" paragraph in
    `copilot-system-prompt.md`, so "how do you work?" gets a two-sentence
    answer and the link.
- Not in the top nav: the main page stays about me, not the bot.
- Add to `app/sitemap.ts`; metadata title `How Ask Titus works | Titus Lim`.

## Page outline

Same system as the home page: Newsreader + IBM Plex Mono, cream paper,
hairline rules, numbered folios, amber as the only accent (indigo stays
reserved for Illumina). Narrow reading column (~68ch). Drop cap on the lede.

**Masthead.** Kicker `COLOPHON`, h1 *How **Ask Titus** works*, dek: *A small
agent, built the way I'd build one for production: grounded in one source of
truth, routed by a fast decision model, and fenced in by guardrails.*

**01 · The short version.** Two or three sentences with a drop cap. It speaks
as me, in first person, from the same data that renders this page. It reads
my articles instead of guessing. It shows you where things are instead of
just telling you. It says "not on file" rather than making things up.

**02 · Anatomy of a reply.** The centrepiece: an inline SVG diagram in
hairline style. One horizontal request path in amber; it stacks vertically on
mobile.

```
visitor ─▶ guards ─▶ Jev (System One) ─▶ GPT (System Two) ─▶ checks ─▶ drawer
           origin     which articles?      answers in my voice   valid anchors   text · footnotes
           rate limit  p ≥ threshold       + show_on_page        valid sources   · page moves
```

Under it, a numbered walkthrough of one real question ("What have you written
about guardrails?"): what each stage decided, in one line each. Optionally
include real timings from a logged request.

**03 · One source of truth.** `lib/profile.ts` → renders the page *and* the
prompt. Explain the drift test ("CI fails if the bot and the page ever
disagree"). This is the most "senior engineer" idea on the page; give it room.

**04 · Guardrails.** A two-column hairline table: *guardrail* | *what it
prevents*.

| Guardrail | Prevents |
|---|---|
| Page anchors validated server-side | the bot pointing at things that don't exist |
| Article routing: known slugs, probability threshold, max 2 | irrelevant or invented sources |
| "Not on file" instead of reframing | overselling in recruiter mode |
| Job descriptions wrapped as data, not stored upstream | prompt injection; retaining confidential postings |
| Fit briefs re-validated after the model | a "strong" claim with no evidence |
| Origin check, rate limits, output caps, timeouts | abuse and runaway cost |
| Scope + redirect rules | the bot discussing salary, family, or my weaknesses |

Say *that* it's rate-limited; don't publish the exact numbers.

**05 · Recruiter mode.** One paragraph plus a small static example of a fit
brief (a made-up role, clearly labelled as an example) with a button that
opens the drawer straight into recruiter mode.

**06 · How it's tested** *(after writing route).* A small scorecard read from
`content/eval-results.json` (committed by the golden-set script): routing hit
rate, abstain accuracy, no-invention rate, number of questions, date of last
run. If the file is missing, hide the section; never show a stale or fake
number. Plus one line on the unit/drift tests.

**07 · What it won't do.** A short list. No salary, availability, or family
talk. No speculating about my weaknesses. No inventing projects or articles.
No memory between visits: chat lives in the tab and isn't saved.

**08 · Stack.** One mono line: Next.js · OpenAI Responses API (GPT) · Jev
(TypeSafe AI) via Vercel AI Gateway · Vercel. Link the source on GitHub
**only if the repo is public**.

## Stretch: "Show your work" in the drawer

The live version of this page. A small toggle in the drawer footer reveals,
under each reply, the decisions behind it, all from events already streamed:

```
ROUTED   Your agent needs a bouncer · p 0.91   (Jev)
SHOWN    Illumina, 2023                        (show_on_page)
```

Needs `p` added to `source` events. A hiring manager poking the bot sees the
architecture *working*, not just described. Off by default; remembered per
visitor in `localStorage` (a convenience, so wrapped in try/catch).

## Don'ts

- Don't publish the full system prompt verbatim. Describe its parts; the
  exact wording is what an injection attempt would want.
- Don't publish visitor questions or logs, even anonymised.
- Don't show numbers that aren't produced by a script.
- Don't let it grow into a blog post. If a section needs more than ~120
  words, it belongs in a Medium article (and *that* can be linked here).

## Checklist

- [ ] Decide route name (`/colophon` vs `/bot`); record the single-page deviation in `CLAUDE.md` + `requirements.md`
- [ ] `app/colophon/page.tsx` + metadata + sitemap entry
- [ ] Sections 01–05, 07, 08
- [ ] Inline SVG anatomy diagram (desktop row, mobile column; theme tokens only)
- [ ] Entry points: drawer header link, footer link, "About me, the bot" prompt paragraph
- [ ] Section 06 from `content/eval-results.json` *(after writing route)*
- [ ] Stretch: "Show your work" toggle + `p` on source events
- [ ] Tests: page renders; scorecard hidden when results missing; links present
- [ ] Check at 390px width: diagram stacks, no horizontal scroll
