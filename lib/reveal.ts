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
