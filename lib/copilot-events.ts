/**
 * Lets any page open the Ask Titus drawer (mounted once in app/layout.tsx)
 * without sharing React state with it: a window event the drawer listens for.
 */
export const COPILOT_OPEN_EVENT = "copilot:open";

export type CopilotOpenDetail = { mode: "chat" | "fit"; prompt?: string };

/** Opens the drawer; with a prompt, it is sent as the visitor's question (chat mode only). */
export function openCopilot(mode: CopilotOpenDetail["mode"] = "chat", prompt?: string): void {
  const detail: CopilotOpenDetail = prompt ? { mode, prompt } : { mode };
  window.dispatchEvent(new CustomEvent<CopilotOpenDetail>(COPILOT_OPEN_EVENT, { detail }));
}

/** Starts the recorded "Show me around" tour (lib/site-tour.ts); the drawer listens for it. */
export const COPILOT_TOUR_EVENT = "copilot:tour";

export function startTour(): void {
  window.dispatchEvent(new CustomEvent(COPILOT_TOUR_EVENT));
}
