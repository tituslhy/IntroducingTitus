"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2.5">
      <div className="flex h-3 items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "900ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "180ms", animationDuration: "900ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "360ms", animationDuration: "900ms" }} />
      </div>
    </div>
  </div>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CollapseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6m10-10h-6V4M4 10h6V4m10 10h-6v6" />
  </svg>
);

export default function CopilotBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const busy = isLoading || isStreaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

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
    };
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || busy) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

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

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;
      const assistantId = crypto.randomUUID();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Detect typed error sentinels sent by the API route
        if (chunk.startsWith("__COPILOT_ERR__:")) {
          const code = chunk.slice("__COPILOT_ERR__:".length);
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
        }

        if (firstChunk) {
          firstChunk = false;
          setIsLoading(false);
          setIsStreaming(true);
          setMessages((prev) => [...prev, { id: assistantId, role: "assistant" as const, content: chunk }]);
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
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
    }
  }, [input, busy, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const panelWidth = isExpanded
    ? "min(700px, calc(100vw - 3rem))"
    : "min(22rem, calc(100vw - 3rem))";

  const panelHeight = isExpanded ? "min(80vh, 740px)" : "520px";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <div
        className="flex flex-col overflow-hidden rounded-xl"
        style={{
          width: panelWidth,
          height: isOpen ? panelHeight : 0,
          background: "#141414",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          boxShadow: isOpen
            ? "0 0 0 1px rgba(245,158,11,0.08), 0 8px 48px rgba(245,158,11,0.18), 0 4px 16px rgba(0,0,0,0.7)"
            : "none",
          transformOrigin: "bottom right",
          transition: [
            "width 260ms cubic-bezier(0.4,0,0.2,1)",
            "height 260ms cubic-bezier(0.4,0,0.2,1)",
            "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
            "opacity 180ms ease",
            "box-shadow 200ms ease",
          ].join(", "),
          transform: isOpen ? "scale(1) translateY(0)" : "scale(0.88) translateY(10px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        aria-hidden={!isOpen}
      >
        {/* Amber accent strip at top */}
        <div style={{ height: "2px", background: "linear-gradient(90deg, #F59E0B 0%, rgba(245,158,11,0.3) 100%)", flexShrink: 0 }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            flexShrink: 0,
            background: "#0f0f0f",
            borderBottom: "1px solid rgba(245, 158, 11, 0.15)",
          }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "#F59E0B", fontFamily: "'IBM Plex Mono', monospace" }}>
              Titus&apos;s Copilot
            </p>
            <p className="text-xs text-neutral-500" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              Ask me anything about my work
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="rounded p-1.5 text-neutral-500 transition-colors hover:text-amber-400"
              aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1.5 text-neutral-500 transition-colors hover:text-neutral-300"
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{ minHeight: 0 }}
        >
          {messages.length === 0 && !busy && (
            <p
              className="pt-6 text-center text-xs text-neutral-600"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Ask about Titus&apos;s experience, projects, or writing.
            </p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="flex items-end gap-2">
                {msg.role === "assistant" && (
                  <img
                    src="/headshot.jpeg"
                    alt="Titus"
                    className="flex-shrink-0 rounded-full object-cover"
                    style={{
                      width: 24,
                      height: 24,
                      objectPosition: "center 10%",
                      boxShadow: "0 0 0 1.5px #F59E0B",
                    }}
                  />
                )}
                <div
                  className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    isExpanded ? "max-w-[80%]" : "max-w-[82%]"
                  } ${
                    msg.role === "user"
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-100 whitespace-pre-wrap"
                      : "border border-neutral-700/80 bg-neutral-800/60 text-neutral-200"
                  }`}
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {msg.role === "user" ? msg.content : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="text-neutral-100 font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="text-neutral-300 italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 transition-colors"
                            style={{ color: "#F59E0B" }}
                          >
                            {children}
                          </a>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-neutral-900 px-1 py-0.5 text-amber-300/80">{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mb-2 overflow-x-auto rounded bg-neutral-900 p-2">{children}</pre>
                        ),
                        h1: ({ children }) => <p className="mb-1 font-semibold text-neutral-100">{children}</p>,
                        h2: ({ children }) => <p className="mb-1 font-semibold text-neutral-100">{children}</p>,
                        h3: ({ children }) => <p className="mb-1 font-semibold text-neutral-200">{children}</p>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
              <button
                onClick={() => copyMessage(msg.id, msg.content)}
                className="flex items-center gap-1 px-1 py-0.5 text-neutral-600 transition-colors hover:text-amber-400"
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px" }}
                aria-label="Copy message"
                title="Copy"
              >
                {copiedIndex === msg.id ? <><CheckIcon /><span>copied</span></> : <><CopyIcon /><span>copy</span></>}
              </button>
            </div>
          ))}

          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="p-3"
          style={{
            flexShrink: 0,
            background: "#0f0f0f",
            borderTop: "1px solid rgba(245, 158, 11, 0.15)",
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about my experience, projects, or writing..."
              disabled={busy}
              rows={1}
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 transition-colors focus:border-amber-500/50 focus:outline-none disabled:opacity-50 resize-none overflow-y-auto"
              style={{ fontFamily: "'IBM Plex Mono', monospace", minHeight: "34px", maxHeight: "120px" }}
            />
            <button
              onClick={sendMessage}
              disabled={busy || !input.trim()}
              className="flex items-center justify-center rounded-lg px-3 py-2 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "#F59E0B", color: "#0a0a0a" }}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          background: "#F59E0B",
          boxShadow: "0 4px 24px rgba(245,158,11,0.4), 0 2px 8px rgba(0,0,0,0.4)",
          color: "#0a0a0a",
        }}
        aria-label={isOpen ? "Close chat" : "Open Titus's Copilot"}
        aria-expanded={isOpen}
      >
        {isOpen ? <CloseIcon size={20} /> : <ChatIcon />}
      </button>
    </div>
  );
}
