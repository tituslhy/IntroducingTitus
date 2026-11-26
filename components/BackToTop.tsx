// Plain anchor to "#top", which browsers scroll to the top of the page with no element needed; works without JS.
// Sits in each section's marker row so a reader who has scrolled past the nav can get back in one click.
export default function BackToTop() {
  return (
    <a
      href="#top"
      className="tap shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft transition-colors duration-150 hover:text-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
    >
      Back to top <span aria-hidden="true">↑</span>
    </a>
  )
}
