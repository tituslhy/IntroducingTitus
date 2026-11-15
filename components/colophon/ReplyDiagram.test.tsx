import { render, screen } from "@testing-library/react";
import { MAX_ARTICLES_PER_REPLY, MAX_TOPICS, MIN_SCORE, RELEVANT, SECTION_BUDGET_CHARS, STAGE2_MAX } from "@/lib/search-config";
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

describe("ReplyDiagram either route, one call", () => {
  // The desktop SVG is hidden on mobile (class "hidden"); the mobile SVG is the one shown as a block.
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("marks the two routes as alternatives, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const texts = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent?.trim());
      expect(texts).toContain("or");
    }
  });

  it("says one search_writing call searches every topic, in each SVG", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    expect(desktopSvg(container).textContent ?? "").toContain("one call: each topic searched separately");
    expect(mobileSvg(container).textContent ?? "").toContain(`1 call, ≤${MAX_TOPICS} searches`);
  });

  it("the description says one route per call, and a reply can use both", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("one route per call");
      expect(label).toContain("a reply can use both");
      expect(label).toMatch(/in one call/i);
    }
  });
});

describe("ReplyDiagram names Jev's operations", () => {
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("the rank box says score × top N, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      expect(svg.textContent ?? "").toContain(`score × top ${STAGE2_MAX}`);
    }
  });

  it("the sections box says score per section and what it keeps, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const text = svg.textContent ?? "";
      expect(text).toContain("score × each section");
      expect(text).toContain(`keeps the best sections, ≤ ${SECTION_BUDGET_CHARS.toLocaleString("en-GB")} chars an article`);
    }
  });

  it("pass labels say what is measured, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const text = svg.textContent ?? "";
      expect(text).toContain(`p(yes) ≥ ${RELEVANT}`);
      expect(text).toContain(`≥ ${MIN_SCORE.toFixed(1)} of 3`);
    }
  });

  it("the description names noul and score, and each section", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("noul");
      expect(label).toContain("score");
      expect(label).toContain("each section");
    }
  });
});
