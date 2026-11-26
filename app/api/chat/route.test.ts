/**
 * @jest-environment node
 */

// Setup mocks BEFORE any imports, especially before importing route.ts
jest.mock("langsmith", () => ({
  Client: jest.fn(function (this: unknown, _config: unknown) {
    return {
      postRun: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
    };
  }),
  RunTree: jest.fn(function (this: unknown, _config: unknown) {
    return {
      postRun: jest.fn().mockResolvedValue(undefined),
      patchRun: jest.fn().mockResolvedValue(undefined),
      end: jest.fn(),
    };
  }),
}));

jest.mock("openai", () => {
  const _create = jest.fn();
  class APIError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.name = "APIError";
      this.status = status;
    }
  }
  function MockOpenAI() {
    return { responses: { create: _create } };
  }
  (MockOpenAI as unknown as Record<string, unknown>).APIError = APIError;
  (MockOpenAI as unknown as Record<string, unknown>)._create = _create;
  return { __esModule: true, default: MockOpenAI };
});

jest.mock("fs", () => ({
  readFileSync: jest.fn(() => "You are Titus's copilot."),
}));

jest.mock("langsmith/traceable", () => ({
  traceable: (_fn: unknown) => _fn,
}));

// search_writing talks to Jev. Route tests drive it through this mock only.
jest.mock("@/lib/writing-search", () => ({
  PAGE_SIZE: 2,
  searchMyWriting: jest.fn(async () => []),
}));

// The trace upload is scheduled with after(). Capture the task so tests decide
// when it runs (and can make after() throw to exercise the fallback).
jest.mock("next/server", () => ({
  after: jest.fn(),
}));

// Tracing is covered by lib/copilot-tracing.test.ts; the route only needs to
// know whether a trace was started and what it was told.
jest.mock("@/lib/copilot-tracing", () => ({
  ChatTrace: { start: jest.fn(async () => null) },
}));

// Import after all mocks are set up
import { POST, isTracingEnabled } from "./route";
import { PAGE_TARGET_IDS } from "@/lib/profile";
import { MAX_PAGE_TARGETS } from "@/lib/copilot-tools";
import { ARTICLES } from "@/lib/articles";
import { formatPublished, mediumPostId } from "@/lib/citation-ledger";
import type { NextRequest } from "next/server";

// next/jest loads .env files, and tracing turns on whenever a LangSmith key is set.
// Clear the tracing env for every test here so no existing test traces by accident.
const TRACING_ENV = ["LANGSMITH_API_KEY", "LANGCHAIN_API_KEY", "COPILOT_TRACING_ENABLED"] as const;
const savedTracingEnv = Object.fromEntries(TRACING_ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of TRACING_ENV) delete process.env[k];
});

afterEach(() => {
  for (const k of TRACING_ENV) {
    if (savedTracingEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedTracingEnv[k];
  }
});

const OpenAIMock = jest.requireMock("openai").default as Record<string, unknown>;
const mockCreate: jest.Mock = OpenAIMock._create as jest.Mock;

let testCounter = 0;

function createPostRequest(
  body: string,
  additionalHeaders: Record<string, string> = {}
) {
  testCounter++;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `192.0.2.${testCounter}`,
      ...additionalHeaders,
    },
  });
}

async function makeStream(events: Array<{ type: string; delta?: string; [key: string]: unknown }>) {
  async function* generator() {
    for (const event of events) {
      yield event;
    }
  }
  return generator();
}

async function drainResponse(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("POST", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
  });

  it("should return 503 when openai api key is missing", async () => {
    // Arrange
    delete process.env.OPENAI_API_KEY;
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toEqual("Service unavailable");
  });

  it("should return 400 when request body is invalid json", async () => {
    // Arrange
    const request = createPostRequest("{invalid-json");

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Invalid request body");
  });

  it("should return 400 when messages array is empty", async () => {
    // Arrange
    const request = createPostRequest(JSON.stringify({ messages: [] }));

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Messages array is required");
  });

  it("should return 400 when messages is missing from body", async () => {
    // Arrange
    const request = createPostRequest(JSON.stringify({}));

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Messages array is required");
  });

  it("should return 400 when message has invalid role (system)", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "system", content: "Hello" }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Invalid message role");
  });

  it("should return 400 when message has invalid role (random string)", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "custom", content: "Hello" }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Invalid message role");
  });

  it("should return 400 when message content is not a string", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: 123 }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Message content must be a string");
  });

  it("should return 400 when message content is an array", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: ["hello"] }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Message content must be a string");
  });

  it("should return 400 when message content exceeds max length (4000 chars)", async () => {
    // Arrange
    const longContent = "a".repeat(4001);
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: longContent }] })
    );

    // Act
    const response = await POST(request as unknown as NextRequest);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Message content too long");
  });

  it("should accept message content at max length (4000 chars)", async () => {
    // Arrange
    const contentAt4000 = "a".repeat(4000);
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: contentAt4000 }] })
    );
    const events = [
      { type: "response.output_text.delta", delta: "Response" },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe("delta");
    expect(parsed.text).toBe("Response");
  });

  it("should trim messages to last 20 when more than 20 are provided", async () => {
    // Arrange
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    const request = createPostRequest(JSON.stringify({ messages }));
    const events = [
      { type: "response.output_text.delta", delta: "Response" },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    // Act
    const response = await POST(request as unknown as NextRequest);
    await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0];
    // The last 20 start at Message 5, a reply, so the window starts on the next visitor message:
    // system prompt, conversation context, then Message 6 to Message 24 (19 messages) = 21 total.
    expect(callArgs.input.length).toBe(21);
    expect(callArgs.input[0].role).toBe("system");
    expect(callArgs.input[1].role).toBe("system");
    expect(callArgs.input[2].content).toBe("Message 6");
    expect(callArgs.input[20].content).toBe("Message 24"); // last message
  });

  it("should stream response with correct headers and content on success", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Tell me about your experience" }] })
    );
    const events = [
      { type: "response.output_text.delta", delta: "Titus has " },
      { type: "response.output_text.delta", delta: "8+ years of AI experience." },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    // Response should be NDJSON — two delta events, newline-delimited
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);
    const event1 = JSON.parse(lines[0]);
    const event2 = JSON.parse(lines[1]);
    expect(event1).toEqual({ type: "delta", text: "Titus has " });
    expect(event2).toEqual({ type: "delta", text: "8+ years of AI experience." });
  });

  it("should return ERR_RATE_LIMIT error event when OpenAI returns 429 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate.mockRejectedValue(new ApiErrorCtor("Too many requests", 429));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_RATE_LIMIT" });
  });

  it("should return ERR_QUOTA error event when OpenAI returns 402 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate.mockRejectedValue(new ApiErrorCtor("Quota exceeded", 402));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_QUOTA" });
  });

  it("should return ERR_AUTH error event when OpenAI returns 401 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate.mockRejectedValue(new ApiErrorCtor("Unauthorized", 401));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_AUTH" });
  });

  it("should return ERR_UNKNOWN error event when OpenAI returns unknown error status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate.mockRejectedValue(new ApiErrorCtor("Server error", 500));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_UNKNOWN" });
  });

  it("should return ERR_UNKNOWN error event when non-OpenAI error is thrown on initial call", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new Error("Generic error without status"));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_UNKNOWN" });
  });

  it("should retry with untraced stream when non-OpenAI error occurs before any content", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const retryEvents = [
      { type: "response.output_text.delta", delta: "Retry successful" },
      { type: "response.done" },
    ];
    mockCreate
      .mockRejectedValueOnce(new Error("LangSmith rate limit"))
      .mockResolvedValueOnce(await makeStream(retryEvents));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "delta", text: "Retry successful" });
    // mockCreate should be called twice: once for traced, once for untraced retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should return error event when retry also fails with OpenAI error", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate
      .mockRejectedValueOnce(new Error("LangSmith down"))
      .mockRejectedValueOnce(new ApiErrorCtor("OpenAI error", 500));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "error", code: "ERR_UNKNOWN" });
  });

  it("should close stream cleanly when non-OpenAI error occurs after partial content", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );

    // Create an async generator that yields one chunk then throws
    async function* failingStream() {
      yield { type: "response.output_text.delta", delta: "Partial content" };
      throw new Error("Connection lost");
    }

    mockCreate.mockResolvedValue(failingStream());

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    // Only the partial content delta should be streamed, no error added after content started
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "delta", text: "Partial content" });
  });

  it("should include system prompt in the request to OpenAI with correct model", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const events = [
      { type: "response.output_text.delta", delta: "Response" },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    // Act
    const response = await POST(request as unknown as NextRequest);
    await drainResponse(response);

    // Assert
    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-6-luna");
    expect(callArgs.input).toBeDefined();
    expect(callArgs.input[0]).toEqual({
      role: "system",
      content: "You are Titus's copilot.",
    });
  });

  it("should offer show_on_page, search_writing, read_writing and show_card as function tools, and no hosted web search", async () => {
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const events = [
      { type: "response.output_text.delta", delta: "Response" },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    const response = await POST(request as unknown as NextRequest);
    await drainResponse(response);

    expect(mockCreate).toHaveBeenCalled();
    const tools = mockCreate.mock.calls[0][0].tools;
    expect(tools.map((t: { name?: string; type: string }) => t.name ?? t.type)).toEqual([
      "show_on_page",
      "search_writing",
      "read_writing",
      "show_card",
    ]);
    expect(tools).not.toContainEqual({ type: "web_search_preview" });
  });

  it("should offer show_on_page with exactly the page's anchor ids as targets", async () => {
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockResolvedValue(
      await makeStream([{ type: "response.output_text.delta", delta: "Hi" }, { type: "response.done" }])
    );

    const response = await POST(request as unknown as NextRequest);
    await drainResponse(response);

    const tool = mockCreate.mock.calls[0][0].tools.find(
      (t: { name?: string }) => t.name === "show_on_page"
    );
    expect(tool).toMatchObject({ type: "function", strict: true });
    expect(tool.parameters.properties.targets.items.enum).toEqual(PAGE_TARGET_IDS);
    // No function call happened, so there is no second round.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("should relay the first show_on_page target, then limit the second call in the same step", async () => {
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "What did you build at Illumina?" }] })
    );
    mockCreate
      .mockResolvedValueOnce(
        await makeStream([
          { type: "response.created", response: { id: "resp_1" } },
          {
            type: "response.output_item.done",
            item: { type: "function_call", name: "show_on_page", arguments: '{"targets":["role-illumina"]}', call_id: "call_1" },
          },
          {
            type: "response.output_item.done",
            item: { type: "function_call", name: "show_on_page", arguments: '{"targets":["role-nasa"]}', call_id: "call_2" },
          },
          { type: "response.done" },
        ])
      )
      .mockResolvedValueOnce(
        await makeStream([{ type: "response.output_text.delta", delta: "Solo, sixteen components." }, { type: "response.done" }])
      );

    const response = await POST(request as unknown as NextRequest);
    const lines = (await drainResponse(response)).split("\n").filter(Boolean).map((l) => JSON.parse(l));

    expect(lines[0]).toEqual({ type: "action", target: "role-illumina" });
    expect(lines.filter((l) => l.type === "action")).toHaveLength(1);
    expect(lines[1]).toEqual({ type: "delta", text: "Solo, sixteen components." });

    // Round two is not the final round, so all three function tools are still offered.
    // Tool results go back by previous_response_id.
    const followUp = mockCreate.mock.calls[1][0];
    expect(followUp.previous_response_id).toBe("resp_1");
    expect(followUp.tools.map((t: { name?: string }) => t.name)).toEqual([
      "show_on_page",
      "search_writing",
      "read_writing",
      "show_card",
    ]);
    // The per-reply budget is spent by the first call, so the second is refused as over-limit.
    expect(followUp.input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ shown: ["role-illumina"] }) },
      { type: "function_call_output", call_id: "call_2", output: JSON.stringify({ error: "limit reached; answer with what you have" }) },
    ]);
  });

  it("should handle messages with assistant role in input", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there" },
        ],
      })
    );
    const events = [
      { type: "response.output_text.delta", delta: "Response" },
      { type: "response.done" },
    ];
    mockCreate.mockResolvedValue(await makeStream(events));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({ type: "delta", text: "Response" });
    const callArgs = mockCreate.mock.calls[0][0];
    // system prompt + conversation context + user + assistant
    expect(callArgs.input.length).toBe(4);
    expect(callArgs.input[1].role).toBe("system");
    expect(callArgs.input[3].role).toBe("assistant");
  });

  it("should handle split error event across multiple read() chunks", async () => {
    // This test verifies the fix: an error event split across network chunks
    // is buffered on the client side and reconstructed properly.
    // For the server test, we just verify that the error is sent as NDJSON.
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    const ApiErrorCtor = OpenAIMock.APIError as unknown as new (
      msg: string,
      status: number
    ) => Error & { status: number };
    mockCreate.mockRejectedValue(new ApiErrorCtor("Too many requests", 429));

    // Act
    const response = await POST(request as unknown as NextRequest);
    const text = await drainResponse(response);

    // Assert - verify the error is properly formatted as a complete JSON line
    expect(response.status).toBe(200);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(1);
    // Verify it's valid JSON and has the expected structure
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe("error");
    expect(parsed.code).toBe("ERR_RATE_LIMIT");
  });
});

describe("POST - tool loop", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
  });

  type FakeEvent = Parameters<typeof makeStream>[0][number];

  const responseCreated = (id: string): FakeEvent => ({ type: "response.created", response: { id } });
  const responseDone: FakeEvent = { type: "response.done" };
  const outputText = (delta: string): FakeEvent => ({ type: "response.output_text.delta", delta });
  const functionCall = (call_id: string, name: string, args: string): FakeEvent => ({
    type: "response.output_item.done",
    item: { type: "function_call", name, arguments: args, call_id },
  });

  /** Queues one mocked OpenAI stream per round, in order. */
  async function queueRounds(...rounds: FakeEvent[][]) {
    for (const events of rounds) {
      mockCreate.mockResolvedValueOnce(await makeStream(events));
    }
  }

  function postChat() {
    return POST(
      createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })) as unknown as NextRequest
    );
  }

  function parseLines(ndjson: string): Array<Record<string, unknown>> {
    return ndjson.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  it("should return outputs for parallel calls in one step, in call order", async () => {
    await queueRounds(
      [
        responseCreated("resp_1"),
        functionCall("call_1", "show_on_page", '{"targets":["role-illumina"]}'),
        functionCall("call_2", "web_lookup", '{"query":"illumina"}'),
        responseDone,
      ],
      [outputText("Answer."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Answer." },
    ]);
    expect(mockCreate.mock.calls[1][0].input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ shown: ["role-illumina"] }) },
      { type: "function_call_output", call_id: "call_2", output: JSON.stringify({ error: "unknown tool" }) },
    ]);
  });

  it("should refuse a show_on_page call in a later round as over-limit and let the reply finish", async () => {
    await queueRounds(
      [
        responseCreated("resp_1"),
        functionCall("call_1", "show_on_page", '{"targets":["role-illumina"]}'),
        responseDone,
      ],
      [
        responseCreated("resp_2"),
        functionCall("call_2", "show_on_page", '{"targets":["role-mastercard"]}'),
        responseDone,
      ],
      [outputText("Answer without a second highlight."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Answer without a second highlight." },
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    // The budget is per reply, so round two still offers show_on_page but it is spent.
    expect(mockCreate.mock.calls[1][0].tools).toContainEqual(
      expect.objectContaining({ type: "function", name: "show_on_page" })
    );
    expect(mockCreate.mock.calls[2][0].previous_response_id).toBe("resp_2");
    expect(mockCreate.mock.calls[2][0].input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_2",
        output: JSON.stringify({ error: "limit reached; answer with what you have" }),
      },
    ]);
  });

  it("should relay each target of one show_on_page call as an action, in the order given", async () => {
    const targets = ["tool-tigergraph", "tool-neo4j", "role-illumina"];
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", JSON.stringify({ targets })), responseDone],
      [outputText("Graphs at Illumina."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "action", target: "tool-tigergraph" },
      { type: "action", target: "tool-neo4j" },
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Graphs at Illumina." },
    ]);
    expect(mockCreate.mock.calls[1][0].input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ shown: targets }) },
    ]);
  });

  it(`should relay at most MAX_PAGE_TARGETS (${MAX_PAGE_TARGETS}) actions from one call, the first ones in order`, async () => {
    const targets = PAGE_TARGET_IDS.slice(0, MAX_PAGE_TARGETS + 2);
    expect(targets).toHaveLength(MAX_PAGE_TARGETS + 2); // really more targets than the cap
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", JSON.stringify({ targets })), responseDone],
      [outputText("Answer."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));
    const actions = lines.filter((l) => l.type === "action");

    expect(MAX_PAGE_TARGETS).toBe(8);
    expect(actions).toEqual(targets.slice(0, MAX_PAGE_TARGETS).map((target) => ({ type: "action", target })));
    expect(mockCreate.mock.calls[1][0].input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_1",
        output: JSON.stringify({ shown: targets.slice(0, MAX_PAGE_TARGETS) }),
      },
    ]);
  });

  it("should return unknown tool for a call to a tool name that is not registered", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "delete_everything", "{}"), responseDone],
      [outputText("Carrying on."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([{ type: "delta", text: "Carrying on." }]);
    expect(mockCreate.mock.calls[1][0].input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ error: "unknown tool" }) },
    ]);
  });

  it.each([
    ["bad JSON", '{"target":'],
    ["a target outside the page's anchor ids", '{"targets":["role-nasa"]}'],
  ])("should return invalid arguments and relay no action for %s", async (_label, args) => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", args), responseDone],
      [outputText("Carrying on."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([{ type: "delta", text: "Carrying on." }]);
    expect(mockCreate.mock.calls[1][0].input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ error: "invalid arguments" }) },
    ]);
  });

  it("should spend a tool's budget on a malformed call, so a valid retry in the next round is refused", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", '{"target":'), responseDone],
      [
        responseCreated("resp_2"),
        functionCall("call_2", "show_on_page", '{"targets":["role-illumina"]}'),
        responseDone,
      ],
      [outputText("Answer."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([{ type: "delta", text: "Answer." }]);
    expect(mockCreate.mock.calls[2][0].input).toEqual([
      {
        type: "function_call_output",
        call_id: "call_2",
        output: JSON.stringify({ error: "limit reached; answer with what you have" }),
      },
    ]);
  });

  it("should withhold function tools on the fourth and final round and chain each round by previous_response_id", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", '{"targets":["role-illumina"]}'), responseDone],
      [responseCreated("resp_2"), functionCall("call_2", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_3"), functionCall("call_3", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_4"), outputText("Final answer."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Final answer." },
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(4);
    const requests = mockCreate.mock.calls.map((c) => c[0]);

    expect(requests[0].previous_response_id).toBeUndefined();
    expect(requests[1].previous_response_id).toBe("resp_1");
    expect(requests[2].previous_response_id).toBe("resp_2");
    expect(requests[3].previous_response_id).toBe("resp_3");
    expect(requests[3].input[0].call_id).toBe("call_3");

    for (const request of requests.slice(0, 3)) {
      expect(request.tools).toContainEqual(expect.objectContaining({ type: "function", name: "show_on_page" }));
    }
    // HOSTED_TOOLS is empty and no function tools are offered on the last round, so the key is omitted.
    expect(requests[3]).not.toHaveProperty("tools");
  });

  it("should never run a function call emitted on the final round, so no action is shown", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_2"), functionCall("call_2", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_3"), functionCall("call_3", "web_lookup", "{}"), responseDone],
      [
        responseCreated("resp_4"),
        functionCall("call_4", "show_on_page", '{"targets":["role-illumina"]}'),
        outputText("Done."),
        responseDone,
      ]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([{ type: "delta", text: "Done." }]);
    expect(lines.some((l) => l.type === "action")).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("should forward search_writing step and source events as NDJSON lines before the next round's text", async () => {
    const search = jest.requireMock("@/lib/writing-search").searchMyWriting as jest.Mock;
    search.mockResolvedValueOnce([
      {
        slug: "guardrails",
        title: "Your agent needs a bouncer",
        url: "https://medium.com/@tituslhy/guardrails",
        body: "Guardrails body",
        relevance: 0.9,
        score: 2.6,
      },
      {
        slug: "lora",
        title: "Teaching Toothless to Bite",
        url: "https://medium.com/@tituslhy/lora",
        body: "LoRA body",
        relevance: 0.8,
        score: null,
      },
    ]);
    await queueRounds(
      [
        responseCreated("resp_1"),
        functionCall("call_1", "search_writing", JSON.stringify({ topics: ["guardrails"] })),
        responseDone,
      ],
      [outputText("Yes, I wrote about it [1][2]."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "step", id: "call_1", tool: "search_writing", label: "Searching my writing for “guardrails”", done: false },
      {
        type: "source",
        n: 1,
        title: "Your agent needs a bouncer",
        url: "https://medium.com/@tituslhy/guardrails",
        relevance: 0.9,
        score: 2.6,
      },
      {
        type: "source",
        n: 2,
        title: "Teaching Toothless to Bite",
        url: "https://medium.com/@tituslhy/lora",
        relevance: 0.8,
        score: null,
      },
      { type: "step", id: "call_1", tool: "search_writing", label: "Searched my writing for “guardrails”", done: true },
      { type: "delta", text: "Yes, I wrote about it [1][2]." },
    ]);
    expect(search).toHaveBeenCalledWith("guardrails", expect.objectContaining({ onTrace: expect.any(Function) }));
    const output = JSON.parse(mockCreate.mock.calls[1][0].input[0].output);
    expect(output.articles.map((a: { n: number }) => a.n)).toEqual([1, 2]);
    expect(output.articles[0].sections[0].text).toBe("Guardrails body");
  });

  it("should forward a reasoning thought as a thought NDJSON line, and skip a summary with no headline", async () => {
    const reasoningDone = (text: string): FakeEvent => ({
      type: "response.reasoning_summary_part.done",
      part: { type: "summary_text", text },
    });
    await queueRounds([
      responseCreated("resp_1"),
      reasoningDone("**Checking your writing**\n\nI will look for guardrails posts."),
      reasoningDone("No headline in this one."),
      outputText("Answer."),
      responseDone,
    ]);

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "thought", text: "Checking your writing" },
      { type: "delta", text: "Answer." },
    ]);
  });

  it("reuses source numbers across a retry, so the drawer never sees two articles under one n", async () => {
    const search = jest.requireMock("@/lib/writing-search").searchMyWriting as jest.Mock;
    const guardrails = {
      slug: "guardrails",
      title: "Your agent needs a bouncer",
      url: "https://medium.com/@tituslhy/guardrails",
      body: "Guardrails body",
      relevance: 0.9,
      score: 2.6,
    };
    // One search per attempt; both return the same article.
    search.mockResolvedValueOnce([guardrails]).mockResolvedValueOnce([guardrails]);
    mockCreate
      .mockResolvedValueOnce(
        await makeStream([
          responseCreated("resp_1"),
          functionCall("call_1", "search_writing", JSON.stringify({ topics: ["guardrails"] })),
          responseDone,
        ])
      )
      // The first attempt fails before any text, so the route retries untraced.
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        await makeStream([
          responseCreated("resp_2"),
          functionCall("call_2", "search_writing", JSON.stringify({ topics: ["guardrails"] })),
          responseDone,
        ])
      )
      .mockResolvedValueOnce(await makeStream([outputText("Answer [1]."), responseDone]));

    const lines = parseLines(await drainResponse(await postChat()));

    const sources = lines.filter((l) => l.type === "source");
    const urlsByN = new Map<unknown, Set<unknown>>();
    for (const s of sources) {
      urlsByN.set(s.n, (urlsByN.get(s.n) ?? new Set()).add(s.url));
    }
    for (const urls of urlsByN.values()) {
      expect(urls.size).toBe(1);
    }
    expect(sources).toEqual([expect.objectContaining({ type: "source", n: 1, url: guardrails.url })]);
    expect(lines.at(-1)).toEqual({ type: "delta", text: "Answer [1]." });
    // The retry's search for the same article reused n=1, so the answer's [1] still points at it.
    const retryOutput = JSON.parse(mockCreate.mock.calls[3][0].input[0].output);
    expect(retryOutput.articles[0].n).toBe(1);
  });

  it("should never open a fifth request even if the model keeps calling tools", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_2"), functionCall("call_2", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_3"), functionCall("call_3", "web_lookup", "{}"), responseDone],
      [responseCreated("resp_4"), functionCall("call_4", "web_lookup", "{}"), responseDone]
    );

    const response = await postChat();
    await drainResponse(response);

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("should stream text, then the tool's action, then the next round's text, in that order", async () => {
    await queueRounds(
      [
        responseCreated("resp_1"),
        outputText("Checking. "),
        functionCall("call_1", "show_on_page", '{"targets":["role-illumina"]}'),
        responseDone,
      ],
      [outputText("Found it."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
      { type: "delta", text: "Checking. " },
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Found it." },
    ]);
  });

  it("should send tool failed to the model and still stream the reply when a tool throws", async () => {
    try {
      await jest.isolateModulesAsync(async () => {
        // Inject a tool whose run() always rejects. Isolated so the mock does not leak.
        jest.doMock("@/lib/copilot-tools", () => ({
          createCopilotTools: () => [
            {
              definition: {
                type: "function",
                name: "flaky_lookup",
                description: "Always fails.",
                strict: true,
                parameters: { type: "object", properties: {}, additionalProperties: false },
              },
              maxCallsPerReply: 1,
              parse: () => ({}),
              run: async () => {
                throw new Error("upstream exploded");
              },
            },
          ],
        }));

        const { POST: POSTIsolated } = await import("./route");
        const isolatedCreate = (jest.requireMock("openai").default as Record<string, unknown>)
          ._create as jest.Mock;
        isolatedCreate
          .mockResolvedValueOnce(
            await makeStream([
              responseCreated("resp_1"),
              functionCall("call_1", "flaky_lookup", "{}"),
              responseDone,
            ])
          )
          .mockResolvedValueOnce(await makeStream([outputText("Recovered."), responseDone]));

        const response = await POSTIsolated(
          createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })) as unknown as NextRequest
        );
        const lines = parseLines(await drainResponse(response));

        expect(response.status).toBe(200);
        expect(lines).toEqual([{ type: "delta", text: "Recovered." }]);
        expect(isolatedCreate).toHaveBeenCalledTimes(2);
        expect(isolatedCreate.mock.calls[1][0].input).toEqual([
          { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ error: "tool failed" }) },
        ]);
      });
    } finally {
      jest.dontMock("@/lib/copilot-tools");
    }
  });
});

describe("isTracingEnabled", () => {
  it.each([
    ["unset, no key", {}, false],
    ["unset, LangSmith key", { LANGSMITH_API_KEY: "lsv2" }, true],
    ["unset, LangChain key", { LANGCHAIN_API_KEY: "lsv2" }, true],
    ['"true", no key', { COPILOT_TRACING_ENABLED: "true" }, false],
    ['"true", LangSmith key', { COPILOT_TRACING_ENABLED: "true", LANGSMITH_API_KEY: "lsv2" }, true],
    ['"TRUE", LangSmith key', { COPILOT_TRACING_ENABLED: "TRUE", LANGSMITH_API_KEY: "lsv2" }, true],
    ['" off ", LangSmith key', { COPILOT_TRACING_ENABLED: " off ", LANGSMITH_API_KEY: "lsv2" }, false],
    ['"0", LangSmith key', { COPILOT_TRACING_ENABLED: "0", LANGSMITH_API_KEY: "lsv2" }, false],
    ['"no", LangSmith key', { COPILOT_TRACING_ENABLED: "no", LANGSMITH_API_KEY: "lsv2" }, false],
    ['"false", LangSmith key', { COPILOT_TRACING_ENABLED: "false", LANGSMITH_API_KEY: "lsv2" }, false],
    ['"FALSE", LangChain key', { COPILOT_TRACING_ENABLED: "FALSE", LANGCHAIN_API_KEY: "lsv2" }, false],
    ['"off", no key', { COPILOT_TRACING_ENABLED: "off" }, false],
  ])("%s → %s", (_label, env, expected) => {
    expect(isTracingEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe("POST - tracing", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  const startTrace = () => jest.requireMock("@/lib/copilot-tracing").ChatTrace.start as jest.Mock;
  const afterMock = () => jest.requireMock("next/server").after as jest.Mock;
  /** Runs every task scheduled with after() so far, as the platform would once the response has ended. */
  async function runAfter() {
    for (const [task] of afterMock().mock.calls) await task();
  }

  /** A stand-in for ChatTrace: its observer records nothing and finish is a spy. */
  function fakeTrace() {
    const span = () => ({ annotate() {}, step() {}, end() {}, fail() {} });
    const observer = { roundStart: jest.fn(span), toolStart: jest.fn(span) };
    const finish = jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => undefined);
    return { observer: jest.fn(() => observer), finish };
  }

  const plainAnswer = async () =>
    makeStream([
      { type: "response.created", response: { id: "resp_1" } },
      { type: "response.output_text.delta", delta: "Hello " },
      { type: "response.output_text.delta", delta: "there." },
      { type: "response.done" },
    ]);

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    mockCreate.mockReset();
    startTrace().mockReset();
    startTrace().mockResolvedValue(null);
    afterMock().mockClear();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
  });

  it("starts a trace only when a LangSmith key is set, and not when tracing is switched off", async () => {
    mockCreate.mockResolvedValue(await plainAnswer());
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest));
    expect(startTrace()).toHaveBeenCalledTimes(1);

    process.env.COPILOT_TRACING_ENABLED = "off";
    mockCreate.mockResolvedValue(await plainAnswer());
    await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest));
    expect(startTrace()).toHaveBeenCalledTimes(1);
  });

  it("streams exactly the same NDJSON with tracing on as with it off", async () => {
    const scenario = async () => {
      mockCreate
        .mockResolvedValueOnce(
          await makeStream([
            { type: "response.created", response: { id: "resp_1" } },
            {
              type: "response.output_item.done",
              item: { type: "function_call", name: "show_on_page", arguments: '{"targets":["role-illumina"]}', call_id: "c1" },
            },
            { type: "response.done" },
          ])
        )
        .mockResolvedValueOnce(await makeStream([{ type: "response.output_text.delta", delta: "Solo." }, { type: "response.done" }]));
      return drainResponse(
        await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Illumina?" }] })) as unknown as NextRequest)
      );
    };

    const off = await scenario();
    expect(startTrace()).not.toHaveBeenCalled();

    process.env.LANGSMITH_API_KEY = "lsv2-test";
    startTrace().mockResolvedValue(fakeTrace());
    const on = await scenario();

    expect(startTrace()).toHaveBeenCalledTimes(1);
    expect(on).toBe(off);
    expect(on.trim().split("\n").map((l) => JSON.parse(l))).toEqual([
      { type: "action", target: "role-illumina" },
      { type: "delta", text: "Solo." },
    ]);
  });

  it("finishes the trace with the answer, sources, rounds and tool calls", async () => {
    const search = jest.requireMock("@/lib/writing-search").searchMyWriting as jest.Mock;
    search.mockResolvedValueOnce([
      { slug: "guardrails", title: "Your agent needs a bouncer", url: "https://medium.com/@tituslhy/guardrails", body: "B", relevance: 0.9, score: 2.6 },
    ]);
    mockCreate
      .mockResolvedValueOnce(
        await makeStream([
          { type: "response.created", response: { id: "resp_1" } },
          {
            type: "response.output_item.done",
            item: { type: "function_call", name: "search_writing", arguments: '{"topics":["guardrails"]}', call_id: "c1" },
          },
          { type: "response.done" },
        ])
      )
      .mockResolvedValueOnce(await makeStream([{ type: "response.output_text.delta", delta: "Answer [1]." }, { type: "response.done" }]));
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    const trace = fakeTrace();
    startTrace().mockResolvedValue(trace);

    await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Guardrails?" }] })) as unknown as NextRequest));

    // The stream has already closed, but the upload has not run yet.
    expect(trace.finish).not.toHaveBeenCalled();
    await runAfter();
    expect(trace.finish).toHaveBeenCalledTimes(1);
    const [outputs, error] = trace.finish.mock.calls[0];
    expect(outputs).toMatchObject({
      answer: "Answer [1].",
      truncated: false,
      actionsShown: [],
      sources: [{ n: 1, title: "Your agent needs a bouncer", url: "https://medium.com/@tituslhy/guardrails" }],
      rounds: 2,
      toolCalls: 1,
    });
    expect(error).toBeUndefined();
  });

  it("records the first error on the trace when the retry also fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down")).mockRejectedValueOnce(new Error("still down"));
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    const trace = fakeTrace();
    startTrace().mockResolvedValue(trace);

    const text = await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest));

    expect(JSON.parse(text.trim())).toEqual({ type: "error", code: "ERR_UNKNOWN" });
    await runAfter();
    expect(trace.finish.mock.calls[0][1]).toBe("Error: network down; retry: Error: still down");
  });

  it("marks a retry that succeeds as recovered, with the first error kept on the trace", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(await makeStream([{ type: "response.output_text.delta", delta: "Retry ok." }, { type: "response.done" }]));
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    const trace = fakeTrace();
    startTrace().mockResolvedValue(trace);

    const text = await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest));

    expect(JSON.parse(text.trim())).toEqual({ type: "delta", text: "Retry ok." });
    await runAfter();
    const [outputs, error] = trace.finish.mock.calls[0];
    expect(outputs).toMatchObject({ answer: "Retry ok.", recoveredError: "Error: network down (recovered on retry)" });
    expect(error).toBeUndefined();
  });

  it("still streams normally when the trace could not be started", async () => {
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    startTrace().mockResolvedValue(null);
    mockCreate.mockResolvedValue(await plainAnswer());

    const response = await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest);
    const text = await drainResponse(response);

    expect(response.status).toBe(200);
    expect(text.trim().split("\n").map((l) => JSON.parse(l))).toEqual([
      { type: "delta", text: "Hello " },
      { type: "delta", text: "there." },
    ]);
  });

  it("still streams when ChatTrace.start rejects", async () => {
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    startTrace().mockRejectedValueOnce(new Error("trace start exploded"));
    mockCreate.mockResolvedValue(await plainAnswer());

    const text = await drainResponse(await POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest));

    expect(text.trim().split("\n").map((l) => JSON.parse(l))).toEqual([
      { type: "delta", text: "Hello " },
      { type: "delta", text: "there." },
    ]);
  });
});

describe("POST - trace upload after the response", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  const startTrace = () => jest.requireMock("@/lib/copilot-tracing").ChatTrace.start as jest.Mock;
  const afterMock = () => jest.requireMock("next/server").after as jest.Mock;
  const lsInstance = () => jest.requireMock("langsmith").Client.mock.results.at(-1)!.value as { flush: jest.Mock };

  function fakeTrace(finish = jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => undefined)) {
    const span = () => ({ annotate() {}, step() {}, end() {}, fail() {} });
    return { observer: jest.fn(() => ({ roundStart: jest.fn(span), toolStart: jest.fn(span) })), finish };
  }

  const request = () =>
    POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })) as unknown as NextRequest);

  async function plainAnswer() {
    return makeStream([
      { type: "response.created", response: { id: "resp_1" } },
      { type: "response.output_text.delta", delta: "Hello." },
      { type: "response.done" },
    ]);
  }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    mockCreate.mockReset();
    afterMock().mockClear();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    jest.useRealTimers();
    mockCreate.mockReset();
  });

  it("completes the response even when the trace upload never resolves", async () => {
    startTrace().mockResolvedValue(fakeTrace(jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(() => new Promise<undefined>(() => {}))));
    mockCreate.mockResolvedValue(await plainAnswer());

    const text = await drainResponse(await request());

    expect(text.trim().split("\n").map((l) => JSON.parse(l))).toEqual([{ type: "delta", text: "Hello." }]);
    expect(afterMock()).toHaveBeenCalledTimes(1);
  });

  it("caps a stalled upload at 5 seconds", async () => {
    jest.useFakeTimers();
    startTrace().mockResolvedValue(fakeTrace(jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(() => new Promise<undefined>(() => {}))));
    mockCreate.mockResolvedValue(await plainAnswer());
    await drainResponse(await request());

    const upload = afterMock().mock.calls[0][0]() as Promise<void>;
    let settled = false;
    void upload.then(() => (settled = true));

    await jest.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("passes the same outputs and error to finish, after the stream has closed", async () => {
    const finish = jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => undefined);
    startTrace().mockResolvedValue(fakeTrace(finish));
    mockCreate.mockResolvedValue(await plainAnswer());

    await drainResponse(await request());
    expect(finish).not.toHaveBeenCalled();
    await afterMock().mock.calls[0][0]();

    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ answer: "Hello.", truncated: false, rounds: 1, toolCalls: 0 }),
      undefined
    );
  });

  it("does not surface a rejecting finish", async () => {
    startTrace().mockResolvedValue(fakeTrace(jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => Promise.reject(new Error("upload failed")) as Promise<undefined>)));
    mockCreate.mockResolvedValue(await plainAnswer());

    const text = await drainResponse(await request());

    expect(JSON.parse(text.trim())).toEqual({ type: "delta", text: "Hello." });
    await expect(afterMock().mock.calls[0][0]()).resolves.toBeUndefined();
  });

  it("does not surface a rejecting flush", async () => {
    startTrace().mockResolvedValue(fakeTrace());
    mockCreate.mockResolvedValue(await plainAnswer());
    await drainResponse(await request());
    lsInstance().flush.mockRejectedValueOnce(new Error("flush failed"));

    await expect(afterMock().mock.calls[0][0]()).resolves.toBeUndefined();
    expect(lsInstance().flush).toHaveBeenCalled();
  });

  it("runs the upload directly when after() throws outside a request scope", async () => {
    const finish = jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => undefined);
    startTrace().mockResolvedValue(fakeTrace(finish));
    afterMock().mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    mockCreate.mockResolvedValue(await plainAnswer());

    await drainResponse(await request());

    expect(afterMock()).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
  });
});

describe("POST - production mode cache", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
  });

  it("should cache system prompt when NODE_ENV is production", async () => {
    // This test verifies the caching behavior by importing the route
    // with NODE_ENV set to production. We use isolateModules to get a fresh
    // module load with the production environment.
    await jest.isolateModulesAsync(async () => {
      (process.env as Record<string, string>).NODE_ENV = "production";

      // Re-mock fs for this isolated test
      jest.doMock("fs", () => ({
        readFileSync: jest.fn(() => "Production system prompt."),
      }));

      const { POST: POSTProduction } = await import("./route");
      const events = [
        { type: "response.output_text.delta", delta: "Response" },
        { type: "response.done" },
      ];
      mockCreate.mockResolvedValue(await makeStream(events));

      // First call - will populate cache
      const request1 = createPostRequest(
        JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
      );
      const response1 = await POSTProduction(request1 as unknown as NextRequest);
      const _text1 = await drainResponse(response1);

      // Second call - should use cache
      const request2 = createPostRequest(
        JSON.stringify({ messages: [{ role: "user", content: "Hello again" }] })
      );
      mockCreate.mockResolvedValue(await makeStream(events));
      const response2 = await POSTProduction(request2 as unknown as NextRequest);
      const _text2 = await drainResponse(response2);

      // Both should return 200
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });
});

describe("POST - citation ledger", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  // A Monday evening in UTC that is already Tuesday in Singapore.
  const NOW = new Date("2026-11-13T17:00:00Z");

  // Two real corpus articles: their URLs and titles come from the corpus, not from these tests.
  const A = ARTICLES[0];
  const B = ARTICLES[1];

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
    jest.useRealTimers();
  });

  type FakeEvent = Parameters<typeof makeStream>[0][number];
  const responseCreated = (id: string): FakeEvent => ({ type: "response.created", response: { id } });
  const responseDone: FakeEvent = { type: "response.done" };
  const outputText = (delta: string): FakeEvent => ({ type: "response.output_text.delta", delta });
  const functionCall = (call_id: string, name: string, args: string): FakeEvent => ({
    type: "response.output_item.done",
    item: { type: "function_call", name, arguments: args, call_id },
  });

  /** Fakes only Date, so the route's "today" is NOW while timers and streams behave normally. */
  function freezeDate() {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        "nextTick",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
      ],
    });
  }

  function postWith(extra: Record<string, unknown>, content = "Hello") {
    return POST(
      createPostRequest(
        JSON.stringify({ messages: [{ role: "user", content }], ...extra })
      ) as unknown as NextRequest
    );
  }

  function parseLines(ndjson: string): Array<Record<string, unknown>> {
    return ndjson.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  /** The model input's second message: the per-request context. */
  function contextOf(callIndex = 0): string {
    return mockCreate.mock.calls[callIndex][0].input[1].content;
  }

  it("still answers a request with no citations field, with today's date and nothing cited yet", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));

    const response = await postWith({});
    expect(response.status).toBe(200);
    await drainResponse(response);

    const input = mockCreate.mock.calls[0][0].input;
    expect(input[0]).toEqual({ role: "system", content: "You are Titus's copilot." });
    expect(input[1]).toEqual({ role: "system", content: "Today's date: 14 Nov 2026." });
    expect(input[2]).toEqual({ role: "user", content: "Hello" });
  });

  it("accepts an empty citations list the same way, with no ledger section", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));

    const response = await postWith({ citations: [] });
    expect(response.status).toBe(200);
    await drainResponse(response);

    expect(contextOf()).toBe("Today's date: 14 Nov 2026.");
    expect(contextOf()).not.toContain("already cited");
  });

  it.each([
    ["a string", "1,2"],
    ["an object", { n: 1, url: A.url }],
    ["an entry with n of 0", [{ n: 0, url: A.url }]],
    ["an entry with n of 100", [{ n: 100, url: A.url }]],
    ["an entry with a fractional n", [{ n: 1.5, url: A.url }]],
    ["an entry without a url", [{ n: 1 }]],
    ["an entry that is null", [null]],
    ["more than 40 entries", Array.from({ length: 41 }, (_, i) => ({ n: (i % 99) + 1, url: A.url }))],
  ])("rejects citations that are %s with 400 before calling OpenAI", async (_label, citations) => {
    const response = await postWith({ citations });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid citations");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("drops a URL that is not in the corpus without an error, and keeps the rest", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));

    const response = await postWith({
      citations: [
        { n: 1, url: "https://example.com/not-mine" },
        { n: 2, url: B.url },
      ],
    });
    expect(response.status).toBe(200);
    await drainResponse(response);

    const context = contextOf();
    expect(context).toContain(`[2] ${B.title} (published `);
    expect(context).not.toContain("[1]");
    expect(context).not.toContain("example.com");
  });

  it("takes the title and date from the corpus, not from a title and date the client sends", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));

    const response = await postWith({
      citations: [{ n: 1, url: A.url, title: "Forged headline", publishedAt: "1999-01-01T00:00:00.000Z" }],
    });
    expect(response.status).toBe(200);
    await drainResponse(response);

    const context = contextOf();
    expect(context).toContain(`[1] ${A.title} (published ${formatPublished(A.publishedAt)}`);
    expect(context).not.toContain("Forged headline");
    expect(context).not.toContain("1999");
  });

  it("states today's date in Singapore time, not UTC", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));

    const response = await postWith({});
    await drainResponse(response);

    // 17:00 UTC on 13 Nov is 01:00 on 14 Nov in Singapore.
    expect(contextOf().split("\n")[0]).toBe("Today's date: 14 Nov 2026.");
  });

  it("does not count the ledger against the 12,000-character budget, even with 40 citations", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));
    const citations = ARTICLES.slice(0, 40).map((a, i) => ({ n: i + 1, url: a.url }));
    // Exactly 12,000 characters of visitor conversation: the budget's limit, not over it.
    const messages = [
      { role: "user", content: "a".repeat(4000) },
      { role: "assistant", content: "b".repeat(4000) },
      { role: "user", content: "c".repeat(4000) },
    ];

    const response = await POST(
      createPostRequest(JSON.stringify({ messages, citations })) as unknown as NextRequest
    );
    expect(response.status).toBe(200);
    await drainResponse(response);

    const input = mockCreate.mock.calls[0][0].input;
    expect(input).toHaveLength(5); // system prompt, context, and the three messages
    expect(input[1].content).toContain("[40] ");
  });

  // Pads a label to exactly 4,000 characters: the per-message cap, so each message is legal on its own.
  const pad = (label: string) => label.padEnd(4000, ".");

  it("accepts an over-budget conversation by dropping its oldest exchange, and sends the rest to OpenAI", async () => {
    freezeDate();
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const messages = [
      { role: "user", content: pad("U1") },
      { role: "assistant", content: pad("A1") },
      { role: "user", content: pad("U2") },
      { role: "assistant", content: pad("A2") },
      { role: "user", content: pad("U3") },
    ];

    try {
      const response = await POST(
        createPostRequest(JSON.stringify({ messages, citations: [{ n: 1, url: A.url }] })) as unknown as NextRequest
      );
      expect(response.status).toBe(200);
      await drainResponse(response);

      // 20,000 characters in total. Dropping U1 and A1 leaves 12,000, which fits.
      const input = mockCreate.mock.calls[0][0].input;
      expect(input).toHaveLength(5); // system prompt, context message, then the three kept messages
      expect(input.slice(2).map((m: { content: string }) => m.content)).toEqual([
        pad("U2"),
        pad("A2"),
        pad("U3"),
      ]);
      expect(JSON.stringify(input)).not.toContain("U1");

      const trimmed = logSpy.mock.calls
        .map(([line]) => JSON.parse(String(line)))
        .filter((e) => e.event === "copilot_history_trimmed");
      expect(trimmed).toEqual([{ event: "copilot_history_trimmed", dropped: 2 }]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("logs no trim when the whole conversation was sent", async () => {
    mockCreate.mockResolvedValueOnce(await makeStream([outputText("Hi"), responseDone]));
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      await drainResponse(await postWith({}));

      const events = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)).event);
      expect(events).not.toContain("copilot_history_trimmed");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("refuses with 400 when the newest exchange alone is over budget (a reply sent after the last visitor message)", async () => {
    // A drawer always ends on a visitor message, so this needs a crafted request: one visitor
    // message followed by three replies. The exchange they make is 16,000 characters.
    const messages = [
      { role: "user", content: pad("U1") },
      { role: "assistant", content: pad("A1") },
      { role: "assistant", content: pad("A2") },
      { role: "assistant", content: pad("A3") },
    ];

    const response = await POST(
      createPostRequest(JSON.stringify({ messages, citations: [{ n: 1, url: A.url }] })) as unknown as NextRequest
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "conversation_too_long" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("answers 400 when the conversation holds only replies and no visitor message", async () => {
    const response = await POST(
      createPostRequest(JSON.stringify({ messages: [{ role: "assistant", content: "Hi" }] })) as unknown as NextRequest
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("A visitor message is required");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("hands the ledger to search_writing, so a cited article keeps its number and a new one continues from the highest", async () => {
    const search = jest.requireMock("@/lib/writing-search").searchMyWriting as jest.Mock;
    search.mockResolvedValueOnce([
      {
        slug: A.slug,
        title: A.title,
        url: A.url,
        publishedAt: A.publishedAt,
        body: "A body",
        relevance: 0.9,
        score: 2.5,
      },
      {
        slug: "brand-new",
        title: "Brand new",
        url: "https://medium.com/@tituslhy/brand-new",
        publishedAt: "2026-10-01T00:00:00.000Z",
        body: "New body",
        relevance: 0.8,
        score: null,
      },
    ]);
    mockCreate
      .mockResolvedValueOnce(
        await makeStream([
          responseCreated("resp_1"),
          functionCall("call_1", "search_writing", JSON.stringify({ topics: ["agents"] })),
          responseDone,
        ])
      )
      .mockResolvedValueOnce(await makeStream([outputText("Both [2][6]."), responseDone]));

    const response = await postWith({ citations: [{ n: 2, url: A.url }, { n: 5, url: B.url }] });
    const lines = parseLines(await drainResponse(response));

    // The ledger's number 2 goes to A again; the new article is 6 (the highest prior number, 5, plus one).
    const output = JSON.parse(mockCreate.mock.calls[1][0].input[0].output);
    expect(output.articles.map((a: { n: number; title: string }) => [a.n, a.title])).toEqual([
      [2, A.title],
      [6, "Brand new"],
    ]);
    expect(lines.filter((l) => l.type === "source")).toEqual([
      expect.objectContaining({ type: "source", n: 2, url: A.url }),
      expect.objectContaining({ type: "source", n: 6, url: "https://medium.com/@tituslhy/brand-new" }),
    ]);
  });
});

describe("POST - cards", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;
  const RAFT = ARTICLES.find((a) => /How to RAFT your LLM/.test(a.title))!;
  const RAFT_ID = mediumPostId(RAFT.url)!;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    (process.env as Record<string, string>).NODE_ENV = originalNodeEnv || "";
    mockCreate.mockReset();
    jest.restoreAllMocks();
  });

  type FakeEvent = Parameters<typeof makeStream>[0][number];
  const responseCreated = (id: string): FakeEvent => ({ type: "response.created", response: { id } });
  const responseDone: FakeEvent = { type: "response.done" };
  const outputText = (delta: string): FakeEvent => ({ type: "response.output_text.delta", delta });
  const functionCall = (call_id: string, name: string, args: string): FakeEvent => ({
    type: "response.output_item.done",
    item: { type: "function_call", name, arguments: args, call_id },
  });
  /** The places an evidence card names: a role and a project, so it spans two pages of the site. */
  const CARD_PLACES = [
    { target: "role-illumina", line: "Built the RAG stack" },
    { target: "project-margin-call", line: "Side project" },
  ];
  const SUMMARY = "[Card shown: where I did it, “Illumina”, “TheMarginCall”]";
  const evidenceCard = (places = CARD_PLACES) => JSON.stringify({ card: { kind: "evidence", places, articles: [] } });
  const compareCard = (articleIds: [string, string]) =>
    JSON.stringify({
      card: {
        kind: "compare",
        title: "RAFT or LoRA",
        options: [
          { name: "LoRA", article: null },
          { name: "RAFT", article: articleIds[1] },
        ],
        rows: [{ label: "Trains on", cells: ["Adapters", "Docs"] }],
      },
    });

  async function queueRounds(...rounds: FakeEvent[][]) {
    for (const events of rounds) mockCreate.mockResolvedValueOnce(await makeStream(events));
  }
  const postChat = () =>
    POST(createPostRequest(JSON.stringify({ messages: [{ role: "user", content: "Which should I read?" }] })) as unknown as NextRequest);
  const parseLines = (ndjson: string): Array<Record<string, unknown>> => ndjson.split("\n").filter(Boolean).map((l) => JSON.parse(l));

  it("relays an evidence card as one card line, before the answer's text, with its messages and summary", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone],
      [responseCreated("resp_2"), outputText("Start with RAFT."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    const cards = lines.filter((l) => l.type === "card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      type: "card",
      id: "card_1",
      flair: "plain",
      summary: SUMMARY,
    });
    expect((cards[0].messages as unknown[])[0]).toMatchObject({ version: "1.0", createSurface: { surfaceId: "card_1" } });
    expect(lines.findIndex((l) => l.type === "card")).toBeLessThan(lines.findIndex((l) => l.type === "delta"));
  });

  it("relays a compare table as a plain card", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", compareCard(["", RAFT_ID])), responseDone],
      [responseCreated("resp_2"), outputText("LoRA is lighter."), responseDone]
    );

    const card = parseLines(await drainResponse(await postChat())).find((l) => l.type === "card");
    expect(card).toMatchObject({ flair: "plain", summary: expect.stringMatching(/^\[Card shown: compare table of /) });
  });

  it("sends no card line, and tells the model it was not shown, when the card's places are not on my site", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard([{ target: "role-nasa", line: "x" }])), responseDone],
      [responseCreated("resp_2"), outputText("Answer in prose."), responseDone]
    );
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines.some((l) => l.type === "card")).toBe(false);
    expect(lines.at(-1)).toEqual({ type: "delta", text: "Answer in prose." });
    const toolOutput = JSON.parse(mockCreate.mock.calls[1][0].input[0].output);
    expect(toolOutput).toMatchObject({ shown: false, error: expect.stringMatching(/answer without a card$/) });
  });

  it("gives the model shown true and the summary when the card is sent", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone],
      [responseCreated("resp_2"), outputText("Start with RAFT."), responseDone]
    );

    await drainResponse(await postChat());

    const toolOutput = JSON.parse(mockCreate.mock.calls[1][0].input[0].output);
    expect(toolOutput).toEqual({ shown: true, card: SUMMARY });
  });

  it("relays at most one card per reply: a second show_card in a later round is refused by the tool limit", async () => {
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone],
      [responseCreated("resp_2"), functionCall("call_2", "show_card", evidenceCard([{ target: "role-mastercard", line: "Tech lead" }, { target: "edu-smu", line: "Studied AI" }])), responseDone],
      [responseCreated("resp_3"), outputText("Done."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines.filter((l) => l.type === "card")).toHaveLength(1);
    const refused = JSON.parse(mockCreate.mock.calls[2][0].input[0].output);
    expect(refused).toMatchObject({ error: expect.stringMatching(/over|limit|call/i) });
  });

  it("keeps one card across a retry: the first attempt's card is sent, and the retry's is not", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockCreate
      .mockResolvedValueOnce(
        await makeStream([responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone])
      )
      // The first attempt fails after its card and before any text, so the route retries untraced.
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        await makeStream([responseCreated("resp_2"), functionCall("call_2", "show_card", evidenceCard([{ target: "role-mastercard", line: "Tech lead" }, { target: "edu-smu", line: "Studied AI" }])), responseDone])
      )
      .mockResolvedValueOnce(await makeStream([outputText("Answer."), responseDone]));

    const lines = parseLines(await drainResponse(await postChat()));

    const cards = lines.filter((l) => l.type === "card");
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("card_1");
    expect(cards[0].summary).toContain("Illumina");
    expect(cards[0].summary).not.toContain("Mastercard");
    expect(lines.at(-1)).toEqual({ type: "delta", text: "Answer." });
  });

  it("logs card: true on the request line when a card was sent", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await queueRounds(
      [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone],
      [responseCreated("resp_2"), outputText("Start with RAFT."), responseDone]
    );

    await drainResponse(await postChat());

    const line = log.mock.calls.map(([l]) => JSON.parse(l as string)).find((l) => l.event === "copilot_chat_request");
    expect(line).toMatchObject({ card: true });
    expect(JSON.stringify(line)).not.toContain("TheMarginCall");
  });

  it("logs card: false on the request line for a reply with no card", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await queueRounds([responseCreated("resp_1"), outputText("Plain answer."), responseDone]);

    await drainResponse(await postChat());

    const line = log.mock.calls.map(([l]) => JSON.parse(l as string)).find((l) => l.event === "copilot_chat_request");
    expect(line).toMatchObject({ card: false });
  });

  it("puts the card's summary in the trace outputs, and no card key when there is none", async () => {
    const startTrace = jest.requireMock("@/lib/copilot-tracing").ChatTrace.start as jest.Mock;
    const afterMock = jest.requireMock("next/server").after as jest.Mock;
    afterMock.mockClear();
    const finish = jest.fn<Promise<undefined>, [Record<string, unknown>, string?]>(async () => undefined);
    const trace = { observer: jest.fn(() => ({ roundStart: jest.fn(() => ({ annotate() {}, step() {}, end() {}, fail() {} })), toolStart: jest.fn(() => ({ annotate() {}, step() {}, end() {}, fail() {} })) })), finish };
    startTrace.mockReset();
    startTrace.mockResolvedValue(trace);
    process.env.LANGSMITH_API_KEY = "lsv2-test";
    try {
      await queueRounds(
        [responseCreated("resp_1"), functionCall("call_1", "show_card", evidenceCard()), responseDone],
        [responseCreated("resp_2"), outputText("Start with RAFT."), responseDone]
      );
      await drainResponse(await postChat());
      for (const call of afterMock.mock.calls as unknown as Array<[() => Promise<unknown>]>) await call[0]();
      expect(finish.mock.calls[0][0]).toMatchObject({ card: SUMMARY });

      finish.mockClear();
      afterMock.mockClear();
      await queueRounds([responseCreated("resp_3"), outputText("No card."), responseDone]);
      await drainResponse(await postChat());
      for (const call of afterMock.mock.calls as unknown as Array<[() => Promise<unknown>]>) await call[0]();
      expect(finish.mock.calls[0][0]).not.toHaveProperty("card");
    } finally {
      delete process.env.LANGSMITH_API_KEY;
      startTrace.mockReset();
      startTrace.mockResolvedValue(null);
    }
  });
});
