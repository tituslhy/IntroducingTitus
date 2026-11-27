import { render, screen, within } from "@testing-library/react";
import { loadColophonTraces } from "@/lib/colophon-traces-load";
import { loadScorecard, type Scorecard } from "@/lib/eval-results";
import type { Recording } from "@/lib/colophon-trace";
import ColophonPage, { metadata } from "./page";

jest.mock("@/lib/eval-results", () => ({
  loadScorecard: jest.fn(() => null),
}));

// content/colophon-traces.json appears once the owner records it. Mock the loader so the
// walkthrough tests always see "no recording"; the TryIt branch has its own describe below.
// titlesFor stays real.
jest.mock("@/lib/colophon-traces-load", () => ({
  ...jest.requireActual("@/lib/colophon-traces-load"),
  loadColophonTraces: jest.fn(() => null),
}));

beforeEach(() => {
  jest.mocked(loadColophonTraces).mockReturnValue(null);
});

const REPO_URL = "https://github.com/tituslhy/IntroducingTitus";

const scorecard: Scorecard = {
  runAt: "2026-10-01T09:30:00Z",
  questionCount: 42,
  jevModel: "jev-1.13",
  toolCallAccuracy: 0.9,
  stage1Recall: 0.8,
  precisionAt2: null,
  abstainAccuracy: 1,
  noInvention: 0.5,
  recordAccuracy: null,
  pageSize: null,
};

function sectionTitles(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
}

describe("ColophonPage metadata", () => {
  it("uses the How Ask Titus works title", () => {
    expect(metadata.title).toBe("How Ask Titus works | Titus Lim");
  });
});

describe("ColophonPage sections", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
  });

  it("renders the section headings in order, numbered from 01", () => {
    render(<ColophonPage />);

    const headings = sectionTitles();
    expect(headings.map((h) => h.slice(0, 2))).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(headings.map((h) => h.slice(2))).toEqual([
      "The short version",
      "Anatomy of a reply",
      "One source of truth",
      "Guardrails",
      "Recruiter mode",
      "What it won’t do",
      "Stack",
    ]);
  });

  it("hides the How it's tested section when there is no scorecard", () => {
    render(<ColophonPage />);

    expect(screen.queryByRole("heading", { name: /how it.s tested/i })).not.toBeInTheDocument();
  });

  it("shows How it's tested with percentages, question count and run date when a scorecard exists", () => {
    jest.mocked(loadScorecard).mockReturnValue(scorecard);
    render(<ColophonPage />);

    const headings = sectionTitles();
    expect(headings.map((h) => h.slice(0, 2))).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
    expect(headings[5].slice(2)).toBe("How it’s tested");

    const section = screen.getByRole("heading", { name: /how it.s tested/i }).closest("section") as HTMLElement;
    const scoped = within(section);
    expect(scoped.getByText("90%")).toBeInTheDocument();
    expect(scoped.getByText("80%")).toBeInTheDocument();
    expect(scoped.getByText("n/a")).toBeInTheDocument();
    expect(scoped.getByText("100%")).toBeInTheDocument();
    expect(scoped.getByText("50%")).toBeInTheDocument();
    expect(scoped.getByText(/42 questions/)).toBeInTheDocument();
    expect(scoped.getByText(/1 October 2026/)).toBeInTheDocument();
    expect(scoped.getByText(/jev-1\.13/)).toBeInTheDocument();
  });

  it("labels the precision row with the page size the run used", () => {
    jest.mocked(loadScorecard).mockReturnValue({ ...scorecard, pageSize: 3 });
    render(<ColophonPage />);

    expect(screen.getByText("Precision@3")).toBeInTheDocument();
    expect(screen.queryByText("Precision@2")).not.toBeInTheDocument();
  });

  it("labels the precision row Precision@2 when the run recorded no page size", () => {
    jest.mocked(loadScorecard).mockReturnValue(scorecard);
    render(<ColophonPage />);

    expect(screen.getByText("Precision@2")).toBeInTheDocument();
  });

  it("describes the scenario replays in prose, with no numbers, covering career and writing questions", () => {
    jest.mocked(loadScorecard).mockReturnValue(scorecard);
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { name: /how it.s tested/i }).closest("section") as HTMLElement;
    const sentence = (section.textContent ?? "")
      .split(/(?<=\.)\s+/)
      .find((s) => /replay/i.test(s));

    expect(sentence).toBeDefined();
    expect(sentence).toMatch(/career/i);
    expect(sentence).toMatch(/writing/i);
    expect(sentence).not.toMatch(/\d/);
  });
});

describe("ColophonPage content", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
  });

  it("labels the example fit brief as an example and not a real posting", () => {
    render(<ColophonPage />);

    expect(screen.getByText("Example fit brief")).toBeInTheDocument();
    expect(screen.getByText("Not a real posting")).toBeInTheDocument();
  });

  it("says conversations are logged privately and never published", () => {
    render(<ColophonPage />);

    expect(screen.getByText(/conversations are logged, privately, so i can see where it goes wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/they’re never published/i)).toBeInTheDocument();
  });

  it("links to the GitHub repository", () => {
    render(<ColophonPage />);

    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", REPO_URL);
  });

  it("has no page-level back link: the site nav carries the way home", () => {
    render(<ColophonPage />);

    expect(screen.queryByRole("link", { name: /back to the site/i })).not.toBeInTheDocument();
  });

  it("credits the tool logos as trademarks of their owners", () => {
    render(<ColophonPage />);

    expect(
      screen.getByText("Tool logos are trademarks of their owners, shown to indicate tools I've used.")
    ).toBeInTheDocument();
  });

  it("offers the recruiter-mode entry point", () => {
    render(<ColophonPage />);

    expect(screen.getByRole("button", { name: /check a role against my record/i })).toBeInTheDocument();
  });

  it("describes stable footnotes", () => {
    render(<ColophonPage />);

    expect(document.body.textContent).toMatch(/keeps the same number for the whole conversation/i);
  });

  it("describes dated articles", () => {
    render(<ColophonPage />);

    expect(document.body.textContent).toMatch(/says when I wrote it/i);
  });

  it("describes long conversations", () => {
    render(<ColophonPage />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/oldest exchanges/i);
    expect(text).toMatch(/keep their numbers/i);
  });

  it("won't-do list covers invented current views", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /what it won[’']t do/i }).closest("section")!;
    const items = within(section).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.some((text) => /what I[’']d use today/i.test(text))).toBe(true);
  });

  it("guardrails table lists rebuilt footnote numbers", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /guardrails/i }).closest("section")!;
    const rows = within(within(section).getByRole("table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.some((text) => /Footnote numbers rebuilt server-side/i.test(text))).toBe(true);
  });

  it("won't-do list refuses to rank me against other candidates", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /what it won[’']t do/i }).closest("section")!;
    const items = within(section).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.some((text) => /rank me against/i.test(text))).toBe(true);
  });

  it("walkthrough describes reading sections", () => {
    render(<ColophonPage />);

    const anatomy = screen.getByRole("heading", { level: 2, name: /anatomy of a reply/i }).closest("section")!;
    expect(anatomy.textContent ?? "").toMatch(/sections/i);
    expect(document.body.textContent ?? "").not.toMatch(/read in full/i);
  });
});

describe("ColophonPage new copy", () => {
  it("has a guided tour paragraph that names show_on_page and the See on page pills", () => {
    render(<ColophonPage />);

    const heading = screen.getByText("The guided tour");
    const section = heading.closest("section")!;
    expect(section.textContent ?? "").toMatch(/show_on_page/);
    expect(section.textContent ?? "").toMatch(/See on page/);
  });

  it("one source of truth names lib/about.ts beside lib/profile.ts", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /one source of truth/i }).closest("section")!;
    expect(within(section).getByText("lib/profile.ts")).toBeInTheDocument();
    expect(within(section).getByText("lib/about.ts")).toBeInTheDocument();
  });

  it("reading in pages says a reply reads at most ten articles, and GPT gets three searches", () => {
    render(<ColophonPage />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/A reply reads at most ten articles/);
    expect(text).toMatch(/gets three searches per reply/);
  });
});

describe("ColophonPage cards copy", () => {
  it("has a Cards entry after the guided tour that names show_card and A2UI v1.0, and says a question about my articles gets no card", () => {
    render(<ColophonPage />);

    const tour = screen.getByText("The guided tour");
    const cards = screen.getByText("Cards");
    expect(tour.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const section = cards.closest("section")!;
    expect(section.textContent ?? "").toMatch(/show_card/);
    expect(section.textContent ?? "").toMatch(/A2UI v1\.0/);
    expect(section.textContent ?? "").toMatch(/gets no card: the Writing page is filtered/);
  });

  it("guardrails has a row saying cards are built by the server and checked as A2UI", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /guardrails/i }).closest("section")!;
    const rows = within(within(section).getByRole("table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.some((text) => /Cards built by the server from my data, checked as A2UI before/.test(text))).toBe(true);
  });
});

describe("ColophonPage topics copy", () => {
  it("walkthrough calls search_writing with a list of topics", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/search_writing\(\[/);
  });

  it("reading in pages says three at a time", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/three at a time/i);
  });

  it("guardrails row says at most ten articles a reply", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /guardrails/i }).closest("section")!;
    const rows = within(within(section).getByRole("table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.some((text) => /at most ten articles/i.test(text))).toBe(true);
    expect(rows.some((text) => /at most (four|six) articles|at (four|six) articles/i.test(text))).toBe(false);
  });
});

describe("ColophonPage three tools and themes", () => {
  it("stack section says Four tools, not Three tools", () => {
    render(<ColophonPage />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Four tools/);
    expect(text).not.toMatch(/Three tools/);
    expect(text).not.toMatch(/Two tools/);
  });

  it("stack section names A2UI v1.0 (Google)", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/A2UI v1\.0 \(Google\)/);
  });

  it("has a Reading by theme paragraph", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/Reading by theme/i);
  });

  it("the Jev rank step says the three best go on, not two", () => {
    render(<ColophonPage />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/three best go on/i);
    expect(text).not.toMatch(/two best/i);
  });
});

describe("ColophonPage does not name BYOA", () => {
  it("does not render BYOA anywhere on the page", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").not.toMatch(/BYOA/);
  });
});

describe("ColophonPage theme count", () => {
  it("never states a theme count no script produced", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").not.toMatch(/\b(about|around|roughly)?\s*(eight|8)\s+themes\b/i);
  });
});

describe("ColophonPage four kinds of question", () => {
  const GUARDRAILS_Q = "What have you written about guardrails?";
  const LITELLM_Q = "How do I use LiteLLM, Helm and Nginx?";
  const BROAD_Q = "How would you design production-ready agents?";
  const LANGGRAPH_Q = "Have you used LangGraph?";

  function block(): HTMLElement {
    render(<ColophonPage />);
    const heading = screen.getByText(/four kinds of question/i);
    return (heading.closest("section") ?? document.body) as HTMLElement;
  }

  it("lists four kinds of question with their route", () => {
    const section = block();
    const text = section.textContent ?? "";

    expect(text).toMatch(/Four kinds of question/i);
    expect(text).toContain(GUARDRAILS_Q);
    expect(text).toContain(LITELLM_Q);
    expect(text).toContain(BROAD_Q);
    expect(text).toContain(LANGGRAPH_Q);
    expect(text).toContain('search_writing(["LiteLLM", "Helm", "Nginx"])');
  });

  it("the production-ready row says GPT splits it and opens each part with its own read_writing call, with no search", () => {
    const section = block();
    const cell = within(section).getByText(BROAD_Q);
    const row = cell.closest("tr") ?? cell.parentElement!;

    expect(row.textContent ?? "").toMatch(/No search/);
    expect(row.textContent ?? "").toMatch(/GPT splits it into parts/);
    expect(row.textContent ?? "").toMatch(/opens each part with its own read_writing call/);
  });

  it("the LangGraph row gives my record first, then search_writing", () => {
    const section = block();
    const cell = within(section).getByText(LANGGRAPH_Q);
    const row = cell.closest("tr") ?? cell.parentElement!;
    const text = row.textContent ?? "";

    expect(text).toMatch(/My record first/);
    expect(text.indexOf("My record first")).toBeLessThan(text.indexOf("search_writing"));
  });
});

describe("ColophonPage LiteLLM route is one call", () => {
  it("the LiteLLM row says it is one call with three searches inside it", () => {
    render(<ColophonPage />);
    const heading = screen.getByText(/four kinds of question/i);
    const section = (heading.closest("section") ?? document.body) as HTMLElement;
    const cell = within(section).getByText("How do I use LiteLLM, Helm and Nginx?");
    const row = cell.closest("tr") ?? cell.parentElement!;

    expect(row.textContent ?? "").toMatch(/one call/i);
    expect(row.textContent ?? "").toMatch(/three searches inside it/i);
  });
});

describe("ColophonPage names each Jev operation", () => {
  it("walkthrough names the Jev operation at each Jev step", () => {
    render(<ColophonPage />);
    const text = document.body.textContent ?? "";

    expect(text).toContain("Jev filter (noul)");
    expect(text).toContain("Jev rank (score)");
    expect(text).toContain("Jev sections (score)");
  });
});

describe("ColophonPage used-my-record row", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
  });

  it("renders the Used my record row with its percent when recordAccuracy is a number", () => {
    jest.mocked(loadScorecard).mockReturnValue({ ...scorecard, recordAccuracy: 0.75 });
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { name: /how it.s tested/i }).closest("section") as HTMLElement;
    const label = within(section).getByText("Used my record");
    const cell = label.closest("div") as HTMLElement;

    expect(within(cell).getByText("75%")).toBeInTheDocument();
    expect(within(cell).getByText("Experience questions answered with when and where I used it")).toBeInTheDocument();
  });

  it("places the Used my record row before Abstain accuracy", () => {
    jest.mocked(loadScorecard).mockReturnValue({ ...scorecard, recordAccuracy: 0.5 });
    render(<ColophonPage />);

    const labels = Array.from(document.querySelectorAll("dt")).map((dt) => dt.textContent ?? "");
    expect(labels.indexOf("Used my record")).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf("Used my record")).toBe(labels.indexOf("Abstain accuracy") - 1);
  });

  it("shows 0% and 100% for the extremes rather than dropping the row", () => {
    const rowFor = (value: number) => {
      jest.mocked(loadScorecard).mockReturnValue({ ...scorecard, recordAccuracy: value });
      const view = render(<ColophonPage />);
      const cell = screen.getByText("Used my record").closest("div") as HTMLElement;
      return { cell, unmount: view.unmount };
    };

    const zero = rowFor(0);
    expect(within(zero.cell).getByText("0%")).toBeInTheDocument();
    zero.unmount();

    const one = rowFor(1);
    expect(within(one.cell).getByText("100%")).toBeInTheDocument();
    one.unmount();
  });

  it("is absent when recordAccuracy is null, and the rest of the scorecard still renders", () => {
    jest.mocked(loadScorecard).mockReturnValue({ ...scorecard, recordAccuracy: null });
    render(<ColophonPage />);

    expect(screen.queryByText("Used my record")).not.toBeInTheDocument();
    expect(screen.getByText("Abstain accuracy")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
  });
});

// A small recording: one search, one answer. The page only needs its shape; the panel's behaviour is tested in TryIt.test.tsx.
const recording: Recording = {
  id: "search",
  question: "Have you used LangChain and LangGraph?",
  recordedAt: "2026-11-24T08:00:00.000Z",
  models: { gpt: "gpt-6-luna", jev: "jev-1" },
  totalMs: 3000,
  spans: [
    { id: 0, parent: null, name: "copilot-chat", kind: "chain", start: 0, end: 3000, inputs: {}, outputs: {} },
    {
      id: 1,
      parent: 0,
      name: "gpt round 1",
      kind: "llm",
      start: 0,
      end: 500,
      inputs: { question: "Have you used LangChain and LangGraph?", tools: ["search_writing"] },
      outputs: { calls: [{ name: "search_writing", arguments: { topics: ["LangChain"], more: false } }], text: "" },
    },
    {
      id: 2,
      parent: 0,
      name: "search_writing",
      kind: "tool",
      start: 500,
      end: 1500,
      inputs: { topics: ["LangChain"], more: false },
      outputs: { articles: [{ n: 1, title: "Agents with LangGraph", url: "https://medium.com/@tituslhy/agents", published: "2025-03-01" }] },
    },
    {
      id: 3,
      parent: 0,
      name: "gpt round 2",
      kind: "llm",
      start: 1500,
      end: 3000,
      inputs: { toolResults: 1, tools: [] },
      outputs: { calls: [], text: "Yes." },
    },
  ],
  answer: "Yes.",
  actions: [],
  sources: [],
};

const TRY_IT_REGION = "Try it: a recorded reply, replayed";
const WALKTHROUGH_STAGE = "The request clears the origin check, the rate limit and the size limits before any model sees it.";
const STILL_CAPTION = "One question: “What have you written about guardrails?”";

describe("ColophonPage with a recorded reply (TryIt branch)", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
    jest.mocked(loadColophonTraces).mockReturnValue([recording]);
  });

  it("loads the recordings from the trace loader", () => {
    render(<ColophonPage />);

    expect(loadColophonTraces).toHaveBeenCalled();
  });

  it("renders the Try it panel before the anatomy section, not inside it", () => {
    render(<ColophonPage />);

    const anatomy = screen.getByRole("heading", { level: 2, name: /anatomy of a reply/i }).closest("section")!;
    const panel = screen.getByRole("region", { name: TRY_IT_REGION });
    expect(anatomy.contains(panel)).toBe(false);
    expect(panel.compareDocumentPosition(anatomy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "▶ Watch a real reply" })).toBeInTheDocument();
  });

  it("says the stage above replays a real reply in the anatomy intro", () => {
    render(<ColophonPage />);

    const anatomy = screen.getByRole("heading", { level: 2, name: /anatomy of a reply/i }).closest("section")!;
    expect(within(anatomy).getByText(/The stage above replays a real reply/)).toBeInTheDocument();
  });

  it("says nothing here calls a model", () => {
    render(<ColophonPage />);

    expect(screen.getByText(/Nothing there calls a model\./)).toBeInTheDocument();
  });

  it("drops the walkthrough list and its one-question caption", () => {
    render(<ColophonPage />);

    expect(screen.queryByText(WALKTHROUGH_STAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(STILL_CAPTION)).not.toBeInTheDocument();
  });

  it("draws the diagram on the stage inside the panel, in both SVGs", () => {
    render(<ColophonPage />);

    const panel = screen.getByRole("region", { name: TRY_IT_REGION });
    expect(panel.querySelectorAll("figure.reply-stage")).toHaveLength(1);
    expect(panel.querySelectorAll('svg[role="img"]')).toHaveLength(2);
  });

  it("keeps the rest of the anatomy copy: four kinds of question and reading in pages", () => {
    render(<ColophonPage />);

    expect(screen.getByText(/four kinds of question/i)).toBeInTheDocument();
    expect(screen.getByText(/reading in pages/i)).toBeInTheDocument();
  });

  it("the panel's first chip is the recorded question, pressed", () => {
    render(<ColophonPage />);

    const panel = screen.getByRole("region", { name: TRY_IT_REGION });
    expect(within(panel).getByRole("button", { name: recording.question, pressed: true })).toBeInTheDocument();
  });
});

describe("ColophonPage without a recorded reply (static branch)", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
    jest.mocked(loadColophonTraces).mockReturnValue(null);
  });

  it("renders the still diagram and the walkthrough list, and no Try it panel", () => {
    render(<ColophonPage />);

    expect(screen.queryByRole("region", { name: TRY_IT_REGION })).not.toBeInTheDocument();
    expect(screen.getByText(WALKTHROUGH_STAGE)).toBeInTheDocument();
    expect(screen.getByText(STILL_CAPTION)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here calls a model/)).not.toBeInTheDocument();
  });

  it("renders the still diagram with no replay state on its boxes", () => {
    const { container } = render(<ColophonPage />);

    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(2);
    expect(container.querySelectorAll("[data-state]")).toHaveLength(0);
  });
});

describe("ColophonPage short version", () => {
  beforeEach(() => {
    jest.mocked(loadScorecard).mockReturnValue(null);
    jest.mocked(loadColophonTraces).mockReturnValue(null);
  });

  it("sets the short version as plain text, with no drop cap", () => {
    render(<ColophonPage />);

    const text = screen.getByText(/It speaks as me, from the same data/);
    expect(text.tagName).toBe("P");
    expect(text.childElementCount).toBe(0);
  });
});
