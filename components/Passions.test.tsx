import { render, screen } from "@testing-library/react";
import Passions from "./Passions";

describe("Passions", () => {
  it("should render aside element", () => {
    const { container } = render(<Passions />);
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
  });

  it("should render section heading 'What drives me'", () => {
    render(<Passions />);
    const heading = screen.getByText(/what drives me/i);
    expect(heading).toBeInTheDocument();
  });

  it("should render all passion cards with correct numbering", () => {
    render(<Passions />);
    expect(screen.getByText("i.")).toBeInTheDocument();
    expect(screen.getByText("ii.")).toBeInTheDocument();
    expect(screen.getByText("iii.")).toBeInTheDocument();
    expect(screen.getByText("iv.")).toBeInTheDocument();
  });

  it("should render first passion about production AI", () => {
    render(<Passions />);
    const title = screen.getByRole("heading", { name: /ai that meets felt needs/i });
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/demos answer whether you can build the concept/i)).toBeInTheDocument();
  });

  it("should render second passion about writing", () => {
    render(<Passions />);
    const title = screen.getByRole("heading", { name: /writing as external memory/i });
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/sixty one articles because future-me will forget/i)).toBeInTheDocument();
  });

  it("should render third passion about open source", () => {
    render(<Passions />);
    const title = screen.getByRole("heading", { name: /open source as paying rent/i });
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/contributions to LlamaIndex, Unsloth, IBM ACP, Chainlit, Giskard/i)).toBeInTheDocument();
  });

  it("should render fourth passion about AI legibility", () => {
    render(<Passions />);
    const title = screen.getByRole("heading", { name: /making ai legible to the people/i });
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/most ai projects die in the gap between what the system can do/i)).toBeInTheDocument();
  });

  it("should render exactly 4 passion list items", () => {
    const { container } = render(<Passions />);
    const listItems = container.querySelectorAll("ol li");
    expect(listItems).toHaveLength(4);
  });

  it("should render passion numbers in amber color", () => {
    const { container } = render(<Passions />);
    const numbers = container.querySelectorAll("span.text-amber");
    expect(numbers.length).toBeGreaterThan(0);
  });

  it("should not render family content", () => {
    render(<Passions />);
    expect(screen.queryByText(/wife|daughter|family|kids|children/i)).not.toBeInTheDocument();
  });

  it("should render passions in ordered list", () => {
    const { container } = render(<Passions />);
    const orderedList = container.querySelector("ol");
    expect(orderedList).toBeInTheDocument();
  });

  it("should have grid layout with 38px span for numbers", () => {
    const { container } = render(<Passions />);
    const listItems = container.querySelectorAll("li");
    listItems.forEach(item => {
      expect(item).toHaveClass("grid");
      expect(item).toHaveClass("grid-cols-[38px_1fr]");
    });
  });

  it("should render passion titles as h3 headings", () => {
    const { container } = render(<Passions />);
    const headings = container.querySelectorAll("h3");
    expect(headings.length).toBe(4);
  });

  it("should apply border styling to passion items", () => {
    const { container } = render(<Passions />);
    const listItems = container.querySelectorAll("li");
    listItems.forEach((item, index) => {
      expect(item).toHaveClass("border-t");
      expect(item).toHaveClass("border-rule");
      if (index === 0) {
        expect(item).toHaveClass("first:border-t-0");
      }
    });
  });
});
