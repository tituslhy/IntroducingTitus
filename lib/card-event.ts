import type { AgentToRendererMessage } from "@a2ui/web_core/v1_0";
import { CARD_KINDS, FLAIRS, type CardKind, type Flair } from "@/lib/card-flair";

/** A card under a reply in the drawer: what the server's `card` event carries (lib/copilot-tools.ts). */
export type CardData = {
  id: string;
  kind: CardKind;
  /** One line that stands in for the card in later turns' history. */
  summary: string;
  flair: Flair;
  messages: AgentToRendererMessage[];
  /** Citation numbers the card lists as sources: the drawer's Sources row leaves them out. */
  sources: number[];
};

/** Most A2UI messages one card may carry: a card is one createSurface and one updateComponents. */
const MAX_CARD_MESSAGES = 8;
const MAX_SUMMARY_CHARS = 600;
const MAX_CARD_SOURCES = 12;

/** Checks a streamed `card` event's shape. The drawer's renderer checks the A2UI itself. */
export function toCard(event: {
  id?: unknown;
  kind?: unknown;
  summary?: unknown;
  flair?: unknown;
  messages?: unknown;
  sources?: unknown;
}): CardData | null {
  const { id, kind, summary, flair, messages, sources } = event;
  if (typeof id !== "string" || !id || typeof summary !== "string" || !summary) return null;
  if (typeof kind !== "string" || !(CARD_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof flair !== "string" || !(FLAIRS as readonly string[]).includes(flair)) return null;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_CARD_MESSAGES) return null;
  if (!messages.every((m) => m !== null && typeof m === "object" && !Array.isArray(m))) return null;
  const ns = Array.isArray(sources)
    ? sources.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, MAX_CARD_SOURCES)
    : [];
  return {
    id,
    kind: kind as CardKind,
    summary: summary.slice(0, MAX_SUMMARY_CHARS),
    flair: flair as Flair,
    messages: messages as AgentToRendererMessage[],
    sources: ns,
  };
}

/** "Compare table" / "Where I did it, and sources": what the card is, for screen readers. */
export function cardLabel(card: CardData): string {
  return card.kind === "compare" ? "Compare table" : "Where I did it, and sources";
}

/** The reply as the model sees it in later turns: its text, then the one line that stands in for its card. */
export function historyContent(content: string, card?: CardData): string {
  return card ? `${content}\n\n${card.summary}` : content;
}
