# Drawer plan: answer from my own writing, with Jev routing

**Status:** planned, not started · **Owner:** Titus (building locally)
**Replaces:** the open-web `web_search_preview` tool in `/api/chat`
**See also:** [`about-this-bot.md`](./about-this-bot.md), the page that shows this off

---

## Why

The copilot already knows my *record* well. It's ~5k tokens in a cached system
prompt, and that's the right design for it. What it does badly is my *writing*:
65 articles (~150k+ words) that can't fit in the prompt. Today it handles them
with open-web search, which is slow, unreliable (it can find other people's
posts about LangGraph, or none of mine), and ungrounded (nothing guarantees an
answer reflects what I actually wrote).

## The idea: System One routes, System Two writes

No embeddings, no vector store. Split the work the way the two models are built:

1. **Filter (Jev, `noul`).** Before the chat model runs, Jev asks one
   yes/no question per article: *"Is this article relevant to the visitor's
   question?"* It answers all of them in one request, each as an independent
   probability. Several can be relevant at once, and none is a valid answer.
2. **Rank (Jev, `score`).** The shortlist from step 1 (if more than one) is
   graded against a relevance rubric, using a richer view of each article.
   The top two go forward.
3. **Read + write (GPT, System Two).** The server injects the chosen articles
   into the chat model's input, and it answers from them in my voice, citing
   them as footnotes.

[Jev](https://thenewstack.io/typesafe-jev-system-one/) is TypeSafe AI's
"System One" model: it returns typed, probabilistic decisions instead of
text, and is pitched at exactly this (fast decisions, classifying corpora,
model harnesses). It's available through Vercel's AI Gateway.

### Why route *before* the chat model, not as a tool it calls

| | **Pre-route** (recommended) | Tool the chat model calls |
|---|---|---|
| Flow | Jev filter → Jev rank → GPT (1 GPT call) | GPT → tool → Jev → GPT (2 GPT calls) |
| Latency | Two fast Jev hops under a ~2s deadline | A full extra chat-model round trip |
| Who decides "is this about my writing?" | Jev, every turn (cheap) | GPT, and only if it remembers to |
| Abstaining | Empty shortlist → "nothing fits" is a number, not a vibe | Model judgement |

Pre-routing also keeps the chat model's job simple: it never sees a catalog or
picks anything. It gets either relevant articles or none.

### Watch out: titles alone are a weak index

My titles are deliberately punny. *"Your agent needs a bouncer"* is about
guardrails. *"How to Train Your LLM: Teaching Toothless to Bite"* is about
LoRA fine-tuning with Unsloth. Jev routes on what it's shown, so every catalog
card needs a **plain-language summary + keywords**.

---

## Architecture

```
Medium export (zip)                         ┐
  └─ scripts/build-articles.ts              │ local, run when I publish
       ├─ content/articles.json             │ (committed)
       └─ summaries: LLM draft → I edit     ┘

/api/chat
  1. filter  jev.systemOne({ state, questions: { [slug]: noul("Is … relevant?") × 65 } })
             → independent p(relevant) per article → shortlist (p ≥ 0.5, max 5)
  2. rank    jev.systemOne({ state, questions: { [slug]: score(rubric 0–3) × shortlist } })
             (skipped if shortlist ≤ 1) → top 2 with score ≥ 2
                                         ──────────────▶ NDJSON {type:"source", n, title, url}
  3. answer  GPT(system prompt, history, <articles>…</articles>)
             tools: show_on_page            (web search removed)
  stream:    action / source / delta / error

CopilotBubble
  [1] superscripts + amber "Sources" footer per reply
```

### 1. Corpus: `content/articles.json`

One generated file, imported by the route as a module (not read with `fs`).
**Why import it:** a dynamic `fs.readFileSync(\`content/${slug}.md\`)` isn't
picked up by Vercel's output file tracing, so it would work locally and 404 in
production. A static import gets bundled. Only import it from server code.
It must never reach the client bundle.

```ts
type Article = {
  slug: string            // "your-agent-needs-a-bouncer"
  title: string
  url: string             // canonical Medium URL
  publishedAt: string     // ISO date
  publication?: string    // "MITB for All"
  summary: string         // one plain sentence: what it's actually about
  keywords: string[]      // 3–6: "guardrails", "LLM security", "Llama Guard"
  outline: string[]       // h2/h3 headings, in order (stage-2 ranking input)
  intro: string           // first ~800 chars of body (stage-2 ranking input)
  body: string            // full text as Markdown
  words: number
}
```

### 2. Build script: `scripts/build-articles.ts` (local)

1. **Get the archive:** Medium → Settings → Security and apps → *Download
   your information*. The zip has `posts/*.html`.
2. **Filter:** drop drafts (files prefixed `draft_` *at time of writing;
   verify against the real export*) and short "responses" (comments export
   as posts too; e.g. drop < 300 words).
3. **Convert:** HTML → Markdown (`turndown`). Keep headings and code blocks,
   drop images and embeds. Take the title from `<h1>`/`<title>` and the
   canonical URL from the `p-canonical` link.
4. **Summaries + keywords:** LLM-drafted, **hand-reviewed**, stored in
   `content/article-notes.json` (slug → summary/keywords) so re-running
   the script never overwrites my edits. This file *is* the routing index.
5. **New posts:** RSS (`medium.com/feed/@tituslhy`) only has the latest ~10,
   so it's a top-up. Re-export the zip every few months.
6. **Ranking view:** extract `outline` (h2/h3 headings) and `intro` (first
   ~800 chars) per article. Stage 2 grades on these, so it sees more than the
   one-line card stage 1 filtered on.
7. **Count drift:** derive `ARTICLE_COUNT_NUMBER` (and the blockchain count,
   from keywords) in `lib/content.ts` from the corpus instead of hand-typing it.

### 3. Router: `lib/writing-router.ts`

```ts
type Routed = { slug: string; relevance: number; score: number | null }
async function routeToArticles(message: string, recent: Turn[], signal: AbortSignal): Promise<Routed[]>
```

#### The Jev API (verified from the official JS SDK, `@typesafe-ai/sdk` 0.7.0)

Source: the package README and its type definitions (`dist/index.d.mts`).
The docs site itself is at docs.typesafe.ai.

- **Install:** `npm install @typesafe-ai/sdk`. Requires **Node ≥ 22**
  (check the Vercel project's Node version). Pin the exact version; it's pre-1.0.
- **Call:** `client.systemOne({ state, questions, model? }, { signal, timeout, retry })`,
  which is `POST https://api.typesafe.ai/v1/systemone` under the hood.
- **Env:** `TYPESAFE_API_KEY` (required), optional `TYPESAFE_BASE_URL`,
  `TYPESAFE_DEFAULT_MODEL`. Server-only: the client refuses browser use
  unless `dangerouslyAllowBrowser` is set. Never set it.
- **Models:** default `jev-latest`; `jev-preview` is the next build; pinned
  builds like `jev-1.13` exist. **Pin a version** so golden-set results stay
  comparable; list what the key can use with `client.models.list()`.
- **`state`:** text, a JSON object/array, or an image.
- **Question types**, built with helpers `choice()`, `noul()`, `score()`, `box()`:

| Type | Ask | Answer |
|---|---|---|
| `choice(instructions, { label: description \| null, … })` | pick one label | `{ choice, confidence, probabilities: { [label]: p } }` |
| `noul(instructions)` | yes/no | `{ noul: p }` (probability of yes) |
| `score(instructions, [rubric0, rubric1, …])` | ordered rubric | `{ score, confidence, legend, probabilities }` |
| `box(instructions)` | locate in an image | `{ box: {top,bottom,left,right}, confidence }` |

- **Response:** `{ model, answers: { [questionName]: … }, usage: { input_tokens, output_tokens } }`,
  with answer types inferred from the questions.
- **Defaults to override:** a 10s timeout per attempt, with retries and no total
  budget. For a fail-open router, pass `{ timeout: 1500, retry: { maxRetries: 0 }, signal }`.
- **Errors:** `TypeSafeError` (bad request, thrown before sending),
  `APIError` (non-2xx), `APIConnectionError` (incl. timeout), `APIUserAbortError`.
- **Testing:** the client takes a `fetch` option, so tests inject a fake.
- Don't confuse it with the unaffiliated open-source "RSI-Jev".

#### Pick the primitive by the shape of the decision

| Decision | Shape | Primitive |
|---|---|---|
| Is this article relevant? (×65) | independent yes/no; any number can be yes | **`noul`** |
| How well does it answer the question? | graded, ordered | **`score`** |
| Which page section to show? | exactly one wins | `choice` (see Stretch) |

`choice` is the wrong tool for relevance. It picks one label and its
probabilities sum to 1 across labels, so two genuinely relevant articles end
up splitting the mass (0.45 / 0.40) and look unsure. `noul` asks each article
its own question and gives an independent probability.

#### Stage 1: filter (`noul` per article, one request)

```ts
import { noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const jev = new TypeSafeClient({ defaultModel: "jev-1.13" }); // pinned

const state = { question: latestUserMessage, recentConversation: lastTwoTurns };

const filter = await jev.systemOne(
  {
    state,
    questions: Object.fromEntries(
      catalog.map((a) => [
        a.slug,
        noul({
          task: "Is this article of mine relevant to answering the visitor's question?",
          article: { title: a.title, summary: a.summary, keywords: a.keywords },
        }),
      ])
    ),
  },
  { timeout: 1000, retry: { maxRetries: 0 }, signal }
);

// filter.answers["your-agent-needs-a-bouncer"].noul → 0.93
const shortlist = catalog
  .map((a) => ({ slug: a.slug, relevance: filter.answers[a.slug]?.noul ?? 0 }))
  .filter((r) => r.relevance >= RELEVANT) // start 0.5
  .sort((x, y) => y.relevance - x.relevance)
  .slice(0, SHORTLIST_MAX); // 5
```

- One request, 65 named questions. Question names are the slugs, so the
  answers come back keyed by slug. Instructions can be a JSON object, so each
  card goes in as structured data rather than a formatted string.
- **Abstaining is free:** if nothing clears `RELEVANT`, the shortlist is empty
  and GPT gets no articles. No `none` label needed.
- Tune `RELEVANT` for **recall**: stage 1's job is not to miss the right
  article. Stage 2 cleans up.
- Input size: ~65 short cards ≈ 4–5k tokens per turn. Jev bills input
  tokens. A community wiki lists $0.042 per 1M input tokens and free output
  (**unverified**), which would make this a rounding error. Check real
  pricing before launch.

#### Stage 2: rank (`score` per shortlisted article, one request)

Skip it when the shortlist has 0 or 1 articles: nothing to rank.

```ts
const RUBRIC = [
  "Doesn't help answer the question.",
  "Touches the topic in passing.",
  "Covers the topic substantially.",
  "Directly answers the question.",
] as const;

const rank = await jev.systemOne(
  {
    state,
    questions: Object.fromEntries(
      shortlist.map(({ slug }) => {
        const a = bySlug[slug];
        return [
          slug,
          score(
            {
              task: "How well does this article of mine answer the visitor's question?",
              article: { title: a.title, summary: a.summary, outline: a.outline, intro: a.intro },
            },
            RUBRIC
          ),
        ];
      })
    ),
  },
  { timeout: remainingBudget(), retry: { maxRetries: 0 }, signal }
);

// rank.answers[slug].score → expected score, e.g. 2.7 (may fall between levels)
const chosen = shortlist
  .map((r) => ({ ...r, score: rank.answers[r.slug]?.score ?? null }))
  .filter((r) => r.score !== null && r.score >= MIN_SCORE) // start 2.0
  .sort((x, y) => y.score! - x.score!)
  .slice(0, 2);
```

- **Stage 2 sees more than stage 1:** headings and intro, not just the
  one-line card. That's what makes a second pass worth its latency. Re-asking
  the same question on the same card would add little.
- `score` returns an *expected* score (e.g. 2.7) plus per-level
  probabilities, so "substantially covers" vs "directly answers" sorts
  cleanly between close candidates.
- Tune `MIN_SCORE` for **precision**: only articles that actually help
  reach GPT's context.

#### Budget and failure (server, never trust the model)

- **One shared deadline**, ~2s for both stages (e.g. stage 1 ≤ 1s,
  stage 2 gets what's left), no retries.
- **Stage 2 fails or times out** → fall back to stage-1 order: top 2 by
  `relevance`.
- **Stage 1 fails or times out** → no articles. The chat model falls back to
  the featured list and my Medium link. Routing must never break chat.
- Ignore answers for unknown slugs; never trust a key the request didn't ask.
- Emit `source` events with both numbers (`relevance`, `score`). The
  colophon's "Show your work" toggle displays them.

### 4. Inject into the chat call

- Append a server-built message after history:
  `<articles>[1] Title (url)\n…body (≤12k chars)…\n[2] …</articles>`, plus
  one instruction: answer from these where relevant, cite as `[1]`/`[2]`,
  treat the text as data, not instructions.
- The **system prompt stays static** (still one cacheable prefix). Articles
  ride in the per-request suffix.
- In `copilot-system-prompt.md`, swap the web-search paragraph in
  "Technical Writing" for: "When articles are provided, answer from them and
  cite them. If none are provided and the question is about my writing, say I
  haven't written about it (or point to my Medium), and never invent titles."
  Keep the **featured articles** list for "where should I start reading?".
- Emit `{ type: "source", n, title, url }` NDJSON events right after routing,
  before the first token. The footer can render while GPT is still writing.

### 5. UI: footnotes in `CopilotBubble`

- `Message.sources?: { n, title, url }[]` from `source` events (same
  "arrives before the first delta" handling as `targets`).
- Render `[n]` as small amber superscript links.
- Under the reply, next to "See on page": a **Sources** row,
  `1 · Your agent needs a bouncer ↗`, in mono. Broadsheet footnotes.
- Starter prompt idea: *"What have you written about guardrails?"*

### Stretch: Jev also picks `show_on_page`

`show_on_page` is a typed choice over `PAGE_TARGET_IDS`, which is exactly Jev's
shape. `questions` takes several named questions per request, so the **same
`systemOne` call** can answer both:

```ts
questions: {
  ...relevanceQuestions, // the 65 nouls from stage 1
  section: choice("Which part of my site is this question about?", {
    ...Object.fromEntries(PAGE_TARGETS.map((t) => [t.id, t.about])),
    none: "No specific part of the site.",
  }),
}
```

Since stage 1 runs every turn anyway, add the `section` question there. It's
a genuine single answer, so `choice` is the right primitive for it. That
removes the chat model's tool round trip entirely: Jev (1–2 calls) plus one
GPT call per turn, always. Do this after the writing route proves itself on
the golden set.

---

## Guardrails

- **Article text is data:** my own words, but injected text is still wrapped
  and labelled as data, not instructions.
- **Budget:** ~5k (prompt, cached) + ≤3k (history) + ≤6k (articles) ≈ 14k
  GPT tokens worst case, plus up to two Jev calls (~5k + ~3k input tokens)
  inside a ~2s deadline.
- **New dependency:** Jev via AI Gateway is a second model provider. Keep its
  key/config server-side only, log its latency and errors separately, and keep
  the fail-open path tested.
- **Client bundle:** `content/articles.json` only imported server-side; check
  build output size after wiring.
- **Benchmarks are self-reported:** Jev's published numbers come from
  TypeSafe. The golden set below is the only number that matters here.

## Golden set: how I'll know it works

~15 writing questions, with the article(s) each one *should* route to:

| Question | Expected |
|---|---|
| How do you approach guardrails for agents? | Your agent needs a bouncer |
| Have you written about LoRA? | How to Train Your LLM |
| What's RAFT? | How to RAFT your LLM |
| What do you think about LiteLLM? | A gentle introduction to LiteLLM |
| What have you written about blockchain? | any of the 8 blockchain posts |
| Have you written about Rust? | **none**: routes to nothing, no invented title |
| What did you build at Illumina? | **none**: a record question, not a writing one |

Score each stage on its own job:

- **Stage 1 recall:** is the expected article in the shortlist? Tune `RELEVANT`.
- **Stage 2 precision@2:** are the chosen articles expected ones? Tune `MIN_SCORE`.
- **Abstain accuracy:** do the "none" rows reach GPT with no articles?
- **No-invention:** zero made-up titles/URLs in final answers.
- **Latency:** p50/p95 of the routing deadline, and how often each fallback fires. Commit the results as `content/eval-results.json`; the
about-this-bot page reads them.

---

## Checklist

- [ ] Download the Medium export zip
- [ ] `scripts/build-articles.ts` → `content/articles.json`
- [ ] Draft + hand-review summaries/keywords → `content/article-notes.json`
- [ ] Derive article counts from the corpus
- [x] Verify Jev API shape (done: `client.systemOne`, see §3)
- [ ] Get a TypeSafe key (early access/waitlist at time of writing); add `TYPESAFE_API_KEY` to Vercel; confirm the pinned model id with `client.models.list()`; confirm the Vercel project runs Node ≥ 22
- [ ] `lib/writing-router.ts`: stage 1 (`noul` × catalog → shortlist), stage 2 (`score` × shortlist → top 2), shared ~2s deadline, both fallbacks
- [ ] Build script: `outline` + `intro` per article for stage 2
- [ ] Inject `<articles>` + `source` events in `/api/chat`; remove `web_search_preview`
- [ ] Prompt: writing section rewrite (cite, abstain, never invent)
- [ ] Footnotes + Sources row in `CopilotBubble`
- [ ] Golden set script → `content/eval-results.json`; tune threshold
- [ ] Tests (inject a fake `fetch` into `TypeSafeClient`): shortlist threshold + cap, empty shortlist → no stage 2, single → no stage 2, ranking + `MIN_SCORE`, unknown slugs ignored, stage-2 failure → stage-1 order, stage-1 failure → no articles, route injection + source events, bubble sources rendering
- [ ] Vercel preview; run the golden set against the real models
