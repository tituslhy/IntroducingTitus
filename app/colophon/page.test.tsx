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
});
