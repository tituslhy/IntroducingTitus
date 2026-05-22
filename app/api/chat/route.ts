import { NextRequest } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { Client as LangSmithClient, RunTree } from "langsmith";

const lsClient = new LangSmithClient({ manualFlushMode: true });

let systemPromptCache: string | null = null;

function getSystemPrompt(): string {
  if (process.env.NODE_ENV !== "production") {
    return readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8");
  }
  if (!systemPromptCache) {
    systemPromptCache = readFileSync(
      join(process.cwd(), "copilot-system-prompt.md"),
      "utf-8"
    );
  }
  return systemPromptCache;
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

  const VALID_ROLES = new Set(["user", "assistant"]);
  const MAX_MESSAGES = 20;
  const MAX_CONTENT_LENGTH = 4000;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array is required", { status: 400 });
  }

  for (const m of messages) {
    if (!VALID_ROLES.has(m.role)) {
      return new Response("Invalid message role", { status: 400 });
    }
    if (typeof m.content !== "string") {
      return new Response("Message content must be a string", { status: 400 });
    }
    if (m.content.length > MAX_CONTENT_LENGTH) {
      return new Response("Message content too long", { status: 400 });
    }
  }

  const trimmedMessages = messages.slice(-MAX_MESSAGES);

  const openai = new OpenAI({ apiKey });

  const input: InputMessage[] = [
    { role: "system", content: getSystemPrompt() },
    ...trimmedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let contentStreamed = false;
      const responseChunks: string[] = [];

      const drain = async (gen: AsyncIterable<string>, collect = false) => {
        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(chunk));
          if (collect) responseChunks.push(chunk);
          contentStreamed = true;
        }
      };

      const rt = new RunTree({
        name: "copilot-chat",
        run_type: "chain",
        inputs: { messages: trimmedMessages },
        client: lsClient,
      });
      await rt.postRun();

      try {
        await drain(rawCopilotStream(openai, input), true);
        rt.end({ outputs: { response: responseChunks.join("") } });
      } catch (err) {
        rt.end({ error: String(err) });
        if (err instanceof OpenAI.APIError) {
          controller.enqueue(encoder.encode(toErrorSentinel(err)));
        } else if (!contentStreamed) {
          try {
            await drain(rawCopilotStream(openai, input));
          } catch (retryErr) {
            controller.enqueue(encoder.encode(toErrorSentinel(retryErr)));
          }
        }
      } finally {
        try {
          await rt.patchRun();
          await lsClient.flush();
        } catch {
          // LangSmith failure must not affect the response
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
