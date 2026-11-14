# Copilot writing tree (PageIndex-style) + per-topic search — design

Date: 2026-11-14 · Size: project · Follows: `2026-11-14-copilot-citation-memory-design.md`
Evidence: LangSmith trace `01a1ca7b-1492-7000-8000-02e0c6ed970b` (child runs)

## Why

Visitors ask three kinds of questions about my writing, and the copilot handles only one well:

- **Concrete** ("what's RAFT?") — works today.
- **Multi-part** ("how do I use LiteLLM, Helm and Nginx…") — fails. The model writes one blended
  query; Jev's stage 1 judges each article against the *whole* query, so a one-topic article
  scores low. In the trace, the Nginx article (keyword `nginx`) never reached the shortlist in
  either search; Helm scraped in at 0.51, then was cut at stage 2 with 1.91 < 2.0.
- **Abstract** ("how would you design production-ready agents?", "which articles should I read
  to build production-ready agents?") — fails. Relevance against a vague goal is flat: partly
  relevant to many articles, fully to none. This is a reasoning problem, not a scoring problem.

Separately: **64 of 65 articles are longer than the 12,000-char body cap** (median 24.7k,
max 56.6k). The model reads roughly the first half of most articles.

The fix follows my own article ("Your AI Agent Needs a Bouncer"): **the LLM reasons, Jev
decides.** Organise the library as a tree, PageIndex-style (vectorless, hierarchical, traversed
by reasoning). GPT navigates the top of the tree for abstract questions; Jev makes the fast,
narrow decisions at the bottom (which articles for a concrete topic, which sections to read).

## Goals

1. **Section-level reading.** Return the sections of an article that matter for the question,
   not its first 12,000 characters.
2. **A library tree in the prompt** — themes → articles — so GPT can reason over everything
   I've written, and can't claim I haven't written about something I have.
3. **Per-topic search.** A multi-part question is searched one topic at a time; no topic crowds
   another out.
4. **Abstract questions answered by navigation**, at no more GPT rounds than a search costs today.
5. **Every retrieval decision is visible in the trace**, including near-misses.

## Non-goals

- The bouncer (Jev query classification before the loop). Deferred: build the tree, run the
  evals, add it only where GPT routes badly (likely candidates: statements, multi-part splitting).
- Embeddings, chunking, or a vector store.
- Changing the Jev model or the stage-1 wording (option "B" from the analysis) — only if the eval
  shows it doesn't hurt the "none" rows.
- Automatic re-theming. Themes change only when I pass `--retheme`.
- Freshness beyond dates. No corrective-RAG or re-checking articles against the outside world:
  the copilot says when an article was written, adds a "check the current docs or repository"
  line for framework articles over six months old, and never invents what I'd do today
  (prompt rule, shipped 2026-11-14).

## Anti-goals

- Citing or answering from the tree. The tree is for choosing what to read; claims come only
  from text a tool returned.
- Shipping unreviewed summaries or themes.
- An abstract question costing more GPT rounds than today's search path.
- Breaking the citation ledger: an article keeps one number for the whole conversation, whichever
  tool returned it.

## Approaches considered

- **Bouncer + per-topic search, GPT splits** — fixes multi-part, but abstract splitting is GPT
  guessing at topics without knowing what I've written. Kept: per-topic search. Deferred: bouncer.
- **Bouncer + separate rewrite LLM call** (closest to my article) — rejected: a full GPT call
  (~9s) before the first token.
- **Library tree + section reading, LLM navigates the top, Jev the bottom ← chosen.** Gives GPT
  the map for abstract questions, keeps Jev on narrow decisions, and fixes truncation for every path.

## Design

### 1. Build time (`scripts/build-articles.ts`, `npm run articles:build`)

Runs whenever I publish, as today. Everything below is incremental: existing entries are kept.

**Sections.** Split each article body on Markdown headings (`#`–`######` at line start), **outside
fenced code blocks** (62 of 65 articles contain code; Python `#` comments must not split).
Text before the first heading is the intro section. Each section: `{ heading, body }`, stored on
the article in `content/articles.json`. `outline` stays as is.

**Section notes.** One plain sentence per section saying what it covers (my headings are written
for readers, not retrieval: "End of story?", "The defence: stop asking the puddle"). Drafted by
the LLM in the same pass as a new article's summary/keywords; backfilled once for the existing
65. Stored in `content/article-notes.json` as `sections: { heading: note }` on the article's
entry, keyed by heading text. **Not review-gated** — they ship as drafted and show up in the git
diff. A heading with no note (article edited after drafting) gets one drafted on the next build.

**Themes.** New `content/article-themes.json`:
`{ themes: [{ id, name, description }], assignments: { slug: themeId[] }, reviewed: { [slug]: boolean } }`
plus `themesReviewed: boolean` for the theme list itself.
- First run / `--retheme`: the LLM drafts ~8 themes from all article summaries and assigns every
  article (one or more themes); everything `reviewed: false`.
- New article: the LLM assigns it to existing themes; that assignment `reviewed: false`.
- **Review-gated like summaries**: the corpus isn't written until the theme list and every
  assignment are reviewed (`--allow-unreviewed` still works for local experiments). The build
  fails if any article has no theme.

### 2. The tree in the prompt (`lib/copilot-prompt.ts`, `copilot-system-prompt.md`)

New token `{{WRITING_TREE}}`, rendered from the corpus + themes, in the cached system prompt:

```
### Agents & orchestration — building, routing and coordinating agents
- f115d5ddac55 Your AI Agent Needs a Bouncer (2026-10): <summary>
- 1c16fb47f435 Agent Memory: … (2025-06): <summary>
### LLMOps & deployment — …
- 18dc88665fc1 Helm Charts: The Multi-Server Orchestra Conductor (2026-02): <summary>
```

- Article id = Medium post id (12 hex; already the canonical key in `lib/citation-ledger.ts`).
- An article in several themes is listed under each.
- **Size:** today ~16,300 chars (~4k tokens; 65 × ~250). Cached, so cheap per turn. A test fails
  above **32,000 chars** (~125 articles; ~2 years at my ~30/year). When it trips, the planned
  change is to render the top 30 articles by Jev stage-1 rank for the question (rank order, not
  the 0.5 threshold) instead of the whole tree. (This corrects the earlier ~9k estimate, which
  was titles + keywords; the tree uses summaries because GPT reasons over them.)
- Prompt rules: the tree is a map for choosing what to read — never cite it, never answer from a
  title or summary, never say "I haven't written about X" if X is in the tree. Abstract or
  goal-shaped questions: reason over the themes, pick up to 3 articles, call `read_writing`.
  Concrete or multi-part: call `search_writing` with one topic per part. "How would *you*…"
  questions lead with my experience (Experience section) and use articles as support.

### 3. Tools (`lib/copilot-tools.ts`)

**`search_writing({ topics: string[] (1–3), more: boolean })`** — replaces `query`.
- Each topic runs the existing two-stage Jev search, in parallel, inside the shared
  `SEARCH_BUDGET_MS`.
- Merge: round-robin by topic — best article of topic 1, of topic 2, of topic 3, then the next of
  each — deduped by slug. Each served article is tagged with the topic(s) it matched.
- Page size: up to 3 articles per call (was 2). `more: true` serves the next page of the merged
  ranking. Max 2 calls per reply, as today.
- Each served article goes through **section picking** (below) with its topic as the focus.

**`read_writing({ articles: string[] (post ids, 1–3), focus: string })`** — new. For
tree navigation. Unknown ids → error entry for that id, others still served. Section picking
with `focus`. Max 2 calls per reply.

**Section picking** (`lib/writing-search.ts` or a new `lib/section-pick.ts`):
- One Jev `score` call per article over its sections (heading + note) against the focus, rubric
  like stage 2's. Articles in a call are scored in parallel.
- Take sections in score order while they fit a **per-article budget of 6,000 chars** (tunable
  constant), at least one; return them **in article order**.
- Always return with them: the intro section (counts toward the budget, truncated if needed) and
  the full outline, so GPT knows what it skipped and can `read_writing` again with a sharper focus.
- Jev failure or timeout → fallback: sections in article order up to the budget (≈ today).
- An article shorter than the budget is returned whole; no Jev call.

**Both tools share one per-reply numbering** seeded from the citation ledger (one `numbered` map
per request, shared across tools), and emit `source` events exactly as `search_writing` does now.
Tool output per article: `n, title, url, published, coAuthors?, topic? , outline, sections: [{ heading, text }]`.

### 4. Search pipeline tweaks (`lib/writing-search.ts`)

- Stage-1 shortlist capped at the **top 8** by probability before stage 2, so a flat spread can't
  fan out into dozens of stage-2 scores.
- **Near-miss logging**: the trace records the top 5 sub-threshold stage-1 probabilities
  (slug + probability) per search, and stage-2 scores under `MIN_SCORE` (already recorded).
  Trace only, never the model.
- Section picking gets its own trace step (`jev sections (score)`) with focus, per-section scores,
  and what was chosen.

### 5. Evals

- `eval:writing` golden set gains:
  - multi-part: "How would I use LiteLLM, Helm and Nginx to put agents in production?" → expects
    the LiteLLM, Helm Charts and Nginx articles;
  - abstract: "How would you design production-ready agents?" and "Which of your articles should
    I read to build production-ready agents?" → expected articles **to be confirmed by me**
    (proposal: testing RAG agents without real LLMs, Agent Memory, Your AI Agent Needs a Bouncer,
    the LiteLLM/Helm pair).
  - The retrieval-only pass calls `searchMyWriting` per topic; the agent pass measures whether
    the expected articles were *read* (via either tool).
- `eval:replay` keeps its checks; the final turn should now cite all three of LiteLLM, Helm, Nginx.
- `/colophon` reads `content/eval-results.json` only — no hand-written numbers. Its reply diagram
  (`components/colophon/ReplyDiagram.tsx`) imports `lib/search-config.ts`; new constants
  (page size 3, top-8 cap, section budget) live there so the diagram can't drift.

## Constraints

- Stack stays: OpenAI Responses API, hand-written loop (`MAX_ROUNDS = 4`), Jev via
  `@typesafe-ai/sdk`. No agent framework, no embeddings.
- Abstract path = same rounds as today: round 1 GPT picks from the tree and calls `read_writing`;
  round 2 answers.
- `lib/articles.ts` stays server-only; the tree renders server-side.
- Tests via the unit-test-writer agent (project rule).

## Build order

1. Sections + section notes + section picking, wired into today's `search_writing` (fixes
   truncation for every path; shippable alone).
2. `topics` search, top-8 cap, near-miss logging (fixes the Nginx miss).
3. Themes + tree token + `read_writing` + prompt rules (abstract questions).
4. Eval additions; run `eval:writing` and `eval:replay`; then decide on the bouncer.

## Left to the builder

- Exact Jev rubric wording for section picking; exact theme-drafting prompt.
- Whether section picking lives in `writing-search.ts` or its own module.
- How headings are normalised for note keys (e.g. trimming ` `, Markdown emphasis).
- Colophon copy describing the tree (must not quote numbers no script produced).
