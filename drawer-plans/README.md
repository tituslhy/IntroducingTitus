# Drawer plans

Feature plans for the **Ask Titus** copilot, written to be built later.
Each plan is self-contained: why, design, files to touch, guardrails, checklist.

| Plan | What | Status |
|---|---|---|
| [`agent-runtime.md`](./agent-runtime.md) | Rebuild `/api/chat` as a LangChain `createAgent` with tools, limits, a stream adapter to the existing NDJSON protocol, and privacy-safe tracing. | Planned |
| [`search-my-writing.md`](./search-my-writing.md) | A `search_writing` agent tool: Jev filters (`noul`) and ranks (`score`) my 65 Medium articles, the agent answers with footnotes. Replaces open-web search. | Planned |
| [`about-this-bot.md`](./about-this-bot.md) | `/colophon`: a one-page "How Ask Titus works" with an architecture diagram, guardrails and an eval scorecard. | Planned |

**Suggested order:**
1. **Agent runtime**, with `show_on_page` only. Doesn't need Jev access; must
   behave exactly like today.
2. **`search_writing`**, once there's a TypeSafe key and the Medium export.
3. **Colophon page.** It can start any time; its "How it's tested" section
   waits for the writing plan's eval results.

**Already shipped** (for context): single source of truth (`lib/profile.ts` →
page + prompt), `show_on_page` page actions, recruiter mode (`/api/fit`).
