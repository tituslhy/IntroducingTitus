# Drawer plan: generalise the copilot into a small agent loop

**Status:** planned, not started · **Owner:** Titus (building locally)
**Unblocks:** [`search-my-writing.md`](./search-my-writing.md) (`search_writing` becomes a tool)
**Can ship before Jev access:** yes. Move `show_on_page` onto the new loop first, add `search_writing` later.

---

## Why

`/api/chat` is already a small agent: `show_on_page` runs through a
hand-rolled loop in `rawCopilotStream`. But that loop is hard-wired to exactly
**two rounds and one tool** (round two withholds `show_on_page`).
`search_writing` needs a general loop: any number of registered tools,
parallel calls in one step, per-tool limits, and a guaranteed final answer.

## Decision: no framework

| Option | Loop code | New deps | Tool → drawer events | Existing route tests |
|---|---|---|---|---|
| **Generalised loop on the `openai` SDK** (chosen) | ~70 lines | none | first-class: a plain `emit()` | mostly survive (already mock `openai`) |
| Vercel AI SDK (`streamText` + tools) | ~30 lines | `ai`, `@ai-sdk/openai`, `zod` | map tool results off its stream | rewrite |
| OpenAI Agents SDK | ~40 lines | `@openai/agents` | via run context | rewrite |
| LangChain `createAgent` | ~40 lines | 4 packages | `runtime.writer` | rewrite |

At **two tools and ≤4 rounds**, the agent is one loop. Frameworks pay off
with many tools, persistent memory, branching graphs, or human-in-the-loop
steps. This copilot has none of those. The generalised loop keeps every
guarantee the current route already tests (caps, timeout, NDJSON, error
mapping) and adds no dependencies.

It's also on-message: my own prompt's engineering philosophy says *"Simple
before complex. I'll pick the boring architecture that ships over the clever
one that doesn't."* The colophon page can say so.

**Revisit if** the copilot grows past ~5 tools, needs memory across visits,
or needs branching or approval steps. Appendix A has a checked LangChain
version of this plan.

---

## Design

### Tool registry: `lib/copilot-tools.ts`

```ts
type Emit = (event: { type: "action"; target: string } | SourceEvent) => void;

interface CopilotTool<A> {
  /** Responses API function-tool definition (strict JSON schema). */
  definition: { type: "function"; name: string; description: string; strict: true; parameters: object };
  /** Max calls per reply; extra calls get an error result, the model carries on. */
  maxCallsPerReply: number;
  /** Validate the model's arguments. Return null to reject (never trust model output). */
  parse(raw: string): A | null;
  /** Do the work; emit drawer events; return what the model should see. */
  run(args: A, ctx: { emit: Emit; signal: AbortSignal }): Promise<unknown>;
}

export function createCopilotTools(): CopilotTool<any>[] // per request: closures hold the footnote counter
```

- **`show_on_page`:** today's `SHOW_ON_PAGE_TOOL` + `parseShowOnPageTarget`,
  moved here unchanged. `run` emits `{ type: "action", target }` and returns
  `{ shown: target }`. `maxCallsPerReply: 1`.
- **`search_writing`:** see `search-my-writing.md`. `run` calls
  `searchMyWriting(query, signal)`, numbers results, emits one `source` event
  each, and returns `{ articles: [...] }`. `maxCallsPerReply: 2`.
- Built **per request**, so per-reply state (the footnote counter, call
  counts) lives in closures and nothing leaks between visitors.

### The loop: `rawCopilotStream`, generalised

```ts
const MAX_ROUNDS = 4;

async function* copilotStream(openai, input, tools, signal): AsyncGenerator<CopilotChunk> {
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  const calls = new Map<string, number>();       // per-tool call counts
  const events: CopilotChunk[] = [];
  const emit: Emit = (e) => events.push({ kind: "event", event: e });

  let next: ResponseInput = input;
  let previousId: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const stream = await openai.responses.create(
      {
        model: MODEL,
        stream: true,
        input: next,
        previous_response_id: previousId,
        // The last round offers no tools, so the loop always ends in an answer.
        tools: lastRound ? [] : tools.map((t) => t.definition),
      },
      { signal }
    );

    const pending: FunctionCall[] = [];
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") yield { kind: "text", text: ev.delta };
      else if (ev.type === "response.created") previousId = ev.response.id;
      else if (ev.type === "response.output_item.done" && ev.item.type === "function_call") pending.push(ev.item);
    }
    if (pending.length === 0) return;             // the model answered: done

    // Run this step's calls in parallel (e.g. search_writing + show_on_page).
    next = await Promise.all(
      pending.map(async (call) => ({
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: JSON.stringify(await runCall(call, byName, calls, { emit, signal })),
      }))
    );
    yield* events.splice(0);                      // flush action/source events to the drawer
  }
}

async function runCall(call, byName, calls, ctx) {
  const tool = byName.get(call.name);
  if (!tool) return { error: "unknown tool" };
  const used = calls.get(call.name) ?? 0;
  if (used >= tool.maxCallsPerReply) return { error: "limit reached; answer with what you have" };
  calls.set(call.name, used + 1);
  const args = tool.parse(call.arguments);
  if (!args) return { error: "invalid arguments" };
  try {
    return await tool.run(args, ctx);
  } catch {
    return { error: "tool failed" };              // a broken tool never breaks the reply
  }
}
```

Notes:
- **Events flush after the step's tools finish.** For the scroll to start
  *during* a slow `search_writing`, have `emit` write straight to the stream
  controller instead of buffering (the generator can take an `onEvent`
  callback). Do whichever reads cleaner.
- **Parallel calls** are what keep a writing question at one extra round
  trip: the model can call `search_writing` and `show_on_page` together.
- **Ordering:** text deltas from a round stream live. If the model writes a
  preamble before calling tools, it streams first. Fine, and rare given the
  prompt.
- **`previous_response_id` stays** (as today). It relies on upstream storage
  (`store` defaults on). If that ever conflicts with privacy goals, switch to
  replaying output items with `store: false`.
- Everything around the loop stays as it is: `drain()`'s `MAX_OUTPUT_CHARS`
  cap, deduped `action` events (now ≤1 by `maxCallsPerReply`), the timeout
  controller, retry-before-first-token, error-code mapping, and logging (add
  `rounds`, `toolCalls`).

### NDJSON protocol

Unchanged, plus `source`: `delta` / `action` / `source` / `error`. The drawer
only needs the Sources rendering from the writing plan.

### Tracing

Keep today's opt-in, hash-only `RunTree`. Optionally add one child run per
tool call with **name, latency, and result size only**: never arguments or
article text. That's enough to draw the colophon's "anatomy of a reply" from
real timings.

---

## Testing

- **Existing route tests mostly survive.** They mock `openai.responses.create`
  with event streams, and today's `show_on_page` tests (action before text,
  invalid target dropped, round-two shape) map straight onto the general loop.
  Update the round-two assertion: a non-final round now offers all tools, and
  only the last round offers none.
- **New loop tests:** parallel calls in one step; per-tool limit returns an
  error result and the reply continues; unknown tool name; a tool that
  throws; `MAX_ROUNDS` reached → final round has no tools; events reach the
  stream.
- **Tool tests in isolation:** `parse` (valid, invalid, malformed JSON) and
  `run` with a fake `emit`.

## Migration order

1. Extract `show_on_page` into `lib/copilot-tools.ts` (registry shape).
2. Replace the two-round special case with the general loop.
3. Run the existing route tests, then the browser check (page glides to
   Illumina, link under the reply, mobile tap). It must behave exactly like
   today.
4. Ship. Then add `search_writing` per the writing plan.

## Checklist

- [ ] `lib/copilot-tools.ts`: `CopilotTool` interface + `show_on_page` moved in
- [ ] Generalise `rawCopilotStream`: tool registry, ≤4 rounds, no tools on the last round, parallel calls, per-tool limits, error-safe `runCall`
- [ ] Decide event timing: flush per step vs live `onEvent`
- [ ] Log `rounds` + `toolCalls`; optional per-tool child runs (name/latency/size only)
- [ ] Update round-two test assertion; add loop tests; tool unit tests
- [ ] Browser parity check (desktop glide + spotlight, mobile tap-to-scroll)
- [ ] Then: `search_writing` (see `search-my-writing.md`)

---

## Appendix A: the LangChain version (if I ever want it)

Checked against the published type definitions of `langchain` 1.6.0,
`@langchain/core` 1.3.2 and `@langchain/openai` 1.8.0 (Nov 2026):

- `createAgent({ model, tools, systemPrompt, middleware })` and `tool(fn, { name, description, schema })` from `langchain`.
- Tool functions get `(input, runtime)`, where `runtime: ToolRuntime` =
  `RunnableConfig & { toolCallId, writer, … }`. Custom events come from
  `runtime.writer?.(…)` (not `config.writer`, as older tutorials show), and
  cancellation from `runtime.signal`.
- `agent.stream(input, { streamMode: ["messages", "custom"], signal, recursionLimit })`.
  The graph's nodes are `model_request` and `tools`. Forward text where
  `meta.langgraph_node === "model_request"`, using `AIMessageChunk.text`.
- Limits: `modelCallLimitMiddleware({ runLimit, exitBehavior: "end" | "error" })`,
  `toolCallLimitMiddleware({ toolName, runLimit, exitBehavior: "continue" | "error" | "end" })`.
- `ChatOpenAI({ model, useResponsesApi: true, zdrEnabled: true, maxRetries: 0 })`.
- **Privacy trap:** LangChain's auto-tracing sends raw messages to LangSmith
  once `LANGSMITH_TRACING=true`. Keep it opt-in, with inputs/outputs hidden.
- Cost: 4 deps, a rewrite of the route tests (inject a fake chat model), and
  ~40 lines instead of ~70.

## Appendix B: Vercel AI SDK, briefly

`streamText({ model, tools, … })` with a step limit, reading `fullStream`
parts (text deltas, tool calls, tool results) and mapping tool results to
`action`/`source` events. Likely the least code of all. *Not verified against
current docs.* Check the step-limit API and tool-result stream parts before
choosing it.
