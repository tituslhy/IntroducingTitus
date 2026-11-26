# Show me around Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Show me around" button that plays a recorded, narrated tour of the whole site by Ask Titus, moving and operating the page as it talks, in under 120 seconds.

**Architecture:** A recorded tour (`content/site-tour.json`, written by `npm run tour:record` from a real Ask Titus run) is a list of steps `{ say, targets }`, where targets use the same vocabulary as `show_on_page`. A player hook inside the drawer walks the steps with timers, reusing the drawer's existing `showStop`/`revealStop` (navigate, reveal, scroll, spotlight). Wide screens narrate in the drawer; narrow screens shrink the drawer and narrate in a caption card over the page.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v3, Jest + Testing Library, OpenAI Responses API (`openai` 6) for the recorder only.

**Spec:** `docs/superpowers/specs/2026-11-25-show-me-around-design.md`

## Global Constraints

- The site never starts the tour itself; only a tap on a tour button starts it.
- Tour total ≤ 120 000 ms by `tourDurationMs`; aim ≈ 100 s.
- Every visible tour surface says it's recorded: drawer thread header "Recorded tour"; caption label "Titus · Recorded tour · {n} of {total}".
- No API call when playing the tour. The recorder is the only code that calls OpenAI, and only Titus runs it.
- The tour brief (`content/tour-brief.md`) and the system prompt are never rendered on the site.
- Phones: text wraps, never truncates; tap targets ≥ 44 px (use the existing `tap` class or `min-h-[44px]`).
- Reduced motion: no smooth scroll, narration shown whole (no typing), same timings.
- Side-by-side test: `(min-width: 1024px)`, or `(min-width: 1440px)` when the drawer is expanded (`SIDE_BY_SIDE_QUERY` / `EXPANDED_SIDE_BY_SIDE_QUERY` in `components/CopilotBubble.tsx`).
- All test writing goes to the **unit-test-writer** agent (CLAUDE.md). Test steps below give it the names and assertions.
- Commits are local on `redesign`; no push without Titus's OK.

## Review Focus

1. Visitor clicks a nav link mid-tour → the tour ends; the player never navigates back. (Task 5 test `ends when the path changes to one the step didn't ask for`.)
2. Tour started while a chat conversation is open → drawer-only targets (`fit-mode`) aren't on screen; the step still plays and the conversation is intact after the tour. (Task 5 test `skips a target it can't find and keeps playing`; Task 6 test `keeps the conversation after the tour`.)
3. Window crosses 1024 px mid-tour (rotate, resize) → the narration moves between drawer and caption on the same step. (Task 6 test `switches layout on resize without changing step`.)
4. A target never renders after navigation (`waitForElement` → null) → that stop is skipped, the tour goes on. (Task 5, same test as 2.)
5. Starting the tour again after it ended, or unmounting mid-tour → starts at step 1, no stray timers. (Task 5 tests `restarts from the first step` and `clears its timers on unmount`.)

---

### Task 1: Tour data, timing and validation

**Files:**
- Create: `lib/site-tour.ts`
- Create: `content/site-tour.json` (hand-written draft of the spec's 10-step route, `"draft": true`)
- Test: `lib/site-tour.test.ts`

**Interfaces:**
- Produces:
  - `type TourStep = { say: string; targets: string[] }`
  - `type SiteTour = { draft: boolean; recordedAt: string | null; model: string | null; steps: TourStep[] }`
  - `const DRAWER_TARGET_IDS = ['ask-button', 'fit-mode'] as const` (drawer elements; tour only)
  - `const TOUR_TARGET_IDS: string[]` = `PAGE_TARGET_IDS` + `DRAWER_TARGET_IDS`
  - `const TOUR_BUDGET_MS = 120_000`
  - `function stepDurationMs(step: TourStep): number` = clamp(words / 3 × 1000 + 1500 when the step has targets, 4000, 16000)
  - `function tourDurationMs(tour: SiteTour): number` (sum)
  - `function parseTour(raw: unknown): SiteTour | null` (shape check only; null on bad shape)
  - `function tourProblems(tour: SiteTour): string[]` (unknown target ids, empty `say`, fewer than 3 steps, over budget; each problem one readable line)
  - `const SITE_TOUR: SiteTour` (the parsed `content/site-tour.json`; throws at import if it doesn't parse)

- [ ] **Step 1: unit-test-writer writes the failing tests**

  - `stepDurationMs`: 30 words + targets → 11 500; 3 words, no targets → 4000 (floor); 200 words → 16 000 (ceiling).
  - `parseTour` returns null for `{}`, for steps missing `say`, for `targets` not an array; returns the object for a valid tour.
  - `tourProblems`: flags `"step 2: unknown target role-nowhere"`; flags an empty `say`; flags `tourDurationMs > 120000` with the total in seconds; returns `[]` for a valid tour.
  - **`the shipped tour is valid`:** `tourProblems(SITE_TOUR)` equals `[]`. (This is the test that catches a renamed role.)

- [ ] **Step 2: Run `npx jest lib/site-tour.test.ts`.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/site-tour.ts`** with the interfaces above. Write `content/site-tour.json` from the spec's route table:
  - Use the spec's gist lines, first person, Education line verbatim: "To find out more about my education, go here. I have a Master of IT in Business (AI track) from Singapore Management University."
  - Targets per step:
    1. `[]`
    2. `["ask-button","fit-mode"]`
    3. `["role-mastercard"]`
    4. `["role-uob","role-illumina","all-roles"]`
    5. `["edu-smu"]`
    6. `["project-fictional-bassoon"]`
    7. `["writing"]`
    8. `["tool-langgraph"]` (any tool target, so the table jumps a chapter; check the id exists via `toolTargetId`)
    9. `["colophon"]`
    10. `[]`
  - `all-roles` and `colophon` arrive in Task 2, so this task's `the shipped tour is valid` test passes only after Task 2. Note that in the commit message, or do Task 2 first.
- [ ] **Step 4: Run `npx jest lib/site-tour.test.ts`.** Expected: PASS (after Task 2 for the shipped-tour test).
- [ ] **Step 5: Commit** `feat(tour): tour data, timing and validation`.

### Task 2: Two new places Ask Titus can take you: all roles, the colophon

**Files:**
- Modify: `lib/profile.ts` (`PAGE_TARGETS`, after `dossier`)
- Modify: `components/experience/PassDesk.tsx` (toggle `id`, SHOW_EVENT listener)
- Modify: `app/colophon/page.tsx:233` (`<header id="colophon" …>`)
- Modify: `copilot-system-prompt.md` ("About Me, the Assistant")
- Test: `lib/profile.test.ts`, `components/experience/PassDesk.test.tsx` (create if missing), `lib/copilot-prompt.test.ts`

**Interfaces:**
- Produces:
  - Targets `{ id: 'all-roles', path: '/experience', label: 'All roles', about: 'every role at once, instead of one pass at a time' }`
  - `{ id: 'colophon', path: COLOPHON_PATH, label: 'How Ask Titus works', about: 'how I, the assistant, am built and tested' }`
  - The "Show all N roles" button has `id="all-roles"`.

- [ ] **Step 1: unit-test-writer writes the failing tests**
  - `PAGE_TARGET_IDS` contains `all-roles` and `colophon` with those paths.
  - PassDesk: dispatching `SHOW_EVENT` with `{ ids: ['all-roles'] }` on the button shows every role (no `[data-reveal]` hidden); a pending show taken on mount (`requestShow` before render) does the same; `{ ids: ['role-uob'] }` does not turn on show-all.
  - `buildSystemPrompt(template)` contains "The whole site is a tool I can use".
- [ ] **Step 2: Run `npx jest lib/profile.test.ts components/experience lib/copilot-prompt.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **PassDesk:** listen for `SHOW_EVENT` on its root and check `takePendingShow((ids) => ids.includes('all-roles'))` on mount, the way `components/about/PeriodicTable.tsx` does. It sets `all` to true.
  - **Prompt:** in "About Me, the Assistant", after "points at things on the page", add: "…and moves the site for the visitor as it answers: it opens pages, picks up passes and plays projectors. The whole site is a tool I can use." Leave "Never mention the tool, navigating…" in "Showing Things" untouched (it governs ordinary answers).
- [ ] **Step 4: Run the same jest command.** Expected: PASS. Also `npx jest lib/site-tour.test.ts`: PASS.
- [ ] **Step 5: Commit** `feat(copilot): all-roles and colophon targets`.

### Task 3: The recorder (`npm run tour:record`)

**Files:**
- Create: `content/tour-brief.md`
- Create: `scripts/record-tour.ts`
- Modify: `lib/site-tour.ts` (add `tourJsonSchema`)
- Modify: `package.json` scripts: `"tour:record": "node --env-file-if-exists=.env.local --import tsx scripts/record-tour.ts"`
- Test: `lib/site-tour.test.ts`

**Interfaces:**
- Consumes: `TOUR_TARGET_IDS`, `parseTour`, `tourProblems`, `tourDurationMs` (Task 1); `buildSystemPrompt` (`lib/copilot-prompt.ts`); `MODEL` (`lib/copilot-loop.ts`).
- Produces: `function tourJsonSchema(): object`, a strict JSON schema: `{ steps: [{ say: string, targets: string[] (enum TOUR_TARGET_IDS) }] }`, `additionalProperties: false` at every level.

- [ ] **Step 1: unit-test-writer writes the failing test**
  - `tourJsonSchema()` has `steps.items.properties.targets.items.enum` equal to `TOUR_TARGET_IDS`.
  - It is strict: every object has `additionalProperties: false`, and `required` lists all its properties.
- [ ] **Step 2: Run `npx jest lib/site-tour.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`content/tour-brief.md`:**
    - The spec's route table as beats, the site's order, ≤ 120 s at ~3 words/s, first person.
    - An explicit override for this run only: "narrate what the page is doing", which overrides "Never mention… navigating". Step 1 must say the whole website is a tool I can use. The last step must say it was a recorded run and invite live questions.
    - The Education beat uses the exact degree title. A beat may use only the targets listed for it.
  - **`scripts/record-tour.ts`:**
    - One `openai.responses.create({ model: MODEL, input: [system: buildSystemPrompt(template), system: brief, user: "Show me around."], text: { format: { type: "json_schema", name: "site_tour", schema: tourJsonSchema(), strict: true } } })`.
    - Parse the result with `parseTour` and stamp `draft: false`, `recordedAt: new Date().toISOString()`, `model: MODEL`.
    - If `tourProblems` returns anything, print it and exit 1 without writing.
    - Otherwise write `content/site-tour.json` (2-space JSON) and print each step with its seconds and the total.
    - `--dry` prints without writing. The header comment matches `scripts/record-colophon.ts`'s style.
- [ ] **Step 4: Run `npx jest lib/site-tour.test.ts`.** Expected: PASS. Run `npx tsc --noEmit`: no errors.
- [ ] **Step 5: Commit** `feat(tour): recorder and brief`.

### Task 4: Start event and front-page buttons

**Files:**
- Modify: `lib/copilot-events.ts`
- Create: `components/front/TourButton.tsx` (client)
- Modify: `components/Hero.tsx` (buttons; remove `HeroAsk`)
- Delete: `components/front/HeroAsk.tsx`, `components/front/HeroAsk.test.tsx`
- Modify: `components/front/OpeningLine.tsx` (line under the tiles)
- Test: `lib/copilot-events.test.ts`, `components/front/TourButton.test.tsx`, `components/Hero.test.tsx`, `components/front/OpeningLine.test.tsx`

**Interfaces:**
- Produces:
  - `const COPILOT_TOUR_EVENT = "copilot:tour"`
  - `function startTour(): void` (dispatches it on `window`)
  - `<TourButton variant="primary" | "line" />`:
    - `primary` is the hero's dark button: "Show me around →", same classes as today's "View experience" link.
    - `line` is the OpeningLine text button: "Short on time? Let me show you around →", serif italic with the arrow in amber and `tap`.
    - It renders null when `SITE_TOUR.draft && process.env.NODE_ENV === 'production'`.

- [ ] **Step 1: unit-test-writer writes the failing tests**
  - `startTour()` dispatches `copilot:tour` exactly once.
  - Clicking either `TourButton` variant calls `startTour`.
  - Hero renders "Show me around", plus "View experience" as the outlined link to `/experience`, and no "Read the writing" link.
  - Hero no longer renders the "How it works" Ask Titus card.
  - OpeningLine renders "Short on time? Let me show you around".
- [ ] **Step 2: Run `npx jest components/Hero components/front lib/copilot-events`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Hero:** `TourButton variant="primary"` goes first, and "View experience" takes the outlined style that "Read the writing" had. Delete the HeroAsk import and its usage.
  - **OpeningLine:** the line goes under the tile grid, left-aligned with the sentence.
  - Fix any other test that referenced HeroAsk (`grep -rn HeroAsk`).
- [ ] **Step 4: Run the same jest command, then `npx jest`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(front): Show me around buttons`.

### Task 5: The tour player hook

**Files:**
- Create: `components/tour/useTourPlayer.ts`
- Test: `components/tour/useTourPlayer.test.tsx`

**Interfaces:**
- Consumes: `SiteTour`, `TourStep`, `stepDurationMs` (Task 1); `Stop`, `groupStops` (`lib/page-stops.ts`).
- Produces:
  ```ts
  type TourStatus = "idle" | "playing" | "paused" | "done";
  function useTourPlayer(opts: {
    tour: SiteTour;
    /** Shows one stop (navigate if needed, reveal, scroll, spotlight); false when its element never appeared. */
    showStop: (stop: Stop) => Promise<boolean>;
    /** Spotlights a drawer element by id without scrolling the page. */
    ringDrawer: (id: string) => void;
    pathname: string;
    targetsById: Map<string, StopTarget>;
  }): {
    status: TourStatus; index: number; step: TourStep | null; total: number;
    start(): void; pause(): void; resume(): void; skip(): void; end(): void;
  }
  ```
- Behaviour:
  - Each step runs its targets in order, spaced `min(2000, stepDurationMs / n)` apart. Drawer ids go to `ringDrawer`; the rest are grouped with `groupStops` and passed to `showStop`.
  - The next step comes after `stepDurationMs`. After the last step the status is `"done"`.
  - Page interaction pauses the tour: `wheel`, `touchmove`, `keydown`, and `pointerdown` outside elements marked `data-tour-ui`.
  - A pathname change the current step didn't cause calls `end()`.

- [ ] **Step 1: unit-test-writer writes the failing tests** (fake timers, `renderHook`)
  - `plays each step after its duration`: index goes 0 → 1 after `stepDurationMs(step0)`.
  - `runs a step's targets in order`: `showStop` is called with role-uob, then role-illumina, then all-roles.
  - `rings drawer targets without showStop`.
  - `pauses on wheel and resumes where it was`.
  - `skip moves to the next step at once`; `end sets done`.
  - `ends when the path changes to one the step didn't ask for`.
  - `skips a target it can't find and keeps playing` (`showStop` resolves false).
  - `restarts from the first step`; `clears its timers on unmount` (no state update after unmount).
- [ ] **Step 2: Run `npx jest components/tour`.** Expected: FAIL.
- [ ] **Step 3: Implement `useTourPlayer`.** Timers are kept in refs so pause and resume continue the remaining time of the current step.
- [ ] **Step 4: Run `npx jest components/tour`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(tour): player hook`.

### Task 6: Tour in the drawer and the caption card

**Files:**
- Create: `components/tour/TourCaption.tsx`
- Create: `components/tour/TourThread.tsx`
- Modify: `components/CopilotBubble.tsx`:
  - listen for `COPILOT_TOUR_EVENT`;
  - `id="ask-button"` on the FAB and `id="fit-mode"` on the hiring-prompt button;
  - make `showStop`'s cross-page path awaitable (return a `Promise<boolean>` wrapper for the player; keep the existing sync callers working);
  - layout switch.
- Test: `components/tour/TourCaption.test.tsx`, `components/CopilotBubble.test.tsx`

**Interfaces:**
- Consumes: `useTourPlayer` (Task 5), `SITE_TOUR` (Task 1), `COPILOT_TOUR_EVENT` (Task 4).
- Produces:
  - `<TourCaption say index total paused onPause onResume onSkip onEnd />`:
    - a labelled region (`aria-label="Site tour"`) with `data-tour-ui`, fixed above the FAB, `max-w-[min(420px,calc(100vw-32px))]`;
    - label "Titus · Recorded tour · {index+1} of {total}";
    - buttons Pause/Resume, Skip →, ✕ (aria-label "End tour"), each ≥ 44 px.
  - `<TourThread steps={upTo} />`: the narration so far as Titus messages under a "Recorded tour" header, rendered in the drawer body above the empty-state starters.
- Layout rule:
  - Steps 1–2 always play in the open drawer.
  - From step 3: if side-by-side, the narration stays in the drawer; otherwise the drawer closes and `TourCaption` shows.
  - On `"done"` the drawer opens with the input focused, `TourThread` shows only the last step, then the usual starters. It clears when the visitor sends a message.
  - Narration types in like replies unless reduced motion; each step goes to `liveMessage` as "{say}" (step {n} of {total}).

- [ ] **Step 1: unit-test-writer writes the failing tests**
  - TourCaption: shows the label with the counts; Pause calls `onPause`, and when `paused` the button reads Resume; ✕ calls `onEnd`; the whole `say` text is in the document (no truncation classes).
  - CopilotBubble:
    - `opens and plays on copilot:tour`: the drawer is open and "Recorded tour" is visible.
    - `narrow screens show the caption from step 3` (matchMedia false): the drawer closes and the region "Site tour" appears.
    - `switches layout on resize without changing step`.
    - `keeps the conversation after the tour`: existing messages are still rendered once done.
    - `ends with the drawer open and the input focused`.
- [ ] **Step 2: Run `npx jest components/tour components/CopilotBubble.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement.** `ringDrawer` adds and then removes `SPOTLIGHT_CLASS` on the element (as `revealStop` does), with no scroll.
- [ ] **Step 4: Run `npx jest`, `npx tsc --noEmit`, `npm run lint`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(tour): drawer thread and phone caption`.

### Task 7: Check it in a browser

**Files:** none (fixes found here go back to the owning task's files)

- [ ] **Step 1:** `npx next build && npx next start -p 3123` (stop the old 3123 server first). The tour needs no API key.
- [ ] **Step 2:** Playwright at 1280×800: click "Show me around"; screenshot steps 1, 3, 4, 6, 9, 10. Check:
  - passes lift and "Show all" turns on;
  - the projector plays;
  - the table jumps a chapter;
  - the colophon opens;
  - the total time is ≤ 120 s.
- [ ] **Step 3:** Playwright at 390×844: same tour. Check:
  - from step 3 the caption covers no more than the bottom third;
  - text wraps;
  - tapping the page pauses the tour;
  - tapping a nav link ends it.
- [ ] **Step 4:** Reduced motion (`emulateMedia({ reducedMotion: 'reduce' })`): there's no smooth scroll and the narration appears whole.
- [ ] **Step 5:** Send Titus the screenshots, and ask him to run `npm run tour:record`, review `content/site-tour.json` and approve it. With his OK, commit the real recording `chore(tour): first recording`. Push for a preview only with his OK.
