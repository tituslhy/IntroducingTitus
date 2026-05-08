/**
 * @jest-environment node
 */

import { POST } from "./route";

// Setup mocks before any imports
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
  (MockOpenAI as any).APIError = APIError;
  (MockOpenAI as any)._create = _create;
  return { __esModule: true, default: MockOpenAI };
});

jest.mock("fs", () => ({
  readFileSync: jest.fn(() => "You are Titus's copilot."),
}));

jest.mock("langsmith/traceable", () => ({
  traceable: (_fn: unknown) => _fn,
}));

const OpenAIMock = jest.requireMock("openai").default as any;
const mockCreate: jest.Mock = OpenAIMock._create;

function createPostRequest(body: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
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

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    mockCreate.mockReset();
  });

  it("should return 503 when openai api key is missing", async () => {
    // Arrange
    delete process.env.OPENAI_API_KEY;
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toEqual("Service unavailable");
  });

  it("should return 400 when request body is invalid json", async () => {
    // Arrange
    const request = createPostRequest("{invalid-json");

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Invalid request body");
  });

  it("should return 400 when messages array is empty", async () => {
    // Arrange
    const request = createPostRequest(JSON.stringify({ messages: [] }));

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Messages array is required");
  });

  it("should return 400 when messages is missing from body", async () => {
    // Arrange
    const request = createPostRequest(JSON.stringify({}));

    // Act
    const response = await POST(request);

    // Assert
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toEqual("Messages array is required");
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
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(text).toBe("Titus has 8+ years of AI experience.");
  });

  it("should return ERR_RATE_LIMIT sentinel when OpenAI returns 429 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new (OpenAIMock.APIError)("Too many requests", 429));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_RATE_LIMIT");
  });

  it("should return ERR_QUOTA sentinel when OpenAI returns 402 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new (OpenAIMock.APIError)("Quota exceeded", 402));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_QUOTA");
  });

  it("should return ERR_AUTH sentinel when OpenAI returns 401 status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new (OpenAIMock.APIError)("Unauthorized", 401));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_AUTH");
  });

  it("should return ERR_UNKNOWN sentinel when OpenAI returns unknown error status", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new (OpenAIMock.APIError)("Server error", 500));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_UNKNOWN");
  });

  it("should return ERR_UNKNOWN sentinel when non-OpenAI error is thrown on initial call", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate.mockRejectedValue(new Error("Generic error without status"));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_UNKNOWN");
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
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("Retry successful");
    // mockCreate should be called twice: once for traced, once for untraced retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should return error sentinel when retry also fails with OpenAI error", async () => {
    // Arrange
    const request = createPostRequest(
      JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    );
    mockCreate
      .mockRejectedValueOnce(new Error("LangSmith down"))
      .mockRejectedValueOnce(new (OpenAIMock.APIError)("OpenAI error", 500));

    // Act
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("__COPILOT_ERR__:ERR_UNKNOWN");
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
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    // Only the partial content should be streamed, no error sentinel added
    expect(text).toBe("Partial content");
  });

  it("should include system prompt in the request to OpenAI", async () => {
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
    await POST(request);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert
    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0];
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
    await POST(request);
    await new Promise(resolve => setTimeout(resolve, 50));

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
    const response = await POST(request);
    const text = await drainResponse(response);

    // Assert
    expect(response.status).toBe(200);
    expect(text).toBe("Response");
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.input.length).toBe(3); // system + user + assistant
    expect(callArgs.input[2].role).toBe("assistant");
  });
});
