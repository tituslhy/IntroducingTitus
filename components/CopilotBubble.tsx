"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FitBriefCard from "./FitBriefCard";
import {
  MAX_JD_CHARS,
  MIN_JD_CHARS,
  fitBriefMailto,
  fitBriefToText,
  type FitBrief,
} from "@/lib/fit-brief";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Page anchors the copilot pointed at while answering. */
  targets?: string[];
  /** Recruiter mode result; `content` then holds its plain-text form. */
  brief?: FitBrief;
}

const HIRING_PROMPT = "I'm hiring — check my fit for a role";

/** Shown while a fit brief is being written (one call, so no live progress to report). */
const FIT_CAPTIONS: [delayMs: number, caption: string][] = [
  [0, "Reading the job description…"],
  [4_000, "Matching requirements against my record…"],
  [10_000, "Linking the evidence on the page…"],
  [22_000, "Still working — long postings take a moment…"],
];

const FIT_ERRORS: Record<string, string> = {
  rate_limited: "I can only write a few of these every ten minutes — try again shortly.",
  job_description_too_short: "That looks short for a job description — could you paste the full posting?",
  job_description_too_long: "That's longer than I can read in one go — try pasting just the role and requirements.",
  ERR_TIMEOUT: "That took longer than it should — please try again.",
};

/** A page anchor the copilot may scroll to (see PAGE_TARGETS in lib/profile.ts). */
export interface CopilotTarget {
  id: string;
  label: string;
}

/** At this width and up, the collapsed drawer leaves the page visible beside it. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";
const SPOTLIGHT_CLASS = "copilot-spotlight";
const SPOTLIGHT_MS = 2800;

const STARTER_PROMPTS = [
  "What did you build at Illumina?",
  "What trade-offs shaped fictional-bassoon?",
  "Which article should I read first?",
  "When do you use multi-agent frameworks?",
];

const AssistantAvatar = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/headshot.jpeg"
    alt="Titus"
    className="h-[22px] w-[22px] flex-shrink-0 border border-rule object-cover"
    style={{ objectPosition: "50% 20%" }}
  />
);

const AssistantLabel = () => (
  <div className="flex items-center gap-2">
    <AssistantAvatar />
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">
      Titus
    </p>
  </div>
);

const CopilotIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M5 5h14v10H8.5L5 18.5V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="9.5" cy="10" r="0.95" fill="currentColor" />
    <circle cx="12" cy="10" r="0.95" fill="currentColor" />
    <circle cx="14.5" cy="10" r="0.95" fill="currentColor" />
  </svg>
);

const CloseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const CollapseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6m10-10h-6V4M4 10h6V4m10 10h-6v6" />
  </svg>
);

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="1" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TypingIndicator = ({ caption }: { caption?: string | null }) => (
  <article className="flex flex-col gap-1.5">
    <AssistantLabel />
    <div className="flex h-4 items-center gap-1.5 border-l border-rule pl-3.5">
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "0ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "180ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "360ms", animationDuration: "900ms" }} />
      {caption && (
        <span className="ml-1.5 font-mono text-[10.5px] italic tracking-[0.02em] text-ink-faint">{caption}</span>
      )}
    </div>
  </article>
);

function usePrefersReducedMotion() {
  // Computed synchronously in the lazy initializer (guarded for SSR, where
  // `window` doesn't exist) rather than set from an effect on mount, so the
  // first client render is already correct and there's no extra re-render.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export default function CopilotBubble({
  targets = [],
  email = "tituslhy@gmail.com",
}: {
  targets?: CopilotTarget[];
  email?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const spotlightRef = useRef<{ el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [turningTo, setTurningTo] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "fit">("chat");
  const [loadingCaption, setLoadingCaption] = useState<string | null>(null);
  const [fitNotice, setFitNotice] = useState<string | null>(null);
  const captionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = isLoading || isStreaming;
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // A fit brief is read top-down, so land on its headline, not its footer.
    const last = messages[messages.length - 1];
    const briefEl = last?.brief ? document.getElementById(`copilot-msg-${last.id}`) : null;
    if (briefEl) {
      briefEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Restore focus to the FAB whenever the drawer transitions from open to closed
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      fabRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, mode === "fit" ? 220 : 120)}px`;
  }, [input, mode]);

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {
      // Clipboard permission denied or unavailable — fail silently
    });
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      abortControllerRef.current?.abort();
      if (spotlightRef.current) clearTimeout(spotlightRef.current.timer);
      captionTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const targetLabels = useMemo(() => new Map(targets.map((t) => [t.id, t.label])), [targets]);

  /**
   * Scrolls the page to a copilot target and gives it a brief highlighter
   * wash. "auto" (the model called show_on_page) only fires when the page is
   * visible beside the drawer; "click" (the visitor tapped "See on page")
   * tucks the drawer away first when it would cover the page.
   * Returns whether the page actually moved.
   */
  const showOnPage = useCallback(
    (id: string, source: "auto" | "click"): boolean => {
      const el = document.getElementById(id);
      if (!el) return false;
      const sideBySide = window.matchMedia(SIDE_BY_SIDE_QUERY).matches && !isExpanded;
      if (source === "auto" && !sideBySide) return false;
      if (source === "click" && !sideBySide) setIsOpen(false);

      el.scrollIntoView({ behavior: prefersReducedMotion ? "instant" : "smooth", block: "start" });

      // Whole sections just scroll; a single entry also gets the highlight.
      if (el.tagName !== "SECTION") {
        if (spotlightRef.current) {
          clearTimeout(spotlightRef.current.timer);
          spotlightRef.current.el.classList.remove(SPOTLIGHT_CLASS);
        }
        void el.offsetWidth; // restart the animation if the same entry is shown twice
        el.classList.add(SPOTLIGHT_CLASS);
        const timer = setTimeout(() => {
          el.classList.remove(SPOTLIGHT_CLASS);
          spotlightRef.current = null;
        }, SPOTLIGHT_MS);
        spotlightRef.current = { el, timer };
      }
      return true;
    },
    [isExpanded, prefersReducedMotion]
  );

  const sendMessage = useCallback(async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || busy) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setTurningTo(null);
    setLiveMessage("Titus is thinking…");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Keep only the last 20 messages to avoid exceeding context limits
    const historyToSend = updatedMessages.slice(-20).map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Rate-limit/origin/size checks return a plain JSON error before any
        // streaming starts (not a __COPILOT_ERR__ sentinel), so handle them
        // here with the same friendly-message treatment as the streamed ones.
        let code: string | undefined;
        try {
          ({ error: code } = await res.json());
        } catch {
          // Non-JSON or empty body — fall through to the generic message below.
        }
        if (res.status === 429 || code === "rate_limited") {
          throw new Error("I'm getting a lot of questions right now — please try again in a minute.");
        }
        if (code === "origin_forbidden") {
          throw new Error("Sorry, this request couldn't be verified. Feel free to email Titus at tituslhy@gmail.com");
        }
        if (code === "conversation_too_long" || code === "request_too_large") {
          throw new Error("That conversation has gotten a bit long for me to follow — try starting a fresh one.");
        }
        throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");
      }
      if (!res.body) throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;
      let buffer = "";
      const assistantId = crypto.randomUUID();
      // Targets can arrive before the first text delta (the model is told to
      // call show_on_page first), so they're held here until the message exists.
      const replyTargets: string[] = [];
      let pageMoved = false;

      const appendDelta = (text: string) => {
        if (firstChunk) {
          firstChunk = false;
          setIsLoading(false);
          setIsStreaming(true);
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: "assistant" as const,
              content: text,
              ...(replyTargets.length > 0 && { targets: [...replyTargets] }),
            },
          ]);
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, content: last.content + text }];
          });
        }
      };

      const handleAction = (target: string) => {
        const label = targetLabels.get(target);
        if (!label || replyTargets.includes(target)) return;
        replyTargets.push(target);
        if (!firstChunk) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, targets: [...replyTargets] } : m))
          );
        }
        // Move the page for the first target only; later ones stay as links.
        if (!pageMoved) {
          pageMoved = showOnPage(target, "auto");
          if (pageMoved) {
            setTurningTo(label);
            setLiveMessage(`Showing ${label} on the page`);
          }
        }
      };

      const handleErrorCode = (code: string) => {
        if (code === "ERR_RATE_LIMIT") {
          throw new Error("I'm getting a lot of questions right now — please try again in a moment.");
        }
        if (code === "ERR_QUOTA") {
          throw new Error("The copilot is temporarily unavailable. Feel free to email Titus at tituslhy@gmail.com");
        }
        if (code === "ERR_AUTH") {
          throw new Error("The copilot is currently misconfigured. Please contact Titus at tituslhy@gmail.com");
        }
        throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setLiveMessage("New reply received");
          break;
        }

        // Server sends newline-delimited JSON events, so a marker split
        // across two network chunks is buffered here until a full line
        // arrives, rather than being read as raw (possibly truncated) text.
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          const event = JSON.parse(line) as
            | { type: "delta"; text: string }
            | { type: "action"; target: string }
            | { type: "error"; code: string };
          if (event.type === "error") {
            handleErrorCode(event.code);
          } else if (event.type === "action") {
            handleAction(event.target);
          } else {
            appendDelta(event.text);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLiveMessage("Reply failed");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content:
            error instanceof Error
              ? error.message
              : "Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com",
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setTurningTo(null);
    }
  }, [input, busy, messages, targetLabels, showOnPage]);

  const enterFitMode = useCallback(() => {
    setMode("fit");
    setFitNotice(null);
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const leaveFitMode = useCallback(() => {
    setMode("chat");
    setFitNotice(null);
  }, []);

  const sendFit = useCallback(async () => {
    const jd = input.trim();
    if (!jd || busy) return;
    if (jd.length < MIN_JD_CHARS) {
      setFitNotice(FIT_ERRORS.job_description_too_short);
      return;
    }
    if (jd.length > MAX_JD_CHARS) {
      setFitNotice(FIT_ERRORS.job_description_too_long);
      return;
    }
    setFitNotice(null);

    const words = jd.split(/\s+/).length;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: `Check my fit for this role (${words}-word job description).` },
    ]);
    setIsLoading(true);
    setLiveMessage("Writing a fit brief…");
    captionTimersRef.current = FIT_CAPTIONS.map(([delay, caption]) =>
      setTimeout(() => setLoadingCaption(caption), delay)
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd }),
        signal: controller.signal,
      });
      let data: { brief?: FitBrief; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON body — handled as a generic failure below.
      }
      if (!res.ok || !data.brief) {
        throw new Error(
          (data.error && FIT_ERRORS[data.error]) ??
            `Sorry, I couldn't write that brief. Feel free to email me the role at ${email}`
        );
      }
      const brief = data.brief;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: fitBriefToText(brief), brief },
      ]);
      setInput("");
      setMode("chat");
      setLiveMessage("Fit brief ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLiveMessage("Fit brief failed");
      // Keep the pasted text so a retry is one click.
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : `Sorry, something went wrong. Feel free to email me at ${email}`,
        },
      ]);
    } finally {
      captionTimersRef.current.forEach(clearTimeout);
      captionTimersRef.current = [];
      setLoadingCaption(null);
      setIsLoading(false);
    }
  }, [input, busy, email]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === "fit") {
      // Pasted postings are multi-line: Enter is a newline, ⌘/Ctrl+Enter submits.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendFit();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDrawerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key !== "Tab") return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const panelWidth = isExpanded
    ? "min(680px, calc(100vw - 3rem))"
    : "min(23rem, calc(100vw - 3rem))";

  const panelHeight = isExpanded ? "min(80vh, 740px)" : "540px";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-heading"
        inert={!isOpen}
        onKeyDown={handleDrawerKeyDown}
        className="flex flex-col overflow-hidden border border-ink bg-paper text-ink"
        style={{
          width: panelWidth,
          height: isOpen ? panelHeight : 0,
          boxShadow: isOpen ? "0 12px 44px rgba(20,16,10,0.20), 0 2px 10px rgba(20,16,10,0.10)" : "none",
          transformOrigin: "bottom right",
          transition: prefersReducedMotion
            ? "height 0ms, opacity 0ms, box-shadow 0ms"
            : [
                "width 260ms cubic-bezier(0.4,0,0.2,1)",
                "height 260ms cubic-bezier(0.4,0,0.2,1)",
                "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
                "opacity 180ms ease",
                "box-shadow 200ms ease",
              ].join(", "),
          transform: prefersReducedMotion
            ? "none"
            : isOpen
              ? "scale(1) translateY(0)"
              : "scale(0.92) translateY(12px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Amber brand spine */}
        <div className="h-0.5 flex-shrink-0 bg-amber" />

        {/* Header */}
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-rule bg-paper-deep px-5 py-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-[pulse-dot_2.4s_ease-in-out_infinite]" />
              <span>Personal assistant</span>
            </p>
            <p id="copilot-heading" className="mt-2 font-serif text-[22px] font-medium leading-none tracking-[-0.01em] text-ink">
              Ask <em className="italic text-amber">Titus</em>
            </p>
            <p className="mt-2 max-w-[34ch] font-mono text-[11px] leading-snug text-ink-faint">
              Grounded in my public work and writing. It answers about my work.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-1.5 text-ink-faint transition-colors hover:text-amber"
              aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-ink-faint transition-colors hover:text-amber"
              aria-label="Close chat"
              title="Close"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </span>

        {/* Messages */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" style={{ minHeight: 0 }}>
          {messages.length === 0 && !busy && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Start with one of these
              </p>
              <ul className="border-b border-rule">
                {STARTER_PROMPTS.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => sendMessage(p)}
                      disabled={busy}
                      className="group flex w-full items-baseline gap-3 border-t border-rule py-3 text-left transition-colors hover:bg-paper-deep disabled:opacity-50"
                    >
                      <span className="font-mono text-[13px] text-amber transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                      <span className="font-serif text-[15px] leading-snug text-ink">{p}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={enterFitMode}
                    disabled={busy}
                    className="group flex w-full items-baseline gap-3 border-t border-rule py-3 text-left transition-colors hover:bg-paper-deep disabled:opacity-50"
                  >
                    <span className="font-mono text-[13px] text-amber transition-transform group-hover:translate-x-0.5">
                      ◆
                    </span>
                    <span className="font-serif text-[15px] italic leading-snug text-ink">{HIRING_PROMPT}</span>
                  </button>
                </li>
              </ul>
            </div>
          )}

          {messages.map((msg) => (
            <article key={msg.id} id={`copilot-msg-${msg.id}`} className="flex flex-col gap-1.5">
              {msg.role === "user" ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  You
                </p>
              ) : (
                <AssistantLabel />
              )}
              <div
                className={
                  msg.brief
                    ? ""
                    : `border-l pl-3.5 ${msg.role === "user" ? "border-rule-strong" : "border-amber"}`
                }
              >
                {msg.brief ? (
                  <FitBriefCard
                    brief={msg.brief}
                    labelFor={(t) => targetLabels.get(t) ?? t}
                    onShow={(t) => showOnPage(t, "click")}
                    mailtoHref={fitBriefMailto(msg.brief, email)}
                    onCheckAnother={enterFitMode}
                  />
                ) : msg.role === "user" ? (
                  <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-soft">
                    {msg.content}
                  </p>
                ) : (
                  <div className="font-serif text-[14.5px] leading-[1.62] text-ink">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1 pl-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2.5 list-decimal space-y-1 pl-4">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber underline underline-offset-2"
                          >
                            {children}
                          </a>
                        ),
                        code: ({ children }) => (
                          <code className="rounded-sm bg-paper-band px-1 py-0.5 font-mono text-[12px] text-ink">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mb-2.5 overflow-x-auto border border-rule bg-paper-band p-2.5 font-mono text-[12px]">
                            {children}
                          </pre>
                        ),
                        h1: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                        h2: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                        h3: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
                {msg.targets && msg.targets.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      See on page
                    </span>
                    {msg.targets.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => showOnPage(t, "click")}
                        className="font-mono text-[11px] text-amber underline decoration-dotted underline-offset-[3px] transition-colors hover:text-ink"
                      >
                        <span aria-hidden="true">↓ </span>
                        {targetLabels.get(t) ?? t}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => copyMessage(msg.id, msg.content)}
                  className="mt-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-amber"
                  aria-label="Copy message"
                  title="Copy"
                >
                  {copiedIndex === msg.id ? <><CheckIcon /><span>copied</span></> : <><CopyIcon /><span>copy</span></>}
                </button>
              </div>
            </article>
          ))}

          {isLoading && (
            <TypingIndicator caption={loadingCaption ?? (turningTo && `Turning to ${turningTo}…`)} />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-rule bg-paper-deep px-3.5 py-3">
          {mode === "fit" && (
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
                Recruiter mode · paste a job description
              </p>
              <button
                type="button"
                onClick={leaveFitMode}
                disabled={busy}
                className="font-mono text-[10.5px] text-ink-soft underline decoration-dotted underline-offset-[3px] transition-colors hover:text-amber disabled:opacity-50"
              >
                ← Back to chat
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "fit" ? "Paste the job description…" : "Ask about my work…"}
              aria-label={mode === "fit" ? "Job description" : "Message"}
              disabled={busy}
              rows={1}
              className="flex-1 resize-none overflow-y-auto border border-rule bg-paper px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-faint transition-colors focus:border-amber focus:outline-none disabled:opacity-50"
              style={{ minHeight: mode === "fit" ? "96px" : "36px", maxHeight: mode === "fit" ? "220px" : "120px" }}
            />
            <button
              onClick={() => (mode === "fit" ? sendFit() : sendMessage())}
              disabled={busy || !input.trim()}
              className="flex flex-shrink-0 items-center gap-1.5 border border-ink bg-ink px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper transition-colors hover:border-amber hover:bg-amber disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={mode === "fit" ? "Check fit" : "Send message"}
            >
              <span>{mode === "fit" ? "Check fit" : "Send"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
          {fitNotice && (
            <p role="alert" className="mt-2 font-serif text-[13px] italic leading-snug text-amber">
              {fitNotice}
            </p>
          )}
          {mode === "fit" ? (
            <p className="mt-2 flex justify-between gap-3 font-mono text-[10px] leading-snug text-ink-faint">
              <span>Sent to OpenAI to write the brief; not stored. ⌘/Ctrl+Enter to submit.</span>
              <span className={input.trim().length > MAX_JD_CHARS ? "text-amber" : ""}>
                {input.trim().length.toLocaleString()}/{MAX_JD_CHARS.toLocaleString()}
              </span>
            </p>
          ) : (
            <p className="mt-2 font-mono text-[10px] leading-snug text-ink-faint">
              Messages are sent to OpenAI to generate a response. This site does not save your chat history.
            </p>
          )}
        </div>
      </div>

      {/* FAB — icon-only circle on mobile (avoids colliding with nearby CTAs
          and body copy at narrow widths); full "Ask Titus" pill from sm up. */}
      <button
        ref={fabRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 rounded-full border border-ink bg-ink p-3.5 text-paper transition-colors hover:border-amber hover:bg-amber sm:px-4 sm:py-3"
        aria-label={isOpen ? "Close chat" : "Open Ask Titus"}
        aria-expanded={isOpen}
      >
        {isOpen ? <CloseIcon size={18} /> : <CopilotIcon />}
        {!isOpen && (
          <span className="hidden font-mono text-[12px] uppercase tracking-[0.12em] sm:inline">Ask Titus</span>
        )}
      </button>
    </div>
  );
}
