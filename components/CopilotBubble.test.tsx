import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEncoder, TextDecoder } from "util";
import CopilotBubble from "./CopilotBubble";

// Renders plain text, except [text](href) which goes through the drawer's own
// `a` renderer, so citation links can be exercised without the ESM markdown stack.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children, components }: { children: string; components?: { a?: React.ElementType } }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const A = components?.a;
    const link = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = link.exec(children)) !== null) {
      parts.push(children.slice(last, m.index));
      parts.push(A ? React.createElement(A, { href: m[2], key: m.index }, m[1]) : m[1]);
      last = link.lastIndex;
    }
    parts.push(children.slice(last));
    return React.createElement(React.Fragment, null, ...parts);
  },
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
    } as unknown as Crypto;

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

  it("should disclose in the drawer header that chats are logged", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    const dialog = screen.getByRole("dialog", { name: /ask titus/i });
    expect(within(dialog).getByText(/chats are logged so i can/i)).toBeInTheDocument();
  });

  it("should close chat panel when FAB is clicked again while open", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });

    // Open the drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");

    // Act - click FAB again to close
    await user.click(fab);

    // Assert
    expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  it("should display starter prompts in empty state", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(screen.getByText(/what did you build at illumina/i)).toBeInTheDocument();
    expect(screen.getByText(/what trade-offs shaped fictional-bassoon/i)).toBeInTheDocument();
    expect(screen.getByText(/which article should i read first/i)).toBeInTheDocument();
    expect(screen.getByText(/lora, raft or grpo/i)).toBeInTheDocument();
  });

  it("should send starter prompt when clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"delta","text":"Great question"}\n`])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const starterPrompt = screen.getByText(/what did you build at illumina/i);
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Tell me something{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.queryByText(/what did you build at illumina/i)).not.toBeInTheDocument();
    });
  });

  it("should display typing indicator while loading", async () => {
    // Arrange
    const user = userEvent.setup();
    let resolveResponse: () => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = () => resolve(createStreamingResponse([`{"type":"delta","text":"Response"}\n`]));
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
      createStreamingResponse([
        `{"type":"delta","text":"Titus has "}\n`,
        `{"type":"delta","text":"10+ years of AI experience."}\n`,
      ])
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
      createStreamingResponse([`{"type":"delta","text":"Assistant response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      resolveResponse = () => resolve(createStreamingResponse([`{"type":"delta","text":"Response"}\n`]));
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

  it("should show rate-limit error message when api returns ERR_RATE_LIMIT error event", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"error","code":"ERR_RATE_LIMIT"}\n`])
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

  it("should show quota unavailable message when api returns ERR_QUOTA error event", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"error","code":"ERR_QUOTA"}\n`])
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

  it("should show misconfigured message when api returns ERR_AUTH error event", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"error","code":"ERR_AUTH"}\n`])
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

  it("should show generic error message when api returns unknown error event", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"error","code":"ERR_UNKNOWN"}\n`])
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

  it("should show a friendly generic error when fetch fails with an unrecognized non-ok status", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      json: async () => ({}),
    });
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert — a raw "HTTP 500" is never shown to the user; a friendly
    // generic message with an email fallback is shown instead.
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it("should show a friendly retry-in-a-minute message when the API rate-limits the request", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      body: null,
      json: async () => ({ error: "rate_limited", retryAfterSeconds: 42 }),
    });
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hi{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/try again in a minute/i)).toBeInTheDocument();
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response content"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response content"}\n`])
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
      screen.getByText(/grounded in my public work and writing/i)
    ).toBeInTheDocument();
  });

  it("should send message with enter key and trim whitespace", async () => {
    // Arrange
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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
      createStreamingResponse([`{"type":"delta","text":"Response"}\n`])
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

  it("should have drawer with dialog role and aria-modal", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);

    // Act
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    const dialog = screen.getByRole("dialog", { name: /ask titus/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("should close drawer when Escape key is pressed", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });

    // Act - open drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");

    // Act - press Escape on the input element within the drawer
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "{Escape}");

    // Assert
    expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  it("should restore focus to FAB when drawer closes", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });

    // Act - open drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");

    // Act - close drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "false");

    // Assert - focus should return to FAB
    expect(fab).toHaveFocus();
  });

  it("should display updated disclaimer text about chat history", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(
      screen.getByText(/messages are sent to openai to generate a response\. this site does not save your chat history\./i)
    ).toBeInTheDocument();
  });

  it("should have close button in drawer header that closes the drawer", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });

    // Act - open drawer
    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");

    // Assert - header close button should exist and be accessible
    const header = screen.getByRole("banner", { hidden: true }) || screen.getByText(/ask titus/i).closest("header");
    expect(header).toBeTruthy();

    // Get the close button specifically within the header (not the FAB)
    const allCloseButtons = screen.getAllByLabelText(/close chat/i);
    expect(allCloseButtons.length).toBe(2); // FAB + header button

    // Click the header close button (the second one, or use title="Close")
    const headerCloseButton = allCloseButtons[1];
    await user.click(headerCloseButton);

    // Assert - drawer should be closed
    expect(fab).toHaveAttribute("aria-expanded", "false");
  });

  it("should handle split error event across multiple read() chunks via buffer", async () => {
    // This test verifies that an error event split across two network chunks
    // is properly buffered and reconstructed on the client side.
    // We simulate this by sending the first half of the error event in one chunk
    // and the second half in another chunk.
    const user = userEvent.setup();
    const encoder = new TextEncoder();

    // Simulate a rate limit error event split across chunks
    const errorEvent = `{"type":"error","code":"ERR_RATE_LIMIT"}\n`;
    const splitIndex = 20; // Split in the middle of the JSON

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let index = 0;
          const chunks = [
            encoder.encode(errorEvent.slice(0, splitIndex)),
            encoder.encode(errorEvent.slice(splitIndex)),
          ];
          return {
            read: jest.fn(async () => {
              if (index >= chunks.length) {
                return { done: true, value: undefined };
              }
              const value = chunks[index];
              index += 1;
              return { done: false, value };
            }),
          };
        },
      },
    } as unknown as Response);

    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Hello{Enter}");

    // Assert - the error should be properly handled despite being split
    await waitFor(() => {
      expect(
        screen.getByText(/i'm getting a lot of questions right now/i)
      ).toBeInTheDocument();
    });
  });
  describe("opening from other pages", () => {
    const fab = () => screen.getByRole("button", { name: /open ask titus/i });

    it("opens the drawer on a copilot:open event", async () => {
      render(<CopilotBubble />);

      act(() => {
        window.dispatchEvent(new CustomEvent("copilot:open", { detail: { mode: "chat" } }));
      });

      expect(await screen.findByRole("dialog", { name: /ask titus/i })).toBeInTheDocument();
    });

    it("enters recruiter mode for a copilot:open event with mode fit", async () => {
      render(<CopilotBubble />);

      act(() => {
        window.dispatchEvent(new CustomEvent("copilot:open", { detail: { mode: "fit" } }));
      });

      expect(await screen.findByRole("textbox", { name: "Job description" })).toBeInTheDocument();
    });

    it("shows a How this works link to /colophon in the drawer header", async () => {
      const user = userEvent.setup();
      render(<CopilotBubble />);
      await user.click(fab());

      expect(screen.getByRole("link", { name: /how this works/i })).toHaveAttribute("href", "/colophon");
    });
  });

  describe("sources and citations", () => {
    const GUARDRAILS = "https://medium.com/@tituslhy/guardrails";

    async function askAndWait(chunks: string[], question = "What have you written about guardrails?") {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse(chunks));
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
    }

    const source = (n: number, title: string, url = GUARDRAILS) =>
      `${JSON.stringify({ type: "source", n, title, url, relevance: 0.9, score: 2.6 })}\n`;
    const delta = (text: string) => `${JSON.stringify({ type: "delta", text })}\n`;

    it("renders a Sources row with one link per article the reply drew on", async () => {
      await askAndWait([source(1, "Your agent needs a bouncer"), source(2, "Teaching Toothless to Bite", "https://medium.com/@tituslhy/lora"), delta("Two pieces cover it.")]);

      await waitFor(() => expect(screen.getByText("Sources")).toBeInTheDocument());
      expect(screen.getByRole("link", { name: "1 · Your agent needs a bouncer" })).toHaveAttribute("href", GUARDRAILS);
      expect(screen.getByRole("link", { name: "2 · Teaching Toothless to Bite" })).toHaveAttribute(
        "href",
        "https://medium.com/@tituslhy/lora"
      );
    });

    it("turns [n] markers into superscript links to the matching source", async () => {
      await askAndWait([source(1, "Your agent needs a bouncer"), delta("Solo, sixteen components [1].")]);

      const link = await screen.findByRole("link", { name: "Source 1: Your agent needs a bouncer" });
      expect(link).toHaveAttribute("href", GUARDRAILS);
      expect(link.closest("sup")).not.toBeNull();
      expect(screen.queryByText(/\[1\]/)).not.toBeInTheDocument();
    });

    it("keeps an [n] marker plain when the server never sent that source", async () => {
      await askAndWait([source(1, "Your agent needs a bouncer"), delta("See [7] and [1].")]);

      await screen.findByRole("link", { name: "Source 1: Your agent needs a bouncer" });
      expect(screen.getByText(/See \[7\] and/)).toBeInTheDocument();
    });

    it("attaches sources that arrive before the first text delta to that reply", async () => {
      await askAndWait([source(1, "Your agent needs a bouncer"), delta("Answer from my writing [1].")]);

      await waitFor(() => expect(screen.getByText(/Answer from my writing/)).toBeInTheDocument());
      expect(screen.getByRole("link", { name: "1 · Your agent needs a bouncer" })).toBeInTheDocument();
    });

    it("de-duplicates sources by n, keeping the first", async () => {
      await askAndWait([source(1, "First title"), source(1, "Second title"), delta("Reply.")]);

      await waitFor(() => expect(screen.getByText("Sources")).toBeInTheDocument());
      expect(screen.getByRole("link", { name: "1 · First title" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "1 · Second title" })).not.toBeInTheDocument();
    });

    it("drops source events that fail validation, so no Sources row or link appears", async () => {
      await askAndWait([
        source(1, "Bad scheme", "javascript:alert(1)"),
        source(1.5, "Fractional"),
        delta("Hi [1]."),
      ]);

      await waitFor(() => expect(screen.getByText(/Hi \[1\]\./)).toBeInTheDocument());
      expect(screen.queryByText("Sources")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Bad scheme/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Fractional/ })).not.toBeInTheDocument();
    });

    it("ignores unknown event types instead of rendering them as text", async () => {
      await askAndWait([`${JSON.stringify({ type: "mystery", text: "SHOULD-NOT-APPEAR" })}\n`, delta("Visible answer.")]);

      await waitFor(() => expect(screen.getByText("Visible answer.")).toBeInTheDocument());
      expect(screen.queryByText(/SHOULD-NOT-APPEAR/)).not.toBeInTheDocument();
    });
  });

  describe("recruiter mode", () => {
    const JD =
      "Staff GenAI Engineer at Acme. Build production RAG and multi-agent platforms on Kubernetes. Rust a plus. Lead a small team.";
    const TARGETS = [{ id: "role-illumina", label: "Illumina, 2023" }];
    const BRIEF = {
      roleTitle: "Staff GenAI Engineer",
      company: "Acme",
      verdict: "Strongest on production retrieval.",
      requirements: [
        { requirement: "Production RAG", fit: "strong", evidence: "I built it at Illumina.", targets: ["role-illumina"] },
        { requirement: "Rust", fit: "not_on_file", evidence: "", targets: [] },
      ],
    };

    async function openFitMode() {
      const user = userEvent.setup();
      render(<CopilotBubble targets={TARGETS} email="me@example.com" />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.click(screen.getByRole("button", { name: /i'm hiring/i }));
      return user;
    }

    it("switches the input to a job-description box and back", async () => {
      const user = await openFitMode();

      expect(screen.getByRole("textbox", { name: /job description/i })).toHaveAttribute(
        "placeholder",
        "Paste the job description…"
      );
      expect(screen.getByRole("button", { name: /check fit/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /back to chat/i }));
      expect(screen.getByPlaceholderText(/ask about my work/i)).toBeInTheDocument();
    });

    it("asks for the full posting when the paste is too short, without calling the API", async () => {
      const user = await openFitMode();
      await user.click(screen.getByRole("textbox", { name: /job description/i }));
      await user.paste("Hire me");
      await user.click(screen.getByRole("button", { name: /check fit/i }));

      expect(screen.getByRole("alert")).toHaveTextContent(/paste the full posting/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("renders the fit brief with evidence links and an email button", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ brief: BRIEF }) });
      const user = await openFitMode();
      await user.click(screen.getByRole("textbox", { name: /job description/i }));
      await user.paste(JD);
      await user.click(screen.getByRole("button", { name: /check fit/i }));

      const card = await screen.findByRole("region", { name: /fit brief for staff genai engineer at acme/i });
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fit",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ jobDescription: JD }) })
      );
      expect(within(card).getByText("Strongest on production retrieval.")).toBeInTheDocument();
      expect(within(card).getByText(/1 of 2 requirements evidenced/i)).toBeInTheDocument();
      expect(within(card).getByText(/not on my site/i)).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: /illumina, 2023/i })).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: /email me about this role/i }).getAttribute("href")).toMatch(
        /^mailto:me@example\.com\?subject=Role%3A%20Staff%20GenAI%20Engineer%20at%20Acme/
      );
      // Back to chat mode for follow-up questions.
      expect(screen.getByPlaceholderText(/ask about my work/i)).toHaveValue("");
    });

    it("shows a friendly error and keeps the pasted text when rate limited", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) });
      const user = await openFitMode();
      await user.click(screen.getByRole("textbox", { name: /job description/i }));
      await user.paste(JD);
      await user.click(screen.getByRole("button", { name: /check fit/i }));

      expect(await screen.findByText(/only write a few of these every ten minutes/i)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /job description/i })).toHaveValue(JD);
    });
  });
});
