/**
 * Resolves with the element once it is in the DOM (checked each frame), or
 * null after `timeoutMs`. Used after a client-side navigation, when the
 * target page's anchor hasn't rendered yet.
 */
export function waitForElement(id: string, timeoutMs = 3000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const el = document.getElementById(id);
      if (el) return resolve(el);
      if (performance.now() - start >= timeoutMs) return resolve(null);
      requestAnimationFrame(check);
    };
    check();
  });
}
