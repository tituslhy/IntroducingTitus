# Colophon: "Try it" — a replayed trace beside the architecture diagram

Date: 2026-11-24 · Branch: `redesign` · Mock: `design/rethink/colophon-tryit.html` (+ `colophon-base.css`)

## Intent

The colophon (`/colophon`, "How Ask Titus works") is where technical readers (hiring managers, tech leads) decide
whether the copilot is serious engineering or a wrapper. Titus wants it to show "sophistication and tech class", and
wants people to say *holy shit* when they watch the system work. Today the page has a static architecture diagram
(`components/colophon/ReplyDiagram.tsx`) and long prose. Titus likes the diagram and wants to keep it as the anchor.

The new centrepiece: a **Try it** button that replays a real, recorded reply. The diagram lights up box by box while a
dark, LangSmith-style trace waterfall builds beside it, then the answer streams in. Visitors can click any span to see
its input and output — "a fake LangSmith", built from a real run, with no live model call.

## Goals

- Show the system working, in sync: diagram (the blueprint) + trace (the instrument) + answer.
- Two recorded questions that together light every box on the diagram:
  1. **Try it** — "Have you used LangChain and LangGraph?" (search route: record in the prompt → `search_writing`
     with two topics → Jev filter → rank → sections, plus `show_on_page`).
  2. **or a broad question** — "How would you build production-ready agents?" (library-map route: GPT splits the
     question into parts and calls `read_writing` once per part, in parallel → Jev sections, plus `show_on_page`).
- Every number shown comes from a recording a script produced. Never invented, never estimated.
- Clickable spans with input/output detail, like LangSmith.

## Non-goals

- No live model calls from the colophon. No visitor-typed questions here (the drawer does that).
- No change to the drawer's look in this piece (the drawer restyle is a separate step).
- No change to the copilot's behaviour.

## Anti-goals (would be a failure even if it works)

- Showing the system prompt, in whole or in part (site rule: never publish it verbatim). GPT-round inputs show only
  the visitor's message and the names of the tools offered.
- A number on the page that no script produced (site rule, same as the scorecard).
- A cute metaphor that hides the engineering (Titus rejected chess, a datasheet, a flow sheet and a plain trace replay
  without the diagram).
- Committing Titus's LangSmith exports: they contain the full system prompt and the repo is public.

## Approaches considered

1. **Trace replay alone** (dark tile, step list, no diagram) — rejected: loses the diagram, which is what reads as
   "tech class".
2. **Datasheet** / **chess annotated game** / **process flow sheet** — rejected: the first is clear but flat; chess was
   fun but obscures the system; the flow sheet repeats About's chemical-engineering story.
3. **Design-decision records** under the diagram — rejected as "boring, like a Confluence page".
4. **Diagram as the spine + observability view, replayed on demand ("Try it")** — **chosen** (Titus's idea, combining
   "the diagram runs the page" with "ops view"). One recorded question was the first plan; a second broad question was
   added so both retrieval routes light up.

## What Titus decided

- Keep the current architecture diagram; it lights up in sync with the trace.
- The trace is a **dark** observability screen (Phoenix / LangSmith / Grafana feel), not cream: blueprint on paper,
  instrument on a screen. Its own small palette inside the panel only: LLM amber, tool green, Jev cyan (as in the mock).
- **Try it** runs one question; a secondary "or a broad question" runs the second.
- Spans are clickable/hoverable to show input and output ("fake LangSmith").
- No system prompt anywhere.
- `show_on_page` does not point at the Writing page; the Sources row already links to each article.

## The panel (as mocked)

Desktop (≥1024px): two columns. Left, cream card "The blueprint": the diagram, with a new box above the agent loop —
**"my record + library map · in the prompt"** — feeding GPT, so the record lane is visible. Under the diagram, a latte
box "What just happened": numbered plain-English steps that light as the replay passes them. Right, the dark trace
screen:

- Header: `copilot-chat · trace`, a REPLAY indicator that pulses while playing.
- Stats row: Status (idle / ● running / ✓ OK), Latency (counts up), Spans (n / total), Model calls (GPT + Jev).
- Waterfall: span names with tree connectors and durations, bars coloured by kind, gridlines, an amber playhead.
  Unplayed spans are dimmed; running spans glow.
- **Zoom · retrieval**: the same spans magnified over the retrieval window (first tool start → last tool end), so the
  sub-second Jev work is legible next to GPT's multi-second rounds.
- Detail pane: the selected span (the running one during playback; the clicked/hovered one otherwise) — kind badge,
  name, start → end, then its inputs/outputs (see Data).
- Legend: LLM · tool · Jev (decision model).

Below both: the answer card, streaming during the last GPT round, then its "See on page" pills and Sources, rendered
the way the drawer renders them (footnotes, pills, sources).

Above both: the question, a **▸ Try it** button (becomes **↻ Replay**), the secondary **or a broad question** chip,
and a meta line: `recorded <date> · real GPT and Jev calls · replayed at 3×`.

Phone (<1024px): stack — question/controls, the diagram's existing **vertical** SVG (not the wide one shrunk), the
trace screen, the steps, the answer. Text wraps, nothing truncates or scrolls sideways (standing rule). Span details
open on tap.

Replay speed: 3× real time; bars are labelled with real durations. The axis fits the recorded total.

Diagram highlighting: each span maps to the boxes it exercises (GPT rounds → GPT + record box; `search_writing` →
tools/search row + topic boxes; Jev filter / rank / sections → their boxes; `read_writing` → read_writing box;
`show_on_page` → its tools row; end → checks, drawer). Running = amber fill; done = amber outline; untouched = faded.
Hovering a span lights its boxes.

## Data

A new script, `npm run colophon:record`, runs the two questions through the real loop (`copilotStream` +
`createCopilotTools`, as `scripts/eval-writing.ts` does) with a **recording observer** — a `LoopObserver` like
`lib/copilot-tracing.ts`'s `ChatTrace`, but writing to memory instead of LangSmith — and writes
`content/colophon-traces.json`. It makes real OpenAI and Jev calls, so it is run by hand, and Claude asks Titus before
running it.

Per span: `name`, `kind` (llm | tool | jev | chain), `parent`, `start`/`end` in ms from the request start, and
sanitised `inputs`/`outputs`:

| Span | Inputs kept | Outputs kept |
|---|---|---|
| gpt round N | the visitor's message; tool names offered | function calls (name + args); answer text |
| search_writing | topics, `more` | articles served (n, title, url, published), `remaining` |
| read_writing | article ids, `focus` | articles served (n, title, url, published) |
| jev filter (noul) | query, catalogue size | shortlist with p(yes), near misses |
| jev rank (score) | query, shortlist | scores |
| jev sections (score) | focus, article | every section's score, which were kept, fallback |
| show_on_page | targets | shown |

Never stored: the system prompt, developer/system messages, article body text (headings and scores only).
Per recording: question, recorded date, model ids, total ms, the answer, actions shown, sources.

Detail-pane rendering: slugs resolve to titles from the article data at render time. Jev sections shows a small bar
chart of every section's score with the kept ones lit ("5 of 22 kept").

If `content/colophon-traces.json` is missing, the Try it panel is hidden and the static diagram shows as today (same
pattern as the scorecard).

## Rest of the page

Keep the current sections and the ~68ch reading column; only the Try it panel breaks out to full width (my call: the
reading column stays a reading column). Copy updates, so the page matches the copilot today:

- "Three kinds of question": add the **experience-with** lane (record first, then writing) and describe the broad
  route as splitting into parts and reading each part in parallel.
- "Reading in pages" / "Reading by theme": limits are now 3 calls per reading tool and 10 articles a reply (from
  `lib/search-config.ts`); describe the library map's themes, and that an article can sit under two.
- The guided tour (`show_on_page` moving the page once, See-on-page pills) gets a sentence.
- The "How it's tested" scorecard is unchanged ("Used my record" already shows).
- The walkthrough list under the diagram is superseded by "What just happened" and can go.

## Motion and accessibility

- Reduced motion: no pulse, shimmer or glow; Try it shows each step's end state as the visitor steps through
  (Next / Back), and the answer appears whole. (Builder may choose the exact control.)
- The replay never starts by itself.
- The waterfall is a list of buttons (each span), keyboard-focusable; Enter selects; the detail pane is a live region.
- The diagram keeps its existing aria description.

## Calls made while writing this up (Claude's, for Titus to check)

- **"What just happened" copy** is written per question after recording, keyed to span names so each line lights when
  its span starts. Any fact in it must appear in the recording (e.g. "LangChain daily since Aug 2024" comes from the
  recorded answer, not from memory).
- **Topic boxes** on the diagram show the recorded topics during a replay ("LangChain", "LangGraph"), and the
  generic "topic 1 · 2 · 3" otherwise. Both SVGs (wide and vertical) get the highlight keys.
- **A recording with a retry** (spans prefixed "retry ·") or an error fails the script; re-run it.
- **Model calls** counts GPT rounds plus every Jev call.
- **The recording is reviewed before commit:** the script prints a summary (spans, articles, total time, answer) and
  writes the file; Titus reads it, and re-runs if the run isn't representative of how the copilot normally behaves.

## Left to the builder

- Component split (likely: a server wrapper reading the JSON; a client `TryIt` with diagram highlight state, waterfall,
  zoom, detail, answer).
- How the diagram exposes highlight hooks (e.g. `data-k` keys on boxes, as in the mock).
- Exact palette tokens for the trace screen (start from the mock's `--scr*` and `--c-*`).
- Tests go to the unit-test-writer agent (CLAUDE.md).

## Separate, not in this piece

- Drawer: footnote clusters render as one run of digits ("12357"); separate them ("1, 2, 3, 5, 7").
- Drawer restyle (step 4 of the copilot plan).

---

## Revision (24 Nov 2026): one stage — the diagram is the trace

Titus found the three-panel layout (cream blueprint, black trace, white answer card) busy: three visual
languages competing, the diagram he loves squeezed into a third of the width. Approved direction
(mock: `design/rethink/colophon-stage.html`, `?s=idle|run|done`):

- **One dark stage** right after the masthead, the page's content width (no breakout). The masthead is plain:
  title on one line, the short version as text beside it behind a hairline, no tile or drop cap.
- **The diagram is the trace.** `ReplyDiagram tone="stage"` re-points its colour tokens (`.reply-stage` in
  globals.css). Boxes light as their spans run; once run, a box shows what it measured instead of its
  explanation (`measuredAt`: "kept 8 · 3", "2 rounds · 15.33s", "3 sources"...). Every number comes from the recording.
- **Any box with spans opens them** (`spansByKey`): an inspector beside the box with input and output, tabs when
  several spans sit behind one box. The system prompt is never shown (not recorded).
- **The reply streams into the drawer** the line ends in: the copilot's own face, on paper.
- **The waterfall folds into one scrubbable timeline** (a slider); "view as a trace" opens the full
  LangSmith-style waterfall for anyone who wants it.
- A one-line caption narrates the current step (`storySteps`). Phones: the column diagram, the drawer under it.
- Kept the real diagram's structure (merge, both routes, limits) rather than the mock's simplified lanes.
