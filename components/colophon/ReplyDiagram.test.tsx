import { render, screen } from "@testing-library/react";
import { MAX_ARTICLES_PER_REPLY } from "@/lib/search-config";
import ReplyDiagram from "./ReplyDiagram";

describe("ReplyDiagram", () => {
  it("renders a desktop and a mobile SVG, each labelled as an image", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    const svgs = container.querySelectorAll('svg[role="img"]');
    expect(svgs).toHaveLength(2);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("describes the search_writing path and the article count in each label", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("search_writing");
      expect(label).toContain("65 articles");
    }
  });

  it("labels the agent loop, GPT, the tools and the round-trip arrows in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const text = svg.textContent ?? "";
      for (const label of ["AGENT LOOP", "≤4 rounds", "GPT", "TOOLS", "show_on_page", "search_writing", "calls", "results", "answer"]) {
        expect(text).toContain(label);
      }
      expect(text).toMatch(/article text back to GPT/);
    }
  });

  it("describes the round trip in each aria-label", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("the tool results go back to GPT for the next round, for at most four rounds");
    }
  });

  it("shows the filter box as noul × articleCount, using the count passed in", () => {
    render(<ReplyDiagram articleCount={12} />);

    expect(screen.getAllByText("noul × 12")).toHaveLength(2);
    expect(screen.queryByText("noul × 65")).not.toBeInTheDocument();
  });
});

describe("ReplyDiagram read_writing", () => {
  it("shows the read_writing tool in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      expect(svg.textContent ?? "").toContain("read_writing");
    }
  });
});

describe("ReplyDiagram search_writing topics", () => {
  it("labels the search tool search_writing(topics) and says it searches each topic separately", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      expect(svg.textContent ?? "").toContain("search_writing(topics)");
      expect(svg.getAttribute("aria-label") ?? "").toMatch(/each topic separately/i);
    }
  });
});

describe("ReplyDiagram two routes", () => {
  const svgsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('svg[role="img"]'));

  it("draws the topic split and the merge, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("topic 1");
      expect(text).toContain("merge");
      expect(text).toContain("round-robin");
    }
  });

  it("draws the library-map route with no search, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("read_writing");
      expect(text).toContain("library map");
      expect(text).toContain("no search");
    }
  });

  it("both routes meet at Jev sections, under the reply cap, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={12} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("Jev sections");
      expect(text).toContain(`≤${MAX_ARTICLES_PER_REPLY} articles a reply`);
    }
  });

  it("the description covers both routes", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("library map");
      expect(label).toContain("read_writing");
      expect(label).toContain("Jev sections");
      expect(label).toMatch(/merge/i);
    }
  });
});
