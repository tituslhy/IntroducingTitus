import { render, screen, within } from "@testing-library/react";
import { loadScorecard, type Scorecard } from "@/lib/eval-results";
import ColophonPage, { metadata } from "./page";

jest.mock("@/lib/eval-results", () => ({
  loadScorecard: jest.fn(() => null),
}));

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

  it("links back to the home page", () => {
    render(<ColophonPage />);

    expect(screen.getByRole("link", { name: /back to the site/i })).toHaveAttribute("href", "/");
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

describe("ColophonPage topics copy", () => {
  it("walkthrough calls search_writing with a list of topics", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/search_writing\(\[/);
  });

  it("reading in pages says three at a time", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").toMatch(/three at a time/i);
  });

  it("guardrails row says at most six articles a reply", () => {
    render(<ColophonPage />);

    const section = screen.getByRole("heading", { level: 2, name: /guardrails/i }).closest("section")!;
    const rows = within(within(section).getByRole("table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.some((text) => /at most six articles/i.test(text))).toBe(true);
    expect(rows.some((text) => /at most four articles|at four articles/i.test(text))).toBe(false);
  });
});

describe("ColophonPage three tools and themes", () => {
  it("stack section says Three tools, not Two tools", () => {
    render(<ColophonPage />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Three tools/);
    expect(text).not.toMatch(/Two tools/);
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

describe("ColophonPage theme count", () => {
  it("never states a theme count no script produced", () => {
    render(<ColophonPage />);

    expect(document.body.textContent ?? "").not.toMatch(/\b(about|around|roughly)?\s*(eight|8)\s+themes\b/i);
  });
});
