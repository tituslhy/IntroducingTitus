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
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as any;

    // Mock clipboard
    const clipboardMock = {
      writeText: jest.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: clipboardMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render floating bubble with correct initial aria label", () => {
    // Arrange & Act
    render(<CopilotBubble />);

    // Assert
    const fab = screen.getByRole("button", { name: /open ask titus/i });
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  it("should open chat panel when floating bubble is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);

    // Act
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(screen.getByPlaceholderText(/ask about my work/i)).toBeInTheDocument();
    expect(screen.getByText(/personal assistant/i)).toBeInTheDocument();
  });

  it("should close chat panel when close button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    // Find the header close button (first one that appears when drawer is open)
    const closeButtons = screen.getAllByRole("button", { name: /close chat/i });
    const headerCloseButton = closeButtons[0]; // The header close button
    await user.click(headerCloseButton);

    // Assert
    const fab = screen.getByRole("button", { name: /open ask titus/i });
    expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  it("should display starter prompts in empty state", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(screen.getByText(/do you think titus is a good software engineer/i)).toBeInTheDocument();
    expect(screen.getByText(/what did titus do at illumina/i)).toBeInTheDocument();
    expect(screen.getByText(/did titus write any article on long-term memory/i)).toBeInTheDocument();
  });

  it("should send starter prompt when clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Great question"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const starterPrompt = screen.getByText(/do you think titus is a good software engineer/i);
    await user.click(starterPrompt);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/great question/i)).toBeInTheDocument();
    });
  });

  it("should hide starter prompts when user sends a message", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Tell me something{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.queryByText(/do you think titus is a good software engineer/i)).not.toBeInTheDocument();
    });
  });

  it("should display typing indicator while loading", async () => {
    // Arrange
    const user = userEvent.setup();
    let resolveResponse: () => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = () => resolve(createStreamingResponse(["Response"]));
    });
    (global.fetch as jest.Mock).mockReturnValue(responsePromise);
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi");
    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Assert — typing indicator should be visible
    expect(screen.getByText(/personal assistant/i)).toBeInTheDocument();

    // Resolve the response
    resolveResponse!();

    // Wait for response to complete
    await waitFor(() => {
      expect(screen.getByText("Response")).toBeInTheDocument();
    });
  });

  it("should stream and render assistant reply when user sends a question", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Titus has ", "10+ years of AI experience."])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Tell me about your experience{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/10\+ years of ai experience/i)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("should show user message and assistant response in conversation", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Assistant response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
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
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i) as HTMLTextAreaElement;
    await user.type(input, "Test{Enter}");

    // Assert
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("should prevent empty messages from being sent", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });

  it("should disable send button while loading response", async () => {
    // Arrange
    const user = userEvent.setup();
    let resolveResponse: () => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = () => resolve(createStreamingResponse(["Response"]));
    });
    (global.fetch as jest.Mock).mockReturnValue(responsePromise);
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi");
    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Assert — button should be disabled immediately
    expect(sendButton).toBeDisabled();

    // Resolve the response
    resolveResponse!();

    // Wait for response to complete
    await waitFor(() => {
      expect(screen.getByText("Response")).toBeInTheDocument();
    });
  });

  it("should show rate-limit error message when api returns ERR_RATE_LIMIT", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_RATE_LIMIT"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/i'm getting a lot of questions right now/i)
      ).toBeInTheDocument();
    });
  });

  it("should show quota unavailable message when api returns ERR_QUOTA", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_QUOTA"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/the copilot is temporarily unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it("should show misconfigured message when api returns ERR_AUTH", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["__COPILOT_ERR__:ERR_AUTH"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
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
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/something went wrong/i)
      ).toBeInTheDocument();
    });
  });

  it("should show error when fetch fails with non-ok status", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    });
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert — should show HTTP error message
    await waitFor(() => {
      expect(screen.getByText(/http 500/i)).toBeInTheDocument();
    });
  });

  it("should show generic error when fetch throws exception", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText(/network error/i)
      ).toBeInTheDocument();
    });
  });

  it("should toggle expand/collapse button state", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

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
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalled();
    });
  });

  it("should maintain message history across multiple messages", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
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

  it("should send message with all previous messages in conversation", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
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

  it("should handle send message via keyboard enter key", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Test message");
    await user.type(input, "{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeInTheDocument();
      expect(screen.getByText("Response")).toBeInTheDocument();
    });
  });

  it("should not send message on shift+enter", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i) as HTMLTextAreaElement;
    await user.type(input, "Line 1");
    await user.type(input, "{Shift>}{Enter}{/Shift}");
    await user.type(input, "Line 2");

    // Assert
    expect(global.fetch).not.toHaveBeenCalled();
    expect(input.value).toContain("Line 1");
    expect(input.value).toContain("Line 2");
  });

  it("should copy message to clipboard when copy button clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response content"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Test{Enter}");

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText("Response content")).toBeInTheDocument();
    });

    // Click copy button for the assistant message
    const copyButtons = screen.getAllByRole("button", { name: /copy message/i });
    await user.click(copyButtons[1]); // Second button is for assistant message

    // Assert
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Response content");
    });
  });

  it("should show copy button on messages", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response content"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Test{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Response content")).toBeInTheDocument();
    });

    // Check that copy buttons are present
    const copyButtons = screen.getAllByRole("button", { name: /copy message/i });
    expect(copyButtons.length).toBe(2); // One for user, one for assistant
  });

  it("should render header description text", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(
      screen.getByText(/a small assistant trained on this page/i)
    ).toBeInTheDocument();
  });

  it("should send message with enter key and trim whitespace", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "  Message with spaces  {Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Message with spaces")).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should toggle drawer open and closed via FAB button", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });

    // Act & Assert - open drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");

    // Act & Assert - close drawer via FAB click
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "false");

    // Act & Assert - open again
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");
  });

  it("should render assistant avatar in label", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse(["Response"])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hello{Enter}");

    // Assert
    await waitFor(() => {
      const avatarImage = screen.getByAltText("Titus");
      expect(avatarImage).toBeInTheDocument();
      expect(avatarImage).toHaveAttribute("src", "/headshot.jpeg");
    });
  });
});
