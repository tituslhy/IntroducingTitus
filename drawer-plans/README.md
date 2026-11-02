# Drawer plans

Feature plans for the **Ask Titus** copilot, written to be built later.
Each plan is self-contained: why, design, files to touch, guardrails, checklist.

| Plan | What | Status |
|---|---|---|
| [`search-my-writing.md`](./search-my-writing.md) | Answer from my 65 Medium articles: Jev routes, GPT writes, footnoted sources. Replaces open-web search. | Planned |
| [`about-this-bot.md`](./about-this-bot.md) | `/colophon`: a one-page "How Ask Titus works" with an architecture diagram, guardrails and an eval scorecard. | Planned |

**Suggested order:** build the writing route first, then the colophon page
(its "How it's tested" section reads the writing route's eval results). The
colophon page can start earlier without section 06.

**Already shipped** (for context): single source of truth (`lib/profile.ts` →
page + prompt), `show_on_page` page actions, recruiter mode (`/api/fit`).
