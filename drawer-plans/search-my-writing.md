# Drawer plan: answer from my own writing ("Jev-ing" the Medium archive)

**Status:** planned, not started · **Owner:** Titus (building locally)
**Replaces:** the open-web `web_search_preview` tool in `/api/chat`

---

## Why

The copilot already knows my *record* well. It's ~5k tokens in a cached system
prompt, and that's the right design for it. What it does badly is my *writing*:
65 articles (~150k+ words) that can't fit in the prompt. Today it handles them
with open-web search, which is slow, unreliable (it can find other people's
posts about LangGraph, or none of mine), and ungrounded (nothing guarantees an
answer reflects what I actually wrote).

## The idea: select, then read

No embeddings, no vector store. Two steps, the way a person uses a library:

1. **Select.** The model looks at a **catalog**: one compact card per
   article (title, a one-line summary, topic keywords) and picks the 1–2 most
   relevant.
2. **Read.** It reads those articles in full and answers from them, citing
   them as footnotes.

At 65 articles the catalog is ~3k tokens. That's small enough that the model
does the selecting itself, in the same call, with the whole catalog in view.
Embeddings would only beat this at hundreds of articles.

### Design decision: one tool, not a selector sub-agent

Two ways to build the "select" step:

| | A. Catalog in the prompt + `read_articles` (**recommended**) | B. `search_writing(query)` tool runs its own LLM call to pick articles |
|---|---|---|
| Model calls per writing question | 2 (pick + read → answer) | 3 (main → selector → main) |
| Latency | One tool round trip | Two, one of them a nested LLM call |
| Selection quality | Main model sees the whole conversation | Selector only sees the query string |
| Scales to | ~150–200 articles | Thousands (selector can page the catalog) |

Go with **A**. Revisit B only if the catalog outgrows the prompt.

### Watch out: titles alone are a weak index

My titles are deliberately punny. *"Your agent needs a bouncer"* is about
guardrails. *"How to Train Your LLM: Teaching Toothless to Bite"* is about
LoRA fine-tuning with Unsloth. Selecting by title alone will miss those. Every
catalog card needs a **plain-language summary + keywords**.

---

## Architecture

```
Medium export (zip)                     ┐
  └─ scripts/build-articles.ts          │ local, run when I publish
       ├─ content/articles.json         │ (committed)
       └─ summaries: LLM draft → I edit │
                                        ┘
/api/chat (route.ts)
  system prompt   += {{ARTICLE_CATALOG}}           (static → stays cached)
  tools            = show_on_page, read_articles   (web search removed)
  loop             = up to 3 rounds (was 2)
  stream events    += { type: "source", n, title, url }
CopilotBubble
  renders [1] markers + an amber "Sources" footer per reply
```

### 1. The corpus: `content/articles.json`

One generated file, imported by the route as a module (not read with `fs`).
**Why import it:** a dynamic `fs.readFileSync(\`content/${slug}.md\`)` isn't
picked up by Vercel's output file tracing, so it would work locally and 404 in
production. A static import gets bundled. ~1 MB of text is fine server-side.
Only ever import it from server code. It must never reach the client bundle.

```ts
type Article = {
  slug: string            // "your-agent-needs-a-bouncer"
  title: string
  url: string             // canonical Medium URL
  publishedAt: string     // ISO date
  publication?: string    // "MITB for All"
  summary: string         // one plain-language sentence: what it's actually about
  keywords: string[]      // 3–6: "guardrails", "LLM security", "Llama Guard"
  body: string            // full text as Markdown
  words: number
}
```

### 2. Build script: `scripts/build-articles.ts` (run locally)

1. **Get the archive:** Medium → Settings → Security and apps → *Download
   your information*. The zip has `posts/*.html`.
2. **Filter:** drop drafts (files prefixed `draft_` *at time of writing;
   verify against the actual export*) and short "responses" (comments are
   exported as posts too; e.g. drop < 300 words).
3. **Convert:** HTML → Markdown (`turndown`). Keep headings and code blocks,
   drop images and embeds. Take the title from `<h1>`/`<title>` and the
   canonical URL from the `p-canonical` link.
4. **Summaries + keywords:** generate a *draft* per article with an LLM, then
   **review by hand**. The catalog is the retrieval index; a vague summary
   means the article never gets picked. Store reviewed values in
   `content/article-notes.json` (slug → summary/keywords) so re-running the
   script never overwrites my edits.
5. **New posts:** the RSS feed (`medium.com/feed/@tituslhy`) only has the
   latest ~10, so it's a top-up, not a source of truth. Re-export the zip
   every few months, or add new posts by hand.
6. **Count drift:** the build script should print the article count. Then
   `ARTICLE_COUNT_NUMBER` in `lib/content.ts` can derive from
   `articles.length` instead of being hand-typed (and `BLOCKCHAIN_ARTICLE_COUNT`
   from keywords).

### 3. Prompt: `{{ARTICLE_CATALOG}}`

New token in `lib/copilot-prompt.ts`, rendered from `articles.json`:

```
- `your-agent-needs-a-bouncer` — Your agent needs a bouncer (2025) — Guardrails for agentic apps: input/output screening with Llama Guard. [guardrails, LLM security]
```

In `copilot-system-prompt.md`, replace the web-search instructions in
"Technical Writing" with:

- When a question touches something I've written about, call
  `read_articles` with the 1–2 most relevant slugs from the catalog **before**
  answering. Answer from what the article says, in my voice.
- Cite with `[1]`, `[2]` matching the order of articles read.
- If nothing in the catalog fits, say so. Don't guess at articles that don't
  exist. Point to my Medium profile instead.
- Keep the **featured articles** list: it still answers "where should I start
  reading?" without a tool call.

The catalog is static, so the whole system prompt stays one cacheable prefix.

### 4. Tool: `read_articles`

```ts
{
  type: "function",
  name: "read_articles",
  description: "Read up to 2 of my articles in full before answering a question about my writing.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      slugs: { type: "array", items: { type: "string", enum: ARTICLE_SLUGS } },
    },
    required: ["slugs"],
    additionalProperties: false,
  },
}
```

Server-side, never trusting model output (same pattern as `show_on_page`):
- Filter `slugs` to known slugs, dedupe, cap at **2**.
- Return `{ articles: [{ n, title, url, body }] }` with each `body` truncated
  to ~12k chars (~3k tokens). Worst case ~6k tokens per writing question.
- Emit `{ type: "source", n, title, url }` NDJSON events as soon as articles
  are read, so the footer can render before the text finishes.

### 5. Generalise the loop in `app/api/chat/route.ts`

Today `rawCopilotStream` is a fixed two-round loop that withholds
`show_on_page` in round 2. With a second tool it should become a small loop:

- Max **3** rounds (e.g. show_on_page + read_articles → answer).
- A tool registry: `{ name → handler(args) → { output, events[] } }`, so
  each tool validates its own args and emits its own client events.
- Last round is offered **no** function tools, so the loop always ends in an
  answer.
- Keep `previous_response_id` chaining. Keep the shared timeout, output cap,
  retry-before-first-token, and tracing (add `articlesRead` to the log line).

### 6. UI: footnotes in `CopilotBubble`

- `Message.sources?: { n, title, url }[]`, filled from `source` events (same
  "may arrive before the first delta" handling as `targets`).
- Render `[n]` in the Markdown as small amber superscripts linking to the source.
- Under the reply, next to "See on page": a **Sources** row of
  `1 · Your agent needs a bouncer ↗` links in mono. Broadsheet footnotes.
- Update the starter prompt *"Which article should I read first?"*. It still
  works via the featured list. Maybe add *"What have you written about
  guardrails?"* to show off retrieval.

---

## Guardrails

- **Untrusted text:** article bodies are my own words, but treat tool output
  as data, not instructions (the system prompt should say so).
- **Budget:** ~5k (prompt, cached) + ≤3k (history) + ≤6k (articles) ≈ 14k
  tokens worst case. Comfortable.
- **Latency:** writing questions gain one tool round trip, but lose the web
  search round trip they have today, so roughly a wash.
- **Client bundle:** `content/articles.json` must only be imported from
  `app/api/**` and `lib/` modules that the client never imports. Check the
  build output size after wiring it.

## How I'll know it's better: a small golden set

Before switching over, write ~15 writing questions with the article each one
*should* pull:

| Question | Expected article(s) |
|---|---|
| How do you approach guardrails for agents? | Your agent needs a bouncer |
| Have you written about LoRA? | How to Train Your LLM |
| What's RAFT? | How to RAFT your LLM |
| What do you think about LiteLLM? | A gentle introduction to LiteLLM |
| What have you written about blockchain? | (any of the 8 blockchain posts) |
| Have you written about Rust? | none: should say so, not invent one |

Score **selection hit rate** (did `read_articles` get an expected slug?) and
**no-invention** (zero made-up titles/URLs). Run it before/after
any catalog or prompt change.

---

## Checklist

- [ ] Download the Medium export zip
- [ ] `scripts/build-articles.ts`: parse, filter, convert → `content/articles.json`
- [ ] Draft summaries + keywords with an LLM; hand-review into `content/article-notes.json`
- [ ] Derive `ARTICLE_COUNT_NUMBER` (and blockchain count) from the corpus
- [ ] `{{ARTICLE_CATALOG}}` token + prompt section rewrite
- [ ] `read_articles` tool + validation + `source` events
- [ ] Generalise the route loop (tool registry, max 3 rounds)
- [ ] Footnote + Sources rendering in `CopilotBubble`
- [ ] Remove `web_search_preview`
- [ ] Golden set + tests (route: slug validation/cap/truncation, loop termination; prompt: catalog renders every article; bubble: sources render)
- [ ] Check client bundle size; deploy a Vercel preview and run the golden set against the real model
