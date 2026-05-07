import { render, screen } from "@testing-library/react";
import TechStack from "./TechStack";

describe("TechStack", () => {
  it("should render stack section heading and subtitle", () => {
    // Arrange
    render(<TechStack />);

    // Act
    const heading = screen.getByRole("heading", { name: /what i work with/i });
    const subtitle = screen.getByText(/tools i've shipped to production/i);

    // Assert
    expect(heading).toBeInTheDocument();
    expect(subtitle).toBeInTheDocument();
  });

  it("should render all stack category labels", () => {
    // Arrange
    render(<TechStack />);

    // Assert
    expect(screen.getByText(/ai\/genai frameworks/i)).toBeInTheDocument();
    expect(screen.getByText(/languages/i)).toBeInTheDocument();
    expect(screen.getByText(/devops/i)).toBeInTheDocument();
    expect(screen.getByText(/databases/i)).toBeInTheDocument();
    expect(screen.getByText(/observability/i)).toBeInTheDocument();
    expect(screen.getByText(/^cloud$/i)).toBeInTheDocument();
  });

  it("should render representative technologies across categories", () => {
    // Arrange
    render(<TechStack />);

    // Assert
    expect(screen.getByText("LangChain")).toBeInTheDocument();
    expect(screen.getByText("Python (Expert)")).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Grafana")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });
});
