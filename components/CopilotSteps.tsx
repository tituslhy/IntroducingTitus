"use client";

import { useEffect, useState } from "react";
import { WAITING_WORDS, WAITING_WORD_MS, foldSteps, type Step } from "@/lib/copilot-steps";

/**
 * How Ask Titus shows what it's doing while a reply is on its way: the tool steps, the line they fold into, and the
 * waiting word. Shared by the live drawer (components/CopilotBubble.tsx) and the colophon's replay (components/colophon/TryIt.tsx).
 */

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** A step still running: a small amber dot, pulsing unless motion is reduced. */
export const PendingDot = () => (
  <span aria-hidden="true" className="inline-flex w-[11px] justify-center">
    <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-pulse" />
  </span>
);

/** What I'm doing while the visitor waits: one line per tool step, then "Writing the reply" once they're done. */
export const StepList = ({ steps }: { steps: Step[] }) =>
  steps.length === 0 ? null : (
  <ul className="mt-1.5 flex flex-col gap-1 border-l border-rule pl-3.5" aria-label="What I'm doing">
    {steps.map((s) => (
      <li key={s.id} className="flex items-baseline gap-2 font-mono text-[10.5px] leading-[1.45] text-ink-faint">
        {s.done ? (
          <span aria-hidden="true" className="inline-flex w-[11px] justify-center text-amber"><CheckIcon /></span>
        ) : (
          <PendingDot />
        )}
        <span className={s.done ? "" : "text-ink-soft"}>{s.label}</span>
      </li>
    ))}
    {steps.every((s) => s.done) && (
      <li className="flex items-baseline gap-2 font-mono text-[10.5px] leading-[1.45] text-ink-soft">
        <PendingDot />
        <span>Writing the reply</span>
      </li>
    )}
  </ul>
);

/**
 * The steps of a finished reply as one quiet line ("Searched my writing · read 3 articles");
 * opening it lists each step as it ran, so a visitor can see what I looked up.
 */
export const StepFold = ({ steps, articles }: { steps: Step[]; articles: number }) => {
  const line = foldSteps(steps, articles);
  if (!line) return null;
  return (
    <details className="group mb-2 font-mono text-[10.5px] leading-[1.45] text-ink-faint">
      <summary className="inline-flex cursor-pointer list-none items-baseline gap-1.5 transition-colors hover:text-amber [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
        {line}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 pl-3">
        {steps.map((s) => (
          <li key={s.id}>{s.label}</li>
        ))}
      </ul>
    </details>
  );
};

/** One waiting word at a time, changing every few seconds. */
export function WaitingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % WAITING_WORDS.length), WAITING_WORD_MS);
    return () => clearInterval(timer);
  }, []);
  return <>{WAITING_WORDS[i]}…</>;
}

/** The waiting word at a given moment of a replay (`ms` since the question), so the replay matches the live drawer. */
export function waitingWordAt(ms: number): string {
  return `${WAITING_WORDS[Math.floor(Math.max(0, ms) / WAITING_WORD_MS) % WAITING_WORDS.length]}…`;
}
