import { createHash } from "crypto";
import { RunTree, type Client } from "langsmith";
import { MODEL, type InputMessage, type LoopObserver, type TraceSpan, type TraceStep } from "@/lib/copilot-loop";

// ---------------------------------------------------------------------------
// LangSmith tracing for /api/chat. On by default whenever a LangSmith API key
// is set (COPILOT_TRACING_ENABLED=false turns it off; see route.ts), and
// FULL TEXT: visitor messages, the system prompt, search queries, article
// text returned to the model, and the answer. One trace per chat request:
//
//   copilot-chat (chain)
//   ├─ gpt round 1 (llm)            input items, offered tools → text, function calls
//   ├─ search_writing (tool)        arguments → result, Jev fallback/chosen
//   │  ├─ jev filter (noul)         query, catalog size → shortlist + relevance
//   │  └─ jev rank (score)          shortlist → every stage-2 score
//   ├─ show_on_page (tool)
//   └─ gpt round 2 (llm) …          a retry's runs are prefixed "retry ·"
//
// Nothing here may affect the reply: every LangSmith call is caught, and
// child runs are posted and patched in order per run.
// ---------------------------------------------------------------------------

type KV = Record<string, unknown>;

const errorText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class ChatTrace {
  private pending: Promise<unknown>[] = [];
  private attempts = 0;

  private constructor(private readonly root: RunTree) {}

  /**
   * Starts the request's root run. Returns null only if the run can't be
   * built; a failed upload is logged by LangSmith itself and just means a
   * missing trace, never a broken reply.
   */
  static async start(client: Client, input: InputMessage[]): Promise<ChatTrace | null> {
    try {
      const root = new RunTree({
        name: "copilot-chat",
        run_type: "chain",
        inputs: { messages: input },
        metadata: {
          model: MODEL,
          messageCount: input.length,
          // Groups identical conversations across traces.
          contentHash: createHash("sha256").update(input.map((m) => m.content).join("\n")).digest("hex"),
        },
        client,
      });
      await root.postRun();
      return new ChatTrace(root);
    } catch (err) {
      console.warn("copilot tracing: start failed:", errorText(err));
      return null;
    }
  }

  /** A fresh observer per attempt, so a retry's runs are labelled as such. */
  observer(): LoopObserver {
    const attempt = ++this.attempts;
    const prefix = attempt > 1 ? `retry${attempt > 2 ? ` ${attempt - 1}` : ""} · ` : "";
    return {
      roundStart: (round, input, offered) =>
        this.span(this.root, `${prefix}gpt round ${round + 1}`, "llm", { input, tools: offered }, {
          ls_provider: "openai",
          ls_model_name: MODEL,
        }),
      toolStart: (call) =>
        this.span(this.root, `${prefix}${call.name}`, "tool", { arguments: parseArgs(call.arguments), call_id: call.call_id }),
    };
  }

  private track(p: Promise<unknown>) {
    this.pending.push(p.catch((err) => console.warn("copilot tracing: run update failed:", errorText(err))));
  }

  private span(parent: RunTree, name: string, run_type: string, inputs: KV, metadata?: KV): TraceSpan {
    const child = parent.createChild({ name, run_type, inputs, ...(metadata && { metadata }) });
    const posted = child.postRun();
    this.track(posted);
    const annotations: KV = {};
    let ended = false;
    const finish = (outputs?: KV, error?: string) => {
      if (ended) return;
      ended = true;
      this.track(posted.then(() => child.end({ ...outputs, ...annotations }, error)).then(() => child.patchRun()));
    };
    return {
      annotate: (data) => Object.assign(annotations, data),
      step: (stepName: string, step: TraceStep) => {
        const sub = child.createChild({
          name: stepName,
          run_type: "tool",
          inputs: step.inputs ?? {},
          start_time: step.startTime,
        });
        // A finished step: post it once the parent exists, then close it at its real end time.
        this.track(
          posted
            .then(() => sub.postRun())
            .then(() => sub.end(step.outputs ?? {}, step.error, step.endTime))
            .then(() => sub.patchRun())
        );
      },
      end: (outputs) => finish(outputs),
      fail: (err) => finish(undefined, errorText(err)),
    };
  }

  /** Closes the root run and waits for every child update, then the caller flushes the client. */
  async finish(outputs: KV, error?: string): Promise<void> {
    try {
      await Promise.all(this.pending);
      await this.root.end(outputs, error);
      await this.root.patchRun();
    } catch (err) {
      console.warn("copilot tracing: finish failed:", errorText(err));
    }
  }
}
