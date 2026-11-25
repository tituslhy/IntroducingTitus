# Show me around: a site tour by Ask Titus

Date: 2026-11-25. Status: draft for Titus's approval.

## Why

A hiring manager lands on the front page and their first question is "where do I start?". Today the page answers
with "View experience" and "Read the writing"; most scroll past the headshot, see the four numbers and leave.

The answer should be Ask Titus, and it should answer by **taking them around the site while it talks**: opening
pages, picking up passes, playing a projector. Ask Titus becomes the star of the show. The reaction we want: "even
his website is agentic", in Ask Titus's own words, "the whole website is a tool I can use".

## Goals

- "Show me around" is the front page's main button, on every screen size.
- One tap plays a narrated tour of the whole site, in the site's own order, in 90 to 120 seconds.
- The tour is a **real run of Ask Titus, recorded**: it starts instantly, costs nothing per visit, never fails on
  the front page's main button, and every word has been checked by Titus.
- It ends by handing over to the live Ask Titus: "That was a recorded run. Now ask me anything and watch me drive."
- On phones the page stays visible while it moves: the drawer shrinks and the narration runs as a caption over the page.

## Non-goals

- No live, per-visitor tour (Titus's call: if the OpenAI credits run out, the main button must not break).
- No new pages or sections; no change to recruiter mode's answers.
- Education stays one line in the tour (see the route).

## Anti-goals (a failure even if it works)

- **The site never starts itself.** Nothing moves until the visitor taps "Show me around".
- **Never passed off as live.** The tour is labelled a recorded run; the live agent is offered at the end.
- **Never fights the visitor.** If they scroll, tap the page or press a key mid-tour, it pauses; it doesn't yank
  the page back.
- **Never says what the record doesn't.** The recording goes through the same system prompt and Honesty rules as
  any answer.
- Never over two minutes.

## Approaches considered

1. **Live tour per visitor:** Ask Titus writes the steps and narration on the spot. Truly agentic and adaptable,
   but a few seconds' wait, a cost per tour, a chance of fumbling, and a broken main button if the API is down.
2. **Recorded from a real run** (picked by Titus): Ask Titus gives the tour once, Titus reviews it, the site replays
   it. Instant, free and safe; can't adapt, and needs re-recording when the site changes (a test catches that).
3. An earlier idea, an auto-playing demo on load, was rejected: "where do I start" beats "the website starts itself".

## Design

### The route (the site's own order)

About 100 seconds; each step's timing comes from its narration's length (see the player).

| # | Where | What happens on screen | What Ask Titus says (gist; the recording writes the words) |
|---|---|---|---|
| 1 | Front page, drawer open | Drawer opens | "Hi, I'm Titus, welcome to my site. This site has an agent: me. The whole website is a tool I can use, so let me show you around." |
| 2 | Front page, drawer open | Rings the Ask Titus button, then the job-description mode | "Ask me anything, any time. Paste a job description and I'll tell you honestly how I fit." |
| 3 | Experience | Picks up the Mastercard pass; its role opens | The headline: Lead AI Engineer at Mastercard, in a line. |
| 4 | Experience | Picks up two more passes, then "Show all roles" | "Each pass is a role. Pick one up, or see them all." |
| 5 | Education | Rings the SMU tile | "To find out more about my education, go here. I have a Master of IT in Business (AI track) from Singapore Management University." |
| 6 | Projects | fictional-bassoon's projector plays (the bear) | "My projects play like films." |
| 7 | Writing | The Titus Times | The article count, and "I can read them for you, too." |
| 8 | About | The periodic table jumps a chapter | "Every tool I've used, in the order I picked it up." |
| 9 | Colophon | Opens /colophon | "Want to learn more about me, the copilot? Click here." |
| 10 | Drawer reopens | Starter questions appear, input focused | "That was a recorded run. Now ask me anything and watch me drive." |

Step 5's degree is the record's exact title ("Master of IT in Business, AI track"), not "a master's in AI": the
Honesty rules say titles exactly as written.

### Ask Titus's new abilities (live chat and the tour)

The tour uses the same vocabulary of places Ask Titus already points at (`PAGE_TARGETS` in `lib/profile.ts`, shown
through `show_on_page` and `lib/reveal.ts`), plus a few new targets, which live chat gets too:

- `all-roles`: the Experience page's "Show all roles" (PassDesk listens for it, like it listens for a role reveal).
- `colophon`: the colophon page.
- Drawer targets for the tour only: `ask-button` and `fit-mode` (ring the Ask Titus button / the job-description
  toggle). These aren't in live chat's `show_on_page` enum.

Already there and reused: a role target picks up that pass (PassDesk's reveal listener); a project target scrolls to
its projector, which plays by itself on screen; a tool target makes the periodic table jump to that chapter
(`requestShow`).

The system prompt gains one line saying what Ask Titus can do with the site ("I can move the site for you as I
answer"), and the `show_on_page` description mentions `all-roles` and `colophon`.

### Recording the tour

- `npm run tour:record` (Titus runs it; it needs the API key) sends Ask Titus a **tour brief** (the route above,
  the 120-second limit, the site's order) with the normal system prompt, and asks for structured output: a list of
  steps, each `{ say: string, targets: string[] }`, targets checked against the vocabulary above.
- It writes `content/site-tour.json` with the steps plus the model and date. Titus reads it; if a line is wrong he
  tweaks the brief and records again. Small hand-edits are allowed (the file says it was reviewed).
- The brief lives in the repo (`content/tour-brief.md`); like the system prompt, it is never shown on the site.
- **A test fails** when a step points at a target that no longer exists, or the tour's total time goes over 120
  seconds, so a renamed role or a long recording is caught before visitors see it.

### The player

- "Show me around" starts the player with `content/site-tour.json` (no API call).
- Each step: the narration appears (typed out, as Ask Titus's replies are), its targets run in order, then it
  waits a reading time from the word count (about 3 words a second, with a floor and ceiling) before the next step.
- Controls on every screen size: **Pause/Resume**, **Skip** (next step) and **✕** (end the tour, drawer opens with
  the starters). Scrolling, tapping the page or pressing a key pauses it.
- **Wide screens (drawer beside the page, ≥1024px; ≥1440px when expanded):** the narration lives in the drawer as a
  message thread labelled "Recorded tour"; the page moves beside it.
- **Narrow screens:** steps 1 and 2 play with the drawer open (it's what they introduce). At step 3 the drawer
  shrinks back to the Ask Titus button and the narration moves to a caption card pinned near the bottom of the
  screen, over the page:

  ```
  ┌──────────────────────────────┐
  │ T·L                  CONTACT │
  │   (Experience; the UOB pass  │
  │    lifts, its role opens)    │
  │ ┌──────────────────────────┐ │
  │ │ ● TITUS · 4 of 10        │ │
  │ │ Each pass is a role.     │ │
  │ │ Pick one up, or see them │ │
  │ │ all.                     │ │
  │ │ ❚❚ Pause   Skip →    ✕   │ │
  │ └──────────────────────────┘ │
  │                         (●)  │
  └──────────────────────────────┘
  ```

  The card wraps, never truncates; buttons are 44px tap targets. Step 10 reopens the full drawer.
- Reduced motion: the page jumps instead of scrolling, the narration appears whole instead of typed, and the
  projector stays paused (as it already does); timings stay the same.
- Screen readers: each step's narration goes to the existing live region; the caption card is a labelled region.
- "Recorded tour" is visible on the drawer thread and the caption card's label, so it's never passed off as live.

### Front page

- **Hero buttons (all sizes):** `[Show me around →]` (dark, primary) and `[View experience →]` (outlined). "Read the
  writing" leaves the hero; Writing stays in the nav, the doors, and step 7 of the tour.
- **The phones-only Ask Titus card (`HeroAsk`) goes:** the main button does its job, and the page gets shorter.
- **Under the four numbers (`OpeningLine`):** one line, `Short on time? Let me show you around →`, starting the
  same tour, where visitors tend to leave.

### Edge cases

- The visitor uses the nav, the Ask Titus button or a link mid-tour: the tour ends (no snapping back).
- Before Titus has recorded and reviewed the first tour, the builder works from a hand-written draft of the route
  (marked as a draft in the file); the "Show me around" button doesn't ship until the real recording replaces it.

## Left to the builder

- Component shape: a `lib/site-tour.ts` (types, timing, validation) plus a player hook and a `TourCaption`
  component, rather than growing `CopilotBubble.tsx` (1,139 lines) further. The drawer exposes what the player needs
  (open, shrink, show a thread, ring its own button and fit toggle).
- How the player drives cross-page steps: `router.push` then wait for the anchor, as `showStop` does today.
- The exact wording of the tour brief and the prompt line, within the shape above.
- Tests go to the unit-test-writer agent (CLAUDE.md). Worth covering: the recording validator; the 120-second
  budget; Pause/Skip/✕; pausing on scroll; narrow vs wide layout; reduced motion; the hero and OpeningLine buttons
  start the tour; `all-roles` and `colophon` in live chat; HeroAsk's removal doesn't break the Doors tests.
- Check on a Vercel preview at 390×844 and at desktop width (see the preview-testing memory). The tour itself needs
  no API key, so it can be checked locally too once `content/site-tour.json` exists.
