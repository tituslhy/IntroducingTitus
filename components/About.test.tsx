import { render, screen } from "@testing-library/react";
import { TOOLS, toolMatcher } from "@/lib/about";
import { pageFolio } from "@/lib/profile";
import About, { DRIVES, toolArticleCounts } from "./About";

// A small, known corpus so the article counts are deterministic.
jest.mock("@/lib/articles", () => ({
  ARTICLES: [
    {
      slug: "a",
      title: "Building with Python and LangChain",
      body: "Java is not here. JavaScript is not here either.",
      keywords: ["Docker"],
    },
    {
      slug: "b",
      title: "Kubernetes in practice",
      body: "We talk about LangChain again and Next.js.",
      keywords: ["Python"],
    },
    {
      slug: "c",
      title: "Notes",
      body: "Nothing to see. Next Js is a typo. nextjs works.",
      keywords: [],
    },
  ],
}));

const idx = (name: string) => TOOLS.findIndex((t) => t.name === name);

describe("About: section and header", () => {
  it("renders the lede section with its header and a back-to-top link in the marker row", () => {
    const { container } = render(<About />);
    const section = container.querySelector("section#lede");
    expect(section).toBeInTheDocument();
    expect(section).toHaveClass("text-ink");

    const marker = container.querySelector("section#lede header > div");
    const link = screen.getByRole("link", { name: /back to top/i });
    expect(marker).toContainElement(link);
    expect(link).toHaveAttribute("href", "#top");
  });

  it("shows the About folio and label in the marker row", () => {
    const { container } = render(<About />);
    const marker = container.querySelector("section#lede header > div");
    expect(marker).toContainElement(screen.getByText(pageFolio("/about")));
    expect(pageFolio("/about")).toBe("05");
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("renders the headline with 'code' emphasised in amber italics", () => {
    const { container } = render(<About />);
    expect(screen.getByRole("heading", { level: 2, name: /i swore i.d never write code/i })).toBeInTheDocument();
    const em = container.querySelector("h2 em");
    expect(em).toHaveTextContent("code");
    expect(em).toHaveClass("text-amber", "italic");
  });

  it("introduces the table as the tools picked up since 2015", () => {
    render(<About />);
    expect(screen.getByText(/i graduated in chemical engineering in 2015/i)).toBeInTheDocument();
  });
});

describe("About: the periodic table", () => {
  it("renders the table inside the lede section, not as a separate section", () => {
    const { container } = render(<About />);
    const stack = container.querySelector("#stack");
    expect(stack).toBeInTheDocument();
    expect(container.querySelector("section#lede #stack")).toBeInTheDocument();
    expect(container.querySelector("section#stack")).toBeNull();
  });

  it("renders one labelled tool button per tool", () => {
    render(<About />);
    const tools = screen.getAllByRole("button", { name: /^\d+, .+, since [A-Z][a-z]{2} \d{4}$/ });
    expect(tools).toHaveLength(TOOLS.length);
  });

  it("starts with the timeline's first month and the Play control", () => {
    render(<About />);
    expect(screen.getByText("Jun 2015", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Timeline" })).toBeInTheDocument();
  });
});

describe("About: what drives me", () => {
  it("has a 'What drives me' label above four driver cards", () => {
    const { container } = render(<About />);
    expect(screen.getByText(/what drives me/i)).toBeInTheDocument();
    expect(DRIVES).toHaveLength(4);
    expect(container.querySelectorAll("section#lede ol.grid > li")).toHaveLength(4);
  });

  it("renders every driver's title and numbered marker", () => {
    render(<About />);
    for (const d of DRIVES) {
      expect(screen.getByRole("heading", { level: 3, name: d.title })).toBeInTheDocument();
      expect(screen.getByText(d.n)).toBeInTheDocument();
    }
  });

  it("gives every driver a title and body", () => {
    for (const d of DRIVES) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the article count word in the second driver", () => {
    render(<About />);
    expect(screen.getByText(/sixty.five articles because future-me will forget/i)).toBeInTheDocument();
  });
});

describe("About: ask pill", () => {
  it("closes the section with an 'Ask about how I got here' pill", () => {
    render(<About />);
    expect(screen.getByRole("button", { name: /ask about how i got here/i })).toBeInTheDocument();
  });
});

describe("About: toolArticleCounts", () => {
  it("returns one count per tool, in table order, all non-negative integers", () => {
    const counts = toolArticleCounts();
    expect(counts).toHaveLength(TOOLS.length);
    for (const c of counts) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts an article once for each tool it mentions, in title, body or keywords", () => {
    const counts = toolArticleCounts();
    expect(counts[idx("Python")]).toBe(2); // title of a, keyword of b
    expect(counts[idx("LangChain")]).toBe(2); // title of a, body of b
    expect(counts[idx("Docker")]).toBe(1); // keyword of a
    expect(counts[idx("Kubernetes")]).toBe(1); // title of b, via its explicit matcher
  });

  it("counts Java only as the whole word, not JavaScript", () => {
    const counts = toolArticleCounts();
    expect(counts[idx("Java")]).toBe(1); // "Java is not here." in a
    expect(counts[idx("JavaScript")]).toBe(1); // default matcher, in a
  });

  it("counts Next.js with its explicit matcher: 'Next.js' and 'nextjs', not 'Next Js'", () => {
    expect(toolArticleCounts()[idx("Next.js")]).toBe(2);
  });

  it("counts nothing for a tool whose name is too common a word to count", () => {
    expect(toolMatcher(TOOLS[idx("Excel")])).toBeNull();
    expect(toolArticleCounts()[idx("Excel")]).toBe(0);
  });
});

describe("About: content", () => {
  it("does not render family details", () => {
    const { container } = render(<About />);
    expect(container.textContent ?? "").not.toMatch(/wife|daughter|family|kids|children|spouse/i);
  });
});
