import { render, screen } from "@testing-library/react";
import About from "./About";

describe("About", () => {
  it("should render section with lede id", () => {
    const { container } = render(<About />);
    const section = container.querySelector("section#lede");
    expect(section).toBeInTheDocument();
  });

  it("should render section heading with correct text", () => {
    render(<About />);
    const heading = screen.getByRole("heading", { name: /a note on the work i take on/i });
    expect(heading).toBeInTheDocument();
  });

  it("should render section marker with '01'", () => {
    render(<About />);
    expect(screen.getByText("01")).toBeInTheDocument();
  });

  it("should render section label 'About'", () => {
    render(<About />);
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("should render amber-colored 'work' emphasis in heading", () => {
    const { container } = render(<About />);
    const emElement = container.querySelector("h2 em");
    expect(emElement).toHaveClass("text-amber");
    expect(emElement).toHaveClass("italic");
    expect(emElement).toHaveTextContent("work");
  });

  it("should render drop cap letter M at start of body", () => {
    const { container } = render(<About />);
    const dropCap = container.querySelector("span.float-left");
    expect(dropCap).toBeInTheDocument();
    expect(dropCap).toHaveTextContent("M");
  });

  it("should render main body text about experience", () => {
    render(<About />);
    expect(screen.getByText(/ore than eight years building ai systems in banking, biotech, and public sector/i)).toBeInTheDocument();
  });

  it("should render text about interesting problems", () => {
    render(<About />);
    expect(screen.getByText(/the interesting problems aren.t just the ai models/i)).toBeInTheDocument();
  });

  it("should render text about latency budgets", () => {
    render(<About />);
    expect(screen.getByText(/latency budgets, the stakeholder who doesn.t trust/i)).toBeInTheDocument();
  });

  it("should render text about research and production", () => {
    render(<About />);
    expect(screen.getByText(/the seam between research and production/i)).toBeInTheDocument();
  });

  it("should render text about publishing work", () => {
    render(<About />);
    expect(screen.getByText(/i publish what i build/i)).toBeInTheDocument();
  });

  it("should render text about sixty one articles", () => {
    render(<About />);
    // About and nested Passions both quote the article-count word form
    const articleCountElements = screen.getAllByText(/sixty one articles/i);
    expect(articleCountElements.length).toBeGreaterThan(0);
  });

  it("should render text about understanding concepts", () => {
    render(<About />);
    expect(screen.getByText(/i don.t understand it yet/i)).toBeInTheDocument();
  });

  it("should render Passions component", () => {
    render(<About />);
    // Passions should be present - check for its content
    expect(screen.getByText(/what drives me/i)).toBeInTheDocument();
  });

  it("should have correct styling on section", () => {
    const { container } = render(<About />);
    const section = container.querySelector("section#lede");
    expect(section).toHaveClass("text-ink");
  });

  it("should have grid layout with responsive columns", () => {
    const { container } = render(<About />);
    const grid = container.querySelector(".grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("min-[880px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]");
  });

  it("should render drop cap with serif font and amber color", () => {
    const { container } = render(<About />);
    const dropCap = container.querySelector("span.float-left");
    expect(dropCap).toHaveClass("font-serif");
    expect(dropCap).toHaveClass("text-amber");
  });

  it("should have proper section padding and margins", () => {
    const { container } = render(<About />);
    const contentDiv = container.querySelector(".mx-auto");
    expect(contentDiv).toHaveClass("max-w-[1280px]");
    expect(contentDiv).toHaveClass("px-[clamp(18px,4vw,56px)]");
  });

  it("should render main body paragraph content correctly", () => {
    const { container } = render(<About />);
    const paragraphs = container.querySelectorAll("div > p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it("should not render family details", () => {
    render(<About />);
    expect(screen.queryByText(/wife|daughter|family|kids|children|spouse/i)).not.toBeInTheDocument();
  });
});
