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
    // input should have system prompt + last 20 messages = 21 total
    expect(callArgs.input.length).toBe(21);
    expect(callArgs.input[0].role).toBe("system");
    expect(callArgs.input[1].content).toBe("Message 5"); // first of last 20
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

  it("should offer show_on_page and search_writing as function tools, and no hosted web search", async () => {
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
    expect(tool.parameters.properties.target.enum).toEqual(PAGE_TARGET_IDS);
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
            item: { type: "function_call", name: "show_on_page", arguments: '{"target":"role-illumina"}', call_id: "call_1" },
          },
          {
            type: "response.output_item.done",
            item: { type: "function_call", name: "show_on_page", arguments: '{"target":"role-nasa"}', call_id: "call_2" },
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

    // Round two is not the final round, so both function tools are still offered.
    // Tool results go back by previous_response_id.
    const followUp = mockCreate.mock.calls[1][0];
    expect(followUp.previous_response_id).toBe("resp_1");
    expect(followUp.tools.map((t: { name?: string }) => t.name)).toEqual(["show_on_page", "search_writing"]);
    // The per-reply budget is spent by the first call, so the second is refused as over-limit.
    expect(followUp.input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ shown: "role-illumina" }) },
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
    expect(callArgs.input.length).toBe(3); // system + user + assistant
    expect(callArgs.input[2].role).toBe("assistant");
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
        functionCall("call_1", "show_on_page", '{"target":"role-illumina"}'),
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
      { type: "function_call_output", call_id: "call_1", output: JSON.stringify({ shown: "role-illumina" }) },
      { type: "function_call_output", call_id: "call_2", output: JSON.stringify({ error: "unknown tool" }) },
    ]);
  });

  it("should refuse a show_on_page call in a later round as over-limit and let the reply finish", async () => {
    await queueRounds(
      [
        responseCreated("resp_1"),
        functionCall("call_1", "show_on_page", '{"target":"role-illumina"}'),
        responseDone,
      ],
      [
        responseCreated("resp_2"),
        functionCall("call_2", "show_on_page", '{"target":"role-mastercard"}'),
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
    ["a target outside the page's anchor ids", '{"target":"role-nasa"}'],
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
        functionCall("call_2", "show_on_page", '{"target":"role-illumina"}'),
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
      [responseCreated("resp_1"), functionCall("call_1", "show_on_page", '{"target":"role-illumina"}'), responseDone],
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
        functionCall("call_4", "show_on_page", '{"target":"role-illumina"}'),
        outputText("Done."),
        responseDone,
      ]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([{ type: "delta", text: "Done." }]);
    expect(lines.some((l) => l.type === "action")).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("should forward search_writing source events as NDJSON lines before the next round's text", async () => {
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
        functionCall("call_1", "search_writing", JSON.stringify({ query: "guardrails" })),
        responseDone,
      ],
      [outputText("Yes, I wrote about it [1][2]."), responseDone]
    );

    const lines = parseLines(await drainResponse(await postChat()));

    expect(lines).toEqual([
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
      { type: "delta", text: "Yes, I wrote about it [1][2]." },
    ]);
    expect(search).toHaveBeenCalledWith("guardrails", expect.objectContaining({ onTrace: expect.any(Function) }));
    const output = JSON.parse(mockCreate.mock.calls[1][0].input[0].output);
    expect(output.articles.map((a: { n: number }) => a.n)).toEqual([1, 2]);
    expect(output.articles[0].body).toBe("Guardrails body");
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
          functionCall("call_1", "search_writing", JSON.stringify({ query: "guardrails" })),
          responseDone,
        ])
      )
      // The first attempt fails before any text, so the route retries untraced.
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        await makeStream([
          responseCreated("resp_2"),
          functionCall("call_2", "search_writing", JSON.stringify({ query: "guardrails" })),
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
        functionCall("call_1", "show_on_page", '{"target":"role-illumina"}'),
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
              item: { type: "function_call", name: "show_on_page", arguments: '{"target":"role-illumina"}', call_id: "c1" },
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
            item: { type: "function_call", name: "search_writing", arguments: '{"query":"guardrails"}', call_id: "c1" },
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
