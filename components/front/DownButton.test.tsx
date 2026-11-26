import { fireEvent, render, screen } from '@testing-library/react'
import DownButton from './DownButton'

const TARGET = 'on-this-site'

/** Gives an element a fixed position in the viewport, which jsdom doesn't lay out. */
function placeAt(el: Element, top: number) {
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia;
}

describe('DownButton', () => {
  let originalMatchMedia: typeof window.matchMedia;
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    setReducedMotion(false);
    scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.replaceChildren();
  });

  function renderWithTarget(targetTop: number, navHeight = 0) {
    render(
      <>
        <nav>site</nav>
        <DownButton targetId={TARGET} />
        <section id={TARGET}>On this site</section>
      </>
    );
    placeAt(document.getElementById(TARGET)!, targetTop);
    Object.defineProperty(document.querySelector('nav')!, 'offsetHeight', { value: navHeight, configurable: true });
  }

  it('is a round labelled link to the section it scrolls to, with no visible words', () => {
    render(<DownButton targetId={TARGET} />);
    const link = screen.getByRole('link', { name: "Scroll down to what's on this site" });
    expect(link).toHaveAttribute('href', `#${TARGET}`);
    expect(link.textContent).toBe('');
  });

  it('scrolls down so the label sits 16px from the top, when the label is below the screen', () => {
    renderWithTarget(500, 56);
    scrollTo.mockClear();
    window.scrollY = 0;

    fireEvent.click(screen.getByRole('link'));

    // Going down the nav hides, so the label lands 16px from the top edge.
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 - 16, behavior: 'smooth' });
  });

  it('scrolls so the label sits 16px under the nav when the nav is showing (label already above the top)', () => {
    renderWithTarget(-200, 56);
    scrollTo.mockClear();
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true, writable: true });

    fireEvent.click(screen.getByRole('link'));

    // top = target top (-200) + scrollY (1000) - nav height (56) - 16 = 728
    expect(scrollTo).toHaveBeenCalledWith({ top: 728, behavior: 'smooth' });
  });

  it('takes over the click, so the page does not jump to the bare anchor', () => {
    renderWithTarget(500);
    const notCancelled = fireEvent.click(screen.getByRole('link'));
    expect(notCancelled).toBe(false);
  });

  it('scrolls instantly, with no animation, under reduced motion', () => {
    setReducedMotion(true);
    renderWithTarget(500);
    fireEvent.click(screen.getByRole('link'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 484, behavior: 'auto' });
  });

  it('does nothing and leaves the anchor alone when the target is not on the page', () => {
    render(<DownButton targetId="missing-section" />);
    const notCancelled = fireEvent.click(screen.getByRole('link'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });

  it('keeps the chevron animated only when the user allows motion', () => {
    const { container } = render(<DownButton targetId={TARGET} />);
    expect(container.querySelector('svg')).toHaveClass('motion-safe:animate-[bob_1.8s_ease-in-out_infinite]');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
