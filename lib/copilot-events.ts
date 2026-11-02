/**
 * Lets any page open the Ask Titus drawer (mounted once in app/layout.tsx)
 * without sharing React state with it: a window event the drawer listens for.
 */
export const COPILOT_OPEN_EVENT = "copilot:open";

export type CopilotOpenDetail = { mode: "chat" | "fit" };

export function openCopilot(mode: CopilotOpenDetail["mode"] = "chat"): void {
  window.dispatchEvent(new CustomEvent<CopilotOpenDetail>(COPILOT_OPEN_EVENT, { detail: { mode } }));
}
