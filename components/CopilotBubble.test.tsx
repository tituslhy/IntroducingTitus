import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextEncoder, TextDecoder } from "util";
import CopilotBubble, { WAITING_WORDS, WAITING_WORD_MS } from "./CopilotBubble";
import { ARTICLE_COUNT_NUMBER } from "@/lib/content";
import { COPILOT_TOUR_PAGE_EVENT, openCopilot, startTour } from "@/lib/copilot-events";
import { PAGE_TARGETS } from "@/lib/profile";
import { SITE_TOUR, TOUR_TARGET_IDS, spokenStep, stepDurationAt, stepDurationMs } from "@/lib/site-tour";
import { STARTER_PROMPTS } from "@/lib/starter-prompts";
import { REVEAL_EVENT, SHOW_EVENT } from "@/lib/reveal";
import { pickQuestion } from "@/lib/writing-pick";

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

// The card renderer is lazy (next/dynamic) and draws A2UI with Google's engine. These tests check where the card
// sits and what goes back in history, so the renderer is a stub that shows its label and message count.
jest.mock("@/components/cards/A2uiCard", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: (props: { label: string; flair: string; messages: unknown[] }) =>
      React.createElement("div", { "data-testid": "a2ui-card", "data-flair": props.flair }, `${props.label} (${props.messages.length} messages)`),
  };
});

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Voice reply: the engine, the player and the browser checks are fakes (each is tested on its own in lib/voice-reply).
// By default the browser can't speak (as jsdom can't), so every other test here sees the drawer as it was; the
// "voice reply" tests at the end switch the voice on.
interface MockSpoken {
  text: string;
  resolve(value: { audio: Float32Array; sampleRate: number }): void;
  reject(reason: Error): void;
}
class MockVoiceEngine {
  state: "idle" | "loading" | "ready" | "failed" = "idle";
  listeners = new Set<(fraction: number) => void>();
  spoken: MockSpoken[] = [];
  private settle: { resolve(): void; reject(e: Error): void } | null = null;
  private promise: Promise<void> | null = null;
  private lastId = 0;
  load = jest.fn(() => {
    if (!this.promise) {
      this.state = "loading";
      this.promise = new Promise<void>((resolve, reject) => (this.settle = { resolve, reject }));
    }
    return this.promise;
  });
  onProgress = jest.fn((cb: (fraction: number) => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  });
  speak = jest.fn((text: string) => {
    const id = ++this.lastId;
    let entry!: MockSpoken;
    const audio = new Promise<{ audio: Float32Array; sampleRate: number }>((resolve, reject) => {
      entry = { text, resolve, reject };
    });
    this.spoken.push(entry);
    return { id, audio };
  });
  cancelAll = jest.fn();
  progress(fraction: number) {
    this.listeners.forEach((cb) => cb(fraction));
  }
  becomeReady() {
    this.state = "ready";
    this.settle?.resolve();
  }
  failToLoad() {
    this.state = "failed";
    this.settle?.reject(new Error("The voice failed to load."));
  }
  texts() {
    return this.spoken.map((s) => s.text);
  }
}
class MockVoicePlayer {
  expected: number[] = [];
  stopped = false;
  finished = false;
  constructor(public opts: { onSentence(i: number): void; onDone(): void; onStall(): void }) {}
  expect = (i: number) => void this.expected.push(i);
  play = jest.fn();
  finish = () => void (this.finished = true);
  stop = () => void (this.stopped = true);
}
let mockVoiceEngine: MockVoiceEngine | null = null;
let mockVoicePlayers: MockVoicePlayer[] = [];
const mockVoiceSupport = { speak: false, cached: false };
jest.mock("@/lib/voice-reply/engine", () => ({ getVoiceEngine: () => (mockVoiceEngine ??= new MockVoiceEngine()) }));
jest.mock("@/lib/voice-reply/player", () => ({
  createReplyPlayer: (_ctx: unknown, opts: MockVoicePlayer["opts"]) => {
    const player = new MockVoicePlayer(opts);
    mockVoicePlayers.push(player);
    return player;
  },
}));
jest.mock("@/lib/voice-reply/support", () => ({
  ...jest.requireActual("@/lib/voice-reply/support"),
  canSpeak: async () => mockVoiceSupport.speak,
  isVoiceCached: async () => mockVoiceSupport.cached,
}));
jest.mock("@/lib/voice-reply/highlight", () => ({ highlightSentence: jest.fn(), clearHighlight: jest.fn() }));

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

/**
 * A reply stream that pauses at every WAIT until the test calls the next release(), so a test can look at
 * the drawer between two steps. (scriptedResponse only has one gate.)
 */
function pausingResponse(script: Array<string | typeof WAIT>) {
  const encoder = new TextEncoder();
  const queue = [...script];
  const gates: Array<() => void> = [];
  const reader = {
    read: jest.fn(async (): Promise<{ done: boolean; value?: Uint8Array }> => {
      const next = queue.shift();
      if (next === undefined) return { done: true, value: undefined };
      if (next === WAIT) {
        await new Promise<void>((resolve) => gates.push(resolve));
        return reader.read();
      }
      return { done: false, value: encoder.encode(next) };
    }),
  };
  const response = { ok: true, status: 200, body: { getReader: () => reader } } as unknown as Response;
  /** Lets the stream past its next WAIT, then lets React settle. */
  const release = async () => {
    await act(async () => {
      gates.shift()?.();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  };
  return { response, release };
}

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
    expect(screen.getByText(STARTER_PROMPTS[2])).toBeInTheDocument();
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

    await user.click(screen.getByText(STARTER_PROMPTS[2]));

    await waitFor(() => {
      expect(screen.getByText(/broad answer/i)).toBeInTheDocument();
    });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: STARTER_PROMPTS[2] }]);
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
        "OpenAI writes the replies (logged to improve them). Nothing is stored in your browser."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/does not save your chat history/i)).not.toBeInTheDocument();
  });

  it("keeps the voice sentences out of the footer where there is no mic, even with WebGPU", async () => {
    Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({}) }, configurable: true });
    try {
      const user = userEvent.setup();
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));

      expect(screen.getByText(/^OpenAI writes the replies/).textContent).toBe(
        "OpenAI writes the replies (logged to improve them). Nothing is stored in your browser."
      );
      expect(screen.queryByText(/transcribes voice clips|Spoken replies/)).not.toBeInTheDocument();
    } finally {
      delete (navigator as unknown as { gpu?: unknown }).gpu;
    }
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

  describe("tool steps", () => {
    const GUARDRAILS = "https://medium.com/@tituslhy/guardrails";
    const SEARCH_DOING = "Searching my writing for “guardrails”";
    const SEARCH_DONE = "Searched my writing for “guardrails”";
    const READ_DOING = "Reading “Your agent needs a bouncer”";
    const READ_DONE = "Read “Your agent needs a bouncer”";

    const stepLine = (id: string, tool: string, label: string, done: boolean) =>
      `${JSON.stringify({ type: "step", id, tool, label, done })}\n`;
    const source = (n: number, title: string, url = GUARDRAILS) =>
      `${JSON.stringify({ type: "source", n, title, url, relevance: 0.9, score: 2.6 })}\n`;
    const delta = (text: string) => `${JSON.stringify({ type: "delta", text })}\n`;

    async function askWith(script: Array<string | typeof WAIT>) {
      const user = userEvent.setup();
      const stream = pausingResponse(script);
      (global.fetch as jest.Mock).mockResolvedValue(stream.response);
      render(<CopilotBubble />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "What have you written about guardrails?{Enter}");
      return stream;
    }

    const liveList = () => screen.queryByRole("list", { name: "What I'm doing" });

    it("shows each step live under the typing dots while the reply has not started", async () => {
      const { release } = await askWith([stepLine("c1", "search_writing", SEARCH_DOING, false), WAIT, delta("Answer.")]);

      const list = await screen.findByRole("list", { name: "What I'm doing" });
      expect(within(list).getByText(SEARCH_DOING)).toBeInTheDocument();
      expect(screen.queryByText("Writing the reply")).not.toBeInTheDocument();

      await release();
      await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());
      expect(liveList()).not.toBeInTheDocument();
    });

    it("replaces a step's running line with its finished one, rather than adding a second line", async () => {
      const { release } = await askWith([
        stepLine("c1", "search_writing", SEARCH_DOING, false),
        WAIT,
        stepLine("c1", "search_writing", SEARCH_DONE, true),
        WAIT,
        delta("Answer."),
      ]);

      await waitFor(() => expect(within(liveList()!).getByText(SEARCH_DOING)).toBeInTheDocument());
      await release();
      await waitFor(() => expect(within(liveList()!).getByText(SEARCH_DONE)).toBeInTheDocument());
      expect(within(liveList()!).queryByText(SEARCH_DOING)).not.toBeInTheDocument();
      expect(within(liveList()!).getAllByRole("listitem").map((li) => li.textContent)).toEqual([SEARCH_DONE, "Writing the reply"]);

      await release();
      await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());
    });

    it("says Writing the reply only once every step is done", async () => {
      const { release } = await askWith([
        stepLine("c1", "search_writing", SEARCH_DOING, false),
        stepLine("c2", "read_writing", READ_DOING, false),
        WAIT,
        stepLine("c1", "search_writing", SEARCH_DONE, true),
        WAIT,
        stepLine("c2", "read_writing", READ_DONE, true),
        WAIT,
        delta("Answer."),
      ]);

      await waitFor(() => expect(within(liveList()!).getByText(SEARCH_DOING)).toBeInTheDocument());
      expect(screen.queryByText("Writing the reply")).not.toBeInTheDocument();

      await release();
      await waitFor(() => expect(within(liveList()!).getByText(SEARCH_DONE)).toBeInTheDocument());
      expect(screen.queryByText("Writing the reply")).not.toBeInTheDocument();

      await release();
      await waitFor(() => expect(screen.getByText("Writing the reply")).toBeInTheDocument());
      expect(within(liveList()!).getByText(READ_DONE)).toBeInTheDocument();

      await release();
      await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());
      expect(screen.queryByText("Writing the reply")).not.toBeInTheDocument();
    });

    it("folds the finished steps into one line above the reply, with the number of articles sent", async () => {
      const user = userEvent.setup();
      await askWith([
        stepLine("c1", "search_writing", SEARCH_DOING, false),
        stepLine("c1", "search_writing", SEARCH_DONE, true),
        source(1, "Your agent needs a bouncer"),
        source(2, "Teaching Toothless to Bite", "https://medium.com/@tituslhy/lora"),
        delta("Two pieces cover it [1][2]."),
      ]);

      const fold = await screen.findByText(/Searched my writing · read 2 articles/, { selector: "summary" });
      const details = fold.closest("details") as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(liveList()).not.toBeInTheDocument();

      await user.click(fold);
      expect(details.open).toBe(true);
      expect(within(details).getByText(SEARCH_DONE)).toBeInTheDocument();
    });

    it("folds a read by id to Read 1 article, with no search in the line", async () => {
      await askWith([
        stepLine("c1", "read_writing", READ_DOING, false),
        stepLine("c1", "read_writing", READ_DONE, true),
        source(1, "Your agent needs a bouncer"),
        delta("From one piece [1]."),
      ]);

      const fold = await screen.findByText(/^›?\s*Read 1 article$/, { selector: "summary" });
      expect(fold.textContent).not.toMatch(/Searched/);
    });

    it("adds a step that arrives after the first words to the folded line", async () => {
      await askWith([
        stepLine("c1", "search_writing", SEARCH_DOING, false),
        stepLine("c1", "search_writing", SEARCH_DONE, true),
        source(1, "Your agent needs a bouncer"),
        delta("First part [1]. "),
        stepLine("c2", "read_writing", READ_DOING, false),
        stepLine("c2", "read_writing", READ_DONE, true),
        delta("Second part."),
      ]);

      await screen.findByText(/Second part\./);
      const fold = screen.getByText(/Searched my writing · read 1 article/, { selector: "summary" });
      const details = fold.closest("details") as HTMLDetailsElement;
      expect(within(details).getByText(SEARCH_DONE)).toBeInTheDocument();
      expect(within(details).getByText(READ_DONE)).toBeInTheDocument();
    });

    it("shows no fold line when the reply had no steps", async () => {
      await askWith([source(1, "Your agent needs a bouncer"), delta("Answer [1].")]);

      await waitFor(() => expect(screen.getByText(/Answer/)).toBeInTheDocument());
      expect(document.querySelector("details")).toBeNull();
      expect(screen.queryByText(/read \d+ articles?/)).not.toBeInTheDocument();
    });

    it("ignores step events that fail validation, and shows only the valid step", async () => {
      const { release } = await askWith([
        `${JSON.stringify({ type: "step", tool: "search_writing", label: "NO-ID", done: false })}\n`,
        `${JSON.stringify({ type: "step", id: "m1", tool: "search_writing", label: "NO-DONE" })}\n`,
        `${JSON.stringify({ type: "step", id: "m2", tool: "search_writing", label: "", done: false })}\n`,
        `${JSON.stringify({ type: "step", id: "m3", tool: "search_writing", label: "BAD-DONE", done: "yes" })}\n`,
        stepLine("c1", "search_writing", SEARCH_DOING, false),
        WAIT,
        delta("Answer."),
      ]);

      // The valid step is the only line: the malformed ones before it were dropped, not queued.
      const list = await waitFor(() => {
        const found = liveList();
        expect(found).toBeInTheDocument();
        return found as HTMLElement;
      });
      expect(within(list).getAllByRole("listitem")).toHaveLength(1);
      expect(within(list).getByText(SEARCH_DOING)).toBeInTheDocument();

      await release();
      await waitFor(() => expect(screen.getByText("Answer.")).toBeInTheDocument());
      expect(screen.queryByText(/NO-ID|NO-DONE|BAD-DONE/)).not.toBeInTheDocument();
      expect(document.querySelector("details")?.querySelectorAll("li")).toHaveLength(1);
    });
  });

  describe("the waiting word, thoughts and the caption", () => {
    const HEADLINE = "Looking up the Illumina role";
    const QUESTION = "What have you written about guardrails?";

    const thoughtLine = (text: string) => `${JSON.stringify({ type: "thought", text })}\n`;
    const stepLine = (id: string, tool: string, label: string, done: boolean) =>
      `${JSON.stringify({ type: "step", id, tool, label, done })}\n`;
    const waitingWord = () => screen.queryByTestId("waiting-word");
    /** Lets the fetch mock, the reader and React run, without moving the fake clock. */
    const settle = () => act(async () => void (await jest.advanceTimersByTimeAsync(0)));

    const originalMatchMedia = window.matchMedia;
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
      window.matchMedia = originalMatchMedia;
    });

    function openDrawer(targets?: Array<{ id: string; label: string; path: string; page: string }>) {
      render(targets ? <CopilotBubble targets={targets} /> : <CopilotBubble />);
      fireEvent.click(screen.getByRole("button", { name: /open ask titus/i }));
    }

    function send(question: string) {
      const input = screen.getByPlaceholderText(/ask about my work/i);
      fireEvent.change(input, { target: { value: question } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    /** Opens the drawer, sends one question, and lets the reply stream as far as its first WAIT. */
    async function sendWith(script: Array<string | typeof WAIT>, targets?: Array<{ id: string; label: string; path: string; page: string }>) {
      const stream = pausingResponse(script);
      (global.fetch as jest.Mock).mockResolvedValue(stream.response);
      openDrawer(targets);
      send(QUESTION);
      await settle();
      return stream;
    }

    it("shows a waiting word while the reply has nothing else to show", async () => {
      await sendWith([WAIT]);

      expect(waitingWord()?.textContent).toBe(`${WAITING_WORDS[0]}…`);
    });

    it("moves to the next waiting word every 3 seconds, and wraps round to the first", async () => {
      await sendWith([WAIT]);

      act(() => void jest.advanceTimersByTime(WAITING_WORD_MS - 1));
      expect(waitingWord()?.textContent).toBe(`${WAITING_WORDS[0]}…`);

      act(() => void jest.advanceTimersByTime(1));
      expect(waitingWord()?.textContent).toBe(`${WAITING_WORDS[1]}…`);

      for (let k = 2; k <= WAITING_WORDS.length + 1; k++) {
        act(() => void jest.advanceTimersByTime(WAITING_WORD_MS));
        expect(waitingWord()?.textContent).toBe(`${WAITING_WORDS[k % WAITING_WORDS.length]}…`);
      }
    });

    it("shows a thought, in place of the waiting word, beside the dots", async () => {
      const stream = await sendWith([thoughtLine(HEADLINE), WAIT, deltaLine("Answer.")]);

      expect(screen.getByText(HEADLINE)).toBeInTheDocument();
      expect(waitingWord()).toBeNull();

      await stream.release();
      await settle();
      expect(screen.getByText("Answer.")).toBeInTheDocument();
    });

    it("replaces an earlier thought with a later one", async () => {
      await sendWith([thoughtLine("First idea"), thoughtLine("Second idea"), WAIT, deltaLine("Answer.")]);

      expect(screen.queryByText("First idea")).toBeNull();
      expect(screen.getByText("Second idea")).toBeInTheDocument();
    });

    it("ignores a thought that arrives after the first words", async () => {
      await sendWith([deltaLine("Start."), thoughtLine("Late idea"), WAIT, deltaLine(" More.")]);

      expect(screen.getByText(/Start\./)).toBeInTheDocument();
      expect(screen.queryByText("Late idea")).toBeNull();
      expect(waitingWord()).toBeNull();
    });

    it("gives Turning to … the caption over a thought", async () => {
      // The page moves on its own only when the drawer sits side by side with it.
      window.matchMedia = jest.fn((query: string) => ({
        matches: query === "(min-width: 1024px)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      })) as unknown as typeof window.matchMedia;
      await sendWith([thoughtLine(HEADLINE), actionLine("role-illumina"), WAIT, deltaLine("Answer.")], [
        { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" },
      ]);

      await act(async () => void (await jest.advanceTimersByTimeAsync(STOP_SETTLE_MS + 50)));

      expect(screen.getByText(/Turning to/)).toBeInTheDocument();
      expect(screen.queryByText(HEADLINE)).toBeNull();
    });

    it("hides the waiting word once steps appear, and shows the steps instead", async () => {
      await sendWith([stepLine("c1", "search_writing", "Searching my writing for “guardrails”", false), WAIT, deltaLine("Answer.")]);

      expect(screen.getByRole("list", { name: "What I'm doing" })).toBeInTheDocument();
      expect(waitingWord()).toBeNull();
    });

    it("is gone once the reply has arrived, and a thought does not outlive it", async () => {
      await sendWith([thoughtLine(HEADLINE), deltaLine("Done.")]);

      expect(screen.getByText("Done.")).toBeInTheDocument();
      expect(waitingWord()).toBeNull();
      expect(screen.queryByText(HEADLINE)).toBeNull();
    });

    it("starts each new question on the waiting word again, not on the last reply's thought", async () => {
      await sendWith([thoughtLine(HEADLINE), deltaLine("First answer.")]);
      expect(screen.getByText("First answer.")).toBeInTheDocument();

      const second = pausingResponse([WAIT, deltaLine("Second answer.")]);
      (global.fetch as jest.Mock).mockResolvedValueOnce(second.response);
      send("A second question?");
      await settle();

      expect(waitingWord()?.textContent).toBe(`${WAITING_WORDS[0]}…`);
      expect(screen.queryByText(HEADLINE)).toBeNull();
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

  describe("the stops under a reply follow the order the reply names them", () => {
    const SIDE_BY_SIDE = "(min-width: 1024px)";
    let originalMatchMedia: typeof window.matchMedia;
    const TARGETS = [
      { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience", names: ["Illumina"] },
      { id: "edu-smu", label: "SMU, 2021", path: "/education", page: "Education", names: ["Singapore Management University", "SMU"] },
      { id: "role-uob", label: "United Overseas Bank, 2025", path: "/experience", page: "Experience", names: ["United Overseas Bank", "UOB"] },
    ];
    // The model sent the actions as Illumina, SMU, UOB; the reply itself names UOB, then SMU, then Illumina.
    const ARRIVAL = ["Experience · Illumina, 2023", "Education · SMU, 2021", "Experience · United Overseas Bank, 2025"];
    const TEXT_ORDER = ["Experience · United Overseas Bank, 2025", "Education · SMU, 2021", "Experience · Illumina, 2023"];
    const REPLY_PART_1 = "I did the bank work at UOB first, then my master's at SMU, ";
    const REPLY_PART_2 = "and the Illumina work last.";

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      mockPathname = "/";
      // Narrow screen: the actions only mark the pills, and the page stays where it is.
      window.matchMedia = jest.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }));
    });

    afterEach(async () => {
      await letPageSettle();
      window.matchMedia = originalMatchMedia;
    });

    /** The labels on the pills under the first reply, in the order they are shown. */
    function pillLabels(): string[] {
      const heading = screen.getAllByText("See on page")[0];
      return within(heading.parentElement!)
        .getAllByRole("button")
        .map((button) => (button.textContent ?? "").replace(/^[→↓]\s*/, ""));
    }

    async function openDrawer() {
      const user = userEvent.setup();
      render(<CopilotBubble targets={TARGETS} />);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      await user.type(screen.getByPlaceholderText(/ask about my work/i), "Where have you worked{Enter}");
      return user;
    }

    it("lists the pills in the order the finished reply names them, not the order the actions arrived", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        createStreamingResponse([
          actionLine("role-illumina"),
          actionLine("edu-smu"),
          actionLine("role-uob"),
          deltaLine(REPLY_PART_1),
          deltaLine(REPLY_PART_2),
        ])
      );
      await openDrawer();

      await waitFor(() => expect(pillLabels()).toEqual(TEXT_ORDER));
      expect(screen.getByText(/the Illumina work last/)).toBeInTheDocument();
    });

    it("shows no pills while the reply is still streaming, then the text order once it closes", async () => {
      const { response, release } = scriptedResponse([
        actionLine("role-illumina"),
        actionLine("edu-smu"),
        actionLine("role-uob"),
        deltaLine(REPLY_PART_1),
        deltaLine(REPLY_PART_2),
        WAIT,
      ]);
      (global.fetch as jest.Mock).mockResolvedValue(response);
      await openDrawer();

      await waitFor(() => expect(screen.getByText(/the Illumina work last/)).toBeInTheDocument());
      expect(screen.queryByText("See on page")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Experience · Illumina, 2023" })).not.toBeInTheDocument();

      await act(async () => release());

      await waitFor(() => expect(pillLabels()).toEqual(TEXT_ORDER));
      expect(pillLabels()).not.toEqual(ARRIVAL);
    });

    it("keeps an earlier reply's pills in text order while a later reply is still streaming", async () => {
      const later = scriptedResponse([deltaLine("Let me think about that."), WAIT]);
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(
          createStreamingResponse([
            actionLine("role-illumina"),
            actionLine("edu-smu"),
            actionLine("role-uob"),
            deltaLine(REPLY_PART_1),
            deltaLine(REPLY_PART_2),
          ])
        )
        .mockResolvedValueOnce(later.response);
      const user = await openDrawer();
      await waitFor(() => expect(pillLabels()).toEqual(TEXT_ORDER));

      await user.type(screen.getByPlaceholderText(/ask about my work/i), "And what about your studies{Enter}");
      await waitFor(() => expect(screen.getByText("Let me think about that.")).toBeInTheDocument());

      expect(pillLabels()).toEqual(TEXT_ORDER);
      await act(async () => later.release());
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

      // The stops are listed once the reply has closed, so wait for its first words, then scroll the page.
      await screen.findByText(/^Here/);
      fireEvent.wheel(document.body);
      await letPageSettle();
      gated.release();

      await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Experience · Illumina, 2023" })).toBeInTheDocument();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
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

      await screen.findByText(/^Here/);
      fireEvent.wheel(screen.getByPlaceholderText(/ask about my work/i));
      gated.release();

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 384, behavior: "smooth" }));
      expect(await screen.findByRole("button", { name: "Experience · Illumina, 2023" })).toBeInTheDocument();
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
  const dur = (i: number) => stepDurationAt(SITE_TOUR, i);
  /** Time from the start of the tour to the start of step `i` (0-based). */
  const startOf = (i: number) => steps.slice(0, i).reduce((sum, _st, k) => sum + stepDurationAt(SITE_TOUR, k), 0);
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
  // A role stop waits on timers and promises (the pass pick-up), so time has to move asynchronously for its follow-up to run.
  const settle = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
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

    it("hides the starter prompts' intro for the tour, leaving the tour thread alone in the drawer", () => {
      renderBubble();
      play();
      expect(document.getElementById("copilot-tour")).toBeInTheDocument();
      expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
    });

    it("tells screen readers each step: the line and 'tour, step n of total'", () => {
      renderBubble();
      play();
      expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(`${steps[0].say} (tour, step 1 of ${total})`);
      advance(dur(0) + 1);
      expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(`${steps[1].say} (tour, step 2 of ${total})`);
    });

    it("gives the drawer's closing progress bar the closing step's stepDurationAt, not its reading time", () => {
      renderBubble();
      play();
      advance(startOf(total - 1) + 1);
      const dialog = screen.getByRole("dialog", { name: /ask titus/i });
      const bar = within(dialog).getByTestId("tour-progress");
      const closing = (bar.firstElementChild as HTMLElement).style.animationDuration;
      expect(closing).toBe(`${stepDurationAt(SITE_TOUR, total - 1)}ms`);
      expect(closing).not.toBe(`${stepDurationMs(steps[total - 1])}ms`);
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
      // The second ring comes 4 s later (the step's targets are spaced across it, at most 4 s apart).
      advance(4000);
      expect(document.getElementById("fit-mode")).toHaveClass("tour-ring");
    });

    it("take the rings off again after a moment", () => {
      renderBubble();
      play();
      advance(dur(0) + 4002);
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

    it("moves the page to the step's target", async () => {
      renderBubble();
      play();
      await settle(startOf(2) + 600);
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

    it("shows a progress bar for the current step, sized to that step and restarting on each one", () => {
      renderBubble();
      play();
      const dialog = screen.getByRole("dialog", { name: /ask titus/i });
      const bar = () => within(dialog).getByTestId("tour-progress");
      expect(bar()).toHaveAttribute("aria-hidden", "true");
      expect((bar().firstElementChild as HTMLElement).style.animationDuration).toBe(`${dur(0)}ms`);
      expect((bar().firstElementChild as HTMLElement).style.animationPlayState).toBe("running");
      const first = bar().firstElementChild;
      advance(dur(0) + 1);
      expect(within(dialog).getAllByTestId("tour-progress")).toHaveLength(1);
      expect(bar().firstElementChild).not.toBe(first);
      expect((bar().firstElementChild as HTMLElement).style.animationDuration).toBe(`${dur(1)}ms`);
    });

    it("freezes the progress bar and says \"Paused · press Resume to carry on\" while paused", () => {
      renderBubble();
      play();
      expect(screen.queryByText(/Paused · press Resume/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.getByText("Paused · press Resume to carry on")).toBeInTheDocument();
      expect((screen.getByTestId("tour-progress").firstElementChild as HTMLElement).style.animationPlayState).toBe("paused");
      const resume = screen.getByRole("button", { name: "Resume" });
      expect(resume).toHaveClass("tour-resume", "bg-ink", "text-paper");
      fireEvent.click(resume);
      expect(screen.queryByText(/Paused · press Resume/)).not.toBeInTheDocument();
      expect((screen.getByTestId("tour-progress").firstElementChild as HTMLElement).style.animationPlayState).toBe("running");
      expect(screen.getByRole("button", { name: "Pause" })).not.toHaveClass("tour-resume");
    });

    it("remounts the progress bar when the tour is started again part-way through a step", () => {
      renderBubble();
      play();
      advance(1000);
      const before = screen.getByTestId("tour-progress").firstElementChild;
      play();
      const after = screen.getByTestId("tour-progress").firstElementChild;
      expect(after).not.toBe(before);
      expect(before?.isConnected).toBe(false);
      expect((after as HTMLElement).style.animationDuration).toBe(`${dur(0)}ms`);
      expect(screen.getAllByTestId("tour-progress")).toHaveLength(1);
    });

    it("keeps the bar's width of the paused step: the same bar element is frozen, not restarted", () => {
      renderBubble();
      play();
      advance(1000);
      const before = screen.getByTestId("tour-progress").firstElementChild;
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.getByTestId("tour-progress").firstElementChild).toBe(before);
    });

    it("pauses the progress bar too when the visitor takes over the page", () => {
      renderBubble();
      play();
      fireEvent.wheel(document.body);
      expect(screen.getByText("Paused · press Resume to carry on")).toBeInTheDocument();
      expect((screen.getByTestId("tour-progress").firstElementChild as HTMLElement).style.animationPlayState).toBe("paused");
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

  describe("the starter prompts during the tour (wide screens)", () => {
    const heading = () => screen.queryByText("Start with one of these");
    const starterButtons = () => STARTER_PROMPTS.flatMap((prompt) => screen.queryAllByText(prompt));

    it("are shown before the tour starts", () => {
      renderBubble();
      act(() => openCopilot());
      expect(heading()).toBeInTheDocument();
      expect(starterButtons().length).toBeGreaterThan(0);
    });

    it("are hidden from the first step, with no intro line and no list", () => {
      renderBubble();
      play();
      expect(heading()).not.toBeInTheDocument();
      expect(screen.queryByText(INTRO)).not.toBeInTheDocument();
      expect(starterButtons()).toHaveLength(0);
      expect(document.getElementById("fit-mode")).not.toBeInTheDocument();
    });

    it("stay hidden in step 2, where the tour's own #fit-mode button stands in for the starter", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      expect(say(1)).toBeInTheDocument();
      expect(heading()).not.toBeInTheDocument();
      expect(starterButtons()).toHaveLength(0);
      expect(document.querySelectorAll("#fit-mode")).toHaveLength(1);
      expect(document.getElementById("fit-mode")).toHaveTextContent("I'm hiring — check my fit for a role");
    });

    it("stay hidden from step 3 on too, so the narration has the drawer to itself", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(say(2)).toBeInTheDocument();
      expect(heading()).not.toBeInTheDocument();
      expect(starterButtons()).toHaveLength(0);
      advance(dur(2) + 1);
      expect(say(3)).toBeInTheDocument();
      expect(heading()).not.toBeInTheDocument();
    });

    it("stay hidden while the tour is paused at any step", () => {
      renderBubble();
      play();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(heading()).not.toBeInTheDocument();
      expect(starterButtons()).toHaveLength(0);
    });

    it("stay hidden through a pause and a resume in step 4", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(heading()).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      expect(heading()).not.toBeInTheDocument();
    });

    it("come back when the tour finishes", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(heading()).toBeInTheDocument();
      expect(starterButtons().length).toBeGreaterThan(0);
    });

    it("come back when the visitor ends the tour with \"End tour\"", () => {
      renderBubble();
      play();
      advance(startOf(4) + 1);
      expect(heading()).not.toBeInTheDocument();
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      expect(heading()).toBeInTheDocument();
    });

    it("are hidden at once when Next moves from step 2 to step 3", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      expect(heading()).not.toBeInTheDocument();
      fireEvent.click(nextButton(2));
      expect(say(2)).toBeInTheDocument();
      expect(heading()).not.toBeInTheDocument();
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

    it("shows a progress bar sized to the step, and no bar or paused text once the tour is over", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      const bar = within(caption()!).getByTestId("tour-progress");
      expect((bar.firstElementChild as HTMLElement).style.animationDuration).toBe(`${dur(2)}ms`);
      advance(ALL_DONE);
      expect(caption()).not.toBeInTheDocument();
    });

    it("says \"Paused · press Resume to carry on\" and offers a \"Resume\" while paused", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      const region = within(caption()!);
      expect(region.queryByText(/Paused ·/)).not.toBeInTheDocument();
      fireEvent.click(region.getByRole("button", { name: "Pause" }));
      expect(region.getByText("Paused · press Resume to carry on")).toBeInTheDocument();
      expect(region.getByRole("status")).toHaveTextContent("Paused · press Resume to carry on");
      expect(region.getByRole("button", { name: "Resume" })).toHaveClass("tour-resume", "bg-ink", "text-paper");
      expect((region.getByTestId("tour-progress").firstElementChild as HTMLElement).style.animationPlayState).toBe("paused");
      fireEvent.click(region.getByRole("button", { name: "Resume" }));
      expect(region.queryByText(/Paused ·/)).not.toBeInTheDocument();
      expect(region.getByRole("button", { name: "Pause" })).toBeInTheDocument();
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
      advance(startOf(1) + 1);
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

  describe("the job-description button under the tour's line", () => {
    const HIRING = "I'm hiring — check my fit for a role";
    const thread = () => document.getElementById("copilot-tour")!;
    const fitButton = () => document.getElementById("fit-mode");

    it("is not there in step 1, which does not mention it", () => {
      renderBubble();
      play();
      expect(fitButton()).not.toBeInTheDocument();
    });

    it("appears under step 2's line, in the tour thread, with the starter's wording", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      const button = fitButton()!;
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveTextContent(HIRING);
      expect(thread()).toContainElement(button);
      const line = screen.getByText(steps[0].say);
      expect(line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(button.parentElement).toContainElement(say(1) as HTMLElement);
    });

    it("is the only #fit-mode, in step 2 and in every step after it", () => {
      renderBubble();
      play();
      for (const i of [1, 2, 3]) {
        advance(i === 1 ? dur(0) + 1 : dur(i - 1));
        expect(document.querySelectorAll("#fit-mode")).toHaveLength(1);
      }
    });

    it("stays under step 2's line while later steps play", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      expect(fitButton()).toBeInTheDocument();
      expect(fitButton()!.parentElement).toHaveTextContent(steps[1].say);
    });

    it("stays while the tour is paused", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(document.querySelectorAll("#fit-mode")).toHaveLength(1);
    });

    it("moves to the closing line when the tour ends, and is still the only #fit-mode (the starters hide theirs)", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      const all = document.querySelectorAll("#fit-mode");
      expect(all).toHaveLength(1);
      expect(thread()).toContainElement(all[0] as HTMLElement);
      expect(all[0].closest("li")).toBeNull();
      expect(all[0]).toHaveTextContent(HIRING);
    });

    it("stays under the closing line when the visitor ends the tour, still the only one", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      expect(document.querySelectorAll("#fit-mode")).toHaveLength(1);
      expect(thread()).toContainElement(fitButton());
      expect(fitButton()!.parentElement).toContainElement(say(total - 1) as HTMLElement);
    });

    it("enters fit mode when pressed: the job-description box opens and the tour stops", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(fitButton()!);
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      expect(recorded()).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(say(total - 1)).not.toBeInTheDocument();
      advance(ALL_DONE);
      expect(recorded()).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
    });

    it("can be pressed from a later step too (it stays under step 2's line)", () => {
      renderBubble();
      play();
      advance(startOf(3) + 1);
      fireEvent.click(fitButton()!);
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      expect(recorded()).not.toBeInTheDocument();
    });
  });

  describe("example questions under a tour line", () => {
    const askStep = steps.findIndex((st) => st.ask && st.ask.length > 0);
    const questions = steps[askStep].ask!;
    const list = () => screen.queryByRole("list", { name: "Example questions" });
    const mockReply = () => (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("A real answer.")]));
    const curly = (q: string) => `\u201c${q}\u201d`;

    it("the shipped tour has a step with questions to test with", () => {
      expect(askStep).toBeGreaterThan(-1);
      expect(questions).toHaveLength(2);
    });

    it("show nothing before that step", () => {
      renderBubble();
      play();
      advance(startOf(askStep) - 1);
      expect(list()).not.toBeInTheDocument();
    });

    it("show under the step's line in the drawer, as plain list items with no buttons", () => {
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      const ul = list()!;
      expect(ul).toBeInTheDocument();
      expect(document.getElementById("copilot-tour")).toContainElement(ul);
      const items = within(ul).getAllByRole("listitem");
      expect(items).toHaveLength(questions.length);
      questions.forEach((q, i) => expect(items[i]).toHaveTextContent(curly(q)));
      expect(within(ul).queryAllByRole("button")).toHaveLength(0);
      const line = say(askStep) as HTMLElement;
      expect(line.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("stay under that line as later steps play, and go when the tour ends", () => {
      renderBubble();
      play();
      advance(startOf(askStep + 1) + 1);
      expect(list()).toBeInTheDocument();
      advance(ALL_DONE);
      expect(list()).not.toBeInTheDocument();
    });

    it("do nothing when clicked: no message is sent and the tour plays on", () => {
      mockReply();
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      for (const li of within(list()!).getAllByRole("listitem")) fireEvent.click(li);
      for (const q of questions) fireEvent.click(screen.getByText(curly(q)));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(recorded()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(list()).toBeInTheDocument();
      expect(say(askStep)).toBeInTheDocument();
      // The clock is untouched: the next step still arrives on time.
      advance(dur(askStep));
      expect(say(askStep + 1)).toBeInTheDocument();
    });

    it("do not pause the tour when clicked (they are the tour's own UI)", () => {
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      fireEvent.pointerDown(within(list()!).getAllByRole("listitem")[0]);
      fireEvent.click(within(list()!).getAllByRole("listitem")[0]);
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(screen.queryByText(/Paused · press Resume/)).not.toBeInTheDocument();
    });

    it("are still there, unpressable, while the tour is paused", () => {
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(within(list()!).getAllByRole("listitem")).toHaveLength(questions.length);
      expect(within(list()!).queryAllByRole("button")).toHaveLength(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("are read out after the line, in the live region, with the step count", () => {
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      expect(spokenStep(steps[askStep])).toBe(`${steps[askStep].say} Examples: ${questions.join(" ")}`);
      expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(`${spokenStep(steps[askStep])} (tour, step ${askStep + 1} of ${total})`);
    });

    it("show as starter buttons in the drawer's empty state after the tour ends, and sending one works", async () => {
      mockReply();
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(list()).not.toBeInTheDocument();
      expect(screen.getByText("Start with one of these")).toBeInTheDocument();
      for (const q of questions) {
        const btn = screen.getByText(q).closest("button");
        expect(btn).not.toBeNull();
        expect(btn).toBeEnabled();
        expect(STARTER_PROMPTS).toContain(q);
      }
      await act(async () => {
        fireEvent.click(screen.getByText(questions[1]).closest("button")!);
      });
      expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).messages).toEqual([{ role: "user", content: questions[1] }]);
    });

    it("show as starter buttons when the tour is ended early, too", () => {
      renderBubble();
      play();
      advance(startOf(askStep) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      for (const q of questions) expect(screen.getByText(q).closest("button")).not.toBeNull();
    });

    describe("on a phone", () => {
      beforeEach(() => {
        mediaState[WIDE] = false;
      });

      it("show in the caption, under the narration, as plain list items, not in a drawer thread", () => {
        renderBubble();
        play();
        advance(startOf(askStep) + 1);
        const ul = within(caption()!).getByRole("list", { name: "Example questions" });
        const items = within(ul).getAllByRole("listitem");
        expect(items).toHaveLength(questions.length);
        questions.forEach((q, i) => expect(items[i]).toHaveTextContent(curly(q)));
        expect(within(ul).queryAllByRole("button")).toHaveLength(0);
        expect(document.getElementById("copilot-tour")).not.toBeInTheDocument();
        expect(isOpen()).toBe(false);
      });

      it("are not in the caption on steps that have none", () => {
        renderBubble();
        play();
        advance(startOf(2) + 1);
        expect(within(caption()!).queryByRole("list", { name: "Example questions" })).not.toBeInTheDocument();
      });

      it("do nothing when clicked: the drawer stays shut, nothing is sent and the caption stays", () => {
        mockReply();
        renderBubble();
        play();
        advance(startOf(askStep) + 1);
        for (const li of within(caption()!).getAllByRole("listitem")) fireEvent.click(li);
        expect(isOpen()).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(caption()).toBeInTheDocument();
        expect(within(caption()!).getByRole("list", { name: "Example questions" })).toBeInTheDocument();
      });

      it("are announced by the caption after the line, then the step count", () => {
        renderBubble();
        play();
        advance(startOf(askStep) + 1);
        const live = within(caption()!).getByText(`${steps[askStep].say} Examples: ${questions.join(" ")} (tour, step ${askStep + 1} of ${total})`);
        expect(live).toHaveAttribute("aria-live", "polite");
      });

      it("show as starter buttons once the drawer is opened after the tour", () => {
        renderBubble();
        play();
        advance(ALL_DONE);
        expect(caption()).not.toBeInTheDocument();
        act(() => openCopilot());
        for (const q of questions) expect(screen.getByText(q).closest("button")).not.toBeNull();
      });
    });
  });

  describe("picking up a pass on Experience", () => {
    const REVEAL = REVEAL_EVENT;
    const DESK_TOP = 1000;
    const ROLE_TOP = 3000;
    const roleStep = 2; // role-mastercard
    const slug = "mastercard";
    const S = () => startOf(roleStep);
    let box: HTMLElement;
    let desk: HTMLElement;
    let revealed: jest.Mock;

    /** The Experience page's desk, one pass on it, and the role it opens, hidden in its [data-reveal] box. */
    function addDesk(id = slug, withDesk = true) {
      document.getElementById(`role-${id}`)?.remove();
      desk = document.createElement("div");
      desk.setAttribute("data-test-tour-target", "");
      if (withDesk) desk.setAttribute("data-desk", ""); // StaffPasses' root
      const pass = document.createElement("button");
      pass.id = `pass-${id}`;
      desk.append(pass);
      box = document.createElement("div");
      box.setAttribute("data-test-tour-target", "");
      box.setAttribute("data-reveal", id);
      box.hidden = true;
      const role = document.createElement("div");
      role.id = `role-${id}`;
      box.append(role);
      revealed = jest.fn();
      // What PassDesk does: un-hides the role's box when its pass is picked up.
      box.addEventListener(REVEAL, (e) => {
        revealed((e as CustomEvent<string>).detail);
        box.hidden = false;
      });
      document.body.append(desk, box);
      placeAt(desk, DESK_TOP);
      placeAt(role, ROLE_TOP);
      return { pass, role };
    }
    const pass = () => document.getElementById(`pass-${slug}`)!;
    const scrolledTo = (top: number) => scrollToSpy.mock.calls.some((c) => c[0].top === top);
    const DESK_SCROLL = DESK_TOP - 16;
    const ROLE_SCROLL = ROLE_TOP - 16;

    it("scrolls the desk (the pass's [data-desk] ancestor) into view at once, before the pass is picked up", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: DESK_SCROLL, behavior: "smooth" });
      expect(pass()).not.toHaveClass("tour-ring");
      expect(revealed).not.toHaveBeenCalled();
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("looks at the desk for 700 ms, then rings the pass and opens its role", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      await settle(500);
      expect(pass()).not.toHaveClass("tour-ring");
      expect(revealed).not.toHaveBeenCalled();
      await settle(300);
      expect(pass()).toHaveClass("tour-ring");
      expect(revealed).toHaveBeenCalledTimes(1);
      expect(revealed).toHaveBeenCalledWith(slug);
      expect(box.hidden).toBe(false);
    });

    it("holds 1100 ms more, then moves the page to the role", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      await settle(800);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      await settle(900);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      await settle(300);
      expect(scrollToSpy).toHaveBeenLastCalledWith({ top: ROLE_SCROLL, behavior: "smooth" });
      expect(document.getElementById(`role-${slug}`)).toHaveClass("copilot-spotlight");
    });

    it("scrolls the desk first and the role second, in that order", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2000);
      expect(scrollToSpy.mock.calls.map((c) => c[0].top).filter((t) => t === DESK_SCROLL || t === ROLE_SCROLL)).toEqual([DESK_SCROLL, ROLE_SCROLL]);
    });

    it("boxes the role only after the pass is picked up and held (700 + 1100 ms), together with the scroll to it", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      const role = document.getElementById(`role-${slug}`)!;
      expect(pass()).toHaveClass("tour-ring");
      expect(role).not.toHaveClass("tour-ring");
      await settle(900);
      expect(role).not.toHaveClass("tour-ring");
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      await settle(300);
      expect(role).toHaveClass("tour-ring");
      expect(role).toHaveClass("copilot-spotlight");
      expect(scrolledTo(ROLE_SCROLL)).toBe(true);
    });

    it("takes the role's box off again after 2800 ms", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2000);
      const role = document.getElementById(`role-${slug}`)!;
      expect(role).toHaveClass("tour-ring");
      await settle(2500);
      expect(role).toHaveClass("tour-ring");
      await settle(400);
      expect(role).not.toHaveClass("tour-ring");
    });

    it("does not box the role if the tour is paused during the hold", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      await settle(3000);
      expect(document.getElementById(`role-${slug}`)).not.toHaveClass("tour-ring");
    });

    it("takes the ring off the pass again after a moment", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      expect(pass()).toHaveClass("tour-ring");
      await settle(3000);
      expect(pass()).not.toHaveClass("tour-ring");
    });

    it("with reduced motion, keeps both waits (700 and 1100 ms) but scrolls instantly", async () => {
      mediaState[REDUCED] = true;
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: DESK_SCROLL, behavior: "instant" });
      await settle(500);
      expect(pass()).not.toHaveClass("tour-ring");
      await settle(300);
      expect(pass()).toHaveClass("tour-ring");
      expect(revealed).toHaveBeenCalledTimes(1);
      await settle(900);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      await settle(300);
      expect(scrollToSpy).toHaveBeenLastCalledWith({ top: ROLE_SCROLL, behavior: "instant" });
    });

    it("scrolls to the pass itself when it has no [data-desk] ancestor", async () => {
      addDesk(slug, false);
      placeAt(pass(), 1400);
      renderBubble();
      play();
      await settle(S() + 2);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 1384, behavior: "smooth" });
    });

    it("picks the pass up even when the role's box is not hidden (every role is already listed)", async () => {
      addDesk();
      box.hidden = false;
      renderBubble();
      play();
      await settle(S() + 800);
      expect(pass()).toHaveClass("tour-ring");
      expect(revealed).toHaveBeenCalledTimes(1);
      expect(revealed).toHaveBeenCalledWith(slug);
    });

    it("just scrolls to a role that is not in a [data-reveal] box, with no waits", async () => {
      const lone = document.createElement("button");
      lone.id = `pass-${slug}`;
      lone.setAttribute("data-test-tour-target", "");
      document.body.append(lone);
      renderBubble(); // role-mastercard stays a plain anchor
      play();
      await settle(S() + 100);
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(lone).not.toHaveClass("tour-ring");
    });

    it("does not pick the pass up twice for one stop", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 5000);
      expect(revealed).toHaveBeenCalledTimes(1);
    });

    it("picks the pass up again when the tour is resumed after a pause mid-hold, and then scrolls to the role", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      expect(revealed).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      await settle(3000);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      await settle(2000);
      expect(revealed).toHaveBeenCalledTimes(2);
      expect(scrolledTo(ROLE_SCROLL)).toBe(true);
    });

    it("does not scroll to the role if the visitor skips to the next step during the hold", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
      await settle(1500);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("does not ring the pass or open the role if the tour is paused before the first wait ends", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      await settle(300);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      await settle(3000);
      expect(pass()).not.toHaveClass("tour-ring");
      expect(revealed).not.toHaveBeenCalled();
      expect(box.hidden).toBe(true);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("does not scroll to the role if the tour is paused during the hold, though the pass was already picked up", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      expect(pass()).toHaveClass("tour-ring");
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      await settle(3000);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      expect(document.getElementById(`role-${slug}`)).not.toHaveClass("copilot-spotlight");
    });

    it("does not ring the pass if the visitor ends the tour during the first wait", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 2);
      await settle(300);
      fireEvent.click(fab()); // mid-tour the button reads "End tour"
      await settle(3000);
      expect(pass()).not.toHaveClass("tour-ring");
      expect(revealed).not.toHaveBeenCalled();
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("does not scroll to the role if the visitor stops the tour (Escape) during the hold", async () => {
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
      await settle(3000);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("does not scroll to the role if the visitor asks a question during the hold", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("An answer.")]));
      addDesk();
      renderBubble();
      play();
      await settle(S() + 800);
      fireEvent.change(screen.getByPlaceholderText(/ask about my work/i), { target: { value: "Hi" } });
      await settle(3000);
      expect(scrolledTo(ROLE_SCROLL)).toBe(false);
    });

    it("picks up the first role of a step with several (uob, in the pass-uob fixture)", async () => {
      addDesk("uob");
      renderBubble();
      play();
      await settle(startOf(3) + 2);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: DESK_SCROLL, behavior: "smooth" });
      await settle(800);
      expect(document.getElementById("pass-uob")).toHaveClass("tour-ring");
      expect(revealed).toHaveBeenCalledWith("uob");
    });

    it("just scrolls to a role whose pass is not on the page, with no waits", async () => {
      renderBubble(); // no desk: role-mastercard is a plain anchor
      play();
      await settle(S() + 100);
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      // The role itself is boxed at once (nothing to pick up first); no pass is ringed because there is none.
      const ringed = Array.from(document.querySelectorAll(".tour-ring"));
      expect(ringed).toEqual([document.getElementById(`role-${slug}`)]);
    });

    it("leaves the other stops alone: no desk scroll, no waits, no ring (education)", async () => {
      const eduStep = steps.findIndex((st) => st.targets.includes("edu-smu"));
      placeAt(document.getElementById("edu-smu")!, 500);
      addDesk(); // a desk is on the page, but this stop is not a role
      renderBubble();
      play();
      await settle(startOf(eduStep) + 100);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 484, behavior: "smooth" });
      expect(document.getElementById(`pass-${slug}`)).not.toHaveClass("tour-ring");
    });

    describe("when the role is on another page", () => {
      /** Plays to the role step with its page not open yet, so the router is asked for it. */
      async function waitingForExperience() {
        document.getElementById(`role-${slug}`)?.remove();
        renderBubble();
        play();
        await settle(S() + 2);
        expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false });
      }

      it("opens the page, then picks up the pass the same way once it has loaded", async () => {
        await waitingForExperience();
        expect(scrollToSpy).not.toHaveBeenCalled();
        addDesk();
        await settle(50);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: DESK_SCROLL, behavior: "smooth" });
        expect(pass()).not.toHaveClass("tour-ring");
        await settle(800);
        expect(pass()).toHaveClass("tour-ring");
        expect(revealed).toHaveBeenCalledWith(slug);
        expect(scrolledTo(ROLE_SCROLL)).toBe(false);
        await settle(1300);
        expect(scrollToSpy).toHaveBeenLastCalledWith({ top: ROLE_SCROLL, behavior: "smooth" });
      });

      it("boxes the role once the pass has been held, as on the page that was already open", async () => {
        await waitingForExperience();
        addDesk();
        await settle(800);
        const role = document.getElementById(`role-${slug}`)!;
        expect(role).not.toHaveClass("tour-ring");
        await settle(1300);
        expect(role).toHaveClass("tour-ring");
      });

      it("does not scroll to the role if the tour is paused while the pass is on show", async () => {
        await waitingForExperience();
        addDesk();
        await settle(800);
        expect(pass()).toHaveClass("tour-ring");
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        await settle(3000);
        expect(scrolledTo(ROLE_SCROLL)).toBe(false);
      });

      it("with reduced motion, keeps the waits but scrolls instantly", async () => {
        mediaState[REDUCED] = true;
        await waitingForExperience();
        addDesk();
        await settle(50);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: DESK_SCROLL, behavior: "instant" });
        await settle(800);
        expect(pass()).toHaveClass("tour-ring");
        await settle(1300);
        expect(scrollToSpy).toHaveBeenLastCalledWith({ top: ROLE_SCROLL, behavior: "instant" });
      });
    });
  });

  describe("telling the nav which page the tour is on", () => {
    let heard: Array<string | null>;
    const onPage = (e: Event) => heard.push((e as CustomEvent<string | null>).detail);
    const last = () => heard[heard.length - 1];

    beforeEach(() => {
      heard = [];
      window.addEventListener(COPILOT_TOUR_PAGE_EVENT, onPage);
    });
    afterEach(() => {
      window.removeEventListener(COPILOT_TOUR_PAGE_EVENT, onPage);
    });

    it("says null while no tour plays, never a path", () => {
      renderBubble();
      expect(heard.length).toBeGreaterThan(0);
      expect(heard.every((d) => d === null)).toBe(true);
    });

    it("announces the current page when the tour starts", () => {
      renderBubble();
      play();
      expect(last()).toBe("/");
    });

    it("announces whatever page the tour started on", () => {
      mockPathname = "/about";
      renderBubble();
      play();
      expect(last()).toBe("/about");
    });

    it("announces it on a narrow screen too, where the drawer steps aside", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(caption()).toBeInTheDocument();
      expect(last()).toBe("/");
    });

    it("follows the tour onto the page it opens itself", () => {
      document.getElementById(steps[2].targets[0])?.remove();
      const { rerender } = renderBubble();
      play();
      advance(startOf(2) + 1); // the router is asked for /experience
      expect(last()).toBe("/");
      mockPathname = "/experience";
      rerender(<CopilotBubble targets={TARGETS} />);
      expect(last()).toBe("/experience");
      expect(recorded()).toBeInTheDocument();
    });

    it("announces null while the tour is paused (the visitor has the page), and the path again when it resumes", () => {
      renderBubble();
      play();
      expect(last()).toBe("/");
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(last()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      expect(last()).toBe("/");
    });

    it("announces null when the visitor scrolling pauses the tour", () => {
      renderBubble();
      play();
      expect(last()).toBe("/");
      fireEvent.wheel(document.body);
      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
      expect(last()).toBeNull();
    });

    it("announces null when the tour finishes", () => {
      renderBubble();
      play();
      expect(last()).toBe("/");
      advance(ALL_DONE);
      expect(recorded()).toBeInTheDocument();
      expect(last()).toBeNull();
    });

    it("announces null when the visitor ends the tour", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      expect(last()).toBeNull();
    });

    it("announces null when the drawer's x stops the tour", () => {
      renderBubble();
      play();
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      expect(last()).toBeNull();
    });

    it("announces null when the visitor navigates away mid-tour and the tour stops quietly", () => {
      const { rerender } = renderBubble();
      play();
      advance(startOf(2) + 1);
      expect(last()).toBe("/");
      mockPathname = "/writing";
      rerender(<CopilotBubble targets={TARGETS} />);
      expect(last()).toBeNull();
    });

    it("announces null when a question ends the tour", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("Sure.")]));
      renderBubble();
      play();
      advance(startOf(2) + 1);
      await ask("What do you do?");
      expect(last()).toBeNull();
    });

    it("announces the page again when the tour is started again", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(last()).toBeNull();
      play();
      expect(last()).toBe("/");
    });

    it("announces null when the component unmounts mid-tour", () => {
      const { unmount } = renderBubble();
      play();
      expect(last()).toBe("/");
      unmount();
      expect(last()).toBeNull();
    });

    it("announces null on unmount even when no tour was playing", () => {
      const { unmount } = renderBubble();
      const before = heard.length;
      unmount();
      expect(heard.length).toBe(before + 1);
      expect(last()).toBeNull();
    });
  });

  describe("boxing what a stop points at", () => {
    const stepOf = (id: string) => steps.findIndex((st) => st.targets.includes(id));
    const el = (id: string) => document.getElementById(id) as HTMLElement;
    /** Swaps the fixture's div for a <section>, as a whole page section is on the real pages. */
    function makeSection(id: string) {
      el(id).remove();
      const section = document.createElement("section");
      section.id = id;
      section.setAttribute("data-test-tour-target", "");
      document.body.append(section);
      return section;
    }

    it("boxes a stop's element (an education tile) and still scrolls to it", async () => {
      renderBubble();
      play();
      await settle(startOf(stepOf("edu-smu")) + 100);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(el("edu-smu")).toHaveClass("tour-ring");
      expect(el("edu-smu")).toHaveClass("copilot-spotlight");
    });

    it("boxes a project tile, a tool tile and a role the same way", async () => {
      for (const id of ["project-fictional-bassoon", "tool-langgraph", "role-uob"]) {
        document.querySelectorAll("[data-test-tour-target]").forEach((n) => n.remove());
        for (const pid of pageTargetIds) {
          const d = document.createElement("div");
          d.id = pid;
          d.setAttribute("data-test-tour-target", "");
          document.body.append(d);
        }
        const { unmount } = renderBubble();
        play();
        await settle(startOf(stepOf(id)) + 100);
        expect(el(id)).toHaveClass("tour-ring");
        unmount();
      }
    });

    it("takes the box off after 2800 ms", async () => {
      renderBubble();
      play();
      await settle(startOf(stepOf("edu-smu")) + 100);
      await settle(2600);
      expect(el("edu-smu")).toHaveClass("tour-ring");
      await settle(200);
      expect(el("edu-smu")).not.toHaveClass("tour-ring");
    });

    it("leaves a periodic-table tile (class pt-el) unboxed, where an amber ring already means something", async () => {
      el("tool-langgraph").classList.add("pt-el");
      renderBubble();
      play();
      await settle(startOf(stepOf("tool-langgraph")) + 100);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(el("tool-langgraph")).toHaveClass("copilot-spotlight");
      expect(el("tool-langgraph")).not.toHaveClass("tour-ring");
    });

    it("leaves a pt-el tile that arrives from another page unboxed too", async () => {
      const i = stepOf("tool-langgraph");
      el("tool-langgraph").remove();
      renderBubble();
      play();
      await settle(startOf(i) + 2);
      expect(mockPush).toHaveBeenCalledWith("/about", { scroll: false });
      const tile = document.createElement("div");
      tile.id = "tool-langgraph";
      tile.className = "pt-el";
      tile.setAttribute("data-test-tour-target", "");
      document.body.append(tile);
      await settle(100);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(tile).not.toHaveClass("tour-ring");
    });

    it("leaves a whole <section> unboxed: the page just scrolls to it", async () => {
      const section = makeSection("writing");
      renderBubble();
      play();
      await settle(startOf(stepOf("writing")) + 100);
      expect(scrollToSpy).toHaveBeenCalled();
      expect(section).not.toHaveClass("tour-ring");
    });

    it("boxes only the stop it is at, not the ones before or after", async () => {
      renderBubble();
      play();
      await settle(startOf(stepOf("edu-smu")) + 100);
      const ringed = Array.from(document.querySelectorAll(".tour-ring")).map((n) => n.id);
      expect(ringed).toEqual(["edu-smu"]);
    });

    describe("scrolling under the nav while the tour pins it", () => {
      const NAV = 56;
      const pinnedNav = () => {
        const nav = addNav(NAV);
        nav.setAttribute("data-test-tour-target", "");
        nav.setAttribute("data-pinned", "");
        return nav;
      };

      it("leaves room for the nav when scrolling down, with the usual 16px gap", async () => {
        pinnedNav();
        placeAt(el("edu-smu"), 500);
        renderBubble();
        play();
        await settle(startOf(stepOf("edu-smu")) + 100);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 500 - NAV - 16, behavior: "smooth" });
      });

      it("leaves the same room when scrolling up", async () => {
        pinnedNav();
        setScrollY(2000);
        placeAt(el("edu-smu"), 500);
        renderBubble();
        play();
        await settle(startOf(stepOf("edu-smu")) + 100);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 500 - NAV - 16, behavior: "smooth" });
        setScrollY(0);
      });

      it("keeps the small gap alone going down when the nav is not pinned (it hides itself)", async () => {
        const nav = addNav(NAV);
        nav.setAttribute("data-test-tour-target", "");
        placeAt(el("edu-smu"), 500);
        renderBubble();
        play();
        await settle(startOf(stepOf("edu-smu")) + 100);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 500 - 16, behavior: "smooth" });
      });

      it("never scrolls above the top of the page", async () => {
        pinnedNav();
        placeAt(el("edu-smu"), 40);
        renderBubble();
        play();
        await settle(startOf(stepOf("edu-smu")) + 100);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      });

      it("clears the pinned nav when picking up a pass's desk too", async () => {
        pinnedNav();
        const desk = document.createElement("div");
        desk.setAttribute("data-desk", "");
        desk.setAttribute("data-test-tour-target", "");
        const pass = document.createElement("button");
        pass.id = "pass-mastercard";
        desk.append(pass);
        const box = document.createElement("div");
        box.setAttribute("data-reveal", "mastercard");
        box.setAttribute("data-test-tour-target", "");
        box.append(el("role-mastercard"));
        document.body.append(desk, box);
        placeAt(desk, 1000);
        renderBubble();
        play();
        await settle(startOf(2) + 2);
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000 - NAV - 16, behavior: "smooth" });
      });
    });

    describe("when its page is not open yet", () => {
      it("boxes the element once the page has loaded", async () => {
        const i = stepOf("edu-smu");
        el("edu-smu").remove();
        renderBubble();
        play();
        await settle(startOf(i) + 2);
        expect(mockPush).toHaveBeenCalledWith("/education", { scroll: false });
        const arrived = document.createElement("div");
        arrived.id = "edu-smu";
        arrived.setAttribute("data-test-tour-target", "");
        document.body.append(arrived);
        await settle(100);
        expect(arrived).toHaveClass("tour-ring");
        expect(arrived).toHaveClass("copilot-spotlight");
        await settle(2800);
        expect(arrived).not.toHaveClass("tour-ring");
      });

      it("leaves a <section> that arrives unboxed", async () => {
        const i = stepOf("writing");
        el("writing").remove();
        renderBubble();
        play();
        await settle(startOf(i) + 2);
        expect(mockPush).toHaveBeenCalledWith("/writing", { scroll: false });
        const section = document.createElement("section");
        section.id = "writing";
        section.setAttribute("data-test-tour-target", "");
        document.body.append(section);
        await settle(100);
        expect(scrollToSpy).toHaveBeenCalled();
        expect(section).not.toHaveClass("tour-ring");
      });

      it("does not box it if the tour was paused while the page was loading", async () => {
        const i = stepOf("edu-smu");
        el("edu-smu").remove();
        renderBubble();
        play();
        await settle(startOf(i) + 2);
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        const arrived = document.createElement("div");
        arrived.id = "edu-smu";
        arrived.setAttribute("data-test-tour-target", "");
        document.body.append(arrived);
        await settle(600);
        expect(arrived).not.toHaveClass("tour-ring");
      });

      it("does not box it if the tour ended while the page was loading", async () => {
        const i = stepOf("edu-smu");
        el("edu-smu").remove();
        renderBubble();
        play();
        await settle(startOf(i) + 2);
        fireEvent.click(fab()); // mid-tour the button reads "End tour"
        const arrived = document.createElement("div");
        arrived.id = "edu-smu";
        arrived.setAttribute("data-test-tour-target", "");
        document.body.append(arrived);
        await settle(600);
        expect(arrived).not.toHaveClass("tour-ring");
      });
    });
  });

  describe("the closing line and the job-description button under it", () => {
    const HIRING = "I'm hiring — check my fit for a role";
    const thread = () => document.getElementById("copilot-tour")!;
    const fits = () => document.querySelectorAll("#fit-mode");
    const endTour = () => fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));

    it("shows the last line and the button right under it, in the tour thread", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(fits()).toHaveLength(1);
      const button = fits()[0] as HTMLElement;
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveTextContent(HIRING);
      expect(thread()).toContainElement(button);
      expect(button.parentElement).toContainElement(say(total - 1) as HTMLElement);
      expect(say(total - 1)!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps the button under the last line only, with no earlier lines above it", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(screen.queryByText(steps[1].say)).not.toBeInTheDocument();
      expect(thread()).toHaveTextContent(steps[total - 1].say);
    });

    it("does not render the starter list's own fit item: exactly one #fit-mode", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(fits()).toHaveLength(1);
      expect(document.querySelectorAll("li #fit-mode")).toHaveLength(0);
    });

    it("still lists the other starter prompts under the closing line", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(screen.getByText(INTRO)).toBeInTheDocument();
      for (const prompt of STARTER_PROMPTS) expect(screen.getByRole("button", { name: new RegExp(prompt.slice(0, 20)) })).toBeInTheDocument();
    });

    it("is the same when the tour is ended by the visitor", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      endTour();
      expect(fits()).toHaveLength(1);
      expect(thread()).toContainElement(fits()[0] as HTMLElement);
      expect(document.querySelectorAll("li #fit-mode")).toHaveLength(0);
    });

    it("is the same on a narrow screen, where the drawer reopens for the ending", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(isOpen()).toBe(true);
      expect(fits()).toHaveLength(1);
      expect(thread()).toContainElement(fits()[0] as HTMLElement);
    });

    it("opens the job-description box when pressed, and the tour's copy of the button goes", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      fireEvent.click(fits()[0]);
      expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
      expect(recorded()).not.toBeInTheDocument();
      // The tour's copy is gone; the empty chat's starters (which show again in fit mode) carry their own.
      expect(fits()).toHaveLength(1);
      expect(document.getElementById("copilot-tour")).toBeNull();
      expect(fits()[0].closest("li")).not.toBeNull();
    });

    it("brings the starter list's own fit item back once the visitor is back in the empty chat after fit mode", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      fireEvent.click(fits()[0]);
      fireEvent.click(screen.getByRole("button", { name: /back to chat/i }));
      expect(document.getElementById("copilot-tour")).not.toBeInTheDocument();
      expect(fits()).toHaveLength(1);
      expect(fits()[0].closest("li")).not.toBeNull();
      expect(fits()[0]).toHaveTextContent(HIRING);
    });

    it("has the starters' fit item back after the closing line is cleared another way (the drawer's x, then reopened)", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      fireEvent.click(fab());
      expect(isOpen()).toBe(true);
      expect(document.getElementById("copilot-tour")).not.toBeInTheDocument();
      expect(fits()).toHaveLength(1);
      expect(fits()[0].closest("li")).not.toBeNull();
    });

    it("clears the button along with the closing line when the visitor sends a message", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("An answer.")]));
      renderBubble();
      play();
      advance(ALL_DONE);
      await ask("Hello?");
      expect(recorded()).not.toBeInTheDocument();
      expect(document.getElementById("copilot-tour")).toBeNull();
      expect(fits()).toHaveLength(0);
    });

    it("has no #fit-mode in step 1 when the tour is started again from the closing line", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(fits()).toHaveLength(1);
      play();
      expect(say(0)).toBeInTheDocument();
      expect(fits()).toHaveLength(0);
    });
  });

  describe("when the tour finishes", () => {
    const FIT_PAUSE = 400;
    const block = () => document.getElementById("copilot-tour") as HTMLElement;
    const scrollerOf = () => block().closest<HTMLElement>(".overflow-y-auto") as HTMLElement;
    const fit = () => document.getElementById("fit-mode") as HTMLElement;
    const rect = (top: number) => () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    /** Gives the drawer's scroll box and the closing line the geometry jsdom lacks. */
    function layOut({ blockTop, scrollerTop, scrollTop = 0 }: { blockTop: number; scrollerTop: number; scrollTop?: number }) {
      block().getBoundingClientRect = rect(blockTop);
      scrollerOf().getBoundingClientRect = rect(scrollerTop);
      scrollerOf().scrollTop = scrollTop;
      return scrollerOf();
    }
    /** A stand-in #fit-mode outside the drawer, to see whether anything still rings by id after the drawer is gone. */
    const decoy = () => {
      const d = document.createElement("button");
      d.id = "fit-mode";
      d.setAttribute("data-test-tour-target", "");
      document.body.append(d);
      return d;
    };

    it("brings the closing line to 16px under the top of the drawer's scroll box after 400 ms", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      const scroller = layOut({ blockTop: 700, scrollerTop: 100 });
      advance(FIT_PAUSE - 1);
      expect(scroller.scrollTop).toBe(0);
      advance(1);
      // the line sits 600px below the scroll box's top; leave 16px above it.
      expect(scroller.scrollTop).toBe(700 - 100 - 16);
    });

    it("counts the scroll the box already has", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      const scroller = layOut({ blockTop: 300, scrollerTop: 100, scrollTop: 50 });
      advance(FIT_PAUSE);
      expect(scroller.scrollTop).toBe(50 + 300 - 100 - 16);
    });

    it("scrolls back up when the line is already below its place", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      const scroller = layOut({ blockTop: 120, scrollerTop: 100, scrollTop: 400 });
      advance(FIT_PAUSE);
      expect(scroller.scrollTop).toBe(400 + 20 - 16);
    });

    it("never scrolls above the top", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      const scroller = layOut({ blockTop: 100, scrollerTop: 100, scrollTop: 5 });
      advance(FIT_PAUSE);
      expect(scroller.scrollTop).toBe(0);
    });

    it("does the same when the visitor ends the tour", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
      const scroller = layOut({ blockTop: 500, scrollerTop: 100 });
      advance(FIT_PAUSE);
      expect(scroller.scrollTop).toBe(500 - 100 - 16);
      expect(fit()).toHaveClass("tour-ring");
    });

    it("rings the job-description button after 400 ms, not before", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(fit()).not.toHaveClass("tour-ring");
      advance(FIT_PAUSE - 1);
      expect(fit()).not.toHaveClass("tour-ring");
      advance(1);
      expect(fit()).toHaveClass("tour-ring");
    });

    it("takes the ring off the button again after 2800 ms", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      advance(FIT_PAUSE);
      advance(2799);
      expect(fit()).toHaveClass("tour-ring");
      advance(1);
      expect(fit()).not.toHaveClass("tour-ring");
    });

    it("rings the button (and does not throw) when the drawer has no layout to measure", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      expect(() => advance(FIT_PAUSE)).not.toThrow();
      expect(fit()).toHaveClass("tour-ring");
    });

    it("also does it on a narrow screen", () => {
      mediaState[WIDE] = false;
      renderBubble();
      play();
      advance(ALL_DONE);
      const scroller = layOut({ blockTop: 400, scrollerTop: 100 });
      advance(FIT_PAUSE);
      expect(scroller.scrollTop).toBe(400 - 100 - 16);
      expect(fit()).toHaveClass("tour-ring");
    });

    it("does nothing at the end of a tour the visitor only stopped quietly (the drawer's x)", () => {
      renderBubble();
      play();
      advance(startOf(2) + 1);
      fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      advance(ALL_DONE);
      expect(document.querySelector(".tour-ring")).toBeNull();
    });

    it("does not ring or scroll when the tour is only paused or running", () => {
      renderBubble();
      play();
      advance(dur(0) + 1);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      advance(FIT_PAUSE + 100);
      expect(fit()).not.toHaveClass("tour-ring");
    });

    it("cancels the pending ring when the component unmounts before the 400 ms", () => {
      const { unmount } = renderBubble();
      play();
      advance(ALL_DONE);
      unmount();
      const stray = decoy();
      advance(FIT_PAUSE + 100);
      expect(stray).not.toHaveClass("tour-ring");
    });

    it("cancels the pending ring when the tour is started again before the 400 ms", () => {
      renderBubble();
      play();
      advance(ALL_DONE);
      advance(FIT_PAUSE - 100);
      play(); // restart: the closing state is gone, and so is its pending ring
      const stray = decoy();
      advance(FIT_PAUSE);
      expect(stray).not.toHaveClass("tour-ring");
      expect(say(0)).toBeInTheDocument();
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

    describe("as the drawer or the thread changes size", () => {
      type FakeRO = { cb: () => void; observed: Element[]; disconnect: jest.Mock };
      let instances: FakeRO[];
      const globalRO = globalThis as unknown as { ResizeObserver?: unknown };
      let originalRO: unknown;
      const hadRO = "ResizeObserver" in globalThis;

      beforeEach(() => {
        originalRO = globalRO.ResizeObserver;
        instances = [];
        globalRO.ResizeObserver = class {
          private readonly self: FakeRO;
          constructor(cb: () => void) {
            this.self = { cb, observed: [], disconnect: jest.fn() };
            instances.push(this.self);
          }
          observe(el: Element) {
            this.self.observed.push(el);
          }
          unobserve() {}
          disconnect() {
            this.self.disconnect();
          }
        };
      });
      afterEach(() => {
        if (hadRO) globalRO.ResizeObserver = originalRO;
        else delete globalRO.ResizeObserver;
      });

      const latest = () => instances[instances.length - 1];
      const block = () => document.getElementById("copilot-tour") as HTMLElement;
      const scrollerOf = () => block().closest<HTMLElement>(".overflow-y-auto") as HTMLElement;

      it("watches both the drawer's scroll box and the tour thread", () => {
        renderBubble();
        play();
        expect(instances.length).toBeGreaterThan(0);
        expect(latest().observed).toHaveLength(2);
        expect(latest().observed).toContain(scrollerOf());
        expect(latest().observed).toContain(block());
      });

      it("pins again to the new geometry when it resizes (the drawer was still opening when the tour started)", () => {
        renderBubble();
        play();
        // The drawer was a few px tall at the start: the thread's first narration would sit far above the view.
        layOut({ blockBottom: 900, scrollerTop: 100, clientHeight: 20 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(900 - 100 - 20 + 16);
        // It has finished opening: a tall scroll box needs far less scrolling.
        layOut({ blockBottom: 900, scrollerTop: 100, clientHeight: 700 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(Math.max(0, 900 - 100 - 700 + 16));
        expect(scrollerOf().scrollTop).toBe(116);
      });

      it("never pins above the top on a resize, and counts the current scroll", () => {
        renderBubble();
        play();
        layOut({ blockBottom: 150, scrollerTop: 100, clientHeight: 300, scrollTop: 40 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(0);
        layOut({ blockBottom: 500, scrollerTop: 100, clientHeight: 300, scrollTop: 200 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(500 - 100 + 200 - 300 + 16);
      });

      it("pins again when the Paused line grows the thread", () => {
        renderBubble();
        play();
        layOut({ blockBottom: 500, scrollerTop: 100, clientHeight: 300 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(116);
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        layOut({ blockBottom: 540, scrollerTop: 100, clientHeight: 300 });
        act(() => latest().cb());
        expect(scrollerOf().scrollTop).toBe(156);
      });

      it("disconnects the observer it replaces when the step changes", () => {
        renderBubble();
        play();
        const first = latest();
        advance(dur(0) + 1);
        expect(latest()).not.toBe(first);
        expect(first.disconnect).toHaveBeenCalled();
        expect(latest().disconnect).not.toHaveBeenCalled();
      });

      it("disconnects every observer when the tour ends, and starts no new one", () => {
        renderBubble();
        play();
        advance(dur(0) + 1);
        fireEvent.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "End tour" }));
        expect(instances.length).toBeGreaterThan(0);
        for (const ro of instances) expect(ro.disconnect).toHaveBeenCalled();
        const count = instances.length;
        advance(ALL_DONE);
        expect(instances).toHaveLength(count);
      });

      it("disconnects when the component unmounts mid-tour", () => {
        const { unmount } = renderBubble();
        play();
        const ro = latest();
        unmount();
        expect(ro.disconnect).toHaveBeenCalled();
      });
    });

    it("does not need ResizeObserver: with none defined (as in jsdom) the tour plays and still pins once", () => {
      expect("ResizeObserver" in globalThis).toBe(false);
      renderBubble();
      expect(() => play()).not.toThrow();
      const scroller = layOut({ blockBottom: 900, scrollerTop: 100, clientHeight: 300 });
      expect(() => advance(dur(0) + 1)).not.toThrow();
      expect(scroller.scrollTop).toBe(900 - 100 - 300 + 16);
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

    describe("the job-description button in the input area", () => {
      const HIRING_NAME = "I'm hiring — check my fit for a role";
      const hiringButtons = () => screen.queryAllByRole("button", { name: new RegExp(HIRING_NAME) }); // the starters' copy has a ◆ in its name
      /** The one this feature adds: in the input area, with no id (the starters' and the tour's own have #fit-mode). */
      const inputAreaButton = () => hiringButtons().filter((b) => !b.id);

      it("is not there before there is a conversation: only the starters' own button shows", () => {
        renderBubble();
        act(() => openCopilot());
        expect(hiringButtons()).toHaveLength(1);
        expect(inputAreaButton()).toHaveLength(0);
        expect(hiringButtons()[0]).toHaveAttribute("id", "fit-mode");
      });

      it("appears once there is a conversation, and is the only such button then", async () => {
        renderBubble();
        await converse();
        expect(hiringButtons()).toHaveLength(1);
        expect(inputAreaButton()).toHaveLength(1);
        expect(document.getElementById("fit-mode")).toBeNull();
      });

      it("has the ◆ hidden from screen readers and no id", async () => {
        renderBubble();
        await converse();
        const button = inputAreaButton()[0];
        expect(button).not.toHaveAttribute("id");
        expect(button).toHaveAttribute("type", "button");
        const mark = button.querySelector("span[aria-hidden='true']");
        expect(mark).toHaveTextContent("◆");
        expect(button).toHaveAccessibleName(HIRING_NAME);
      });

      it("sits in the input area, under the messages and not inside their scroll box", async () => {
        renderBubble();
        await converse();
        const button = inputAreaButton()[0];
        expect(button.closest(".overflow-y-auto")).toBeNull();
        const textbox = screen.getByPlaceholderText(/ask about my work/i);
        expect(button.compareDocumentPosition(textbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText("Hello, I am Titus.").compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it("enters fit mode when pressed: the job-description box opens, and the button goes", async () => {
        renderBubble();
        await converse();
        fireEvent.click(inputAreaButton()[0]);
        expect(screen.getByRole("textbox", { name: "Job description" })).toBeInTheDocument();
        expect(hiringButtons()).toHaveLength(0);
      });

      it("comes back when the visitor leaves fit mode for the chat", async () => {
        renderBubble();
        await converse();
        fireEvent.click(inputAreaButton()[0]);
        fireEvent.click(screen.getByRole("button", { name: /back to chat/i }));
        expect(inputAreaButton()).toHaveLength(1);
      });

      it("is disabled while a reply is streaming", async () => {
        renderBubble();
        await converse();
        const gated = scriptedResponse([deltaLine("Working "), WAIT, deltaLine("on it.")]);
        (global.fetch as jest.Mock).mockResolvedValue(gated.response);
        await ask("And what else?");
        expect(inputAreaButton()[0]).toBeDisabled();
        await act(async () => {
          gated.release();
        });
        expect(await screen.findByText(/on it\./)).toBeInTheDocument();
        expect(inputAreaButton()[0]).toBeEnabled();
      });

      it("is not there while the tour plays: only the tour's own copy shows, once it reaches step 2", async () => {
        renderBubble();
        await converse();
        play();
        expect(inputAreaButton()).toHaveLength(0);
        advance(dur(0) + 1);
        expect(inputAreaButton()).toHaveLength(0);
        expect(hiringButtons()).toHaveLength(1);
        expect(hiringButtons()[0]).toHaveAttribute("id", "fit-mode");
        advance(startOf(4));
        expect(inputAreaButton()).toHaveLength(0);
      });

      it("is not there during the tour's closing line, where the tour's copy shows under it", async () => {
        renderBubble();
        await converse();
        play();
        advance(ALL_DONE);
        expect(say(total - 1)).toBeInTheDocument();
        expect(inputAreaButton()).toHaveLength(0);
        expect(hiringButtons()).toHaveLength(1);
        expect(document.getElementById("copilot-tour")).toContainElement(hiringButtons()[0]);
      });

      it("is back once the closing line is cleared by a new question", async () => {
        renderBubble();
        await converse();
        play();
        advance(ALL_DONE);
        (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([deltaLine("Another answer.")]));
        await ask("One more?");
        expect(await screen.findByText("Another answer.")).toBeInTheDocument();
        expect(recorded()).not.toBeInTheDocument();
        expect(inputAreaButton()).toHaveLength(1);
      });

      it("is back after the tour is stopped quietly, and the tour's own copy is gone", async () => {
        renderBubble();
        await converse();
        play();
        advance(dur(0) + 1);
        fireEvent.keyDown(screen.getByPlaceholderText(/ask about my work/i), { key: "Escape" });
        expect(recorded()).not.toBeInTheDocument();
        expect(inputAreaButton()).toHaveLength(1);
        expect(document.getElementById("fit-mode")).toBeNull();
      });
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

    it("scrolls the page without smooth behaviour", async () => {
      mediaState[REDUCED] = true;
      renderBubble();
      play();
      await settle(startOf(2) + 600);
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    });

    it("types the narration in when motion is allowed", () => {
      renderBubble();
      play();
      expect(document.querySelector("#copilot-tour .opacity-0")).not.toBeNull();
    });
  });
});

describe("CopilotBubble cards", () => {
  const SUMMARY = "[Card shown: where I did it, “Illumina”, “TheMarginCall”]";
  const surface = [
    { version: "1.0", createSurface: { surfaceId: "card_1", catalogId: "x", metadata: {} } },
    { version: "1.0", updateComponents: { surfaceId: "card_1", components: [] } },
  ];
  const cardLine = (overrides: Record<string, unknown> = {}) =>
    `${JSON.stringify({ type: "card", id: "card_1", kind: "evidence", summary: SUMMARY, flair: "plain", messages: surface, sources: [], ...overrides })}\n`;

  beforeEach(() => {
    global.fetch = jest.fn();
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
  });

  async function openAndAsk(question: string) {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
    return user;
  }

  it("draws a streamed evidence card under the reply text, labelled for what it is, once the reply has arrived", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([cardLine(), deltaLine("Start with RAFT.")])
    );
    await openAndAsk("How would you design production-ready agents?");

    const card = await screen.findByTestId("a2ui-card");
    expect(card).toHaveTextContent("Where I did it, and sources (2 messages)");
    expect(card).toHaveAttribute("data-flair", "plain");
    const reply = screen.getByText("Start with RAFT.");
    expect(reply.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a compare card with the Compare table label", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([cardLine({ kind: "compare", summary: "[Card shown: compare table of “A”, “B” on “x”]" }), deltaLine("A is light.")])
    );
    await openAndAsk("LoRA or RAFT?");

    const card = await screen.findByTestId("a2ui-card");
    expect(card).toHaveTextContent("Compare table (2 messages)");
    expect(card).toHaveAttribute("data-flair", "plain");
  });

  it("does not draw a card for a malformed card event, and still shows the reply", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([cardLine({ flair: "neon" }), deltaLine("Plain answer.")]));
    await openAndAsk("Anything?");

    await screen.findByText("Plain answer.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
  });

  it("does not draw a card with the retired clipping flair, or with the retired reading_list kind", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createStreamingResponse([cardLine({ flair: "clipping" }), deltaLine("Old flair.")]))
      .mockResolvedValueOnce(createStreamingResponse([cardLine({ kind: "reading_list" }), deltaLine("Old kind.")]));
    const user = await openAndAsk("Old card?");
    await screen.findByText("Old flair.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Old kind?{Enter}");
    await screen.findByText("Old kind.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
  });

  it("draws only the first card of a reply", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([cardLine(), cardLine({ id: "card_2", summary: "[Card shown: another]" }), deltaLine("Answer.")])
    );
    await openAndAsk("Two cards?");

    await screen.findByText("Answer.");
    expect(screen.getAllByTestId("a2ui-card")).toHaveLength(1);
  });

  it("sends the card's one-line summary in history, in place of the card, on the next turn", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createStreamingResponse([cardLine(), deltaLine("Start with RAFT.")]))
      .mockResolvedValueOnce(createStreamingResponse([deltaLine("Next answer.")]));
    const user = await openAndAsk("Which should I read?");
    await screen.findByTestId("a2ui-card");
    await screen.findByText("Start with RAFT.");

    await user.type(screen.getByPlaceholderText(/ask about my work/i), "And after that?{Enter}");
    await screen.findByText("Next answer.");

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(body.messages).toEqual([
      { role: "user", content: "Which should I read?" },
      { role: "assistant", content: `Start with RAFT.\n\n${SUMMARY}` },
      { role: "user", content: "And after that?" },
    ]);
    expect(JSON.stringify(body.messages)).not.toContain("createSurface");
  });

  it("sends an assistant reply with no card as its text alone", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createStreamingResponse([deltaLine("Plain answer.")]))
      .mockResolvedValueOnce(createStreamingResponse([deltaLine("Second.")]));
    const user = await openAndAsk("Hi?");
    await screen.findByText("Plain answer.");

    await user.type(screen.getByPlaceholderText(/ask about my work/i), "More?{Enter}");
    await screen.findByText("Second.");

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(body.messages[1]).toEqual({ role: "assistant", content: "Plain answer." });
  });

  it("lists a source the card does not list in the Sources row, and leaves out one that it does", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([
        `{"type":"source","n":1,"title":"First article","url":"https://medium.com/a"}\n`,
        `{"type":"source","n":2,"title":"Second article","url":"https://medium.com/b"}\n`,
        cardLine({ sources: [2] }),
        deltaLine("Both are useful."),
      ])
    );
    await openAndAsk("Which two?");

    await screen.findByText("Both are useful.");
    expect(screen.getByRole("link", { name: /1 · First article/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Second article/ })).toBeNull();
  });

  it("keeps every source in the Sources row when the card lists none of them", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      createStreamingResponse([
        `{"type":"source","n":1,"title":"First article","url":"https://medium.com/a"}\n`,
        `{"type":"source","n":2,"title":"Second article","url":"https://medium.com/b"}\n`,
        cardLine({ sources: [] }),
        deltaLine("Both."),
      ])
    );
    await openAndAsk("Which two?");

    await screen.findByText("Both.");
    expect(screen.getByRole("link", { name: /1 · First article/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2 · Second article/ })).toBeInTheDocument();
  });
});

describe("CopilotBubble: a pick from show_on_page", () => {
  const TWO = ["0000000a", "00000001"];
  const TARGETS = [{ id: "writing", label: "Writing", path: "/writing", page: "Writing" }];
  const SIDE_BY_SIDE = "(min-width: 1024px)";
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    global.fetch = jest.fn();
    mockPush.mockReset();
    mockPathname = "/";
    window.history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    await letPageSettle();
    window.matchMedia = originalMatchMedia;
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

  const pickLine = (ids: string[]) => `${JSON.stringify({ type: "pick", articles: ids })}\n`;
  const writingAction = actionLine("writing");

  /** Asks a question whose reply carries the given stream, with the drawer open at the given media queries. */
  async function askFor(lines: string[], matching: string[] = []) {
    mockMatchMedia(matching);
    (global.fetch as jest.Mock).mockResolvedValue(createStreamingResponse([...lines, deltaLine("Here they are.")]));
    render(<CopilotBubble targets={TARGETS} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Which of your articles should I read?{Enter}");
    await waitFor(() => expect(screen.getByText("Here they are.")).toBeInTheDocument());
    return user;
  }

  it("offers a button that opens the Writing page filtered to the picked articles, when the drawer covers the page", async () => {
    const user = await askFor([pickLine(TWO), writingAction]);

    await user.click(screen.getByRole("button", { name: /See these 2 on the Writing page/ }));
    expect(mockPush).toHaveBeenCalledWith("/writing?read=0000000a,00000001", { scroll: false });
  });

  it("says this one, for a pick of one article", async () => {
    await askFor([pickLine(["0000000a"]), writingAction]);
    expect(screen.getByRole("button", { name: /See this one on the Writing page/ })).toBeInTheDocument();
  });

  it("shows the Writing stop as the pick line, not as a stop pill beside it", async () => {
    await askFor([pickLine(TWO), writingAction]);
    expect(screen.queryByText("See on page")).toBeNull();
  });

  it("has no pick line for a reply that picked no articles", async () => {
    await askFor([]);
    expect(screen.queryByRole("button", { name: /See (this one|these \d+) on the Writing page/ })).toBeNull();
    expect(screen.queryByText(/filtered to/)).toBeNull();
  });

  it("takes the first pick of a reply, and ignores a later one", async () => {
    await askFor([pickLine(TWO), pickLine(["00000002", "00000003", "00000004"]), writingAction]);
    expect(screen.getByRole("button", { name: /See these 2 on the Writing page/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /these 3/ })).toBeNull();
  });

  it("moves the page to the filtered Writing page on its own when the drawer sits beside it, and says so", async () => {
    await askFor([pickLine(TWO), writingAction], [SIDE_BY_SIDE]);
    await letPageSettle();

    expect(mockPush).toHaveBeenCalledWith("/writing?read=0000000a,00000001", { scroll: false });
    expect(screen.getByRole("button", { name: /Writing page · filtered to these 2/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See these 2 on the Writing page/ })).toBeNull();
  });

  it("shows the whole Writing page from “Show all” beside the page", async () => {
    const user = await askFor([pickLine(TWO), writingAction], [SIDE_BY_SIDE]);
    await letPageSettle();

    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(mockPush).toHaveBeenLastCalledWith("/writing", { scroll: false });
  });

  it("remembers the question that made the pick, for the Writing page's banner", async () => {
    await askFor([pickLine(TWO), writingAction]);
    expect(pickQuestion(TWO)).toBe("Which of your articles should I read?");
  });
});

describe("CopilotBubble: a card waits for the reply", () => {
  const SUMMARY = "[Card shown: where I did it, “Illumina”, “TheMarginCall”]";
  const surface = [
    { version: "1.0", createSurface: { surfaceId: "card_1", catalogId: "x", metadata: {} } },
    { version: "1.0", updateComponents: { surfaceId: "card_1", components: [] } },
  ];
  const cardLine = `${JSON.stringify({ type: "card", id: "card_1", kind: "evidence", summary: SUMMARY, flair: "plain", messages: surface, sources: [] })}\n`;

  beforeEach(() => {
    global.fetch = jest.fn();
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function askQuestion(question: string) {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
  }

  it("does not draw the card while the reply is still streaming in", async () => {
    const stream = pausingResponse([cardLine, deltaLine("Start with RAFT."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await askQuestion("How would you design production-ready agents?");

    await screen.findByText("Start with RAFT.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
  });

  it("draws the card below the reply once the stream has closed", async () => {
    const stream = pausingResponse([cardLine, deltaLine("Start with RAFT."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await askQuestion("How would you design production-ready agents?");

    await screen.findByText("Start with RAFT.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();

    await stream.release();
    const card = await screen.findByTestId("a2ui-card");
    expect(card).toHaveTextContent("Where I did it, and sources (2 messages)");
    const reply = screen.getByText("Start with RAFT.");
    expect(reply.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("a2ui-card")).toHaveLength(1);
  });

  it("keeps the card out of the reply when the stream fails partway through", async () => {
    const encoder = new TextEncoder();
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode(cardLine) })
        .mockResolvedValueOnce({ done: false, value: encoder.encode(deltaLine("Partway")) })
        .mockRejectedValueOnce(new TypeError("network error")),
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } });
    await askQuestion("Anything?");

    await waitFor(() => expect(screen.getByText(/connection dropped before I could finish/i)).toBeInTheDocument());
    expect(screen.getByText("Partway")).toBeInTheDocument();
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
  });

  it("keeps the card out of a failed reply that never sent any text", async () => {
    const encoder = new TextEncoder();
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoder.encode(cardLine) })
        .mockRejectedValueOnce(new TypeError("network error")),
    };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } });
    await askQuestion("Anything?");

    await waitFor(() => expect(screen.getByText(/connection dropped before I could finish/i)).toBeInTheDocument());
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
  });
});

describe("CopilotBubble: the page-move step", () => {
  const TARGET_ID = "role-illumina";
  const TARGETS = [{ id: TARGET_ID, label: "Illumina, 2023", path: "/experience", page: "Experience" }];
  const WRITING = [{ id: "writing", label: "Writing", path: "/writing", page: "Writing" }];
  const SIDE_BY_SIDE = "(min-width: 1024px)";
  const MOVED = "Went to Illumina, 2023 on the Experience page";
  const pickLine = (ids: string[]) => `${JSON.stringify({ type: "pick", articles: ids })}\n`;
  let originalMatchMedia: typeof window.matchMedia;
  const originalScrollTo = window.scrollTo;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
    global.fetch = jest.fn();
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    mockPush.mockReset();
    mockPathname = "/";
    window.history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    await letPageSettle();
    window.matchMedia = originalMatchMedia;
    window.scrollTo = originalScrollTo;
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

  async function askWith(
    script: Array<string | typeof WAIT>,
    { targets = TARGETS, matching = [SIDE_BY_SIDE] }: { targets?: typeof TARGETS; matching?: string[] } = {},
  ) {
    mockMatchMedia(matching);
    const stream = pausingResponse(script);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    render(<CopilotBubble targets={targets} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Show me Illumina{Enter}");
    return { user, stream };
  }

  const liveList = () => screen.queryByRole("list", { name: "What I'm doing" });

  it("lists the move under the dots, before the reply has started, once the page has moved", async () => {
    const { stream } = await askWith([actionLine(TARGET_ID), WAIT, deltaLine("Here it is.")]);

    await letPageSettle();
    const list = await waitFor(() => {
      const found = liveList();
      expect(found).toBeInTheDocument();
      return found as HTMLElement;
    });
    expect(within(list).getByText(MOVED)).toBeInTheDocument();
    expect(within(list).getByText(MOVED).closest("li")?.textContent).toBe(MOVED);
    expect(screen.getByText("Writing the reply")).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith("/experience", { scroll: false });

    await stream.release();
    await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    expect(liveList()).not.toBeInTheDocument();
  });

  it("joins the folded line above the reply when the move comes after the first words", async () => {
    const { stream } = await askWith([deltaLine("Here it is."), actionLine(TARGET_ID), WAIT, deltaLine(" More.")]);
    await screen.findByText(/Here it is\./);

    await letPageSettle();
    const fold = await screen.findByText(MOVED, { selector: "summary" });
    expect(fold.closest("details")).not.toBeNull();
    expect(liveList()).not.toBeInTheDocument();

    await stream.release();
    await waitFor(() => expect(screen.getByText(/More\./)).toBeInTheDocument());
    expect(screen.getByText(MOVED, { selector: "summary" })).toBeInTheDocument();
  });

  it("adds the move to the fold after a search, with the other parts first", async () => {
    const stepLine = (id: string, tool: string, label: string, done: boolean) =>
      `${JSON.stringify({ type: "step", id, tool, label, done })}\n`;
    const { stream } = await askWith([
      stepLine("c1", "search_writing", "Searching my writing for “x”", false),
      stepLine("c1", "search_writing", "Searched my writing for “x”", true),
      actionLine(TARGET_ID),
      deltaLine("Here it is."),
      WAIT,
    ]);
    await letPageSettle();
    await stream.release();
    await waitFor(() =>
      expect(screen.getByText(`Searched my writing · went to Illumina, 2023 on the Experience page`, { selector: "summary" })).toBeInTheDocument(),
    );
  });

  it("does not list a move when the page is too narrow for the drawer beside it", async () => {
    const { stream } = await askWith([actionLine(TARGET_ID), WAIT, deltaLine("Here it is.")], { matching: [] });
    await letPageSettle();

    expect(mockPush).not.toHaveBeenCalled();
    expect(liveList()).not.toBeInTheDocument();
    expect(screen.queryByText(/Went to/)).not.toBeInTheDocument();

    await stream.release();
    await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    expect(screen.queryByText(/Went to/)).not.toBeInTheDocument();
  });

  it("does not list a move when the visitor scrolled the page during the answer", async () => {
    const { stream } = await askWith([deltaLine("Here "), actionLine(TARGET_ID), WAIT, deltaLine("it is.")]);
    await screen.findByText(/^Here/);
    fireEvent.wheel(document.body);
    await letPageSettle();

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText(/Went to/)).not.toBeInTheDocument();

    await stream.release();
    await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
    expect(screen.queryByText(/Went to/)).not.toBeInTheDocument();
  });

  it("says how many articles the Writing page was filtered to, for a pick beside the page", async () => {
    const { stream } = await askWith(
      [pickLine(["0000000a", "00000001"]), actionLine("writing"), WAIT, deltaLine("Here they are.")],
      { targets: WRITING },
    );
    await letPageSettle();

    expect(mockPush).toHaveBeenCalledWith("/writing?read=0000000a,00000001", { scroll: false });
    expect(within(liveList()!).getByText("Filtered the Writing page to 2 articles")).toBeInTheDocument();

    await stream.release();
    await waitFor(() => expect(screen.getByText("Here they are.")).toBeInTheDocument());
    expect(screen.getByText("Filtered the Writing page to 2 articles", { selector: "summary" })).toBeInTheDocument();
  });

  it("uses the singular for a pick of one article", async () => {
    const { stream } = await askWith(
      [pickLine(["0000000a"]), actionLine("writing"), WAIT, deltaLine("Here it is.")],
      { targets: WRITING },
    );
    await letPageSettle();

    expect(within(liveList()!).getByText("Filtered the Writing page to 1 article")).toBeInTheDocument();
    await stream.release();
    await waitFor(() => expect(screen.getByText("Here it is.")).toBeInTheDocument());
  });
});

describe("CopilotBubble: following the bottom of the drawer", () => {
  let height: number;
  let scroller: HTMLElement;
  let originalRO: unknown;
  const globalRO = globalThis as unknown as { ResizeObserver?: unknown };
  const hadRO = "ResizeObserver" in globalThis;

  beforeEach(() => {
    global.fetch = jest.fn();
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
    height = 1000;
    originalRO = globalRO.ResizeObserver;
    // jsdom has no ResizeObserver: these tests do not need one (the ResizeObserver describe below defines its own).
    delete globalRO.ResizeObserver;
  });

  afterEach(() => {
    if (hadRO) globalRO.ResizeObserver = originalRO;
    else delete globalRO.ResizeObserver;
    jest.restoreAllMocks();
  });

  /** Opens the drawer and gives its scroll box a geometry jsdom lacks: `height` is the content, the box is 400px. */
  async function openDrawer() {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    scroller = messagesScroller();
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    return user;
  }

  /** The visitor scrolls the drawer to `top`: the scroll position changes, and a scroll event follows. */
  function scrollDrawerTo(top: number) {
    scroller.scrollTop = top;
    fireEvent.scroll(scroller);
  }

  async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
    await user.type(screen.getByPlaceholderText(/ask about my work/i), `${question}{Enter}`);
  }

  it("pins the new lines to the bottom as a reply streams in", async () => {
    const user = await openDrawer();
    const stream = pausingResponse([deltaLine("One."), WAIT, deltaLine(" Two.")]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await ask(user, "Go on");

    await screen.findByText(/One\./);
    expect(scroller.scrollTop).toBe(1000);

    height = 1200;
    await stream.release();
    await waitFor(() => expect(scroller.scrollTop).toBe(1200));
  });

  it("stops following when the visitor scrolls up, so further lines leave their place", async () => {
    const user = await openDrawer();
    const stream = pausingResponse([deltaLine("One."), WAIT, deltaLine(" Two."), WAIT, deltaLine(" Three.")]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await ask(user, "Go on");
    await screen.findByText(/One\./);

    scrollDrawerTo(100);
    height = 1200;
    await stream.release();
    await screen.findByText(/Two\./);
    expect(scroller.scrollTop).toBe(100);

    height = 1400;
    await stream.release();
    await screen.findByText(/Three\./);
    expect(scroller.scrollTop).toBe(100);
  });

  it("follows again once the visitor scrolls back to the bottom", async () => {
    const user = await openDrawer();
    const stream = pausingResponse([deltaLine("One."), WAIT, deltaLine(" Two."), WAIT, deltaLine(" Three.")]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await ask(user, "Go on");
    await screen.findByText(/One\./);

    scrollDrawerTo(100);
    height = 1200;
    await stream.release();
    await screen.findByText(/Two\./);
    expect(scroller.scrollTop).toBe(100);

    scrollDrawerTo(1200 - 400);
    height = 1500;
    await stream.release();
    await waitFor(() => expect(scroller.scrollTop).toBe(1500));
  });

  it("still counts as at the bottom within 48px of it", async () => {
    const user = await openDrawer();
    const stream = pausingResponse([deltaLine("One."), WAIT, deltaLine(" Two.")]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await ask(user, "Go on");
    await screen.findByText(/One\./);

    scrollDrawerTo(1000 - 400 - 48);
    height = 1200;
    await stream.release();
    await waitFor(() => expect(scroller.scrollTop).toBe(1200));
  });

  it("stops following once it is more than 48px from the bottom", async () => {
    const user = await openDrawer();
    const stream = pausingResponse([deltaLine("One."), WAIT, deltaLine(" Two.")]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await ask(user, "Go on");
    await screen.findByText(/One\./);

    scrollDrawerTo(1000 - 400 - 49);
    height = 1200;
    await stream.release();
    await screen.findByText(/Two\./);
    expect(scroller.scrollTop).toBe(1000 - 400 - 49);
  });

  it("follows the new message when the visitor sends one, even after scrolling up", async () => {
    const user = await openDrawer();
    (global.fetch as jest.Mock).mockResolvedValueOnce(createStreamingResponse([deltaLine("First.")]));
    await ask(user, "First question");
    await screen.findByText(/First\./);

    scrollDrawerTo(50);
    height = 2000;
    (global.fetch as jest.Mock).mockResolvedValueOnce(createStreamingResponse([deltaLine("Second.")]));
    await ask(user, "Second question");

    await waitFor(() => expect(scroller.scrollTop).toBe(2000));
  });
});

describe("CopilotBubble: the newest reply is re-pinned as it grows", () => {
  type FakeRO = { cb: () => void; observed: Element[]; disconnect: jest.Mock };
  let instances: FakeRO[];
  const globalRO = globalThis as unknown as { ResizeObserver?: unknown };
  let originalRO: unknown;
  const hadRO = "ResizeObserver" in globalThis;
  let height: number;

  beforeEach(() => {
    global.fetch = jest.fn();
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
    height = 1000;
    originalRO = globalRO.ResizeObserver;
    instances = [];
    globalRO.ResizeObserver = class {
      private readonly self: FakeRO;
      constructor(cb: () => void) {
        this.self = { cb, observed: [], disconnect: jest.fn() };
        instances.push(this.self);
      }
      observe(el: Element) {
        this.self.observed.push(el);
      }
      unobserve() {}
      disconnect() {
        this.self.disconnect();
      }
    };
  });

  afterEach(() => {
    if (hadRO) globalRO.ResizeObserver = originalRO;
    else delete globalRO.ResizeObserver;
    jest.restoreAllMocks();
  });

  /** Lets the reply grow in layout (as its card or a late image would) and reports the change the way a browser does. */
  function growReply(newHeight: number) {
    height = newHeight;
    act(() => {
      for (const ro of instances) ro.cb();
    });
  }

  it("watches the newest assistant reply itself", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    const stream = pausingResponse([deltaLine("Answer."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Question{Enter}");
    const reply = await screen.findByText("Answer.");
    const article = reply.closest<HTMLElement>("article")!;

    expect(article.id).toMatch(/^copilot-msg-/);
    expect(instances.some((ri) => ri.observed.includes(article))).toBe(true);
    await stream.release();
  });

  it("re-pins the bottom when the reply grows, while the drawer is following", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    const scroller = messagesScroller();
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    const stream = pausingResponse([deltaLine("Answer."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Question{Enter}");
    await screen.findByText("Answer.");

    growReply(1300);
    expect(scroller.scrollTop).toBe(1300);
    await stream.release();
  });

  it("leaves the scroll alone when the reply grows after the visitor scrolled up", async () => {
    const user = userEvent.setup();
    render(<CopilotBubble />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    const scroller = messagesScroller();
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    const stream = pausingResponse([deltaLine("Answer."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Question{Enter}");
    await screen.findByText("Answer.");

    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    growReply(1300);
    expect(scroller.scrollTop).toBe(100);
    await stream.release();
  });
});

describe("CopilotBubble: the footer under a reply waits for the reply", () => {
  const TARGETS = [
    { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" },
    { id: "writing", label: "Writing", path: "/writing", page: "Writing" },
  ];
  const GUARDRAILS = "https://medium.com/@tituslhy/guardrails";
  const source = (n: number, title: string) => `${JSON.stringify({ type: "source", n, title, url: GUARDRAILS })}\n`;
  const pickLine = (ids: string[]) => `${JSON.stringify({ type: "pick", articles: ids })}\n`;
  const cardLine = `${JSON.stringify({
    type: "card",
    id: "card_1",
    kind: "evidence",
    summary: "[Card shown: where I did it]",
    flair: "plain",
    messages: [
      { version: "1.0", createSurface: { surfaceId: "card_1", catalogId: "x", metadata: {} } },
      { version: "1.0", updateComponents: { surfaceId: "card_1", components: [] } },
    ],
    sources: [],
  })}\n`;
  const PILL = "Experience · Illumina, 2023";
  const PICK_BUTTON = /See these 2 on the Writing page/;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    global.fetch = jest.fn();
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
    // Narrow screen: the actions only mark pills and the pick only shows its line, so the page stays where it is.
    window.matchMedia = jest.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
    }));
    mockPathname = "/";
    window.history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    await letPageSettle();
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  /** A reply with every footer item: a card, sources, a pick line, a stop pill (the copy button is always there once it closes). */
  const fullReply = (text: string, extra: string[] = []) => [
    deltaLine(text),
    source(1, "Your agent needs a bouncer"),
    pickLine(["0000000a", "00000001"]),
    actionLine("role-illumina"),
    ...extra,
  ];

  async function openDrawer() {
    const user = userEvent.setup();
    render(<CopilotBubble targets={TARGETS} />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    return user;
  }

  /** The message whose text is `text`. Every message has a copy button, so the copy checks look inside the reply. */
  const replyOf = (text: string) => screen.getByText(text).closest<HTMLElement>("article")!;
  const copyIn = (article: HTMLElement) => within(article).queryAllByRole("button", { name: "Copy message" });

  function expectNoFooter(text: string) {
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.queryByText("See on page")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PILL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PICK_BUTTON })).not.toBeInTheDocument();
    expect(copyIn(replyOf(text))).toHaveLength(0);
  }

  it("shows no Sources row, stop pills, pick line or copy button while the reply is streaming", async () => {
    const stream = pausingResponse([...fullReply("Two pieces cover it."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    const user = await openDrawer();
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Where do I write about guardrails?{Enter}");

    await screen.findByText("Two pieces cover it.");
    expectNoFooter("Two pieces cover it.");

    await stream.release();
    await waitFor(() => expect(copyIn(replyOf("Two pieces cover it."))).toHaveLength(1));
  });

  it("shows every footer item once the stream has closed", async () => {
    const stream = pausingResponse([...fullReply("Two pieces cover it."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    const user = await openDrawer();
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Where do I write about guardrails?{Enter}");
    await screen.findByText("Two pieces cover it.");
    expectNoFooter("Two pieces cover it.");

    await stream.release();

    expect(await screen.findByText("Sources")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Your agent needs a bouncer/ })).toHaveAttribute("href", GUARDRAILS);
    expect(screen.getByText("See on page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PILL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PICK_BUTTON })).toBeInTheDocument();
    expect(copyIn(replyOf("Two pieces cover it."))).toHaveLength(1);
  });

  it("puts the card before the pills, pick line, sources and copy button once the stream has closed", async () => {
    const stream = pausingResponse([cardLine, ...fullReply("Two pieces cover it."), WAIT]);
    (global.fetch as jest.Mock).mockResolvedValue(stream.response);
    const user = await openDrawer();
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Where do I write about guardrails?{Enter}");
    await screen.findByText("Two pieces cover it.");
    expect(screen.queryByTestId("a2ui-card")).not.toBeInTheDocument();
    expectNoFooter("Two pieces cover it.");

    await stream.release();

    const card = await screen.findByTestId("a2ui-card");
    const text = screen.getByText("Two pieces cover it.");
    const pill = screen.getByRole("button", { name: PILL });
    const pick = screen.getByRole("button", { name: PICK_BUTTON });
    const sources = screen.getByText("Sources");
    const copy = copyIn(replyOf("Two pieces cover it."))[0];
    const following = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(following(text, card)).toBe(true);
    expect(following(card, pick)).toBe(true);
    expect(following(card, pill)).toBe(true);
    expect(following(card, sources)).toBe(true);
    expect(following(sources, copy)).toBe(true);
  });

  it("keeps an earlier finished reply's footer while a later reply is still streaming", async () => {
    const later = pausingResponse([deltaLine("Let me think about that."), WAIT]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(createStreamingResponse(fullReply("Two pieces cover it.")))
      .mockResolvedValueOnce(later.response);
    const user = await openDrawer();
    await user.type(screen.getByPlaceholderText(/ask about my work/i), "Where do I write about guardrails?{Enter}");
    await waitFor(() => expect(copyIn(replyOf("Two pieces cover it."))).toHaveLength(1));

    await user.type(screen.getByPlaceholderText(/ask about my work/i), "And what about your studies?{Enter}");
    await screen.findByText("Let me think about that.");

    // The first reply keeps its footer; the streaming one has none yet.
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PILL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PICK_BUTTON })).toBeInTheDocument();
    expect(copyIn(replyOf("Two pieces cover it."))).toHaveLength(1);
    expect(copyIn(replyOf("Let me think about that."))).toHaveLength(0);

    await later.release();
    await waitFor(() => expect(copyIn(replyOf("Let me think about that."))).toHaveLength(1));
  });
});

describe("CopilotBubble: voice in", () => {
  // A MediaRecorder stand-in: stop() hands over the clip the test chose, then fires onstop, as a browser does.
  class FakeRecorder {
    static instances: FakeRecorder[] = [];
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    clipBytes = 5_000;
    constructor(public stream: MediaStream) {
      FakeRecorder.instances.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(this.clipBytes)], { type: "audio/webm" }) });
      this.onstop?.();
    }
  }
  const tracks: Array<{ stop: jest.Mock }> = [];
  let getUserMedia: jest.Mock;
  let originalMatchMedia: typeof window.matchMedia;

  const MIC = "Speak your question";
  const STOP = "Stop recording";
  const SEND = "Send message";
  const TRANSCRIBE_TEXT = "What did you build at Illumina?";
  const PRIVACY = /transcribes voice clips \(I don’t keep them\)/;
  const alertText = () => screen.queryByRole("alert")?.textContent ?? null;
  const box = () => screen.queryByPlaceholderText(/ask about my work/i) as HTMLTextAreaElement | null;
  const micButton = () => screen.queryByRole("button", { name: MIC });

  /** Routes fetch: the transcription goes to `transcribe`, the chat to the stream given. */
  function routeFetch(transcribe: () => Promise<Response>, chat: Response | Promise<Response> = createStreamingResponse([deltaLine("Sure.")])) {
    const chatFetch = jest.fn<Promise<Response>, [string]>(async () => chat);
    global.fetch = jest.fn((url: string) => (url === "/api/transcribe" ? transcribe() : chatFetch(url))) as unknown as typeof fetch;
    return { chatFetch };
  }
  const transcribedOk = (text: string) => async () => ({ ok: true, status: 200, json: async () => ({ text }) }) as unknown as Response;
  const transcribeCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === "/api/transcribe");
  const chatCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url]) => url !== "/api/transcribe");

  async function flush() {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  async function openDrawer(targets = [] as Array<{ id: string; label: string; path: string; page?: string }>) {
    const user = userEvent.setup();
    render(<CopilotBubble targets={targets} email="me@example.com" />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    return user;
  }

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
    }));
    FakeRecorder.instances = [];
    tracks.length = 0;
    getUserMedia = jest.fn(async () => {
      const track = { stop: jest.fn() };
      tracks.push(track);
      return { getTracks: () => [track] } as unknown as MediaStream;
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
    global.crypto = {
      randomUUID: jest.fn(() => "test-id-" + Math.random().toString(36).substr(2, 9)),
    } as unknown as Crypto;
    if (!global.TextDecoder) {
      global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    }
    routeFetch(transcribedOk(TRANSCRIBE_TEXT));
  });

  afterEach(async () => {
    await act(async () => {});
    delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  describe("the mic", () => {
    it("sits between the box and Send where the browser can record", async () => {
      await openDrawer();

      const mic = micButton()!;
      const send = screen.getByRole("button", { name: SEND });
      expect(mic).toBeInTheDocument();
      expect(box()!.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(mic.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("is absent where the browser has no MediaRecorder, and the privacy line says nothing about voice", async () => {
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      await openDrawer();

      expect(micButton()).toBeNull();
      expect(screen.getByRole("button", { name: SEND })).toBeInTheDocument();
      expect(screen.queryByText(/transcribes voice clips/)).not.toBeInTheDocument();
    });

    it("is not offered in the job-description mode", async () => {
      const user = await openDrawer();
      await user.click(screen.getByRole("button", { name: /i'm hiring/i }));

      expect(micButton()).toBeNull();
    });

    it("is disabled while a reply streams", async () => {
      const stream = pausingResponse([deltaLine("One."), WAIT]);
      global.fetch = jest.fn(async (url: string) => (url === "/api/transcribe" ? transcribedOk(TRANSCRIBE_TEXT)() : stream.response)) as unknown as typeof fetch;
      const user = await openDrawer();
      await user.type(box()!, "Go on{Enter}");
      await screen.findByText("One.");

      expect(micButton()).toBeDisabled();
      await stream.release();
    });

    it("shows Send as just its arrow on a phone, where the mic takes the room", async () => {
      await openDrawer();
      const label = screen.getByRole("button", { name: SEND }).querySelector("span");
      expect(label).toHaveTextContent("Send");
      expect(label).toHaveClass("hidden", "min-[400px]:inline");
    });

    it("leaves Send's label alone where there is no mic", async () => {
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
      await openDrawer();
      const label = screen.getByRole("button", { name: SEND }).querySelector("span");
      expect(label).toHaveTextContent("Send");
      expect(label).not.toHaveClass("hidden");
    });

    it("says voice clips go to OpenAI to be transcribed and are not kept, only where the mic is", async () => {
      await openDrawer();
      expect(screen.getByText(PRIVACY)).toBeInTheDocument();
    });

    it("stops a playing tour when the visitor starts to speak", async () => {
      await openDrawer();
      act(() => startTour());
      await screen.findByRole("button", { name: "Pause" });

      fireEvent.click(micButton()!);
      await flush();

      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });
  });

  describe("recording and transcribing", () => {
    it("while recording, the box and Send give way to a listening line and a Stop button", async () => {
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();

      expect(getUserMedia).toHaveBeenCalledWith({
        audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true },
      });
      expect(screen.getByRole("status")).toHaveTextContent("Listening");
      expect(box()).toBeNull();
      expect(screen.getByRole("button", { name: STOP })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: SEND })).toBeNull();
      expect(micButton()).toBeNull();
    });

    it("Stop ends the recording and shows Transcribing, with the mic and Send disabled", async () => {
      let finish!: (r: Response) => void;
      routeFetch(() => new Promise<Response>((resolve) => (finish = resolve)));
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();

      expect(screen.getByRole("status")).toHaveTextContent("Transcribing…");
      expect(micButton()).toBeDisabled();
      expect(screen.getByRole("button", { name: SEND })).toBeDisabled();
      expect(box()).toBeNull();

      await act(async () => finish({ ok: true, status: 200, json: async () => ({ text: "Done." }) } as unknown as Response));
      await flush();
      expect(box()).toBeInTheDocument();
    });

    it("puts the words in the box after what is typed, focuses it, and sends nothing by itself", async () => {
      const user = await openDrawer();
      await user.type(box()!, "Tell me about");
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();

      await waitFor(() => expect(box()!.value).toBe(`Tell me about ${TRANSCRIBE_TEXT}`));
      await waitFor(() => expect(document.activeElement).toBe(box()));
      expect(transcribeCalls()).toHaveLength(1);
      expect(chatCalls()).toHaveLength(0);
      expect(screen.queryByText(TRANSCRIBE_TEXT, { selector: "article *" })).toBeNull();
    });

    it("with nothing typed, the words are the whole box", async () => {
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await waitFor(() => expect(box()!.value).toBe(TRANSCRIBE_TEXT));
    });

    it("the words come back to the box as a user adds more, with nothing sent until Send", async () => {
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await waitFor(() => expect(box()!.value).toBe(TRANSCRIBE_TEXT));

      await user.type(box()!, " and Mastercard?");
      expect(chatCalls()).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: SEND }));
      await waitFor(() => expect(chatCalls()).toHaveLength(1));
      expect(screen.getByText(`${TRANSCRIBE_TEXT} and Mastercard?`)).toBeInTheDocument();
    });

    it("a clip with nothing said is not sent: the line says so, and no request is made", async () => {
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      FakeRecorder.instances[0].clipBytes = 200;
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();

      expect(alertText()).toMatch(/I couldn't hear anything from your microphone/);
      expect(transcribeCalls()).toHaveLength(0);
      expect(box()!.value).toBe("");
    });
  });

  describe("problems", () => {
    it("a refused microphone shows the browser-settings line under the box, and typing clears it", async () => {
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();

      expect(alertText()).toMatch(/microphone is blocked/);
      expect(box()).toBeInTheDocument();

      await user.type(box()!, "x");
      expect(alertText()).toBeNull();
    });

    it("a 429 from the route says there were too many clips", async () => {
      routeFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response);
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await waitFor(() => expect(alertText()).toMatch(/a lot of voice clips in a minute/));
    });

    it("a failed transcription says the clip did not come through, and the box stays usable", async () => {
      routeFetch(async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response);
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await waitFor(() => expect(alertText()).toMatch(/That clip didn't come through/));
      expect(box()).toBeInTheDocument();
      expect(micButton()).not.toBeDisabled();
    });
  });

  describe("closing the drawer", () => {
    it("closed while the mic permission is still being asked, then granted: no recording, nothing sent, the mic is handed back", async () => {
      let grant!: (s: MediaStream) => void;
      getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => (grant = resolve)));
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      await user.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      await flush();

      const track = { stop: jest.fn() };
      await act(async () => grant({ getTracks: () => [track] } as unknown as MediaStream));
      await flush();

      expect(FakeRecorder.instances).toHaveLength(0);
      expect(track.stop).toHaveBeenCalled();
      expect(transcribeCalls()).toHaveLength(0);
      expect(chatCalls()).toHaveLength(0);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("button", { name: STOP })).toBeNull();
      expect(alertText()).toBeNull();
      expect(box()!.value).toBe("");
    });

    it("while recording drops the clip: nothing is sent, the mic is released, and the notice is cleared", async () => {
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      expect(alertText()).toMatch(/microphone is blocked/);

      // Record a clip, then close the drawer before stopping it.
      fireEvent.click(micButton()!);
      await flush();
      expect(screen.getByRole("button", { name: STOP })).toBeInTheDocument();
      await user.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      await flush();

      expect(transcribeCalls()).toHaveLength(0);
      expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      expect(alertText()).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(box()).toBeInTheDocument();
    });

    it("while transcribing aborts the request and puts nothing in the box", async () => {
      // The transcription never answers on its own: it only ends when the drawer aborts it.
      let signal: AbortSignal | undefined;
      global.fetch = jest.fn((url: string, init?: RequestInit) => {
        if (url !== "/api/transcribe") return Promise.resolve(createStreamingResponse([]));
        signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }) as unknown as typeof fetch;
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();
      expect(screen.getByRole("status")).toHaveTextContent("Transcribing…");

      await user.click(within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" }));
      await flush();

      expect(signal!.aborted).toBe(true);
      expect(alertText()).toBeNull();
      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      expect(box()!.value).toBe("");
    });
  });

  describe("keyboard focus follows the mic", () => {
    it("while recording, focus lands on Stop", async () => {
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: STOP }));
    });

    it("while transcribing, focus lands on the Transcribing line, which stays in the tab order", async () => {
      routeFetch(() => new Promise<Response>(() => {}));
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();

      const line = screen.getByRole("status");
      expect(line).toHaveTextContent("Transcribing…");
      expect(line).toHaveAttribute("tabindex", "0");
      expect(document.activeElement).toBe(line);
    });

    it("back to idle with the drawer open, focus returns to the box with the cursor after the words", async () => {
      const user = await openDrawer();
      await user.type(box()!, "Tell me about");
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));

      await waitFor(() => expect(box()!.value).toBe(`Tell me about ${TRANSCRIBE_TEXT}`));
      await waitFor(() => expect(document.activeElement).toBe(box()));
      expect(box()!.selectionStart).toBe(box()!.value.length);
      expect(box()!.selectionEnd).toBe(box()!.value.length);
    });

    it("after a problem, focus goes to the mic, to try again", async () => {
      routeFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response);
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));

      await waitFor(() => expect(alertText()).toMatch(/a lot of voice clips in a minute/));
      await waitFor(() => expect(document.activeElement).toBe(micButton()));
    });

    it("does not pull focus when the visitor has moved it elsewhere in the drawer while the clip was on its way", async () => {
      let answer!: (r: Response) => void;
      routeFetch(() => new Promise<Response>((resolve) => (answer = resolve)));
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await flush();

      const close = within(screen.getByRole("dialog", { name: /ask titus/i })).getByRole("button", { name: "Close chat" });
      act(() => close.focus());
      await act(async () => answer({ ok: false, status: 429, json: async () => ({}) } as unknown as Response));

      await waitFor(() => expect(alertText()).toMatch(/a lot of voice clips in a minute/));
      await flush();
      expect(document.activeElement).toBe(close);
    });

    it("once idle again with the drawer open, focus is back in the box, even with no problem to show", async () => {
      await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      fireEvent.click(screen.getByRole("button", { name: STOP }));
      await waitFor(() => expect(box()).toBeInTheDocument());
      await waitFor(() => expect(document.activeElement).toBe(box()));
    });
  });

  describe("the job-description mode takes over a clip", () => {
    it("opening it while recording drops the clip: the mic is handed back, nothing is sent, and the box is the job-description box", async () => {
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      expect(FakeRecorder.instances[0].state).toBe("recording");

      await user.click(screen.getByRole("button", { name: /i'm hiring/i }));
      await flush();

      expect(FakeRecorder.instances[0].state).toBe("inactive");
      expect(tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
      expect(screen.queryByRole("button", { name: STOP })).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(transcribeCalls()).toHaveLength(0);
      expect(screen.getByRole("textbox", { name: /job description/i })).toBeInTheDocument();
    });

    it("opening it clears a voice notice that was showing", async () => {
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
      const user = await openDrawer();
      fireEvent.click(micButton()!);
      await flush();
      expect(alertText()).toMatch(/microphone is blocked/);

      await user.click(screen.getByRole("button", { name: /i'm hiring/i }));
      await flush();

      expect(alertText()).toBeNull();
    });
  });
});

describe("CopilotBubble: voice reply", () => {
  // A MediaRecorder stand-in (as in "voice in"): stop() hands over a clip, then fires onstop.
  class FakeRecorder {
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(public stream: MediaStream) {}
    start() {
      this.state = "recording";
    }
    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(5_000)], { type: "audio/webm" }) });
      this.onstop?.();
    }
  }
  class FakeAudioContext {
    state = "suspended";
    currentTime = 0;
    destination = {};
    resume = jest.fn(async () => {
      this.state = "running";
    });
    close = jest.fn(async () => {});
  }

  const SPOKEN_WORDS = "Walk me through your career.";
  const THINKING_LINE = "You asked out loud, so I’ll answer out loud.";
  const FALLBACK = "My voice couldn’t keep up on this device, so this one’s written out.";
  const box = () => screen.queryByPlaceholderText(/ask about my work/i) as HTMLTextAreaElement | null;
  const mic = () => screen.getByRole("button", { name: "Speak your question" });
  const engine = () => mockVoiceEngine!;
  const player = () => mockVoicePlayers[mockVoicePlayers.length - 1];
  const strip = () => screen.queryByText("type to cut in");
  const chatCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url]) => url !== "/api/transcribe");
  const chatBody = (n = 0) => JSON.parse(chatCalls()[n][1].body);
  let media: Record<string, boolean>;
  let chatReplies: Array<Response | Promise<Response>>;
  let originalMatchMedia: typeof window.matchMedia;

  async function flush() {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  async function openDrawer() {
    const user = userEvent.setup();
    render(<CopilotBubble targets={[]} email="me@example.com" />);
    await user.click(screen.getByRole("button", { name: /open ask titus/i }));
    return user;
  }

  /** Taps the mic, then Stop: the words land in the box. */
  async function speakIntoBox() {
    fireEvent.click(mic());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => expect(box()!.value).toBe(SPOKEN_WORDS));
  }

  /** A returning visitor: the voice is cached and loads at the mic tap. */
  async function voiceReady() {
    mockVoiceSupport.cached = true;
    const user = await openDrawer();
    await speakIntoBox();
    await act(async () => engine().becomeReady());
    await flush();
    return user;
  }

  async function sendSpoken(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await flush();
  }

  beforeEach(() => {
    mockVoiceEngine = new MockVoiceEngine();
    mockVoicePlayers = [];
    mockVoiceSupport.speak = true;
    mockVoiceSupport.cached = false;
    media = {};
    originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({
      matches: !!media[query],
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
    })) as unknown as typeof window.matchMedia;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [{ stop: jest.fn() }] })) },
      configurable: true,
    });
    Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    let n = 0;
    global.crypto = { randomUUID: jest.fn(() => `voice-id-${++n}`) } as unknown as Crypto;
    if (!global.TextDecoder) global.TextDecoder = TextDecoder as typeof global.TextDecoder;
    window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: jest.fn(), writable: true });
    chatReplies = [];
    global.fetch = jest.fn(async (url: string) => {
      if (url === "/api/transcribe") return { ok: true, status: 200, json: async () => ({ text: SPOKEN_WORDS }) } as unknown as Response;
      return chatReplies.shift() ?? createStreamingResponse([deltaLine("I started in supply chain. Then data science.")]);
    }) as unknown as typeof fetch;
  });

  afterEach(async () => {
    await act(async () => {});
    mockVoiceSupport.speak = false;
    mockVoiceSupport.cached = false;
    delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    window.matchMedia = originalMatchMedia;
  });

  describe("the privacy line", () => {
    const WITH_VOICE =
      "OpenAI writes the replies (logged to improve them) and transcribes voice clips (I don’t keep them).";
    const MIC_ONLY =
      "OpenAI writes the replies (logged to improve them) and transcribes voice clips (I don’t keep them). Nothing is stored in your browser.";
    const line = () => screen.getByText(/^OpenAI writes the replies/);

    afterEach(() => {
      delete (navigator as unknown as { gpu?: unknown }).gpu;
    });

    it("where replies can be spoken (WebGPU and the mic), reads the spec's text exactly", async () => {
      Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({}) }, configurable: true });
      await openDrawer();

      expect(line().textContent).toBe(WITH_VOICE);
    });

    it("without WebGPU, keeps today's line: nothing stored in your browser, and the clip sentence only", async () => {
      await openDrawer();

      expect(line().textContent).toBe(MIC_ONLY);
      expect(screen.queryByText(/Hugging Face/)).not.toBeInTheDocument();
    });

    it("keeps the voice wording after the voice fails to load: it never goes back to “Nothing is stored”", async () => {
      Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => ({}) }, configurable: true });
      await openDrawer();
      expect(line().textContent).toBe(WITH_VOICE);

      // A computer: the download starts at the first mic tap, then fails (it may have cached files first).
      await speakIntoBox();
      await flush();
      expect(engine().load).toHaveBeenCalled();
      await act(async () => engine().failToLoad());
      await flush();

      expect(line().textContent).toBe(WITH_VOICE);
      expect(screen.queryByText(/Nothing is stored in your browser/)).not.toBeInTheDocument();
    });

    it("keeps the voice wording for the visit once shown, even when WebGPU turns out to give no adapter", async () => {
      Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => null }, configurable: true });
      mockVoiceSupport.speak = false;
      await openDrawer();
      expect(line().textContent).toBe(WITH_VOICE);

      await speakIntoBox();
      await flush();

      expect(line().textContent).toBe(WITH_VOICE);
    });
  });

  describe("which questions are spoken", () => {
    it("words from the mic, then Send: the request says spoken, and the question is tagged spoken", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);

      expect(chatBody().spoken).toBe(true);
      const question = screen.getByText(SPOKEN_WORDS, { selector: "article p" }).closest("article")!;
      expect(within(question).getByText("spoken")).toBeInTheDocument();
    });

    it("a typed question sends no spoken flag and has no tag", async () => {
      const user = await openDrawer();
      await user.type(box()!, "What did you build?{Enter}");
      await flush();

      expect(chatBody()).not.toHaveProperty("spoken");
      expect(screen.queryByText("spoken")).toBeNull();
    });

    it("a starter prompt sends no spoken flag", async () => {
      const user = await openDrawer();
      await user.click(screen.getByRole("button", { name: new RegExp(STARTER_PROMPTS[0].slice(0, 20)) }));
      await flush();

      expect(chatBody()).not.toHaveProperty("spoken");
    });

    it("an “Ask about X” pill sends no spoken flag, even with spoken words in the box", async () => {
      await openDrawer();
      await speakIntoBox();
      act(() => openCopilot("chat", "Ask about Illumina"));
      await flush();

      expect(chatBody()).not.toHaveProperty("spoken");
    });

    it("mic words, the box emptied, then typed: not spoken", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await user.clear(box()!);
      await user.type(box()!, "Something else{Enter}");
      await flush();

      expect(chatBody()).not.toHaveProperty("spoken");
    });

    it("mic words lightly edited: still spoken", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await user.type(box()!, " Briefly.");
      await sendSpoken(user);

      expect(chatBody().spoken).toBe(true);
      expect(chatBody().messages[0].content).toBe(`${SPOKEN_WORDS} Briefly.`);
    });
  });

  describe("the first time", () => {
    it("on a computer, the first mic tap starts the download", async () => {
      await openDrawer();
      fireEvent.click(mic());
      await flush();

      expect(engine().load).toHaveBeenCalledTimes(1);
    });

    it("while it thinks: the out-loud line, and the first-time step with the real percentage and MB", async () => {
      const stream = pausingResponse([WAIT, deltaLine("Hello.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      act(() => engine().progress(0.38));

      expect(screen.getByText(THINKING_LINE)).toBeInTheDocument();
      expect(screen.getByText("Getting my voice ready").parentElement).toHaveTextContent(/^Getting my voice ready · 38%$/);
      expect(screen.getByText(/First time only: 65 of 172 MB\./)).toBeInTheDocument();
      await stream.release();
    });

    it("a typed question while the voice downloads has no out-loud line", async () => {
      const stream = pausingResponse([WAIT, deltaLine("Hello.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      fireEvent.click(mic());
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
      await waitFor(() => expect(box()!.value).toBe(SPOKEN_WORDS));
      await user.clear(box()!);
      await user.type(box()!, "Typed{Enter}");
      await flush();

      expect(screen.queryByText(THINKING_LINE)).toBeNull();
      await stream.release();
    });

    it("on a phone, the first mic tap shows the offer while recording carries on; nothing downloads until “Speak replies”", async () => {
      media["(pointer: coarse)"] = true;
      await openDrawer();
      fireEvent.click(mic());
      await flush();

      expect(screen.getByText("I can answer out loud. It’s a one-off 172 MB download, best on Wi-Fi.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
      expect(screen.getByText("Listening")).toBeInTheDocument();
      expect(engine().load).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Speak replies" }));
      await flush();
      expect(engine().load).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/I can answer out loud/)).toBeNull();
    });

    it("on a phone, “Text is fine”: no speech for this reply, and no offer for the next spoken question", async () => {
      media["(pointer: coarse)"] = true;
      const user = await openDrawer();
      await speakIntoBox();
      fireEvent.click(screen.getByRole("button", { name: "Text is fine" }));
      await sendSpoken(user);
      await screen.findByText("I started in supply chain. Then data science.");

      await speakIntoBox();
      await flush();
      expect(screen.queryByText(/I can answer out loud/)).toBeNull();
      expect(engine().load).not.toHaveBeenCalled();
      expect(engine().speak).not.toHaveBeenCalled();
    });

    it("already cached, on a phone: no offer and no first-time step", async () => {
      media["(pointer: coarse)"] = true;
      mockVoiceSupport.cached = true;
      const stream = pausingResponse([WAIT, deltaLine("Hello.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await speakIntoBox();
      expect(screen.queryByText(/I can answer out loud/)).toBeNull();
      await sendSpoken(user);
      act(() => engine().progress(0.5));

      expect(screen.getByText(THINKING_LINE)).toBeInTheDocument();
      expect(screen.queryByText(/First time only/)).toBeNull();
      expect(screen.queryByText(/Getting my voice ready/)).toBeNull();
      await stream.release();
    });

    it("the reply finished while it loads: the strip says so with Just read, which speaks nothing for this reply", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      await screen.findByText("I started in supply chain. Then data science.");
      act(() => engine().progress(0.86));

      expect(screen.getByText(/Getting my voice ready/).closest("div")).toHaveTextContent("Getting my voice ready · 86%");
      expect(screen.getByText("I’ll read it out as soon as it’s in.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Just read" }));
      await act(async () => engine().becomeReady());
      await flush();

      expect(engine().speak).not.toHaveBeenCalled();
      expect(screen.queryByText(/Getting my voice ready/)).toBeNull();
    });

    it("ready after the visitor scrolled the drawer: the late strip; “Hear this reply” reads it from the start; ✕ dismisses", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      const reply = await screen.findByText("I started in supply chain. Then data science.");
      fireEvent.wheel(reply);
      await act(async () => engine().becomeReady());
      await flush();

      expect(screen.getByText("My voice is ready.")).toBeInTheDocument();
      expect(engine().speak).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Hear this reply" }));
      await flush();
      expect(engine().texts()).toEqual(["I started in supply chain.", "Then data science."]);
      expect(player().expected).toEqual([0, 1]);
      expect(strip()).toBeInTheDocument();
    });

    it("the late strip's ✕ dismisses it", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      const reply = await screen.findByText("I started in supply chain. Then data science.");
      fireEvent.wheel(reply);
      await act(async () => engine().becomeReady());
      await flush();

      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByText("My voice is ready.")).toBeNull();
    });

    it("a typed Send clears the late strip", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      const reply = await screen.findByText("I started in supply chain. Then data science.");
      fireEvent.wheel(reply);
      await act(async () => engine().becomeReady());
      await flush();

      await user.type(box()!, "Something else");
      expect(screen.getByText("My voice is ready.")).toBeInTheDocument();
      await user.keyboard("{Enter}");
      await flush();
      expect(screen.queryByText("My voice is ready.")).toBeNull();
    });

    it("a stream error while the voice downloads: no strip, and nothing appears when the voice arrives", async () => {
      chatReplies.push(createStreamingResponse([deltaLine("I started in supply chain. Then"), `{"type":"error","code":"ERR_RATE_LIMIT"}\n`]));
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      await screen.findByText(/lot of questions right now/);

      expect(screen.queryByText(/Getting my voice ready/)).toBeNull();
      await act(async () => engine().becomeReady());
      await flush();
      expect(screen.queryByText("My voice is ready.")).toBeNull();
      expect(strip()).toBeNull();
      expect(engine().speak).not.toHaveBeenCalled();
    });

    it("closed mid-stream, the voice arriving before the reply is in: “Hear this reply” plays it", async () => {
      const stream = pausingResponse([deltaLine("One here. Two"), WAIT, deltaLine(" there.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      await screen.findByText("One here. Two");
      fireEvent.click(screen.getAllByRole("button", { name: "Close chat" })[0]);
      await flush();
      await act(async () => engine().becomeReady());
      await flush();
      expect(engine().speak).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /open ask titus/i }));
      fireEvent.click(screen.getByRole("button", { name: "Hear this reply" }));
      await flush();
      expect(engine().texts()).toEqual(["One here."]);
      await stream.release();
      expect(engine().texts()).toEqual(["One here.", "Two there."]);
    });

    it("the drawer closed while the voice downloads: when it arrives, nothing is spoken", async () => {
      const stream = pausingResponse([WAIT, deltaLine("One here. Two there.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      fireEvent.click(screen.getAllByRole("button", { name: "Close chat" })[0]);
      await flush();
      await stream.release();
      await act(async () => engine().becomeReady());
      await flush();

      expect(engine().speak).not.toHaveBeenCalled();
    });
  });

  describe("speaking", () => {
    it("streams sentences to the voice as they complete, and the last one when the reply is in", async () => {
      const stream = pausingResponse([deltaLine("I started in supply chain. Then"), WAIT, deltaLine(" data science")]);
      chatReplies.push(stream.response);
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText("I started in supply chain. Then");

      expect(engine().texts()).toEqual(["I started in supply chain."]);
      await stream.release();
      expect(engine().texts()).toEqual(["I started in supply chain.", "Then data science"]);
      expect(player().finished).toBe(true);
    });

    it("while a spoken reply streams, the box stays live: typing cuts in, and Send waits for the reply", async () => {
      const stream = pausingResponse([deltaLine("I started in supply chain. Then"), WAIT, deltaLine(" data science.")]);
      chatReplies.push(stream.response);
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText("Speaking");
      const speaking = player();

      expect(box()).toBeEnabled();
      await user.type(box()!, "Next");
      expect(speaking.stopped).toBe(true);
      expect(strip()).toBeNull();
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
      await user.keyboard("{Enter}");
      expect(chatCalls()).toHaveLength(1);

      await stream.release();
      expect(box()).toBeEnabled();
      expect(box()!.value).toBe("Next");
    });

    it("while a typed reply streams, the box is disabled as before", async () => {
      const stream = pausingResponse([deltaLine("A typed answer"), WAIT, deltaLine(".")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await user.type(box()!, "Typed{Enter}");
      await screen.findByText("A typed answer");

      expect(box()).toBeDisabled();
      await stream.release();
    });

    it("shows the strip: “Speaking”, “type to cut in” and Stop", async () => {
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText("I started in supply chain. Then data science.");

      expect(screen.getByText("Speaking")).toBeInTheDocument();
      expect(strip()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop speaking" })).toBeInTheDocument();
    });

    it("with reduced motion, the strip's bars have no animation class", async () => {
      media["(prefers-reduced-motion: reduce)"] = true;
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText("Speaking");

      const bars = Array.from(document.querySelectorAll("[data-voice-bars] > span"));
      expect(bars).toHaveLength(5);
      bars.forEach((bar) => expect(bar.className).not.toMatch(/voice-bar-move|animate/));
    });

    const stoppers: Array<[string, (user: ReturnType<typeof userEvent.setup>) => Promise<unknown>]> = [
      ["Stop", async () => fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }))],
      ["typing", async (user) => user.type(box()!, "W")],
      ["the mic", async () => fireEvent.click(mic())],
      ["sending", async () => act(() => openCopilot("chat", "Ask about Illumina"))],
      ["closing the drawer", async () => fireEvent.click(screen.getAllByRole("button", { name: "Close chat" })[0])],
      ["starting the tour", async () => act(() => startTour())],
    ];
    it.each(stoppers)("%s stops the speech and the strip goes", async (_name, action) => {
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText("Speaking");
      const speaking = player();

      await action(user);
      await flush();

      expect(speaking.stopped).toBe(true);
      expect(engine().cancelAll).toHaveBeenCalled();
      expect(strip()).toBeNull();
    });

    it("done: “hear again” beside copy on that reply only, and it replays from sentence 0", async () => {
      chatReplies.push(createStreamingResponse([deltaLine("A typed answer.")]));
      const user = await voiceReady();
      await user.clear(box()!);
      await user.type(box()!, "Typed first{Enter}");
      await screen.findByText("A typed answer.");
      await speakIntoBox();
      await sendSpoken(user);
      const reply = (await screen.findByText("I started in supply chain. Then data science.")).closest("article")!;
      act(() => player().opts.onDone());

      expect(strip()).toBeNull();
      expect(within(reply).getByRole("button", { name: "hear again" })).toBeInTheDocument();
      expect(within(reply).getByRole("button", { name: "Copy message" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "hear again" })).toHaveLength(1);

      const first = player();
      fireEvent.click(within(reply).getByRole("button", { name: "hear again" }));
      await flush();
      expect(player()).not.toBe(first);
      expect(player().expected).toEqual([0, 1]);
      expect(strip()).toBeInTheDocument();
    });

    it("a stall: the fallback line under the reply, and no “hear again”", async () => {
      const user = await voiceReady();
      await sendSpoken(user);
      const reply = (await screen.findByText("I started in supply chain. Then data science.")).closest("article")!;
      act(() => player().opts.onStall());

      expect(within(reply).getByText(FALLBACK)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "hear again" })).toBeNull();
      expect(strip()).toBeNull();
    });

    it("the voice failing to load: the fallback line", async () => {
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);
      await screen.findByText("I started in supply chain. Then data science.");
      await act(async () => engine().failToLoad());
      await flush();

      expect(screen.getByText(FALLBACK)).toBeInTheDocument();
    });

    it("no WebGPU: no out-loud line, the fallback line, no “hear again”", async () => {
      mockVoiceSupport.speak = false;
      const stream = pausingResponse([WAIT, deltaLine("I started in supply chain.")]);
      chatReplies.push(stream.response);
      const user = await openDrawer();
      await speakIntoBox();
      await sendSpoken(user);

      expect(screen.queryByText(THINKING_LINE)).toBeNull();
      await stream.release();
      expect(screen.getByText(FALLBACK)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "hear again" })).toBeNull();
      expect(engine().load).not.toHaveBeenCalled();
    });

    it("a stream error mid-reply stops the speech, and the error message is never spoken", async () => {
      chatReplies.push(createStreamingResponse([deltaLine("I started in supply chain. Then"), `{"type":"error","code":"ERR_RATE_LIMIT"}\n`]));
      const user = await voiceReady();
      await sendSpoken(user);
      await screen.findByText(/lot of questions right now/);

      expect(player().stopped).toBe(true);
      expect(engine().texts()).toEqual(["I started in supply chain."]);
      expect(strip()).toBeNull();
    });
  });
});
