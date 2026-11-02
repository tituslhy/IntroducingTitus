# Drawer plan: rebuild the copilot as a LangChain agent

**Status:** planned, not started · **Owner:** Titus (building locally)
**Unblocks:** [`search-my-writing.md`](./search-my-writing.md) (`search_writing` becomes a tool)
**Can ship before Jev access:** yes. Port `show_on_page` first, add `search_writing` later.

---

## Why

`/api/chat` is already a small agent: `show_on_page` runs through a
hand-rolled loop in `rawCopilotStream`. That loop is hard-wired to exactly
two rounds and one tool (round two withholds `show_on_page`; it uses
`previous_response_id` chaining). `search_writing` needs a real loop: the
model decides when to search, can search and point at the page in the same
step, and stops within a budget.

Generalising the loop by hand means writing a tool registry, a step limit,
per-tool limits, and tracing. **LangChain's `createAgent`** ships all of that,
and it's the stack on my CV, so the copilot's own runtime becomes evidence of it.

### Honest trade-off

- **It saves loop code, not all code.** The ~110-line loop + tool parsing
  shrinks to ~40 lines. What stays custom either way: request guards
  (`lib/api-guards.ts`), input caps, the NDJSON protocol the drawer speaks,
  the output cap, and the prompt builder. The real wins are **extensibility**
  (a new tool is one `tool()` call) and **observability** (LangSmith traces of
  every model/tool step, which this project already uses).
- **Cost:** four new runtime deps (server-only), a rewrite of the chat route
  tests (they mock `openai` directly today), and one more abstraction over
  the Responses API.
- **Not everything moves.** `/api/fit` is one structured-output call with no
  tools, so it stays on the plain `openai` SDK. No agent where a function will do.

Alternatives considered: the **Vercel AI SDK** (`streamText` + `tools` +
step limits) is the least code in Next.js but brings its own client stream
protocol. The **OpenAI Agents SDK** is closest to today's Responses API calls.
LangChain wins on CV fit + LangSmith, not on line count.

---

## Versions (checked on npm, Nov 2026)

`langchain` 1.6.0 · `@langchain/core` 1.3.2 · `@langchain/openai` 1.8.0 ·
`@langchain/langgraph` 1.6.0 (transitive) · `zod` 4.x. Pin exact versions;
this ecosystem moves fast.

**Verified against the packages' type definitions:**
- `createAgent({ model, tools, systemPrompt, middleware })` from `langchain`
- `tool(fn, { name, description, schema })` from `langchain`
- Tool functions get `(input, runtime)`, where **`runtime: ToolRuntime`** =
  `RunnableConfig & { toolCallId, writer, … }`. So `runtime.writer?.(…)`
  emits custom stream events, and `runtime.signal` cancels downstream calls.
  *(Older tutorials show `config.writer`; in core 1.3 it's the runtime.)*
- Stream modes include `"messages"` and `"custom"`. The agent's graph nodes are
  named **`model_request`** and **`tools`**.
- Built-in middleware: `toolCallLimitMiddleware({ toolName, runLimit, exitBehavior: "continue" | "error" | "end" })`
  and `modelCallLimitMiddleware({ runLimit, exitBehavior: "end" | "error" })`.
- `ChatOpenAI` options include `useResponsesApi` and `zdrEnabled`
  (zero-data-retention mode, i.e. don't store responses upstream).
- `AIMessageChunk` has a `.text` getter, which is safer than `.content` with
  Responses-API content blocks.

---

## Design

### Shape

```
POST /api/chat
  guards (origin, rate limit, caps)            ← unchanged, lib/api-guards.ts
  agent = createCopilotAgent(request context)  ← new, lib/copilot-agent.ts
    model:  ChatOpenAI(gpt-6-luna, Responses API, ZDR, no retries)
    tools:  show_on_page, search_writing
    limits: ≤4 model calls, search_writing ≤2, show_on_page ≤1 per reply
  stream adapter: LangGraph stream → existing NDJSON events
     messages (node "model_request") → { type: "delta", text }
     custom  { type: "action" }       → { type: "action", target }
     custom  { type: "source" }       → { type: "source", n, title, url, relevance, score }
```

The drawer (`CopilotBubble`) keeps speaking the same NDJSON protocol, so
apart from rendering `source` events, the client doesn't change.

### `lib/copilot-agent.ts` (sketch)

Tools are built **per request** (a factory), so per-reply state like the
footnote counter lives in a closure and nothing leaks between visitors.

```ts
import { createAgent, tool, toolCallLimitMiddleware, modelCallLimitMiddleware } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import * as z from "zod";
import { PAGE_TARGET_IDS } from "@/lib/profile";
import { searchMyWriting } from "@/lib/writing-search"; // Jev filter → rank → read

export function createCopilotAgent(systemPrompt: string) {
  let footnote = 0;

  const showOnPage = tool(
    async ({ target }, runtime) => {
      runtime.writer?.({ type: "action", target });
      return JSON.stringify({ shown: target });
    },
    {
      name: "show_on_page",
      description:
        "Scroll the visitor's page to the entry your answer is about and briefly highlight it. At most once per answer.",
      schema: z.object({ target: z.enum(PAGE_TARGET_IDS as [string, ...string[]]) }),
    }
  );

  const searchWriting = tool(
    async ({ query }, runtime) => {
      const articles = await searchMyWriting(query, runtime.signal); // ≤2, may be []
      const numbered = articles.map((a) => ({ ...a, n: ++footnote }));
      for (const a of numbered) {
        runtime.writer?.({ type: "source", n: a.n, title: a.title, url: a.url, relevance: a.relevance, score: a.score });
      }
      return JSON.stringify(
        numbered.length
          ? { articles: numbered.map(({ n, title, url, body }) => ({ n, title, url, body })) }
          : { articles: [], note: "No article of mine covers this." }
      );
    },
    {
      name: "search_writing",
      description:
        "Find and read my own articles on a topic. Use it before answering anything about my writing or my views on a technical topic. Cite results as [n].",
      schema: z.object({
        query: z
          .string()
          .describe("A standalone search query. Resolve references like 'that one' from the conversation."),
      }),
    }
  );

  return createAgent({
    model: new ChatOpenAI({ model: "gpt-6-luna", useResponsesApi: true, zdrEnabled: true, maxRetries: 0 }),
    tools: [showOnPage, searchWriting],
    systemPrompt,
    middleware: [
      modelCallLimitMiddleware({ runLimit: 4, exitBehavior: "end" }),
      toolCallLimitMiddleware({ toolName: "search_writing", runLimit: 2, exitBehavior: "continue" }),
      toolCallLimitMiddleware({ toolName: "show_on_page", runLimit: 1, exitBehavior: "continue" }),
    ],
  });
}
```

Notes:
- **Validation still happens server-side.** `z.enum(PAGE_TARGET_IDS)` rejects
  unknown anchors before the tool body runs. `searchMyWriting` only returns
  known slugs (see the writing plan).
- **The agent writes the search query.** It resolves "tell me more about that
  one" into a standalone query, so the Jev router no longer needs raw
  conversation turns.
- **Parallel tool calls:** for "what have you written about guardrails, and
  where did you use them?", the model can call `search_writing` and
  `show_on_page` in the *same* step. That's one extra round trip, not two.
  Mention it in the prompt.
- **`exitBehavior: "continue"`** on tool limits: an over-limit tool call gets
  an error result and the model carries on answering, instead of the reply
  dying.

### Stream adapter (in `route.ts`)

```ts
const agent = createCopilotAgent(getSystemPrompt());
const stream = await agent.stream(
  { messages: trimmedMessages },                // role/content pairs, as today
  { streamMode: ["messages", "custom"], signal: controller.signal, recursionLimit: 12 }
);

for await (const [mode, chunk] of stream) {
  if (mode === "custom") {
    emit(validateCustomEvent(chunk));           // action / source, re-checked
  } else {
    const [message, meta] = chunk;
    if (meta.langgraph_node === "model_request" && message.text) {
      emitDelta(message.text);                  // MAX_OUTPUT_CHARS cap → controller.abort()
    }
  }
}
```

**Keep from today's route:** the guards, input caps, `MAX_OUTPUT_CHARS`
(abort on overflow), the overall timeout via `AbortController`, structured
logging (add `toolCalls` and `searches`), and error-code mapping. *Verify:*
the exact `[mode, chunk]` tuple shape when passing multiple stream modes, and
how `ChatOpenAI` surfaces `OpenAI.APIError` status codes (for
`ERR_RATE_LIMIT` / `ERR_QUOTA` / `ERR_AUTH`).

**Drop:** `previous_response_id` chaining (the agent resends the message list
each step; at ~8–14k tokens that's fine, and the static system prompt keeps
the prefix cacheable), the two-round special case, and the hand-written
retry-before-first-token. Keep `maxRetries: 0` and let the client's
friendly error handle failures. Simpler beats clever here.

### Prompt changes (`copilot-system-prompt.md`)

- "Showing Things on the Page" stays, since `show_on_page` is unchanged.
- New "Searching My Writing" section: call `search_writing` before answering
  questions about my articles or my views on a technical topic. Cite `[n]`.
  If it returns nothing, say I haven't written about it. Never invent titles.
  You may call `search_writing` and `show_on_page` in the same step.
- Remove the web-search paragraph and `web_search_preview`.

---

## Tracing and privacy (don't regress this)

Today tracing is **opt-in** (`COPILOT_TRACING_ENABLED`) and records only
hashes and lengths, never visitor text. LangChain's automatic LangSmith tracing
would send **raw messages** the moment `LANGSMITH_TRACING=true` is set. Keep the
same stance:

- Tracing stays off unless explicitly enabled.
- When enabled, hide inputs and outputs (LangSmith supports
  `LANGSMITH_HIDE_INPUTS=true` / `LANGSMITH_HIDE_OUTPUTS=true`; *verify the
  current env names*), so traces show the **shape** of each run: steps, tools
  called, latencies, token counts. That's the useful part for the colophon
  page anyway.
- Remove the manual `RunTree` code from the route once auto-tracing covers it.

---

## Testing

- **Dependency injection:** `createCopilotAgent(systemPrompt, { model })`
  accepts a model override, so tests pass a fake tool-calling chat model
  instead of mocking `openai`.
- **Rewrite the route tests** around the adapter: deltas stream in order;
  `action`/`source` custom events map to NDJSON; unknown targets are rejected
  by the schema; output cap aborts; timeout → error event; API errors map to
  codes; tool limits stop runaway loops.
- **Tool tests in isolation:** call `showOnPage.invoke(...)` /
  `searchWriting.invoke(...)` with a fake `writer` and assert emitted events.
- Keep the existing guard tests (they target `lib/api-guards.ts`).

---

## Migration order

1. Add deps (pinned) and `lib/copilot-agent.ts` with **only `show_on_page`**.
2. Swap the route's loop for `agent.stream` + the adapter. Same NDJSON out,
   so the drawer is untouched.
3. Rewrite route tests; run the browser check (page glides to Illumina, link
   under the reply, mobile tap). It must behave exactly like today.
4. Tracing: opt-in + hidden I/O; remove the manual `RunTree`.
5. Ship. Then add `search_writing` per the writing plan.

## Checklist

- [ ] Pin `langchain`, `@langchain/core`, `@langchain/openai`, `zod`
- [ ] `lib/copilot-agent.ts`: factory, `show_on_page` tool, limits middleware, model DI
- [ ] Route: `agent.stream` + NDJSON adapter; keep guards/caps/timeout/logging; drop the two-round loop
- [ ] Verify the multi-mode stream tuple shape + APIError mapping through `ChatOpenAI`
- [ ] Tracing opt-in with hidden inputs/outputs; remove manual `RunTree`
- [ ] Rewrite chat route tests with a fake model; tool unit tests with a fake writer
- [ ] Browser parity check (desktop glide + spotlight, mobile tap-to-scroll)
- [ ] Then: `search_writing` tool (see `search-my-writing.md`)
