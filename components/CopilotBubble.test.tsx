import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEncoder, TextDecoder } from "util";
import CopilotBubble from "./CopilotBubble";
import { ARTICLE_COUNT_NUMBER } from "@/lib/content";
import { openCopilot, startTour } from "@/lib/copilot-events";
import { PAGE_TARGETS } from "@/lib/profile";
import { SITE_TOUR, TOUR_TARGET_IDS, stepDurationMs } from "@/lib/site-tour";
import { STARTER_PROMPTS } from "@/lib/starter-prompts";
import { SHOW_EVENT } from "@/lib/reveal";

// The drawer routes show_on_page to another page with the App Router. Tests give it a
// router they can inspect, and a pathname they can set.
const mockPush = jest.fn();
let mockPathname = "/";
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => mockPathname,
}));

const INTRO = `Ask about my roles, projects or any of my ${ARTICLE_COUNT_NUMBER} articles, or paste a job description to see how I fit.`;

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

/** Mirrors STOP_SETTLE_MS in CopilotBubble: the page moves this long after the first action. */
const STOP_SETTLE_MS = 150;

/** Lets the settle timer and the animation frame after it run, so a page that is going to move has moved. */
async function letPageSettle() {
  await act(() => new Promise((done) => setTimeout(done, STOP_SETTLE_MS + 100)));
}

/** A reply stream of text chunks, with WAIT where it pauses until `release()` is called. */
const WAIT = "wait" as const;
function scriptedResponse(script: Array<string | typeof WAIT>) {
  const encoder = new TextEncoder();
  const queue = [...script];
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  const reader = {
    read: jest.fn(async (): Promise<{ done: boolean; value?: Uint8Array }> => {
      const next = queue.shift();
      if (next === undefined) return { done: true, value: undefined };
      if (next === WAIT) {
        await gate;
        return reader.read();
      }
      return { done: false, value: encoder.encode(next) };
    }),
  };
  const response = { ok: true, status: 200, body: { getReader: () => reader } } as unknown as Response;
  return { response, release };
}
const actionLine = (target: string) => `{"type":"action","target":"${target}"}\n`;
const deltaLine = (text: string) => `{"type":"delta","text":"${text}"}\n`;

/** The scroll box that holds the messages (nearest scrolling ancestor of the starter-state intro). */
function messagesScroller(): HTMLElement {
  const dialog = screen.getByRole("dialog", { name: /ask titus/i });
  const scroller = within(dialog).getByText(INTRO).closest<HTMLElement>(".overflow-y-auto");
  if (!scroller) throw new Error("messages scroller not found");
  return scroller;
}

/** Places an element at `documentTop` in the page (as the scroll sees it), so tests can check where the page moves. */
function placeAt(el: HTMLElement, documentTop: number): HTMLElement {
  el.getBoundingClientRect = () =>
    ({ top: documentTop - window.scrollY, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/** jsdom does no scrolling or layout: sets the offset the page reports as window.scrollY. */
function setScrollY(y: number) {
  window.scrollY = y;
}

/** Adds the site nav, with a fixed height, so scrollUnderNav can measure it. */
function addNav(height: number) {
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Site navigation");
  Object.defineProperty(nav, "offsetHeight", { value: height, configurable: true });
  document.body.append(nav);
  return nav;
}

describe("CopilotBubble", () => {
  // Where the page is asked to scroll; jsdom cannot scroll, so window.scrollTo is mocked.
  let scrollTo: jest.Mock;
  const originalScrollTo = window.scrollTo;
  afterEach(() => {
    window.scrollTo = originalScrollTo;
  });
  beforeEach(() => {
    scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    mockPush.mockReset();
    mockPathname = "/";
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

  it("should not say in the drawer header that chats are logged, and keep the How this works link", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    const dialog = screen.getByRole("dialog", { name: /ask titus/i });
    expect(within(dialog).getByText(/grounded in my public work and writing\. it answers about my work\./i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/chats are logged/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /how this works/i })).toHaveAttribute("href", "/colophon");
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
    expect(screen.getByText("What did you build at Illumina?")).toBeInTheDocument();
    expect(screen.getByText("What trade-offs shaped fictional-bassoon?")).toBeInTheDocument();
    expect(screen.getByText("How would you build production-ready agents?")).toBeInTheDocument();
    expect(screen.getByText("LoRA, RAFT or GRPO: which fine-tuning approach should I use, and when?")).toBeInTheDocument();
    expect(screen.queryByText(/which article should i read first/i)).not.toBeInTheDocument();
  });

  it("says what it can be asked about, with the live article count", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    expect(screen.getByText(INTRO)).toBeInTheDocument();
  });

  it("sends the broad starter question when clicked", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([`{"type":"delta","text":"Broad answer"}\n`])
    );
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    await user.click(screen.getByText("How would you build production-ready agents?"));

    await waitFor(() => {
      expect(screen.getByText(/broad answer/i)).toBeInTheDocument();
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: "How would you build production-ready agents?" }]);
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
    expect(screen.getByText(INTRO)).toBeInTheDocument();

    // Act
    const input = screen.getByPlaceholderText(/ask about my work/i);
    await user.type(input, "Tell me something{Enter}");

    // Assert
    await waitFor(() => {
      expect(screen.queryByText(/what did you build at illumina/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    const scroller = messagesScroller();
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 987 });

    // Act
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Hi{Enter}");

    // Assert - the drawer's own scroll box moves; the page is never scrolled via scrollIntoView
    await waitFor(() => {
      expect(screen.getByText("Response")).toBeInTheDocument();
      expect(scroller.scrollTop).toBe(987);
    });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("starts the empty drawer at the top even if the messages box kept a previous offset", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    const fab = screen.getByRole("button", { name: /open ask titus/i });
    await user.click(fab);
    const scroller = messagesScroller();
    scroller.scrollTop = 300;
    expect(scroller.scrollTop).toBe(300); // jsdom keeps the offset, so the reset below is observable

    // Act - close, leave a stale offset behind while hidden, then reopen
    await user.click(fab);
    scroller.scrollTop = 300;
    await user.click(fab);

    // Assert
    expect(scroller.scrollTop).toBe(0);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
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

  it("should display updated chat-mode footer disclosure", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));

    // Assert
    expect(
      screen.getByText(
        "Messages go to OpenAI to generate a reply and are logged so I can improve answers. Nothing is stored in your browser."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/does not save your chat history/i)).not.toBeInTheDocument();
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

    it("sends the prompt as the visitor's question when opened with one", async () => {
      const PROMPT = "What did you build at Illumina?";
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([`{"type":"delta","text":"Prompt answer"}\n`])
      );
      render(<CopilotBubble />);

      act(() => {
        openCopilot("chat", PROMPT);
      });

      expect(await screen.findByText("Prompt answer")).toBeInTheDocument();
      expect(screen.getByText(PROMPT)).toBeInTheDocument();
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.messages).toEqual([{ role: "user", content: PROMPT }]);
    });

    it("opens without sending anything when the event carries no prompt", async () => {
      render(<CopilotBubble />);

      act(() => {
        openCopilot("chat");
      });

      expect(await screen.findByRole("dialog", { name: /ask titus/i })).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("lists the same starter prompts as the front page band (one shared list)", async () => {
      const user = userEvent.setup();
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));

      for (const prompt of STARTER_PROMPTS) {
        expect(screen.getByText(prompt)).toBeInTheDocument();
      }
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

    it("sends the citations from earlier replies with the next message, as number and link only", async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createStreamingResponse([source(1, "Your agent needs a bouncer"), delta("First answer [1].")]))
        .mockResolvedValueOnce(createStreamingResponse([delta("Second answer.")]));
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      const input = screen.getByPlaceholderText(/ask about my work/i);

      await user.type(input, "First question{Enter}");
      await waitFor(() => expect(screen.getByText("Sources")).toBeInTheDocument());
      await user.type(input, "Second question{Enter}");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

      const bodyOf = (call: number) => JSON.parse((global.fetch as jest.Mock).mock.calls[call][1].body);
      expect(bodyOf(0).citations).toEqual([]);
      expect(bodyOf(1).citations).toEqual([{ n: 1, url: GUARDRAILS }]);
      expect(bodyOf(1).citations[0]).not.toHaveProperty("title");
    });

    it("links a citation to an article cited in an earlier reply", async () => {
      const EARLIER = "https://medium.com/@tituslhy/earlier";
      const user = userEvent.setup();
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(createStreamingResponse([source(2, "Earlier article", EARLIER), delta("First answer [2].")]))
        .mockResolvedValueOnce(createStreamingResponse([delta("The most recent is [2].")]));
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      const input = screen.getByPlaceholderText(/ask about my work/i);

      await user.type(input, "First question{Enter}");
      await waitFor(() => expect(screen.getByText("Sources")).toBeInTheDocument());
      await user.type(input, "Second question{Enter}");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText(/The most recent is/)).toBeInTheDocument());

      // One superscript per reply: reply 2 has no footnote of its own, but [2] still points at the earlier article.
      const links = screen.getAllByRole("link", { name: "Source 2: Earlier article" });
      expect(links).toHaveLength(2);
      for (const link of links) expect(link).toHaveAttribute("href", EARLIER);
    });

    it("a number no reply ever sent stays plain text", async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([delta("Unknown [9] here.")]));
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Question{Enter}");

      await waitFor(() => expect(screen.getByText(/Unknown \[9\] here\./)).toBeInTheDocument());
      expect(screen.queryByRole("link", { name: /^Source 9/ })).not.toBeInTheDocument();
    });

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

    it("draws a comma between adjacent citations: [1][2] renders 1, then a comma, then 2", async () => {
      const SECOND = "https://medium.com/@tituslhy/lora";
      await askAndWait([
        source(1, "Your agent needs a bouncer"),
        source(2, "Teaching Toothless to Bite", SECOND),
        delta("Both say so [1][2]."),
      ]);

      const first = await screen.findByRole("link", { name: "Source 1: Your agent needs a bouncer" });
      const second = screen.getByRole("link", { name: "Source 2: Teaching Toothless to Bite" });
      expect(second).toHaveAttribute("href", SECOND);
      const [supOne, supTwo] = [first.closest("sup"), second.closest("sup")];
      expect(supOne).toHaveTextContent(/^1$/);
      expect(supOne?.querySelector("span")).toBeNull();
      expect(supTwo?.textContent).toBe(",2");
      expect(supTwo?.querySelector("span")).toHaveTextContent(/^,$/);
      expect(supOne?.nextElementSibling).toBe(supTwo);
    });

    it("draws no comma between citations separated by text", async () => {
      await askAndWait([
        source(1, "Your agent needs a bouncer"),
        source(2, "Teaching Toothless to Bite", "https://medium.com/@tituslhy/lora"),
        delta("Yes [1] and more [2]."),
      ]);

      await screen.findByRole("link", { name: "Source 1: Your agent needs a bouncer" });
      const sups = [...document.querySelectorAll("sup")];
      expect(sups.map((sup) => sup.textContent)).toEqual(["1", "2"]);
      expect(document.querySelectorAll("sup span")).toHaveLength(0);
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
    const TARGETS = [{ id: "role-illumina", label: "Illumina, 2023", path: "/experience" }];
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

  describe("show_on_page from the model", () => {
    const TARGET_ID = "role-illumina";
    const TARGETS = [{ id: TARGET_ID, label: "Illumina, 2023", path: "/experience" }];
    const SIDE_BY_SIDE = "(min-width: 1024px)";
    const WIDE = "(min-width: 1440px)";
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
    });

    afterEach(async () => {
      // A reply's settle timer outlives its test if the test ends first; let it fire here, not in the next test.
      await letPageSettle();
      window.matchMedia = originalMatchMedia;
    });

    // Answers each media query by whether it is listed in `matchingQueries`.
    function mockMatchMedia(matchingQueries: string[]) {
      // jest.setup defines matchMedia as writable but non-configurable, so assign rather than redefine.
      window.matchMedia = jest.fn((query: string) => ({
        matches: matchingQueries.includes(query),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }));
    }

    // Sends one question whose stream opens with an auto action for TARGET_ID.
    // Places the target 700px down the page, where the page should scroll to it (16px below the nav).
    async function askModelToShowTarget({ expanded, matching }: { expanded: boolean; matching: string[] }) {
      mockMatchMedia(matching);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          `{"type":"action","target":"${TARGET_ID}"}\n`,
          `{"type":"delta","text":"Here it is."}\n`,
        ])
      );
      render(
        <>
          <div id={TARGET_ID}>Illumina entry</div>
          <CopilotBubble targets={TARGETS} />
        </>
      );
      placeAt(document.getElementById(TARGET_ID)!, 700);

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      if (expanded) {
        await user.click(screen.getByRole("button", { name: /expand chat/i }));
      }
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Show me Illumina{Enter}");
      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    }

    it("scrolls the page to the target when expanded and the 1440px query matches", async () => {
      await askModelToShowTarget({ expanded: true, matching: [SIDE_BY_SIDE, WIDE] });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 684, behavior: "smooth" }));
    });

    it("does not scroll the page when expanded and only the 1024px query matches", async () => {
      await askModelToShowTarget({ expanded: true, matching: [SIDE_BY_SIDE] });
      await letPageSettle();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("still scrolls the page when collapsed and the 1024px query matches", async () => {
      await askModelToShowTarget({ expanded: false, matching: [SIDE_BY_SIDE] });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 684, behavior: "smooth" }));
    });
  });

  describe("show_on_page to another page", () => {
    const TARGET_ID = "role-illumina";
    const PATH = "/experience";
    const TARGETS = [{ id: TARGET_ID, label: "Illumina, 2023", path: PATH, page: "Experience" }];
    const SIDE_BY_SIDE = "(min-width: 1024px)";
    let originalMatchMedia: typeof window.matchMedia;
    let arrivedEl: HTMLElement | null = null;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      arrivedEl = null;
      // The router renders the target page: its anchor appears once the route changes.
      mockPush.mockImplementation(() => {
        const el = document.createElement("div");
        el.id = TARGET_ID;
        el.textContent = "Illumina entry";
        placeAt(el, 250);
        document.body.appendChild(el);
        arrivedEl = el;
      });
    });

    afterEach(async () => {
      await letPageSettle();
      window.matchMedia = originalMatchMedia;
      document.getElementById(TARGET_ID)?.remove();
      window.history.replaceState({}, "", "/");
    });

    function mockMatchMedia(matchingQueries: string[]) {
      window.matchMedia = jest.fn((query: string) => ({
        matches: matchingQueries.includes(query),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }));
    }

    // The model asks to show a target that is not rendered on this page yet.
    async function askModelToShow({ matching, expanded = false }: { matching: string[]; expanded?: boolean }) {
      mockMatchMedia(matching);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          `{"type":"action","target":"${TARGET_ID}"}\n`,
          `{"type":"delta","text":"Here it is."}\n`,
        ])
      );
      render(<CopilotBubble targets={TARGETS} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      if (expanded) await user.click(screen.getByRole("button", { name: /expand chat/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Show me Illumina{Enter}");
      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    }

    it("navigates to the target's page, then scrolls to the anchor once it has rendered", async () => {
      await askModelToShow({ matching: [SIDE_BY_SIDE] });

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith(PATH, { scroll: false }));
      await waitFor(() => expect(arrivedEl).not.toBeNull());
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 234, behavior: "smooth" }));
      expect(arrivedEl!.classList.contains("copilot-spotlight")).toBe(true);
    });

    it("does not navigate when the page is too narrow to show it beside the drawer", async () => {
      await askModelToShow({ matching: [] });
      await letPageSettle();

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not navigate for a target already on this page when its anchor is missing", async () => {
      // The target's route is the page the visitor is on, so there is nowhere else to go.
      window.history.replaceState({}, "", PATH);
      mockPathname = PATH;
      await askModelToShow({ matching: [SIDE_BY_SIDE] });
      await letPageSettle();

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("navigates from a See on page control on another page, even when the drawer is narrow", async () => {
      mockMatchMedia([]);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          `{"type":"action","target":"${TARGET_ID}"}\n`,
          `{"type":"delta","text":"Here it is."}\n`,
        ])
      );
      render(<CopilotBubble targets={TARGETS} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Show me Illumina{Enter}");
      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
      expect(mockPush).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Experience · Illumina, 2023" }));

      expect(mockPush).toHaveBeenCalledWith(PATH, { scroll: false });
      await waitFor(() => expect(arrivedEl).not.toBeNull());
    });

    it("marks a See on page target on another route with an arrow, and one on this page with a down arrow", async () => {
      mockMatchMedia([]);
      mockPathname = "/";
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          `{"type":"action","target":"role-illumina"}\n`,
          `{"type":"action","target":"open-source"}\n`,
          `{"type":"delta","text":"Two things."}\n`,
        ])
      );
      render(
        <CopilotBubble
          targets={[
            { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" },
            { id: "open-source", label: "Open source", path: "/", page: "Projects" },
          ]}
        />
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Two things{Enter}");
      await waitFor(() => expect(screen.getByText("Two things.")).toBeInTheDocument());

      expect(screen.getByRole("button", { name: "Experience · Illumina, 2023" })).toHaveTextContent("→ Experience · Illumina, 2023");
      expect(screen.getByRole("button", { name: "Projects · Open source" })).toHaveTextContent("↓ Projects · Open source");
    });
  });

  describe("scrolling under the nav", () => {
    const SIDE_BY_SIDE = "(min-width: 1024px)";
    const REDUCE = "(prefers-reduced-motion: reduce)";
    const TARGET = { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" };
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
    });

    afterEach(async () => {
      await letPageSettle();
      window.matchMedia = originalMatchMedia;
      setScrollY(0);
      window.history.replaceState({}, "", "/");
      document.querySelectorAll(`#${TARGET.id}, nav[aria-label="Site navigation"]`).forEach((el) => el.remove());
    });

    function mockMatchMedia(matchingQueries: string[]) {
      window.matchMedia = jest.fn((query: string) => ({
        matches: matchingQueries.includes(query),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }));
    }

    /** Asks about an entry on this page, which the page then scrolls to. `top` is its position in the document. */
    async function askAboutEntry({ top, scrollY, reduce = false }: { top: number; scrollY: number; reduce?: boolean }) {
      setScrollY(scrollY);
      mockMatchMedia(reduce ? [SIDE_BY_SIDE, REDUCE] : [SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/experience");
      mockPathname = "/experience";
      const entry = document.createElement("div");
      entry.id = TARGET.id;
      entry.textContent = "Illumina entry";
      document.body.append(placeAt(entry, top));
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([actionLine(TARGET.id), deltaLine("Here it is.")])
      );
      render(<CopilotBubble targets={[TARGET]} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Show me Illumina{Enter}");
      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    }

    it("scrolling down leaves 16px above the entry, even with the nav on the page", async () => {
      addNav(64);
      await askAboutEntry({ top: 900, scrollY: 200 });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 884, behavior: "smooth" }));
    });

    it("scrolling up leaves room for the nav (its height) plus 16px above the entry", async () => {
      addNav(64);
      await askAboutEntry({ top: 800, scrollY: 1200 });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" }));
    });

    it.each([
      ["down", 200, 900, 884],
      ["up", 1200, 800, 784],
    ])("with no nav on the page, scrolling %s leaves 16px above the entry", async (_direction, scrollY, top, expected) => {
      await askAboutEntry({ top, scrollY });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: expected, behavior: "smooth" }));
    });

    it.each([
      ["down, near the top of the page", 0, 10],
      ["up, under a tall nav", 1200, 40],
    ])("never scrolls to a negative position (%s)", async (_direction, scrollY, top) => {
      addNav(64);
      await askAboutEntry({ top, scrollY });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" }));
    });

    it.each([
      [true, "instant"],
      [false, "smooth"],
    ])("with reduced motion %s, the page scrolls with behavior %s", async (reduce, behavior) => {
      await askAboutEntry({ top: 500, scrollY: 0, reduce });

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 484, behavior }));
    });
  });

  describe("guided tour", () => {
    const SIDE_BY_SIDE = "(min-width: 1024px)";
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
    });

    afterEach(async () => {
      jest.useRealTimers();
      await letPageSettle();
      window.matchMedia = originalMatchMedia;
      window.history.replaceState({}, "", "/");
      document.querySelectorAll("#role-illumina, #tool-tigergraph, #tool-neo4j, #stack").forEach((el) => el.remove());
    });

    function mockMatchMedia(matchingQueries: string[]) {
      window.matchMedia = jest.fn((query: string) => ({
        matches: matchingQueries.includes(query),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }));
    }

    /** A page element placed `top` px down the page, for the scroll to measure. */
    function pageEl(id: string, text = id, top = 400): HTMLElement {
      const el = document.createElement(id.startsWith("tool-") ? "button" : "div");
      el.id = id;
      el.textContent = text;
      return placeAt(el, top);
    }

    async function askQuestion(question: string) {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
      return user;
    }

    const ILLUMINA = { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" };
    const TIGERGRAPH = { id: "tool-tigergraph", label: "TigerGraph", path: "/about", page: "About", tool: true };
    const NEO4J = { id: "tool-neo4j", label: "Neo4j", path: "/about", page: "About", tool: true };

    it("moves the page once, to the stop on the page being read, when several actions arrive", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/about");
      mockPathname = "/about";
      const illumina = pageEl("role-illumina", "role-illumina", 100);
      const stack = document.createElement("section");
      stack.id = "stack";
      const tigergraph = pageEl("tool-tigergraph", "TigerGraph");
      const neo4j = pageEl("tool-neo4j", "Neo4j");
      stack.append(tigergraph, neo4j);
      placeAt(stack, 800);
      document.body.append(illumina, stack);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          actionLine("role-illumina"),
          actionLine("tool-tigergraph"),
          actionLine("tool-neo4j"),
          deltaLine("Both are in the stack."),
        ])
      );
      render(<CopilotBubble targets={[ILLUMINA, TIGERGRAPH, NEO4J]} />);
      await askQuestion("Illumina and graphs?");
      await waitFor(() => expect(screen.getByText("Both are in the stack.")).toBeInTheDocument());

      await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
      await letPageSettle();
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ top: 784, behavior: "smooth" });
      expect(mockPush).not.toHaveBeenCalled();
      [illumina, stack, tigergraph, neo4j].forEach((el) => el.remove());
    });

    it("moves to the first stop when none is on the page being read", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      // Nothing on this page is named, so the first stop (Illumina, on another page) is the one the page moves to.
      let arrived: HTMLElement | null = null;
      mockPush.mockImplementation(() => {
        arrived = pageEl("role-illumina", "role-illumina", 300);
        document.body.append(arrived);
      });
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([actionLine("role-illumina"), actionLine("tool-neo4j"), deltaLine("Done.")])
      );
      render(<CopilotBubble targets={[ILLUMINA, NEO4J]} />);
      await askQuestion("Illumina and Neo4j?");

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false }));
      await waitFor(() => expect(arrived).not.toBeNull());
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 284, behavior: "smooth" }));
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("does not move the page when the visitor scrolls before the settle timer, but still lists the stops", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/experience");
      mockPathname = "/experience";
      const illumina = pageEl("role-illumina");
      document.body.append(illumina);
      const gated = scriptedResponse([actionLine("role-illumina"), deltaLine("Here "), WAIT, deltaLine("it is.")]);
      (global.fetch as jest.Mock).mockResolvedValue(gated.response);
      render(<CopilotBubble targets={[ILLUMINA]} />);
      await askQuestion("Show me Illumina");

      await screen.findByRole("button", { name: "Experience · Illumina, 2023" });
      fireEvent.wheel(document.body);
      await letPageSettle();
      gated.release();

      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
      expect(scrollTo).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Experience · Illumina, 2023" })).toBeInTheDocument();
      illumina.remove();
    });

    it("still moves the page when the scroll happens inside the drawer", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/experience");
      mockPathname = "/experience";
      const illumina = pageEl("role-illumina");
      document.body.append(illumina);
      const gated = scriptedResponse([actionLine("role-illumina"), deltaLine("Here "), WAIT, deltaLine("it is.")]);
      (global.fetch as jest.Mock).mockResolvedValue(gated.response);
      render(<CopilotBubble targets={[ILLUMINA]} />);
      await askQuestion("Show me Illumina");

      await screen.findByRole("button", { name: "Experience · Illumina, 2023" });
      fireEvent.wheel(screen.getByPlaceholderText(/ask about my work/i));
      gated.release();

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 384, behavior: "smooth" }));
      illumina.remove();
    });

    it("lists two tool tiles as one pill named for the table", async () => {
      mockMatchMedia([]);
      mockPathname = "/about";
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([actionLine("tool-tigergraph"), actionLine("tool-neo4j"), deltaLine("Graphs.")])
      );
      render(<CopilotBubble targets={[TIGERGRAPH, NEO4J]} />);
      await askQuestion("Graph databases?");
      await waitFor(() => expect(screen.getByText("Graphs.")).toBeInTheDocument());

      expect(screen.getByText("See on page")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "About · TigerGraph, Neo4j" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^About · / })).toHaveLength(1);
    });

    it("dispatches the show event with every tool id and spotlights each tool tile", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/about");
      mockPathname = "/about";
      const stack = document.createElement("section");
      stack.id = "stack";
      const tigergraph = pageEl("tool-tigergraph", "TigerGraph");
      const neo4j = pageEl("tool-neo4j", "Neo4j");
      stack.append(tigergraph, neo4j);
      placeAt(stack, 640);
      document.body.append(stack);
      const received: string[][] = [];
      const onShow = (e: Event) => received.push((e as CustomEvent<{ ids: string[] }>).detail.ids);
      document.addEventListener(SHOW_EVENT, onShow);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([actionLine("tool-tigergraph"), actionLine("tool-neo4j"), deltaLine("Both.")])
      );
      render(<CopilotBubble targets={[TIGERGRAPH, NEO4J]} />);
      await askQuestion("Graphs?");

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 624, behavior: "smooth" }));
      expect(received).toEqual([["tool-tigergraph", "tool-neo4j"]]);
      expect(tigergraph.classList.contains("copilot-spotlight")).toBe(true);
      expect(neo4j.classList.contains("copilot-spotlight")).toBe(true);
      document.removeEventListener(SHOW_EVENT, onShow);
      stack.remove();
    });

    it("scrolls a tool stop to the whole table (#stack), not to the tile that was named", async () => {
      mockMatchMedia([SIDE_BY_SIDE]);
      window.history.replaceState({}, "", "/about");
      mockPathname = "/about";
      const stack = document.createElement("section");
      stack.id = "stack";
      stack.append(pageEl("tool-tigergraph", "TigerGraph", 760));
      placeAt(stack, 640);
      document.body.append(stack);
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([actionLine("tool-tigergraph"), deltaLine("Graphs.")])
      );
      render(<CopilotBubble targets={[TIGERGRAPH]} />);
      await askQuestion("Graphs?");

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 624, behavior: "smooth" }));
      expect(scrollTo).toHaveBeenCalledTimes(1);
      stack.remove();
    });

    describe("tapping a stop on a phone", () => {
      const QUESTION = "Show me everything you built at Illumina, including the agents, the data pipelines and the evaluation harness";

      async function answerWithIllumina() {
        mockMatchMedia([]);
        (global.fetch as jest.Mock).mockResolvedValue(
          createStreamingResponse([actionLine("role-illumina"), deltaLine("Here it is.")])
        );
        render(<CopilotBubble targets={[ILLUMINA]} />);
        const user = await askQuestion(QUESTION);
        await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
        return user;
      }

      it("closes the drawer, goes to the stop, and leaves a note of the question cut to 60 characters", async () => {
        const user = await answerWithIllumina();
        expect(screen.queryByRole("status")).toBeNull();

        await user.click(screen.getByRole("button", { name: "Experience · Illumina, 2023" }));

        expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false });
        expect(screen.getByRole("button", { name: /open ask titus/i })).toBeInTheDocument();
        const cut = `${QUESTION.slice(0, 57).trimEnd()}…`;
        expect(cut).toBe("Show me everything you built at Illumina, including the a…");
        expect(cut.length).toBeLessThanOrEqual(60);
        expect(screen.getByRole("status")).toHaveTextContent(`Asked: ${cut}`);
      });

      it("clears the note when the drawer opens again", async () => {
        const user = await answerWithIllumina();
        await user.click(screen.getByRole("button", { name: "Experience · Illumina, 2023" }));
        expect(screen.getByRole("status")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /open ask titus/i }));

        expect(screen.queryByRole("status")).toBeNull();
      });

      it("clears the note after 10 seconds", async () => {
        await answerWithIllumina();
        jest.useFakeTimers();
        fireEvent.click(screen.getByRole("button", { name: "Experience · Illumina, 2023" }));
        expect(screen.getByRole("status")).toBeInTheDocument();

        act(() => {
          jest.advanceTimersByTime(9_900);
        });
        expect(screen.getByRole("status")).toBeInTheDocument();

        act(() => {
          jest.advanceTimersByTime(200);
        });
        expect(screen.queryByRole("status")).toBeNull();
      });

      it("keeps the question whole when it is 60 characters or fewer", async () => {
        const short = "Illumina agents?";
        mockMatchMedia([]);
        (global.fetch as jest.Mock).mockResolvedValue(
          createStreamingResponse([actionLine("role-illumina"), deltaLine("Here it is.")])
        );
        render(<CopilotBubble targets={[ILLUMINA]} />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: /open ask titus/i }));
        await user.type(screen.getByPlaceholderText(/ask about my work/i), `${short}{Enter}`);
        await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Experience · Illumina, 2023" }));

        expect(screen.getByRole("status")).toHaveTextContent(`Asked: ${short}`);
      });
    });
  });
});

describe("CopilotBubble: a dropped connection", () => {
  const EMAIL = "me@example.com";
  const DROPPED = /connection dropped before I could finish/i;

  beforeEach(() => {
    mockPush.mockReset();
    mockPathname = "/";
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function askOnce(question = "Hi") {
    const user = userEvent.setup();
    render(<CopilotBubble email={EMAIL} />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
  }

  it("says the connection dropped, with the email, when fetch rejects with a TypeError", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Failed to fetch"));
    await askOnce();

    await waitFor(() => expect(screen.getByText(DROPPED)).toBeInTheDocument());
    expect(screen.getByText(new RegExp(EMAIL.replace(".", "\\.")))).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
  });

  it("says the connection dropped when the stream reader rejects with a TypeError mid-reply", async () => {
    const encoder = new TextEncoder();
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode(`{"type":"delta","text":"Partway"}\n`) })
        .mockRejectedValueOnce(new TypeError("network error")),
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } });
    await askOnce();

    await waitFor(() => expect(screen.getByText(DROPPED)).toBeInTheDocument());
    expect(screen.getByText(new RegExp(EMAIL.replace(".", "\\.")))).toBeInTheDocument();
    expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
  });

  it("still shows the message of an Error that is not a TypeError", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Quota exceeded for this session"));
    await askOnce();

    await waitFor(() => expect(screen.getByText(/quota exceeded for this session/i)).toBeInTheDocument());
    expect(screen.queryByText(DROPPED)).not.toBeInTheDocument();
  });
});

describe("CopilotBubble: the Show me around tour", () => {
  const WIDE = "(min-width: 1024px)";
  const REDUCED = "(prefers-reduced-motion: reduce)";
  const steps = SITE_TOUR.steps;
  const total = steps.length;
  const dur = (i: number) => stepDurationMs(steps[i]);
  /** Time from the start of the tour to the start of step `i` (0-based). */
  const startOf = (i: number) => steps.slice(0, i).reduce((sum, st) => sum + stepDurationMs(st), 0);
  const ALL_DONE = startOf(total);

  const TARGETS = PAGE_TARGETS.map((t) => ({ id: t.id, label: t.label, path: t.path, page: "Page", tool: "tool" in t ? t.tool : undefined }));
  // Page anchors the tour names, as they would be on screen. Tests remove some to model a page that never renders them.
  const pageTargetIds = Array.from(new Set(steps.flatMap((st) => st.targets))).filter((id) => TOUR_TARGET_IDS.includes(id) && !["ask-button", "fit-mode"].includes(id));

  let originalMatchMedia: typeof window.matchMedia;
  let mediaListeners: Map<string, Set<() => void>>;
  let mediaState: Record<string, boolean>;
  let scrollToSpy: jest.Mock;
  const originalScrollTo = window.scrollTo;

  /** matchMedia that answers from `mediaState`, and lets a test flip a query and tell its listeners. */
  function installMatchMedia() {
    mediaListeners = new Map();
    window.matchMedia = jest.fn((query: string) => ({
      get matches() {
        return !!mediaState[query];
      },
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn((_type: string, fn: () => void) => {
        if (!mediaListeners.has(query)) mediaListeners.set(query, new Set());
        mediaListeners.get(query)!.add(fn);
      }),
      removeEventListener: jest.fn((_type: string, fn: () => void) => mediaListeners.get(query)?.delete(fn)),
      dispatchEvent: jest.fn(() => true),
    })) as unknown as typeof window.matchMedia;
  }
  function setMedia(query: string, matches: boolean) {
    mediaState[query] = matches;
    act(() => {
      mediaListeners.get(query)?.forEach((fn) => fn());
    });
  }

  const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
  const play = (steps_ = 0) => {
    act(() => startTour());
    if (steps_) advance(startOf(steps_) + 1);
  };
  const fab = () => document.getElementById("ask-button") as HTMLElement;
  const isOpen = () => fab().getAttribute("aria-expanded") === "true";
  const caption = () => screen.queryByRole("region", { name: "Site tour" });
  /** The narration of step `i` where it is typed in (the drawer's newest line, or the caption): found by its visually hidden full copy. */
  const say = (i: number) => Array.from(document.querySelectorAll(".sr-only")).find((el) => el.textContent === steps[i].say) ?? null;
  /** The caption's own live announcement of step `i`. */
  const announced = (i: number) => (caption() ? within(caption()!).queryByText(`${steps[i].say} (tour, step ${i + 1} of ${total})`) : null);
  const recorded = () => screen.queryByText("Recorded tour");

  function renderBubble() {
    return render(<CopilotBubble targets={TARGETS} />);
  }

  /** The drawer's own "next" button, whose accessible name leaves out its decorative arrow. */
  const nextButton = (n: number) => screen.getByRole("button", { name: `Next · ${n} of ${total}` });

  /** Types a question into the open drawer and sends it; the (mocked) reply streams in after. */
  async function ask(question: string) {
    fireEvent.change(screen.getByPlaceholderText(/ask about my work/i), { target: { value: question } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockReset();
    mockPathname = "/";
    originalMatchMedia = window.matchMedia;
    mediaState = { [WIDE]: true };
    installMatchMedia();
    scrollToSpy = jest.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
    if (!global.TextDecoder) global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    global.fetch = jest.fn();
    global.crypto = { randomUUID: jest.fn(() => "tour-id-" + Math.random().toString(36).slice(2)) } as unknown as Crypto;
    window.history.replaceState({}, "", "/");
    for (const id of pageTargetIds) {
      const el = document.createElement("div");
      el.id = id;
      el.setAttribute("data-test-tour-target", "");
      document.body.append(el);
    }
  });

  afterEach(() => {
    act(() => void jest.runOnlyPendingTimers());
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.scrollTo = originalScrollTo;
    document.querySelectorAll("[data-test-tour-target]").forEach((el) => el.remove());
    window.history.replaceState({}, "", "/");
  });

  describe("starting", () => {
    it("gives the Ask Titus button the id the tour rings", () => {
      renderBubble();
      expect(fab()).toBeInTheDocument();
      expect(fab()).toHaveAttribute("aria-label", "Open Ask Titus");
    });

    it("gives the hiring prompt the id fit-mode", () => {
      renderBubble();
      act(() => openCopilot());
      const fit = document.getElementById("fit-mode");
      expect(fit).toBeInTheDocument();
      expect(fit?.tagName).toBe("BUTTON");
      expect(fit).toHaveTextContent(/hiring/i);
    });

    it("does not start by itself", () => {
      renderBubble();
      advance(ALL_DONE);
      expect(isOpen()).toBe(false);
      expect(recorded()).not.toBeInTheDocument();
    });

    it("opens and plays on copilot:tour: the drawer is open and \"Recorded tour\" is visible", () => {
      renderBubble();
      play();
      expect(isOpen()).toBe(true);
      expect(screen.getByRole("dialog", { name: /ask titus/i })).toBeInTheDocument();
      expect(recorded()).toBeInTheDocument();
      expect(say(0)).toBeInTheDocument();
    });

    it("hides the starter prompts' intro behind the tour thread, which comes first", () => {
      renderBubble();
      play();
      const thread = document.getElementById("copilot-tour")!;
      const intro = screen.getByText(INTRO);
      expect(thread.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("tells screen readers each step: the line and 'tour, step n of total'", () => {
      renderBubble();
      play();
      expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(`${steps[0].say} (tour, step 1 of ${total})`);
      advance(dur(0) + 1);
      expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(`${steps[1].say} (tour, step 2 of ${total})`);
    });

    it("leaves recruiter mode for chat when the tour starts", () => {
      renderBubble();
      act(() => openCopilot("fit"));
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      play();
      expect(screen.queryByRole("textbox", { name: "Job description" })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ask about my work/i)).toBeInTheDocument();
    });

    it("stops listening for the tour event on unmount", () => {
      const { unmount } = renderBubble();
      unmount();
      expect(() => act(() => startTour())).not.toThrow();
    });
  });

  describe("the first two steps", () => {
    it("play in the open drawer on a narrow screen too", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      expect(isOpen()).toBe(true);
      expect(caption()).not.toBeInTheDocument();
      advance(dur(0) + 1);
      expect(isOpen()).toBe(true);
      expect(caption()).not.toBeInTheDocument();
      expect(recorded()).toBeInTheDocument();
    });

    it("ring the Ask Titus button and the hiring prompt on step 2", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      expect(fab()).toHaveClass("tour-ring");
      // The second ring comes 2 s later (the step's targets are spaced across it, at most 2 s apart).
      advance(2000);
      expect(document.getElementById("fit-mode")).toHaveClass("tour-ring");
    });

    it("take the rings off again after a moment", () => {
      renderBubble();
      play();
      advance(dur(0) + 2002);
      advance(3000);
      expect(fab()).not.toHaveClass("tour-ring");
      expect(document.getElementById("fit-mode")).not.toHaveClass("tour-ring");
    });
  });

  describe("from step 3", () => {
    it("shows the caption on narrow screens, and the drawer closes", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      expect(isOpen()).toBe(false);
      expect(screen.getByText(`Titus · Recorded tour · 3 of ${total}`)).toBeInTheDocument();
      expect(announced(2)).toBeInTheDocument();
      expect(announced(2)).toHaveAttribute("aria-live", "polite");
    });

    it("keeps the narration in the drawer on wide screens, with no caption", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(caption()).not.toBeInTheDocument();
      expect(isOpen()).toBe(true);
      expect(say(2)).toBeInTheDocument();
    });

    it("lists the steps so far in the drawer, earlier ones as plain text", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(screen.getByText(steps[0].say)).toBeInTheDocument();
      expect(screen.getByText(steps[1].say)).toBeInTheDocument();
      expect(say(2)).toBeInTheDocument();
      expect(say(3)).not.toBeInTheDocument();
    });

    it("uses the expanded drawer's wider breakpoint (1440px) when the drawer is expanded", () => {
      mediaState[WIDE] = true; // 1024+ but not 1440+
      renderBubble();
      act(() => openCopilot());
      fireEvent.click(screen.getByRole("button", { name: /expand/i }));
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      setMedia("(min-width: 1440px)", true);
      expect(caption()).not.toBeInTheDocument();
    });

    it("moves the page to the step's target", () => {
      renderBubble();
      play();
      advance(startOf(2) + 600);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(document.getElementById(steps[2].targets[0])).toHaveClass("copilot-spotlight");
    });

    it("moves a page that is not open yet with the router, and does not go back", async () => {
      document.getElementById(steps[2].targets[0])?.remove();
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false });
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  describe("switching layout on resize", () => {
    it("switches layout on resize without changing step", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      expect(caption()).not.toBeInTheDocument();
      expect(say(3)).toBeInTheDocument();

      // The window narrows (a rotate, a resize): the narration moves out to the caption, on the same step.
      setMedia(WIDE, false);
      expect(caption()).toBeInTheDocument();
      expect(isOpen()).toBe(false);
      expect(screen.getByText(`Titus · Recorded tour · 4 of ${total}`)).toBeInTheDocument();
      expect(announced(3)).toBeInTheDocument();

      // And widens again: back into the drawer, still step 4.
      setMedia(WIDE, true);
      expect(caption()).not.toBeInTheDocument();
      expect(isOpen()).toBe(true);
      expect(say(3)).toBeInTheDocument();
      expect(nextButton(4)).toBeInTheDocument();
    });

    it("keeps its clock across the switch, so the step still ends on time", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      setMedia(WIDE, false);
      advance(dur(3) - 2);
      expect(screen.getByText(new RegExp(`Recorded tour · 4 of ${total}`))).toBeInTheDocument();
      advance(2);
      expect(screen.getByText(new RegExp(`Recorded tour · 5 of ${total}`))).toBeInTheDocument();
    });

    it("does nothing to the drawer in the first two steps", () => {
      renderBubble();
      play();
      setMedia(WIDE, false);
      expect(isOpen()).toBe(true);
      expect(caption()).not.toBeInTheDocument();
    });
  });

  describe("the drawer's controls (wide screens)", () => {
    it("reads Pause, then Resume, and pausing stops the clock", () => {
      renderBubble();
      play();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
      advance(ALL_DONE);
      expect(say(0)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      advance(dur(0) + 1);
      expect(say(1)).toBeInTheDocument();
    });

    it("reads \"Next · n of total →\" and goes to the next step at once", () => {
      renderBubble();
      play();
      const next = nextButton(1);
      fireEvent.click(next);
      expect(say(1)).toBeInTheDocument();
      expect(nextButton(2)).toBeInTheDocument();
    });

    it("reads \"Finish →\" on the last step, and finishing ends the tour", () => {
      renderBubble();
      play();
      advance(startOf(total - 1) + 1);
      expect(screen.queryByRole("button", { name: /^Next/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(say(total - 1)).toBeInTheDocument();
    });

    it("ends the tour with \"End tour\": the closing line, the drawer open", () => {
      renderBubble();
      play();
      advance(startOf(4) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(say(total - 1)).toBeInTheDocument();
      expect(say(4)).not.toBeInTheDocument();
      expect(isOpen()).toBe(true);
    });

    it("keeps going when the visitor clicks inside the drawer", () => {
      renderBubble();
      play();
      fireEvent.pointerDown(screen.getByRole("dialog", { name: /ask titus/i }));
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "a" });
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("pauses when the visitor takes over the page", () => {
      renderBubble();
      play();
      fireEvent.wheel(document.body);
      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    });

    it("shows no controls once it is over", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(screen.queryByRole("button", { name: /^(Pause|Resume|End tour)$/ })).not.toBeInTheDocument();
    });
  });

  describe("the phone caption", () => {
    beforeEach(() => {
      mediaState[WIDE] = false;
    });

    it("has Pause/Resume, \"Skip →\" and ✕ (End tour)", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      const region = within(caption()!);
      fireEvent.click(region.getByRole("button", { name: "Pause" }));
      expect(region.getByRole("button", { name: "Resume" })).toBeInTheDocument();
      fireEvent.click(region.getByRole("button", { name: "Resume" }));
      expect(region.getByRole("button", { name: /^Skip/ })).toHaveTextContent("Skip →");
      expect(region.getByRole("button", { name: "End tour" })).toHaveTextContent("✕");
    });

    it("moves to the next step on Skip", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.click(within(caption()!).getByRole("button", { name: /^Skip/ }));
      expect(screen.getByText(`Titus · Recorded tour · 4 of ${total}`)).toBeInTheDocument();
    });

    it("reads \"Finish →\" on the last step", () => {
      renderBubble();
      play();
      advance(startOf(total - 1) + 1);
      expect(within(caption()!).getByRole("button", { name: /^Finish/ })).toHaveTextContent("Finish →");
    });

    it("ends the tour with ✕, and the drawer opens with the closing line", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      fireEvent.click(within(caption()!).getByRole("button", { name: "End tour" }));
      expect(caption()).not.toBeInTheDocument();
      expect(isOpen()).toBe(true);
      expect(say(total - 1)).toBeInTheDocument();
    });

    it("does not pause when the visitor taps the caption itself", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.pointerDown(caption()!);
      expect(within(caption()!).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("pauses when the visitor taps the page, and the caption offers Resume", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.pointerDown(document.body);
      expect(within(caption()!).getByRole("button", { name: "Resume" })).toBeInTheDocument();
    });

    it("does not say what the closed drawer holds: the tour thread is not rendered twice", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(document.getElementById("copilot-tour")).not.toBeInTheDocument();
    });
  });

  describe("the end", () => {
    it("ends with the drawer open and the input focused", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(isOpen()).toBe(true);
      expect(caption()).not.toBeInTheDocument();
      advance(200);
      expect(screen.getByPlaceholderText(/ask about my work/i)).toHaveFocus();
    });

    it("shows only the closing line, above the usual starters, under the Recorded tour header", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(recorded()).toBeInTheDocument();
      expect(say(total - 1)).toBeInTheDocument();
      expect(screen.queryByText(steps[total - 2].say)).not.toBeInTheDocument();
      expect(say(0)).not.toBeInTheDocument();
      const thread = document.getElementById("copilot-tour")!;
      expect(thread.compareDocumentPosition(screen.getByText(INTRO)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      for (const prompt of STARTER_PROMPTS) expect(screen.getByRole("button", { name: new RegExp(prompt.slice(0, 20)) })).toBeInTheDocument();
    });

    it("clears the closing line when the visitor sends a message", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("An answer.")]));
      renderBubble();
      play();
      advance(ALL_DONE);
      await ask("Hello?");
      expect(recorded()).not.toBeInTheDocument();
      expect(say(total - 1)).not.toBeInTheDocument();
      expect(await screen.findByText("An answer.")).toBeInTheDocument();
    });

    it("restarts at step 1 when the tour is started again after it ended", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(say(total - 1)).toBeInTheDocument();
      play();
      expect(say(0)).toBeInTheDocument();
      expect(nextButton(1)).toBeInTheDocument();
      expect(say(total - 1)).not.toBeInTheDocument();
    });

    it("restarts at step 1 when started again mid-tour", () => {
      renderBubble();
      play();
      advance(startOf(4) + 1);
      play();
      expect(nextButton(1)).toBeInTheDocument();
    });
  });

  describe("leaving the tour", () => {
    it("clicking the Ask Titus button mid-tour ends it, with the drawer open, rather than closing the drawer", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.click(fab());
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(isOpen()).toBe(true);
      expect(say(total - 1)).toBeInTheDocument();
    });

    it("sending a message mid-tour stops it quietly: no closing line, no more narration", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("Sure thing.")]));
      renderBubble();
      play();
      advance(startOf(2) + 1);
      await ask("What do you do?");
      expect(recorded()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(say(total - 1)).not.toBeInTheDocument();
      advance(ALL_DONE);
      expect(say(total - 1)).not.toBeInTheDocument();
      expect(screen.getByText("What do you do?")).toBeInTheDocument();
    });

    it("a nav to another page mid-tour ends it quietly, with no navigation back", () => {
      const { rerender } = renderBubble();
      play();
      advance(startOf(2) + 1);
      const pushes = mockPush.mock.calls.length;
      mockPathname = "/writing";
      rerender(<CopilotBubble targets={TARGETS} />);
      expect(recorded()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(caption()).not.toBeInTheDocument();
      advance(ALL_DONE);
      expect(mockPush).toHaveBeenCalledTimes(pushes);
      expect(say(total - 1)).not.toBeInTheDocument();
    });

    it("a nav on the narrow caption ends it too, without opening the drawer's closing line", () => {
      mediaState[WIDE] = false;
      const { rerender } = renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      mockPathname = "/about";
      rerender(<CopilotBubble targets={TARGETS} />);
      expect(caption()).not.toBeInTheDocument();
      expect(recorded()).not.toBeInTheDocument();
    });

    it("leaves the tour alone when the page it opened itself shows up in the path", () => {
      document.getElementById(steps[2].targets[0])?.remove();
      const { rerender } = renderBubble();
      play();
      advance(startOf(2) + 1); // the router is asked for /experience
      mockPathname = "/experience";
      rerender(<CopilotBubble targets={TARGETS} />);
      expect(recorded()).toBeInTheDocument();
      expect(nextButton(3)).toBeInTheDocument();
    });

    it("clears every timer when it unmounts mid-tour, so nothing fires afterwards", () => {
      const { unmount } = renderBubble();
      play();
      advance(startOf(2) + 600); // step 3 has moved the page and is waiting for step 4
      const pushes = mockPush.mock.calls.length;
      const scrolls = scrollToSpy.mock.calls.length;
      unmount();
      expect(() => advance(ALL_DONE)).not.toThrow();
      expect(mockPush).toHaveBeenCalledTimes(pushes);
      expect(scrollToSpy).toHaveBeenCalledTimes(scrolls);
    });
  });

  describe("the visitor taking over from the tour", () => {
    const dialog = () => screen.getByRole("dialog", { name: /ask titus/i });
    const quietlyStopped = () => {
      expect(recorded()).not.toBeInTheDocument();
      expect(caption()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
      expect(say(total - 1)).not.toBeInTheDocument();
    };

    it("Escape in the drawer stops the tour, quietly, and closes the drawer", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
      expect(isOpen()).toBe(false);
      quietlyStopped();
      advance(ALL_DONE);
      expect(isOpen()).toBe(false);
      quietlyStopped();
    });

    it("Escape does not pause-and-resume: a paused tour is stopped too", () => {
      renderBubble();
      play();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      fireEvent.keyDown(dialog(), { key: "Escape" });
      quietlyStopped();
    });

    it("Escape with no tour just closes the drawer", () => {
      renderBubble();
      act(() => openCopilot());
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
      expect(isOpen()).toBe(false);
      expect(recorded()).not.toBeInTheDocument();
    });

    it("taking up the \"I'm hiring\" starter stops the tour quietly and opens the job-description box", () => {
      renderBubble();
      play();
      advance(startOf(1) + 1);
      fireEvent.click(document.getElementById("fit-mode")!);
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      expect(isOpen()).toBe(true);
      quietlyStopped();
      advance(ALL_DONE);
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      quietlyStopped();
    });

    it("a copilot:open fit request from elsewhere on the page stops it too", () => {
      renderBubble();
      play();
      act(() => openCopilot("fit"));
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      quietlyStopped();
    });

    it("sending a job description after that leaves the tour stopped, and the brief is requested", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ brief: { roleTitle: "Staff Engineer", company: "Acme", verdict: "A fit.", requirements: [] } }) });
      renderBubble();
      play();
      fireEvent.click(document.getElementById("fit-mode")!);
      fireEvent.change(screen.getByRole("textbox", { name: "Job description" }), {
        target: { value: "Staff GenAI Engineer at Acme. Build production RAG and multi-agent platforms on Kubernetes. Lead a small team." },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Check fit" }));
      });
      expect(global.fetch).toHaveBeenCalledWith("/api/fit", expect.anything());
      advance(ALL_DONE);
      quietlyStopped();
    });

    it("typing in the input stops the tour quietly, and keeps what was typed", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      const box = screen.getByPlaceholderText(/ask about my work/i);
      fireEvent.change(box, { target: { value: "Actually, a question" } });
      expect(box).toHaveValue("Actually, a question");
      expect(isOpen()).toBe(true);
      quietlyStopped();
      advance(ALL_DONE);
      expect(box).toHaveValue("Actually, a question");
      quietlyStopped();
    });

    it("typing while paused stops it too", () => {
      renderBubble();
      play();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      fireEvent.change(screen.getByPlaceholderText(/ask about my work/i), { target: { value: "hi" } });
      quietlyStopped();
    });

    it("typing with no tour running does nothing to the tour", () => {
      renderBubble();
      act(() => openCopilot());
      fireEvent.change(screen.getByPlaceholderText(/ask about my work/i), { target: { value: "hi" } });
      advance(ALL_DONE);
      expect(recorded()).not.toBeInTheDocument();
    });

    it("typing after the tour has ended leaves its closing line", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      fireEvent.change(screen.getByPlaceholderText(/ask about my work/i), { target: { value: "hi" } });
      expect(say(total - 1)).toBeInTheDocument();
    });
  });

  describe("the Ask Titus button during the tour", () => {
    it("reads \"End tour\" while the tour plays or is paused, and the usual labels otherwise", () => {
      renderBubble();
      expect(fab()).toHaveAttribute("aria-label", "Open Ask Titus");
      play();
      expect(fab()).toHaveAttribute("aria-label", "End tour");
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(fab()).toHaveAttribute("aria-label", "End tour");
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      advance(ALL_DONE);
      expect(isOpen()).toBe(true);
      expect(fab()).toHaveAttribute("aria-label", "Close chat");
    });

    it("reads \"End tour\" on a narrow screen while the caption shows", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      expect(fab()).toHaveAttribute("aria-label", "End tour");
      expect(fab()).toHaveAttribute("aria-expanded", "false");
    });

    it("goes back to \"Open Ask Titus\" after the visitor stops the tour and closes the drawer", () => {
      renderBubble();
      play();
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
      expect(fab()).toHaveAttribute("aria-label", "Open Ask Titus");
    });
  });

  describe("a page that finishes loading after the tour was paused or ended", () => {
    const target = () => steps[2].targets[0];
    // The wait for the page ends in a promise, so time has to move asynchronously for its follow-up to run.
    const settle = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
    const appear = () => {
      const el = document.createElement("div");
      el.id = target();
      el.setAttribute("data-test-tour-target", "");
      document.body.append(el);
      return el;
    };
    /** Plays to step 3 with its target missing, so the drawer asks the router and waits for the page. */
    function waitingForPage() {
      document.getElementById(target())?.remove();
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false });
    }

    it("moves the page when it appears while the tour is playing (the control)", async () => {
      waitingForPage();
      const el = appear();
      await settle(600);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(el).toHaveClass("copilot-spotlight");
    });

    it("does not move the page when it appears after the visitor paused", async () => {
      waitingForPage();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      const el = appear();
      await settle(600);
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(el).not.toHaveClass("copilot-spotlight");
    });

    it("does not move the page when it appears after the tour ended", async () => {
      waitingForPage();
      fireEvent.click(fab()); // mid-tour the button reads "End tour"
      const el = appear();
      await settle(600);
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(el).not.toHaveClass("copilot-spotlight");
    });

    it("does not move the page when it appears after the tour was stopped (Escape)", async () => {
      waitingForPage();
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
      appear();
      await settle(600);
      expect(scrollToSpy).not.toHaveBeenCalled();
    });

    it("moves the page if the visitor paused and resumed before it appeared", async () => {
      waitingForPage();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      appear();
      await settle(600);
      expect(scrollToSpy).toHaveBeenCalled();
    });
  });

  describe("closing the drawer", () => {
    const closeX = () => within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" });

    it("the drawer's x stops the tour mid-tour: idle, no closing line, nothing more narrated", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.click(closeX());
      expect(isOpen()).toBe(false);
      expect(recorded()).not.toBeInTheDocument();
      expect(caption()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      advance(ALL_DONE);
      expect(isOpen()).toBe(false);
      expect(say(total - 1)).not.toBeInTheDocument();
    });

    it("the drawer's x stops the tour from paused, too", () => {
      renderBubble();
      play();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      fireEvent.click(closeX());
      expect(isOpen()).toBe(false);
      expect(recorded()).not.toBeInTheDocument();
    });

    it("the drawer's x still just closes the drawer when no tour is playing, and puts focus on the Ask Titus button", () => {
      renderBubble();
      act(() => openCopilot());
      fireEvent.click(closeX());
      expect(isOpen()).toBe(false);
      expect(fab()).toHaveFocus();
    });

    it("does not move focus to the Ask Titus button when the tour itself closes the drawer (step 3 on a narrow screen)", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(300); // the input has taken focus, as it does on any opening
      expect(screen.getByPlaceholderText(/ask about my work/i)).toHaveFocus();
      advance(startOf(2));
      expect(isOpen()).toBe(false);
      expect(caption()).toBeInTheDocument();
      expect(fab()).not.toHaveFocus();
    });

    it("does not move focus to the button either when the window narrows mid-tour and the drawer steps aside", () => {
      renderBubble();
      play();
      advance(startOf(3) + 300);
      setMedia(WIDE, false);
      expect(isOpen()).toBe(false);
      expect(fab()).not.toHaveFocus();
    });

    it("still puts focus on the Ask Titus button when a visitor closes the drawer after the tour moved it", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(startOf(2) + 1); // the tour closed the drawer
      fireEvent.click(within(caption()!).getByRole("button", { name: "End tour" })); // done: the drawer opens
      expect(isOpen()).toBe(true);
      advance(300);
      fireEvent.click(closeX());
      expect(isOpen()).toBe(false);
      expect(fab()).toHaveFocus();
    });
  });

  describe("keeping the newest line in view", () => {
    /** Gives the drawer's scroll box and the tour thread the geometry jsdom lacks. */
    function layOut({ blockBottom, scrollerTop, clientHeight, scrollTop = 0 }: { blockBottom: number; scrollerTop: number; clientHeight: number; scrollTop?: number }) {
      const block = document.getElementById("copilot-tour") as HTMLElement;
      const scroller = block.closest<HTMLElement>(".overflow-y-auto") as HTMLElement;
      const rect = (top: number, bottom: number) => () => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      block.getBoundingClientRect = rect(0, blockBottom);
      scroller.getBoundingClientRect = rect(scrollerTop, scrollerTop + clientHeight);
      Object.defineProperty(scroller, "clientHeight", { value: clientHeight, configurable: true });
      scroller.scrollTop = scrollTop;
      return scroller;
    }

    it("scrolls the drawer so the bottom of the tour thread (its newest line and controls) is in view", () => {
      renderBubble();
      play();
      const scroller = layOut({ blockBottom: 900, scrollerTop: 100, clientHeight: 300 });
      advance(dur(0) + 1); // step 2 comes in
      // bottom within the scroll box = 900 - 100 + 0; show it with 16px to spare under a 300px viewport.
      expect(scroller.scrollTop).toBe(900 - 100 - 300 + 16);
    });

    it("takes the box's current scroll into account", () => {
      renderBubble();
      play();
      const scroller = layOut({ blockBottom: 500, scrollerTop: 100, clientHeight: 300, scrollTop: 200 });
      advance(dur(0) + 1);
      expect(scroller.scrollTop).toBe(500 - 100 + 200 - 300 + 16);
    });

    it("never scrolls above the top when the thread is short", () => {
      renderBubble();
      play();
      const scroller = layOut({ blockBottom: 150, scrollerTop: 100, clientHeight: 300, scrollTop: 40 });
      advance(dur(0) + 1);
      expect(scroller.scrollTop).toBe(0);
    });

    it("lays out the typed line at its full size from the start, so the thread does not grow as it types", () => {
      renderBubble();
      play();
      const typing = document.querySelector("#copilot-tour .opacity-0");
      expect(typing).toHaveTextContent(steps[0].say);
    });
  });

  describe("a conversation that already exists", () => {
    async function converse() {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("Hello, I am Titus.")]));
      act(() => openCopilot());
      await ask("Who are you?");
      expect(await screen.findByText("Hello, I am Titus.")).toBeInTheDocument();
    }

    it("skips the missing fit-mode ring, plays the step anyway, and goes on", async () => {
      renderBubble();
      await converse();
      expect(document.getElementById("fit-mode")).not.toBeInTheDocument();
      play();
      advance(startOf(1) + 1);
      expect(say(1)).toBeInTheDocument();
      expect(fab()).toHaveClass("tour-ring"); // the button that is there is still rung
      advance(dur(1) + 1);
      expect(say(2)).toBeInTheDocument();
    });

    it("keeps the conversation after the tour", async () => {
      renderBubble();
      await converse();
      play();
      advance(ALL_DONE);
      expect(screen.getByText("Who are you?")).toBeInTheDocument();
      expect(screen.getAllByText("Hello, I am Titus.")).toHaveLength(1);
      expect(say(total - 1)).toBeInTheDocument();
    });

    it("shows the tour under the conversation, not over it", async () => {
      renderBubble();
      await converse();
      play();
      const thread = document.getElementById("copilot-tour")!;
      const answer = screen.getByText("Hello, I am Titus.");
      expect(answer.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps the conversation when the tour is ended, and when the caption comes and goes", async () => {
      mediaState[WIDE] = false;
      renderBubble();
      await converse();
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      fireEvent.click(within(caption()!).getByRole("button", { name: "End tour" }));
      expect(screen.getByText("Who are you?")).toBeInTheDocument();
      expect(screen.getAllByText("Hello, I am Titus.")).toHaveLength(1);
    });
  });

  describe("a target that never appears", () => {
    it("skips that stop and carries on with the tour", async () => {
      const target = steps[2].targets[0];
      document.getElementById(target)?.remove();
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(mockPush).toHaveBeenCalledTimes(1);
      // waitForElement gives up after 3 s; the page never renders it.
      advance(3500);
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(nextButton(3)).toBeInTheDocument();
      advance(dur(2));
      expect(say(3)).toBeInTheDocument();
      expect(nextButton(4)).toBeInTheDocument();
    });

    it("skips a stop that is not on this page and not on the page it was asked for", () => {
      // The element is missing, but the page is already where it should live: nothing to push to.
      const target = steps[2].targets[0];
      document.getElementById(target)?.remove();
      const path = TARGETS.find((t) => t.id === target)!.path;
      window.history.replaceState({}, "", path);
      mockPathname = path;
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(mockPush).not.toHaveBeenCalled();
      advance(dur(2));
      expect(say(3)).toBeInTheDocument();
    });
  });

  describe("reduced motion", () => {
    it("shows the narration whole, with no typing, and keeps the same timings", () => {
      mediaState[REDUCED] = true;
      renderBubble();
      play();
      expect(say(0)).toBeInTheDocument();
      expect(document.querySelector("#copilot-tour .opacity-0")).toBeEmptyDOMElement();
      expect(Array.from(document.querySelectorAll("#copilot-tour [aria-hidden=true]")).some((el) => el.textContent === steps[0].say)).toBe(true);
      advance(dur(0) + 1);
      expect(say(1)).toBeInTheDocument();
      expect(Array.from(document.querySelectorAll("#copilot-tour [aria-hidden=true]")).some((el) => el.textContent === steps[1].say)).toBe(true);
    });

    it("scrolls the page without smooth behaviour", () => {
      mediaState[REDUCED] = true;
      renderBubble();
      play();
      advance(startOf(2) + 600);
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    });

    it("types the narration in when motion is allowed", () => {
      renderBubble();
      play();
      expect(document.querySelector("#copilot-tour .opacity-0")).not.toBeNull();
    });
  });
});
