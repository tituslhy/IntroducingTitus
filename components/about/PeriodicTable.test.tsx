import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { CHAPTERS, TIMELINE_END, TIMELINE_START, TOOLS, atomicNumbers, journeyLine, monthsBetween, toolTargetId } from "@/lib/about";
import { PENDING_SHOW_MS, SHOW_EVENT, requestShow, takePendingShow } from "@/lib/reveal";
import PeriodicTable, { CHAPTER_MS } from "./PeriodicTable";

const ZERO_COUNTS = TOOLS.map(() => 0);
const TOTAL = TOOLS.length;
const MONTHS = monthsBetween(TIMELINE_START, TIMELINE_END);
const indexOfMonth = (m: string) => MONTHS.indexOf(m);
const stopOf = (label: string) => indexOfMonth(CHAPTERS.find((c) => c.label === label)!.at);
const litLabel = (n: number) => `${n} of ${TOTAL} tools`;
const cascadeMs = (span: number) => Math.max(12, Math.round(CHAPTER_MS.cascade / span));
// The first chapter starts at the timeline's first month with no hold before it, so its cascade is one month longer
// than its stop's index: from Jun 2015 to Sep 2016 is 16 steps, each cascadeMs(16) long.
const FIRST_SPAN = stopOf("2015–2016") + 1;

const originalIO = window.IntersectionObserver;
const originalMatchMedia = window.matchMedia;

type FakeObserver = { callback: IntersectionObserverCallback; disconnect: jest.Mock; observe: jest.Mock };
let observers: FakeObserver[] = [];

/** A stand-in IntersectionObserver that lets a test say when the table comes into view. */
class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  disconnect = jest.fn();
  observe = jest.fn();
  unobserve = jest.fn();
  takeRecords = jest.fn(() => []);
  root = null;
  rootMargin = "";
  thresholds = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
}

/** Tell the table it is now on screen, so it starts to play. */
function scrollIntoView() {
  const io = observers[observers.length - 1];
  act(() => {
    io.callback([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
  });
}

/** Advance fake time without crossing a pending month change. */
function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Fire exactly the next scheduled month change, then let React schedule the one after it. */
function nextMonth() {
  act(() => {
    jest.advanceTimersToNextTimer();
  });
}

/** Fire month changes until the table shows `month`. */
function runTo(month: string) {
  for (let i = 0; i < 400 && dateHeading().textContent !== month; i++) nextMonth();
  expect(dateHeading()).toHaveTextContent(month);
}

/** Fire month changes until the table reports Replay (the end). */
function playToEnd() {
  for (let i = 0; i < 400 && playButton().textContent !== "Replay"; i++) nextMonth();
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia;
}

/** A mouse pointer entering or leaving an element, as the browser reports it (pointerover / pointerout). */
function pointer(el: Element, type: "pointerover" | "pointerout", pointerType: string) {
  const ev = new Event(type, { bubbles: true });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  act(() => {
    el.dispatchEvent(ev);
  });
}

const dateHeading = () => screen.getByText(/^[A-Z][a-z]{2} \d{4}$/, { selector: "p" });
const playButton = () => screen.getByRole("button", { name: /^(Play|Pause|Replay)$/ });
const slider = () => screen.getByRole("slider", { name: "Timeline" });
const toolButton = (name: string) => screen.getAllByTitle(name).find((el) => el.tagName === "BUTTON")!;
const liveLine = (container: HTMLElement) => container.querySelector('[aria-live="polite"]') as HTMLElement;
const chapterNav = () => screen.getByRole("navigation", { name: "Chapters" });
const chapterChip = (label: string) => within(chapterNav()).getByRole("button", { name: label });
const notch = (container: HTMLElement) => container.querySelector(".glow-tile") as HTMLElement;
const progressBar = (container: HTMLElement) => container.querySelector(".pt-progress") as HTMLElement | null;

beforeEach(() => {
  observers = [];
  window.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  mockReducedMotion(false);
});

afterEach(() => {
  jest.useRealTimers();
  window.IntersectionObserver = originalIO;
  window.matchMedia = originalMatchMedia;
});

describe("PeriodicTable: rendering", () => {
  it("renders one button per tool, each labelled with its atomic number, name and pick-up month", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(container.querySelectorAll("button.pt-el")).toHaveLength(TOTAL);
    const labelled = screen.getAllByRole("button", { name: /^\d+, .+, since [A-Z][a-z]{2} \d{4}$/ });
    expect(labelled).toHaveLength(TOTAL);

    const numbers = atomicNumbers(TOOLS);
    labelled.forEach((btn, i) =>
      expect(btn.getAttribute("aria-label")!.startsWith(`${numbers[i]}, ${TOOLS[i].name}, since`)).toBe(true),
    );
  });

  it("starts at the first chapter's first month, with the first two tools lit and Play showing", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(screen.getByText(litLabel(2))).toBeInTheDocument();
    expect(playButton()).toHaveTextContent("Play");
    expect(container.querySelectorAll("button.pt-lit")).toHaveLength(2);
    expect(screen.getByText(/Graduated in chemical engineering/)).toBeInTheDocument();
  });

  it("shows no photo figure in a chapter without one", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(stopOf("2017")) } });
    expect(container.querySelector("figure")).toBeNull();
  });

  it("shows the Toyota photo from the start, in the first chapter", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(container.querySelector("figure img")).toHaveAttribute("src", "/about/toyota.jpg");
    expect(screen.getByText("Toyota Tsusho, 2015–2017")).toBeInTheDocument();
  });

  it("shows the chapter's photo figure once the chapter has one", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(stopOf("2021")) } });
    expect(container.querySelector("figure img")).toHaveAttribute("src", "/about/smu.jpg");
  });

  it("exports the chapter timing constants", () => {
    expect(CHAPTER_MS).toEqual({ cascade: 1000, hold: 6000, holdPhoto: 8000 });
  });
});

describe("PeriodicTable: chapter row", () => {
  it("renders one chip per chapter, in order, with the first one current", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    const chips = within(chapterNav()).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(CHAPTERS.map((c) => c.label));
    expect(chapterChip("2015–2016")).toHaveAttribute("aria-current", "step");
    expect(chapterChip("2017")).not.toHaveAttribute("aria-current");
  });

  it("moves aria-current with the slider", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2020-01")) } });
    expect(chapterChip("2021")).toHaveAttribute("aria-current", "step");
    expect(chapterChip("2015–2016")).not.toHaveAttribute("aria-current");
  });

  it("jumps to a chapter's stop month, shows its story, and stops play", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.click(chapterChip("2018"));
    expect(dateHeading()).toHaveTextContent("Apr 2018");
    expect(chapterChip("2018")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Research and statistics at EMA/)).toBeInTheDocument();
    expect(slider()).toHaveAttribute("aria-valuetext", "Apr 2018");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("jumping to the SMU pillar chapter (Jun 2026) shows the pillar photo, its caption and its interview link", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.click(chapterChip("Jun 2026"));
    expect(dateHeading()).toHaveTextContent("Jun 2026");
    expect(screen.getByText(/Featured on SMU’s campus for its Master of IT in Business/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Watch the interview" });
    expect(link).toHaveAttribute("href", "https://youtu.be/SvFH6uKAyfE");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("figure img")).toHaveAttribute("src", "/about/pillar.jpg");
  });

  it("shows no pillar link at a non-SMU chapter", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.click(chapterChip("2025"));
    expect(screen.queryByRole("link", { name: "Watch the interview" })).toBeNull();
  });

  it("jumping while playing stops play", () => {
    jest.useFakeTimers();
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    expect(playButton()).toHaveTextContent("Pause");
    fireEvent.click(chapterChip("2017"));
    expect(playButton()).toHaveTextContent("Play");
    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Apr 2017");
  });

  it("sparkles the current chapter's tools after a jump, but not after a scrub", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    // Pandas and NumPy were picked up in Apr 2017, inside the 2017 chapter; Excel is from the first chapter.
    fireEvent.change(slider(), { target: { value: String(stopOf("2017")) } });
    expect(toolButton("Pandas")).toHaveClass("pt-lit");
    expect(toolButton("Pandas")).not.toHaveClass("pt-spark");

    fireEvent.click(chapterChip("2017"));
    expect(toolButton("Pandas")).toHaveClass("pt-spark");
    expect(toolButton("Excel")).not.toHaveClass("pt-spark");
    expect(container.querySelectorAll("button.pt-spark").length).toBeGreaterThan(0);
  });
});

describe("PeriodicTable: no IntersectionObserver", () => {
  it("jumps straight to the end of the timeline on the next frame, with the journey line", async () => {
    // @ts-expect-error simulating a browser without IntersectionObserver
    delete window.IntersectionObserver;
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);

    expect(await screen.findByText("Nov 2026", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(journeyLine())).toBeInTheDocument();
    expect(screen.queryByText(litLabel(TOTAL))).toBeNull();
    expect(screen.getByRole("button", { name: "Replay" })).toBeInTheDocument();
  });
});

describe("PeriodicTable: timeline slider", () => {
  it("moves the date, the lit count and the story when scrubbed", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2020-01")) } });

    expect(dateHeading()).toHaveTextContent("Jan 2020");
    expect(slider()).toHaveAttribute("aria-valuetext", "Jan 2020");
    const lit = TOOLS.filter((t) => t.since <= "2020-01").length;
    expect(screen.getByText(litLabel(lit))).toBeInTheDocument();
    expect(container.querySelectorAll("button.pt-lit")).toHaveLength(lit);
    expect(screen.getByText(/For years I’d stood at the edge of it/)).toBeInTheDocument();
  });

  it("stops playing when scrubbed, even mid-play", () => {
    jest.useFakeTimers();
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    expect(playButton()).toHaveTextContent("Pause");

    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2019-01")) } });
    expect(playButton()).toHaveTextContent("Play");
    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Jan 2019");
  });

  it("shows the journey line at the last month, and the N of N count once scrubbed back", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    expect(screen.getByText(`From 2 tools in 2015 to ${TOTAL} today.`)).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ tools/)).toBeNull();

    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2026-10")) } });
    expect(screen.queryByText(journeyLine())).toBeNull();
    expect(screen.getByText(litLabel(TOOLS.filter((t) => t.since <= "2026-10").length))).toBeInTheDocument();
  });

  it("can be scrubbed back to the start", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    fireEvent.change(slider(), { target: { value: "0" } });
    expect(dateHeading()).toHaveTextContent("Jun 2015");
  });
});

describe("PeriodicTable: picking a tool", () => {
  it("shows nothing in the detail line until a tool is picked", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(liveLine(container)).toBeEmptyDOMElement();
  });

  it("shows the tool's depth, pick-up month, place and article count when clicked", () => {
    const counts = TOOLS.map((t) => (t.name === "SQL" ? 3 : 0));
    const { container } = render(<PeriodicTable articleCounts={counts} />);
    fireEvent.click(toolButton("SQL"));

    const line = liveLine(container);
    expect(line).toHaveTextContent("· SQL — Every day, 2016–2026 · since Sep 2016 · Self-taught, then every role until Mastercard");
    expect(line).toHaveTextContent(/in 3 articles$/);
    expect(toolButton("SQL")).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the singular for one article", () => {
    const counts = TOOLS.map((t) => (t.name === "Python" ? 1 : 0));
    const { container } = render(<PeriodicTable articleCounts={counts} />);
    fireEvent.click(toolButton("Python"));
    expect(liveLine(container)).toHaveTextContent(/in 1 article$/);
    expect(liveLine(container).textContent).not.toMatch(/articles/);
  });

  it("hides the article count when a tool appears in none", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.click(toolButton("HTML"));
    expect(liveLine(container)).toHaveTextContent("Used at work");
    expect(liveLine(container).textContent).not.toMatch(/article/);
  });

  it("describes a tool whose daily span has ended with its closing years", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.click(toolButton("Excel"));
    expect(liveLine(container)).toHaveTextContent("Every day, 2015–2017");
  });

  it("follows the pointer on a hover-capable device", () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({
      matches: query === "(hover: hover)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
      fireEvent.mouseEnter(toolButton("HTML"));
      expect(liveLine(container)).toHaveTextContent("Used at work");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("PeriodicTable: amber ring for everyday tools", () => {
  it("rings Python at the end, since it is still an everyday tool", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    expect(toolButton("Python")).toHaveClass("pt-daily", "pt-lit");
  });

  it("does not ring SQL at the end, since its daily span ended in Jun 2026", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    expect(toolButton("SQL")).toHaveClass("pt-lit");
    expect(toolButton("SQL")).not.toHaveClass("pt-daily");
  });

  it("rings SQL while it is still in its daily span", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2020-01")) } });
    expect(toolButton("SQL")).toHaveClass("pt-daily", "pt-lit");
  });

  it("rings OpenCode while its daily span runs, and not at the end once it has ended", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2025-12")) } });
    expect(toolButton("OpenCode")).toHaveClass("pt-daily", "pt-lit");
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    expect(toolButton("OpenCode")).toHaveClass("pt-lit");
    expect(toolButton("OpenCode")).not.toHaveClass("pt-daily");
  });

  it("does not ring a tool before it is picked up", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2020-01")) } });
    expect(toolButton("Docker")).not.toHaveClass("pt-lit");
    expect(toolButton("Docker")).not.toHaveClass("pt-daily");
  });

  it("does not ring a tool that was never an everyday tool", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth(TIMELINE_END)) } });
    expect(toolButton("HTML")).toHaveClass("pt-lit");
    expect(toolButton("HTML")).not.toHaveClass("pt-daily");
  });
});

describe("PeriodicTable: autoplay timing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("waits for the table to come into view before playing", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    advance(CHAPTER_MS.hold * 2);
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("holds on the first chapter's stop for the full photo hold before moving on", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    expect(playButton()).toHaveTextContent("Pause");
    runTo("Sep 2016");
    advance(CHAPTER_MS.holdPhoto - 1);
    expect(dateHeading()).toHaveTextContent("Sep 2016");
    advance(1);
    expect(dateHeading()).toHaveTextContent("Oct 2016");
  });

  it("runs the first chapter from the start month, one month at a time, with no hold first", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    advance(cascadeMs(FIRST_SPAN) - 1);
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    advance(1);
    expect(dateHeading()).toHaveTextContent("Jul 2015");
  });

  it("cascades through a chapter at about a second in total, then holds at its stop", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    // The 2023 chapter runs from the 2021 stop (Aug 2021) to Dec 2023: 28 months, each cascadeMs(28) long.
    runTo("Aug 2021");
    const span = stopOf("2023") - stopOf("2021");
    expect(span).toBe(28);
    const step = cascadeMs(span);
    const started = Date.now();
    advance(CHAPTER_MS.holdPhoto);
    expect(dateHeading()).toHaveTextContent("Sep 2021");
    advance(step - 1);
    expect(dateHeading()).toHaveTextContent("Sep 2021");
    advance(1);
    expect(dateHeading()).toHaveTextContent("Oct 2021");
    runTo("Dec 2023");
    // The first step out of the stop is the hold itself, so the cascade is the remaining span - 1 months.
    expect(Date.now() - started).toBe(CHAPTER_MS.holdPhoto + (span - 1) * step);
    expect(Math.abs((span - 1) * step - CHAPTER_MS.cascade) / CHAPTER_MS.cascade).toBeLessThan(0.1);
    expect(container.querySelectorAll("button.pt-lit")).toHaveLength(TOOLS.filter((t) => t.since <= "2023-12").length);
  });

  it("holds on a photo chapter's stop for the longer photo hold", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Aug 2021");
    advance(CHAPTER_MS.holdPhoto - 1);
    expect(dateHeading()).toHaveTextContent("Aug 2021");
    advance(1);
    expect(dateHeading()).toHaveTextContent("Sep 2021");
  });

  it("lights a tool and sparkles it as its month arrives while playing", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Apr 2017");
    expect(toolButton("Pandas")).toHaveClass("pt-lit", "pt-spark");
    // Excel was picked up in the first chapter, before the 2017 chapter's cascade started.
    expect(toolButton("Excel")).not.toHaveClass("pt-spark");
  });

  it("pauses when Pause is pressed and resumes from the same month", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Jul 2015");
    fireEvent.click(playButton());
    expect(playButton()).toHaveTextContent("Play");
    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Jul 2015");

    fireEvent.click(playButton());
    advance(cascadeMs(FIRST_SPAN));
    expect(dateHeading()).toHaveTextContent("Aug 2015");
  });

  it("plays through every chapter to Nov 2026, shows Replay and the journey line, then Replay starts again", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    playToEnd();
    expect(dateHeading()).toHaveTextContent("Nov 2026");
    expect(playButton()).toHaveTextContent("Replay");
    expect(screen.getByText(journeyLine())).toBeInTheDocument();
    expect(jest.getTimerCount()).toBe(0);
    expect(chapterChip("Now")).toHaveAttribute("aria-current", "step");

    fireEvent.click(playButton());
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(playButton()).toHaveTextContent("Pause");
  });

  it("disconnects the observer once the table has started", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    const io = observers[0];
    scrollIntoView();
    expect(io.disconnect).toHaveBeenCalled();
  });
});

describe("PeriodicTable: hover and focus hold", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("holds playback while the mouse rests on the dark tile, and resumes with a full hold on leaving", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    pointer(notch(container), "pointerover", "mouse");
    expect(screen.getByText(/Paused while you read/)).toBeInTheDocument();

    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Sep 2016");

    pointer(notch(container), "pointerout", "mouse");
    expect(screen.queryByText(/Paused while you read/)).toBeNull();
    advance(CHAPTER_MS.holdPhoto - 1);
    expect(dateHeading()).toHaveTextContent("Sep 2016");
    advance(1);
    expect(dateHeading()).toHaveTextContent("Oct 2016");
  });

  it("ignores touch pointers on the dark tile", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    pointer(notch(container), "pointerover", "touch");
    expect(screen.queryByText(/Paused while you read/)).toBeNull();
  });

  it("holds while focus is inside the dark tile, and resumes when focus leaves", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    act(() => playButton().focus());
    expect(screen.getByText(/Paused while you read/)).toBeInTheDocument();
    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Sep 2016");

    act(() => playButton().blur());
    expect(screen.queryByText(/Paused while you read/)).toBeNull();
    advance(CHAPTER_MS.holdPhoto);
    expect(dateHeading()).toHaveTextContent("Oct 2016");
  });

  it("shows no paused hint when the table is not playing", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    pointer(notch(container), "pointerover", "mouse");
    expect(screen.queryByText(/Paused while you read/)).toBeNull();
  });
});

describe("PeriodicTable: chapter progress bar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("shows on the current chapter chip only while playing at a stop, for that chapter's hold", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    const bar = progressBar(container);
    expect(bar).toBeInTheDocument();
    expect(bar!.closest("button")).toBe(chapterChip("2015–2016"));
    expect(bar).toHaveStyle({ animationDuration: `${CHAPTER_MS.holdPhoto}ms` });
  });

  it("is absent mid-cascade", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    advance(cascadeMs(FIRST_SPAN));
    expect(dateHeading()).toHaveTextContent("Jul 2015");
    expect(progressBar(container)).toBeNull();
  });

  it("uses the photo hold for a photo chapter's stop", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Aug 2021");
    expect(progressBar(container)!.closest("button")).toBe(chapterChip("2021"));
    expect(progressBar(container)).toHaveStyle({ animationDuration: `${CHAPTER_MS.holdPhoto}ms` });
  });

  it("is absent when paused at a stop, and paused (not removed) while the mouse rests on the tile", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    fireEvent.click(playButton());
    expect(progressBar(container)).toBeNull();

    fireEvent.click(playButton());
    pointer(notch(container), "pointerover", "mouse");
    expect(progressBar(container)).toHaveStyle({ animationPlayState: "paused" });
  });
});

describe("PeriodicTable: reduced motion", () => {
  it("jumps to the finished table instead of playing when the table comes into view", () => {
    jest.useFakeTimers();
    mockReducedMotion(true);
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();

    expect(dateHeading()).toHaveTextContent("Nov 2026");
    expect(playButton()).toHaveTextContent("Replay");
    expect(container.querySelectorAll("button.pt-lit")).toHaveLength(TOTAL);
    expect(jest.getTimerCount()).toBe(0);
    advance(60_000);
    expect(dateHeading()).toHaveTextContent("Nov 2026");
  });

  it("still plays when reduced motion is off, for contrast", () => {
    jest.useFakeTimers();
    mockReducedMotion(false);
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(playButton()).toHaveTextContent("Pause");
  });
});

describe("PeriodicTable: photo caption link", () => {
  it("shows the pillar photo's caption and its interview link inside the SMU chapter", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2025-12")) } });
    expect(screen.getByText(/Featured on SMU’s campus for its Master of IT in Business/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Watch the interview" });
    expect(link).toHaveAttribute("href", "https://youtu.be/SvFH6uKAyfE");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows no link outside the SMU chapter", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2024-01")) } });
    expect(screen.queryByRole("link", { name: "Watch the interview" })).toBeNull();
    expect(screen.queryByText(/Featured on SMU’s campus/)).toBeNull();
  });

  it("shows no link once the 2026 chapter takes over (Jul 2026)", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2026-07")) } });
    expect(screen.queryByRole("link", { name: "Watch the interview" })).toBeNull();
  });
});

describe("PeriodicTable: next-chapter hint and hold timer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  const timerOf = (container: HTMLElement) => container.querySelector('[data-testid="hold-timer"]') as HTMLElement | null;

  it("shows 'Next: 2017' and a timer holding for the photo hold at the first stop", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    expect(screen.getByText("Next: 2017")).toBeInTheDocument();
    expect(timerOf(container)).toHaveStyle({ animationDuration: "8000ms", animationPlayState: "running" });
  });

  it("says 'Paused while you read' and pauses the timer while the mouse rests on the dark tile", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    pointer(notch(container), "pointerover", "mouse");
    expect(screen.getByText("Paused while you read")).toBeInTheDocument();
    expect(screen.queryByText("Next: 2017")).toBeNull();
    expect(timerOf(container)).toHaveStyle({ animationDuration: "8000ms", animationPlayState: "paused" });
  });

  it("pauses the timer and shows the held text while focus is inside the dark tile", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    act(() => playButton().focus());
    expect(screen.getByText("Paused while you read")).toBeInTheDocument();
    expect(timerOf(container)).toHaveStyle({ animationPlayState: "paused" });
  });

  it("resumes to 'Next: …' with a running timer on pointerleave", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    pointer(notch(container), "pointerover", "mouse");
    pointer(notch(container), "pointerout", "mouse");
    expect(screen.getByText("Next: 2017")).toBeInTheDocument();
    expect(screen.queryByText("Paused while you read")).toBeNull();
    expect(timerOf(container)).toHaveStyle({ animationPlayState: "running" });
  });

  it("shows no hint or timer during a chapter's cascade", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    advance(cascadeMs(FIRST_SPAN));
    expect(dateHeading()).toHaveTextContent("Jul 2015");
    expect(timerOf(container)).toBeNull();
    expect(screen.queryByText(/^Next: /)).toBeNull();
    expect(screen.queryByText("Paused while you read")).toBeNull();
  });

  it("shows no hint or timer after pressing Pause at a stop", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Sep 2016");
    fireEvent.click(playButton());
    expect(playButton()).toHaveTextContent("Play");
    expect(timerOf(container)).toBeNull();
    expect(screen.queryByText(/^Next: /)).toBeNull();
  });

  it("shows no hint or timer after a chapter chip jump, since the jump stops play", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Jul 2015");
    fireEvent.click(chapterChip("2017"));
    expect(dateHeading()).toHaveTextContent("Apr 2017");
    expect(playButton()).toHaveTextContent("Play");
    expect(timerOf(container)).toBeNull();
    expect(screen.queryByText(/^Next: /)).toBeNull();
  });

  it("uses the plain 6000ms hold for a chapter without a photo (2017 → 'Next: 2018')", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    runTo("Apr 2017");
    expect(screen.getByText("Next: 2018")).toBeInTheDocument();
    expect(timerOf(container)).toHaveStyle({ animationDuration: "6000ms", animationPlayState: "running" });
  });

  it("shows no hint or timer at the end of the timeline", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    playToEnd();
    expect(dateHeading()).toHaveTextContent("Nov 2026");
    expect(timerOf(container)).toBeNull();
    expect(screen.queryByText(/^Next: /)).toBeNull();
  });
});

describe("PeriodicTable: Ask Titus pointing at tools", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  /**
   * What Ask Titus's stop sends: the show event, dispatched from a tile and bubbling up to the table. Starts from
   * the first id that is a tile, or from any tile when none is.
   */
  function showTools(ids: string[]) {
    const origin = ids.map((id) => document.getElementById(id)).find((el) => el !== null) ?? document.querySelector("button.pt-el")!;
    act(() => {
      origin.dispatchEvent(new CustomEvent(SHOW_EVENT, { bubbles: true, detail: { ids } }));
    });
  }

  it("stops playing, jumps to the chapter where the latest named tool lights up, and shows the first tool", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    expect(playButton()).toHaveTextContent("Pause");
    advance(CHAPTER_MS.cascade);

    showTools(["tool-tigergraph", "tool-neo4j"]);

    // Neo4j is picked up in May 2025, the "2024" chapter's stop; TigerGraph (Mar 2023) is shown first.
    expect(playButton()).toHaveTextContent("Play");
    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(screen.getByRole("button", { name: /TigerGraph/ })).toHaveAttribute("aria-pressed", "true");
    expect(liveLine(document.body)).toHaveTextContent("· TigerGraph —");
  });

  it("leaves play stopped at the chapter stop, with no further months changing", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    showTools(["tool-tigergraph", "tool-neo4j"]);
    advance(CHAPTER_MS.holdPhoto * 2);
    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("shows the first named tool even when a later tool is named first in the list", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(["tool-neo4j", "tool-tigergraph"]);
    expect(liveLine(container)).toHaveTextContent("· Neo4j —");
    expect(dateHeading()).toHaveTextContent("May 2025");
  });

  it("does not let the table's first-view autoplay override a show that came before it", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(["tool-tigergraph", "tool-neo4j"]);
    expect(dateHeading()).toHaveTextContent("May 2025");

    // The table now comes into view: it would normally start playing from the first month.
    scrollIntoView();
    advance(CHAPTER_MS.holdPhoto * 3);

    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("ignores ids that are not tools on the table", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    scrollIntoView();
    advance(CHAPTER_MS.cascade);
    const before = dateHeading().textContent;

    showTools(["tool-nope", "role-illumina"]);

    expect(dateHeading().textContent).toBe(before);
    expect(playButton()).toHaveTextContent("Pause");
    expect(liveLine(container)).toBeEmptyDOMElement();
  });

  it("keeps the known tools of a mixed list and ignores the rest", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(["tool-nope", "tool-neo4j"]);
    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(liveLine(container)).toHaveTextContent("· Neo4j —");
  });

  it("gives every tool tile the id its target uses on the page", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    const tiles = Array.from(container.querySelectorAll("button.pt-el"));
    expect(tiles.map((el) => el.id)).toEqual(TOOLS.map((t) => toolTargetId(t)));
    for (const tool of TOOLS) {
      const el = document.getElementById(toolTargetId(tool));
      expect(el?.tagName).toBe("BUTTON");
      expect(el).toHaveAttribute("title", tool.name);
    }
  });
});

describe("PeriodicTable: a show request made before it mounts", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Clear any request left by an earlier test.
    takePendingShow(() => true);
  });

  /** What Ask Titus sends when the page is still mounting: the request is made from a detached anchor. */
  const requestBeforeMount = (ids: string[]) => requestShow(document.createElement("button"), ids);

  it("lands on the 2024 chapter with the first named tool picked, and does not autoplay when it comes into view", () => {
    requestBeforeMount(["tool-tigergraph", "tool-neo4j"]);
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);

    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(chapterChip("2024")).toHaveAttribute("aria-current", "step");
    expect(liveLine(container)).toHaveTextContent("· TigerGraph —");
    expect(playButton()).toHaveTextContent("Play");

    scrollIntoView();
    advance(CHAPTER_MS.holdPhoto * 3);
    expect(dateHeading()).toHaveTextContent("May 2025");
    expect(playButton()).toHaveTextContent("Play");
  });

  it("is taken once: a second mount after that plays from the start again", () => {
    const { unmount } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    unmount();
    requestBeforeMount(["tool-tigergraph", "tool-neo4j"]);
    const first = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(dateHeading()).toHaveTextContent("May 2025");
    first.unmount();
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(dateHeading()).toHaveTextContent("Jun 2015");
  });

  it("ignores a request older than PENDING_SHOW_MS, and the table plays normally", () => {
    requestBeforeMount(["tool-tigergraph", "tool-neo4j"]);
    advance(PENDING_SHOW_MS + 1);
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);

    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(liveLine(container)).toBeEmptyDOMElement();
    scrollIntoView();
    advance(CHAPTER_MS.cascade);
    expect(playButton()).toHaveTextContent("Pause");
    expect(dateHeading()).not.toHaveTextContent("May 2025");
  });

  it("ignores a request with no tool ids and leaves it for another owner", () => {
    requestBeforeMount(["role-illumina"]);
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);

    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(liveLine(container)).toBeEmptyDOMElement();
    scrollIntoView();
    expect(playButton()).toHaveTextContent("Pause");
    expect(takePendingShow(() => true)).toEqual(["role-illumina"]);
  });

  it("after handling a SHOW_EVENT, remounting does not re-apply the request", () => {
    const { unmount } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    // The anchor is a tile on the table, so the event reaches the table's own listener and is handled there.
    act(() => requestShow(document.getElementById("tool-tigergraph")!, ["tool-tigergraph", "tool-neo4j"]));
    expect(dateHeading()).toHaveTextContent("May 2025");
    unmount();

    const remounted = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(dateHeading()).toHaveTextContent("Jun 2015");
    expect(chapterChip("2015–2016")).toHaveAttribute("aria-current", "step");
    expect(liveLine(remounted.container)).toBeEmptyDOMElement();
  });
});

describe("PeriodicTable: tools named by Ask Titus stay marked until the table is used", () => {
  const NAMED = ["tool-tigergraph", "tool-neo4j"];

  beforeEach(() => {
    jest.useFakeTimers();
    // Clear any request left by an earlier test.
    takePendingShow(() => true);
  });

  /** What Ask Titus's stop sends: the show event, dispatched from a tile and bubbling up to the table. */
  function showTools(ids: string[]) {
    const origin = ids.map((id) => document.getElementById(id)).find((el) => el !== null) ?? document.querySelector("button.pt-el")!;
    act(() => {
      origin.dispatchEvent(new CustomEvent(SHOW_EVENT, { bubbles: true, detail: { ids } }));
    });
  }

  /** Both named tiles are outlined and solid; every other tile is faded. */
  function expectNamedMarked(ids: string[]) {
    TOOLS.forEach((tool) => {
      const el = document.getElementById(toolTargetId(tool))!;
      if (ids.includes(toolTargetId(tool))) {
        expect(el).toHaveClass("outline", "outline-2", "outline-offset-2", "outline-ink");
        expect(el).not.toHaveClass("opacity-30");
      } else {
        expect(el).toHaveClass("opacity-30");
      }
    });
  }

  const fadedCount = (container: HTMLElement) => container.querySelectorAll(".opacity-30").length;

  function hoverCapable() {
    const original = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({
      matches: query === "(hover: hover)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => true),
    })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  }

  it("outlines both named tiles and fades every other tile after SHOW_EVENT", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    expectNamedMarked(NAMED);
    expect(toolButton("TigerGraph")).toHaveAttribute("aria-pressed", "true");
  });

  it("marks both named tiles when the request was made before the table mounted", () => {
    requestShow(document.createElement("button"), NAMED);
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    expect(dateHeading()).toHaveTextContent("May 2025");
    expectNamedMarked(NAMED);
    expect(fadedCount(container)).toBe(TOTAL - NAMED.length);
  });

  it("keeps the marks through the table's first-view autoplay that comes after the show", () => {
    render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    scrollIntoView();
    advance(CHAPTER_MS.holdPhoto);
    expectNamedMarked(NAMED);
  });

  it("clears the fading when Play is pressed", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    expect(fadedCount(container)).toBe(TOTAL - NAMED.length);
    fireEvent.click(playButton());
    expect(playButton()).toHaveTextContent("Pause");
    expect(fadedCount(container)).toBe(0);
    // Neo4j is named but not the picked tile, so its outline has gone too.
    expect(document.getElementById("tool-neo4j")).not.toHaveClass("outline-ink");
  });

  it("clears the fading when the timeline slider is scrubbed", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    fireEvent.change(slider(), { target: { value: String(indexOfMonth("2020-01")) } });
    expect(dateHeading()).toHaveTextContent("Jan 2020");
    expect(fadedCount(container)).toBe(0);
    expect(document.getElementById("tool-neo4j")).not.toHaveClass("outline-ink");
  });

  it("clears the fading when a chapter button is clicked", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    fireEvent.click(chapterChip("2017"));
    expect(chapterChip("2017")).toHaveAttribute("aria-current", "step");
    expect(fadedCount(container)).toBe(0);
    expect(document.getElementById("tool-neo4j")).not.toHaveClass("outline-ink");
  });

  it("clears the fading when a tile is clicked", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    showTools(NAMED);
    fireEvent.click(toolButton("HTML"));
    expect(toolButton("HTML")).toHaveAttribute("aria-pressed", "true");
    expect(fadedCount(container)).toBe(0);
    expect(document.getElementById("tool-neo4j")).not.toHaveClass("outline-ink");
  });

  it("does not clear the fading when a tile is only hovered on a hover-capable device", () => {
    const restore = hoverCapable();
    try {
      const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
      showTools(NAMED);
      fireEvent.mouseEnter(toolButton("HTML"));
      expect(toolButton("HTML")).toHaveAttribute("aria-pressed", "true");
      expect(fadedCount(container)).toBe(TOTAL - NAMED.length);
      expect(document.getElementById("tool-tigergraph")).toHaveClass("outline-ink");
      expect(document.getElementById("tool-neo4j")).toHaveClass("outline-ink");
    } finally {
      restore();
    }
  });

  it("puts scroll-mt-32 on the #stack wrapper, which holds the chapter row and the tiles", () => {
    const { container } = render(<PeriodicTable articleCounts={ZERO_COUNTS} />);
    const stack = container.querySelector<HTMLElement>("#stack");
    expect(stack).toHaveClass("scroll-mt-32");
    expect(container.querySelectorAll(".scroll-mt-32")).toHaveLength(1);
    expect(stack).toContainElement(chapterNav());
    expect(stack!.querySelectorAll("button.pt-el")).toHaveLength(TOTAL);
  });
});
