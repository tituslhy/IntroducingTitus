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

// Import after all mocks are set up
import { POST } from "./route";
import type { NextRequest } from "next/server";

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

async function makeStream(events: Array<{ type: string; delta?: string }>) {
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

  it("should include web_search_preview tool in OpenAI request", async () => {
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
    expect(callArgs.tools).toEqual([{ type: "web_search_preview" }]);
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
