import { render, screen } from "@testing-library/react";
import Passions from "./Passions";

describe("Passions", () => {
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

  it("should never render family content under any condition", () => {
    // Arrange
    render(<Passions />);

    // Assert
    expect(screen.queryByText(/wife|daughter|family|kids|children/i)).not.toBeInTheDocument();
  });
});
