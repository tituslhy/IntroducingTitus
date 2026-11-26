import { act, render, screen, within } from "@testing-library/react";
import { StepFold, StepList, WaitingWord, waitingWordAt } from "./CopilotSteps";
import { WAITING_WORDS, WAITING_WORD_MS, type Step } from "@/lib/copilot-steps";

const search = (id: string, done: boolean, label = "Searching my writing for “a”"): Step => ({ id, tool: "search_writing", label, done });
const read = (id: string, done: boolean, label = "Reading “T”"): Step => ({ id, tool: "read_writing", label, done });

describe("waitingWordAt", () => {
  it("starts on the first word at the question", () => {
    expect(waitingWordAt(0)).toBe(`${WAITING_WORDS[0]}…`);
  });

  it("holds each word for WAITING_WORD_MS, then moves on", () => {
    expect(waitingWordAt(WAITING_WORD_MS - 1)).toBe(`${WAITING_WORDS[0]}…`);
    expect(waitingWordAt(WAITING_WORD_MS)).toBe(`${WAITING_WORDS[1]}…`);
    expect(waitingWordAt(2 * WAITING_WORD_MS)).toBe(`${WAITING_WORDS[2]}…`);
    expect(waitingWordAt(3 * WAITING_WORD_MS)).toBe(`${WAITING_WORDS[3]}…`);
  });

  it("wraps round to the first word after the last", () => {
    expect(waitingWordAt(4 * WAITING_WORD_MS)).toBe(`${WAITING_WORDS[0]}…`);
    expect(waitingWordAt(5 * WAITING_WORD_MS)).toBe(`${WAITING_WORDS[1]}…`);
    expect(waitingWordAt(400 * WAITING_WORD_MS + 1)).toBe(`${WAITING_WORDS[0]}…`);
  });

  it("clamps a negative time to the first word", () => {
    expect(waitingWordAt(-1)).toBe(`${WAITING_WORDS[0]}…`);
    expect(waitingWordAt(-50_000)).toBe(`${WAITING_WORDS[0]}…`);
  });

  it("works for a fractional time, as a replay clock can be", () => {
    expect(waitingWordAt(4_500.5)).toBe(`${WAITING_WORDS[1]}…`);
  });

  it("uses the words the live drawer uses, in the same order", () => {
    expect(WAITING_WORDS).toEqual(["Thinking", "Reasoning", "Considering", "Weighing"]);
    expect(WAITING_WORD_MS).toBe(3_000);
  });
});

describe("WaitingWord", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the first word with an ellipsis", () => {
    render(<WaitingWord />);
    expect(screen.getByText(`${WAITING_WORDS[0]}…`)).toBeInTheDocument();
  });

  it("moves to the next word every WAITING_WORD_MS, and wraps round", () => {
    const { container } = render(<WaitingWord />);
    for (let k = 1; k <= WAITING_WORDS.length + 1; k++) {
      act(() => void jest.advanceTimersByTime(WAITING_WORD_MS));
      expect(container.textContent).toBe(`${WAITING_WORDS[k % WAITING_WORDS.length]}…`);
    }
  });

  it("stops its timer when it unmounts", () => {
    const { unmount } = render(<WaitingWord />);
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("StepList", () => {
  it("is labelled as what I'm doing, with one line per step", () => {
    render(<StepList steps={[search("c1", false), read("c2", false)]} />);
    const list = screen.getByRole("list", { name: "What I'm doing" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Searching my writing for “a”")).toBeInTheDocument();
    expect(within(list).getByText("Reading “T”")).toBeInTheDocument();
  });

  it("gives a finished step a check and a running one a pulsing dot", () => {
    render(<StepList steps={[search("c1", true), read("c2", false)]} />);
    const [finished, running] = screen.getAllByRole("listitem");
    expect(finished.querySelector("svg")).not.toBeNull();
    expect(running.querySelector("svg")).toBeNull();
    expect(running.querySelector('[class*="animate-pulse"]')).not.toBeNull();
  });

  it("keeps a running step's label in the softer ink, and a finished one's in the plain ink", () => {
    render(<StepList steps={[search("c1", true), read("c2", false)]} />);
    const [finished, running] = screen.getAllByRole("listitem");
    expect(finished.querySelector(":scope > span:last-child")).not.toHaveClass("text-ink-soft");
    expect(running.querySelector(":scope > span:last-child")).toHaveClass("text-ink-soft");
  });

  it("does not say Writing the reply while a step is still running", () => {
    render(<StepList steps={[search("c1", true), read("c2", false)]} />);
    expect(screen.queryByText("Writing the reply")).not.toBeInTheDocument();
  });

  it("says Writing the reply once every step is done", () => {
    render(<StepList steps={[search("c1", true), read("c2", true)]} />);
    expect(screen.getByText("Writing the reply")).toBeInTheDocument();
  });
});

describe("StepFold", () => {
  it("shows the fold line in a closed details, with the number of articles sent", () => {
    const { container } = render(<StepFold steps={[search("c1", true)]} articles={3} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(screen.getByText(/Searched my writing · read 3 articles/, { selector: "summary" })).toBeInTheDocument();
  });

  it("lists each step's label inside the details, as it ran", () => {
    const { container } = render(<StepFold steps={[search("c1", true, "Searched my writing for “a”"), read("c2", true, "Read “T”")]} articles={1} />);
    const items = Array.from(container.querySelectorAll("details li"), (li) => li.textContent);
    expect(items).toEqual(["Searched my writing for “a”", "Read “T”"]);
  });

  it("says Read 1 article for a read by id, with no search in the line", () => {
    render(<StepFold steps={[read("c1", true)]} articles={1} />);
    expect(screen.getByText(/^›?\s*Read 1 article$/, { selector: "summary" })).toBeInTheDocument();
  });

  it("renders nothing when there is no line to fold to", () => {
    const { container } = render(<StepFold steps={[]} articles={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
