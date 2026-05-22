import { render, screen } from "@testing-library/react";
import Passions from "./Passions";

describe("Passions", () => {
  it("should render section with passions id", () => {
    // Arrange
    const { container } = render(<Passions />);

    // Act
    const section = container.querySelector("section#passions");

    // Assert
    expect(section).toBeInTheDocument();
  });

  it("should render section heading and supporting copy", () => {
    // Arrange
    render(<Passions />);

    // Act
    const heading = screen.getByRole("heading", { name: /what drives me/i });
    const subtitle = screen.getByText(/beyond the job description/i);

    // Assert
    expect(heading).toBeInTheDocument();
    expect(subtitle).toBeInTheDocument();
  });

  it("should render all passion cards with numbered labels", () => {
    // Arrange
    render(<Passions />);

    // Assert
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
  });

  it("should render all passion text content", () => {
    // Arrange
    render(<Passions />);

    // Assert
    expect(screen.getByText(/shipping production ai that solves real problems/i)).toBeInTheDocument();
    expect(screen.getByText(/writing technical content that explains complex systems/i)).toBeInTheDocument();
    expect(screen.getByText(/open-source contributions to the frameworks/i)).toBeInTheDocument();
    expect(screen.getByText(/closing the gap between ai research and engineering reality/i)).toBeInTheDocument();
  });

  it("should never render family content under any condition", () => {
    // Arrange
    render(<Passions />);

    // Assert
    expect(screen.queryByText(/wife|daughter|family|kids|children/i)).not.toBeInTheDocument();
  });

  it("should use proper styling for passion numbers", () => {
    // Arrange
    render(<Passions />);

    // Act
    const numberOne = screen.getByText("01");

    // Assert
    expect(numberOne).toHaveStyle("color: #F59E0B");
  });

  it("should render passion cards in a grid layout", () => {
    // Arrange
    const { container } = render(<Passions />);

    // Act
    const grid = container.querySelector(".grid");

    // Assert
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("md:grid-cols-2");
  });

  it("should render exactly 4 passion items", () => {
    // Arrange
    const { container } = render(<Passions />);

    // Act
    const cards = container.querySelectorAll(".grid > div");

    // Assert
    expect(cards.length).toBe(4);
  });
});
