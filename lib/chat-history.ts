// ---------------------------------------------------------------------------
// Fits the visitor's conversation into the copilot's history window. The
// server is the authority here; the drawer's own slice is only a payload cap.
//   1. Keep the last `maxMessages`.
//   2. Start on a visitor's message: a leading assistant reply answers a
//      question the model can no longer see.
//   3. Over `maxChars`, drop the oldest exchanges (a visitor message and the
//      replies after it) until it fits, rather than refusing the conversation.
//      Articles cited in dropped turns survive in the citation ledger.
// The newest exchange is never dropped. Returns null only if that alone is
// over budget, which the per-message cap makes unreachable in practice.
// ---------------------------------------------------------------------------

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export type FittedHistory<M extends HistoryMessage> = {
  messages: M[];
  /** Messages dropped beyond the `maxMessages` cut: leading replies and old exchanges. */
  dropped: number;
};

const size = (messages: readonly HistoryMessage[]) => messages.reduce((sum, m) => sum + m.content.length, 0);

/** Index of the first visitor message at or after `from`, or -1. */
function nextUserIndex(messages: readonly HistoryMessage[], from: number): number {
  for (let i = from; i < messages.length; i++) if (messages[i].role === "user") return i;
  return -1;
}

export function fitHistory<M extends HistoryMessage>(
  all: readonly M[],
  { maxMessages, maxChars }: { maxMessages: number; maxChars: number }
): FittedHistory<M> | null {
  const windowed = all.slice(-maxMessages);
  let start = nextUserIndex(windowed, 0);
  if (start === -1) return { messages: [], dropped: windowed.length };

  // The newest exchange begins at the last visitor message; it always stays.
  let lastUser = start;
  for (let i = windowed.length - 1; i >= start; i--) {
    if (windowed[i].role === "user") {
      lastUser = i;
      break;
    }
  }

  while (start < lastUser && size(windowed.slice(start)) > maxChars) {
    start = nextUserIndex(windowed, start + 1);
  }

  const messages = windowed.slice(start);
  if (size(messages) > maxChars) return null;
  return { messages, dropped: start };
}
