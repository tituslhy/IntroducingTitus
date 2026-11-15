# Maintenance runbook

For me, months from now, when I've forgotten the commands. Checklists first; details after.

Two things to know up front:

- `resources/` is gitignored. The Medium export and the saved joint-article pages live only on my machine.
- `content/` is committed. `articles.json`, `articles-meta.json`, `article-notes.json`, `article-themes.json` and `eval-results.json` ship with the site.

---

## 1. When I publish an article

- [ ] Export from Medium: Settings → Security and apps → Download your information. The zip arrives by email.
- [ ] Replace `resources/medium-export.zip` with the new zip.
- [ ] Joint article (published under a co-author's byline)? Open it in the browser, File → Save Page As → "Webpage, HTML Only", into `resources/joint-articles/`. The build warns about any joint article in my export that has no saved page. Medium blocks scripted fetches, so this has to be done by hand.
- [ ] `npm run articles:build`. Using `OPENAI_API_KEY`, it drafts for each new article: a note (summary + keywords), a one-line note per section, and which theme(s) it belongs under.
- [ ] Open `content/article-notes.json`, find the new entries (`"reviewed": false`), fix the summary and keywords, and set `"reviewed": true`. These notes are the retrieval index the copilot searches, so they matter. The `sections` notes inside each entry are not reviewed (fix one if it's wrong, but nothing waits on them).
- [ ] Open `content/article-themes.json`, check the new article's entry under `assignments` (one or two theme ids from `themes`), and set its `reviewed` entry to `true`. This is the library tree the copilot reads for broad questions ("what should I read to build production agents?").
- [ ] `npm run articles:build` again. This time it writes the corpus (and checks the tree still fits its 32k-character limit).
- [ ] `npx jest`.
- [ ] Optional: `npm run eval:writing` (re-runs the golden set and rewrites `content/eval-results.json`, which feeds the /colophon scorecard). Commit that file only from a real run, never a hand edit.
- [ ] Optional: `npm run eval:replay` (replays a recorded conversation and checks it; writes nothing).
- [ ] Commit `content/`, push. Vercel deploys.

Flags for `articles:build`:

| Flag | What it does |
|---|---|
| `-- path/to/export` | Use a different zip, or an unzipped folder, instead of `resources/medium-export.zip`. |
| `-- --no-draft` | Don't draft missing notes with an LLM (no API key needed). New articles then still need notes before the corpus is written. |
| `-- --allow-unreviewed` | Write the corpus even with unreviewed notes or themes. Local experiments only. Never ship a corpus built this way. |
| `-- --retheme` | Throw away the themes and draft a fresh set (about 8) from every article. Everything in `article-themes.json` is unreviewed again: review the theme list (`"themesReviewed": true`) and every assignment. Use when the library has outgrown its themes. |

What it writes: `content/articles.json` (the corpus, server-only), `content/articles-meta.json` (the article count the page shows), and merges into `content/article-notes.json` and `content/article-themes.json` (never overwrites my edits, except `--retheme`). It also warns about notes and theme assignments for articles that are no longer in the export.

First build after the writing-tree change: it backfills section notes for every article (one call each, about 65) and drafts the first set of themes. Review the theme list and all assignments once (`"themesReviewed": true`, every `reviewed` entry `true`), then re-run.

RSS only carries the latest ~10 posts, so the export is the source of truth. Re-run the whole thing every time I publish.

---

## 2. When I change roles or projects

- [ ] Edit `lib/profile.ts`. Nothing else. The site and the copilot's system prompt both render from it (roles, projects, education, stack, open source, featured articles, links).
- [ ] New role goes at the top of `ROLES`. `SIGN_OFF_TITLE` is the top role's exact title, so the hero label, footer, page title and OG card follow automatically.
- [ ] A few shared figures (years of experience, Illumina savings, coverage figure) live in `lib/content.ts`. Edit them there if they change.
- [ ] `npx jest`. The drift tests (`lib/copilot-prompt.test.ts`, `lib/profile.test.ts`) catch the page and the prompt disagreeing. If my title changed, one test fails on purpose: `lib/profile.test.ts` pins today's title ("reads Lead AI Engineer today"). Update that string.
- [ ] Commit, push.

Don't hand-edit facts into `copilot-system-prompt.md`. It is a template; its `{{TOKENS}}` are filled from `lib/profile.ts`.

---

## 3. Keys

Local: `.env.local` at the repo root (gitignored; the npm scripts load it automatically). Production: the same names in the Vercel dashboard (Project → Settings → Environment Variables). Never commit values.

| Name | Needed for | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `/api/chat`, `/api/fit`, `articles:build` (drafting notes), both evals | Required. |
| `TYPESAFE_API_KEY` | Jev search (`search_writing`), `eval:writing` | Required for article search. Without it, search returns "unavailable". |
| `TYPESAFE_DEFAULT_MODEL` | Pins the Jev build (default `jev-latest`) | Optional. List builds with `npm run eval:writing -- --models`. Pin one so eval results stay comparable. |
| `LANGSMITH_API_KEY` | LangSmith tracing of `/api/chat` | Optional. Tracing is on whenever this is set. `LANGCHAIN_API_KEY` also works. |
| `LANGSMITH_PROJECT` | Which LangSmith project traces go to | Optional, read by the LangSmith SDK, not my code. Set to `personal-website` (that's the project the exported traces come from). |
| `COPILOT_TRACING_ENABLED` | Kill switch for tracing | Optional. `false`/`0`/`no`/`off` turns tracing off. |
| `NEXT_PUBLIC_SITE_URL` | Allowed origin for the API routes | Optional. Defaults to `https://introducing-titus.vercel.app`. |

`VERCEL_URL` and `NODE_ENV` are set by Vercel/Next. I don't set them.

`/api/fit` is never traced: job descriptions can be confidential. `/api/chat` traces are full text (visitor messages, prompts, article text, answers).

---

## 4. Debugging a bad answer

- [ ] Find the run in LangSmith, project `personal-website`. One trace per chat request, named `copilot-chat`.
- [ ] Read the child runs: each `gpt round n`, each `search_writing` call with its arguments and result, and under it `jev filter (noul)` (the shortlist and relevance) and `jev rank (score)` (every stage-2 score). The `search_writing` run also carries `search.chosen` (what was served) and any `fallback`/`errors`. Export the trace if I want to keep it.
- [ ] Decide which layer failed:
  - Search didn't find the right article: usually a weak note. Fix the summary/keywords in `content/article-notes.json`, rebuild. Add the question to `GOLDEN` in `scripts/eval-writing.ts` so it stays fixed.
  - Search found it but the answer was wrong (bad citation, apology on a correction, stale self-description): prompt or loop problem. Look at `copilot-system-prompt.md` and `lib/copilot-loop.ts`.
- [ ] Reproduce: `npm run eval:replay`. Today `scripts/replay-citations.ts` replays one recorded conversation (the `TURNS` list) with checks tied to specific turn numbers. To replay a new conversation, copy its visitor turns into `TURNS` (or a copy of the script) and adjust the turn-number constants and checks.
- [ ] Without LangSmith: Vercel's runtime logs have one `copilot_writing_search` JSON line per search (latency, fallback, errors, no query text) and `copilot_chat_rejected` lines for refused requests.

---

## 5. Tripwires

| Symptom | What it means | What to do |
|---|---|---|
| `articles:build` prints "N article(s) need review in content/article-notes.json" and "Corpus not written." | New or edited notes still have `"reviewed": false`. Deliberate: unreviewed LLM summaries never ship. | Review them, set `"reviewed": true`, re-run. Not `--allow-unreviewed`. |
| `articles:build` says "OPENAI_API_KEY is needed to draft notes" (or "to draft themes") | New articles need notes or a theme and there's no key. | Add the key to `.env.local`, or `--no-draft` and write the notes / assignments by hand. |
| `articles:build` prints "N problem(s) in content/article-themes.json" | Themes or assignments unreviewed, an article with no theme, or an assignment to a theme id that doesn't exist. | Fix the listed entries, set `reviewed` / `themesReviewed`, re-run. |
| `articles:build` says "The library tree is N chars, over TREE_MAX_CHARS" | The tree (one line per article per theme) no longer fits the prompt budget. | Shorten long summaries or theme descriptions, or file fewer articles under two themes. If the library has simply grown, raise `TREE_MAX_CHARS` in `lib/search-config.ts` deliberately. |
| A section note reads wrong | Drafted by an LLM, not reviewed. | Edit it in `article-notes.json` → `sections`. Delete it and the next build redrafts it. |
| `articles:build` warns about joint articles with no saved page | A joint article is listed in my export but not saved in `resources/joint-articles/`. | Open the printed URL, Save Page As → "Webpage, HTML Only" into that folder, re-run. |
| `npx jest` fails "featured article N resolves to a corpus article" (`lib/copilot-prompt.test.ts`) | An entry in `FEATURED_ARTICLES` (`lib/profile.ts`) has no match in `content/articles.json`, so the prompt would link it without a date. | Rebuild the corpus from a fresh export, or fix the featured entry's `href`/title. |
| Visitor sees "That conversation has gotten a bit long for me to follow" (`conversation_too_long`) | The conversation doesn't fit the history budget even after dropping the oldest exchanges (`lib/chat-history.ts`). Logged as `copilot_chat_rejected` / `budget_exceeded`. | Usually fine: one very long paste. If it shows up often in logs, look at the budget in `app/api/chat/route.ts`. |
| A `search_writing` result is `{ articles: [], error: "search unavailable" }` | Jev's first stage failed (key missing, Jev down, timeout). Search never looked. This is not "I haven't written about that". | Check `TYPESAFE_API_KEY` in Vercel and the `copilot_writing_search` log's `errors`. If the copilot told a visitor it hadn't written on the topic after this, that's a prompt bug. |

---

## 6. Command reference

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server at http://localhost:3000. |
| `npm run build` | Production build (what Vercel runs). |
| `npm run start` | Serve the production build locally. |
| `npm run lint` | ESLint over the repo. |
| `npm test` / `npx jest` | All unit tests, including the drift tests. |
| `npx tsc --noEmit -p .` | Type-check without building. |
| `npm run articles:build` | Rebuild the article corpus from `resources/medium-export.zip` (flags in section 1). |
| `npm run eval:writing` | Golden set for article search, real GPT + real Jev; writes `content/eval-results.json`. `-- --dry` prints without writing; `-- --models` lists Jev builds. Costs API calls. |
| `npm run eval:replay` | Replays a recorded conversation through the real loop and checks it. Writes nothing; exits 1 on a failed check. Costs ~10 agent turns. |

The `articles:build` and `eval:*` scripts load `.env.local` themselves (`node --env-file-if-exists`).

---

## Coming with the writing tree

Themes and section notes are in (above). Still planned in `docs/superpowers/plans/2026-11-14-copilot-writing-tree.md`: the copilot reading the tree (`read_writing`), and replays moving into their own scenario files. Update this doc then.
