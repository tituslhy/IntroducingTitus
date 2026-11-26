/**
 * Some content sits in the page but hidden until asked for: the Experience page shows one role at a
 * time, and the rest wait in `<div data-reveal="<slug>" hidden>`. Anything that wants to scroll to
 * such content (the results row, Ask Titus) calls `reveal` first; the owner listens for the event,
 * un-hides it, and `reveal` waits for that paint before handing back.
 */
export const REVEAL_EVENT = 'reveal'

/**
 * Un-hides the `[data-reveal]` box around `el`, if it is hidden, and returns a promise that resolves once
 * it has been painted. Returns null when there is nothing to un-hide, so callers can carry on at once.
 */
export function reveal(el: Element): Promise<void> | null {
  const box = el.closest<HTMLElement>('[data-reveal]')
  if (!box?.hidden) return null
  box.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: box.dataset.reveal }))
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
}

/**
 * Sent (bubbling) on the first anchor of an Ask Titus stop just before the page scrolls to it, with every
 * anchor of the stop, so its owner can get ready: the periodic table jumps to the chapter where the named
 * tools light up.
 */
export const SHOW_EVENT = 'copilot:show'

export type ShowDetail = { ids: string[] }

/** How long a show request waits for an owner that hasn't started listening yet (a page still mounting). */
export const PENDING_SHOW_MS = 3000

let pending: { ids: string[]; at: number } | null = null

/**
 * Sends SHOW_EVENT from `el` and keeps the request for a moment. After Ask Titus opens another page, the
 * anchor can be in the DOM before its owner has started listening (React adds listeners after it paints),
 * so the owner also checks `takePendingShow` when it starts.
 */
export function requestShow(el: Element, ids: string[]): void {
  pending = { ids, at: Date.now() }
  el.dispatchEvent(new CustomEvent<ShowDetail>(SHOW_EVENT, { bubbles: true, detail: { ids } }))
}

/**
 * The latest show request, if it is recent and `accept` wants it; taken once, so it never replays. Owners
 * call it when they start listening, and again when they handle the event, so a request is used once.
 */
export function takePendingShow(accept: (ids: string[]) => boolean): string[] | null {
  if (!pending || Date.now() - pending.at > PENDING_SHOW_MS || !accept(pending.ids)) return null
  const { ids } = pending
  pending = null
  return ids
}
