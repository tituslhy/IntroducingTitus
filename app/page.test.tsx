import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("should render key homepage sections", () => {
    // Arrange
    render(<Home />);

    // Assert
    expect(screen.getByRole("heading", { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /writing/i })).toBeInTheDocument();
    expect(screen.getByText(/what i work with/i)).toBeInTheDocument();
    expect(screen.getByText(/what drives me/i)).toBeInTheDocument();
    expect(screen.getByText(/get in touch/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /experience/i })).toBeInTheDocument();
  });
});
