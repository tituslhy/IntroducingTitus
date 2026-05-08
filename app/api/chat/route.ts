import { NextRequest } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { traceable } from "langsmith/traceable";
import { Client as LangSmithClient } from "langsmith";

let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = readFileSync(
      join(process.cwd(), "copilot-system-prompt.md"),
      "utf-8"
    );
  }
  return systemPrompt;
}

type InputMessage = { role: "system" | "user" | "assistant"; content: string };

// Raw generator — used directly when LangSmith tracing is unavailable
async function* rawCopilotStream(openai: OpenAI, input: InputMessage[]) {
  const stream = await openai.responses.create({
    model: "gpt-5.4-nano",
    tools: [{ type: "web_search_preview" }],
    stream: true,
    input,
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

// Traced wrapper — preferred; falls back to rawCopilotStream on LangSmith errors
const streamCopilotResponse = traceable(rawCopilotStream, {
  name: "copilot-chat",
  run_type: "llm",
  metadata: { model: "gpt-5.4-nano" },
});

function toErrorSentinel(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return "__COPILOT_ERR__:ERR_RATE_LIMIT";
    if (error.status === 402) return "__COPILOT_ERR__:ERR_QUOTA";
    if (error.status === 401) return "__COPILOT_ERR__:ERR_AUTH";
  }
  return "__COPILOT_ERR__:ERR_UNKNOWN";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Service unavailable", { status: 503 });
  }

  let messages: { role: string; content: string }[];
  try {
    ({ messages } = await request.json());
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array is required", { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const input: InputMessage[] = [
    { role: "system", content: getSystemPrompt() },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let contentStreamed = false;

      const drain = async (gen: AsyncIterable<string>) => {
        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(chunk));
          contentStreamed = true;
        }
      };

      try {
        await drain(streamCopilotResponse(openai, input));
      } catch (err) {
        if (err instanceof OpenAI.APIError) {
          // OpenAI error — surface to client via sentinel
          controller.enqueue(encoder.encode(toErrorSentinel(err)));
        } else if (!contentStreamed) {
          // Non-OpenAI error (e.g. LangSmith rate limit) before any output —
          // retry without tracing so the user still gets a response
          console.warn("Traced stream failed before output, retrying untraced:", err);
          try {
            await drain(rawCopilotStream(openai, input));
          } catch (retryErr) {
            // Both traced and untraced failed — must be an OpenAI error on retry
            controller.enqueue(encoder.encode(toErrorSentinel(retryErr)));
          }
        }
        // If non-OpenAI error after partial content, the response is already
        // on its way to the client — just close cleanly.
      } finally {
        try {
          await new LangSmithClient().awaitPendingTraceBatches();
        } catch {
          // LangSmith flush failure must not affect the response
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
