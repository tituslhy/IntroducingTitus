import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEncoder, TextDecoder } from "util";
import CopilotBubble from "./CopilotBubble";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function createStreamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: jest.fn(async () => {
          if (index >= encodedChunks.length) {
            return { done: true, value: undefined };
          }

          const value = encodedChunks[index];
          index += 1;
          return { done: false, value };
        }),
      }),
    },
  } as unknown as Response;
}

describe("CopilotBubble", () => {
  beforeEach(() => {
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: jest.fn(),
      writable: true,
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should open chat panel when floating bubble is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);

    // Act
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Assert
    expect(screen.getByText(/ask me anything about my work/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about my experience, projects, or writing/i)).toBeInTheDocument();
  });

  it("should stream and render assistant reply when user sends a question", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Titus has ", "8+ years of AI experience."])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Tell me about your experience{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/8\+ years of ai experience/i)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("should show friendly rate-limit fallback when api returns rate-limit sentinel", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_RATE_LIMIT"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/i'm getting a lot of questions right now/i)
      ).toBeInTheDocument();
    });
  });

  it("should show quota unavailable message when api returns quota sentinel", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_QUOTA"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/the copilot is temporarily unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it("should show misconfigured message when api returns ERR_AUTH sentinel", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_AUTH"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/the copilot is currently misconfigured/i)
      ).toBeInTheDocument();
    });
  });

  it("should show generic error message when api returns unknown error sentinel", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_UNKNOWN"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/something went wrong/i)
      ).toBeInTheDocument();
    });
  });

  it("should toggle expand/collapse button state", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const expandButton = screen.getByRole("button", { name: /expand chat/i });
    expect(expandButton).toBeInTheDocument();

    await user.click(expandButton);

    // Assert
    expect(screen.getByRole("button", { name: /collapse chat/i })).toBeInTheDocument();

    // Click again to collapse
    const collapseButton = screen.getByRole("button", { name: /collapse chat/i });
    await user.click(collapseButton);

    // Assert
    expect(screen.getByRole("button", { name: /expand chat/i })).toBeInTheDocument();
  });

  it("should scroll messages to bottom when new messages arrive", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    const scrollIntoViewSpy = jest.spyOn(HTMLElement.prototype, "scrollIntoView");

    // Act
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalled();
    });
  });

  it("should prevent empty messages from being sent", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const sendButton = screen.getByRole("button", { name: /send message/i });

    // Assert
    expect(sendButton).toBeDisabled();
  });

  it("should render floating bubble with correct initial aria-label", () => {
    // Arrange
    render(<CopilotBubble />);

    // Act & Assert
    expect(screen.getByRole("button", { name: /open titus's copilot/i })).toBeInTheDocument();
  });

  it("should update message list with user and assistant messages", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Assistant response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Test message{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
      expect(screen.getByText("Assistant response")).toBeInTheDocument();
    });
  });

  it("should clear input after sending message", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i) as HTMLInputElement;
    await user.type(input, "Test{Enter}");

    // Assert
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("should render helper text in empty message list", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);

    // Act
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Assert
    expect(screen.getByText(/ask about titus's experience, projects, or writing/i)).toBeInTheDocument();
  });

  it("should have correct header title in chat panel", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);

    // Act
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Assert
    expect(screen.getByText(/titus's copilot/i)).toBeInTheDocument();
  });

  it("should maintain message history across multiple messages", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "First{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    // Send another message
    await user.type(input, "Second{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByText("First")).toBeInTheDocument();
    });
  });

  it("should disable send button while loading", async () => {
    // Arrange
    const user = userEvent.setup();
    let resolveResponse: () => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = () => resolve(createStreamingResponse(["Response"]));
    });
    (global.fetch as jest.Mock).mockReturnValue(responsePromise);
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "Hi");
    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Assert — button should be disabled while loading
    expect(sendButton).toBeDisabled();

    // Resolve the response
    resolveResponse!();

    // Wait for it to complete
    await waitFor(() => {
      expect(screen.getByText("Response")).toBeInTheDocument();
    });
  });

  it("should send message with all previous messages in conversation", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open titus's copilot/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my experience, projects, or writing/i);
    await user.type(input, "First{Enter}");

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    // Type second message
    await user.type(input, "Second{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Second")).toBeInTheDocument();
    });

    // Verify that fetch was called with both messages
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const secondCall = (global.fetch as jest.Mock).mock.calls[1];
    const body = JSON.parse(secondCall[1].body);
    expect(body.messages.length).toBe(3); // First user, First assistant, Second user
    expect(body.messages[2].content).toBe("Second");
  });
});
