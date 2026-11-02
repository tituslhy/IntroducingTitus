import { render, screen } from "@testing-library/react";
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
