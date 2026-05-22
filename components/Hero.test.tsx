import { render, screen } from "@testing-library/react";
import Hero from "./Hero";

describe("Hero", () => {
  it("should render headshot image with accessible alt text", () => {
    // Arrange
    render(<Hero />);

    // Act
    const image = screen.getByRole("img", { name: /titus lim/i });

    // Assert
    expect(image).toBeInTheDocument();
  });

  it("should render headshot with amber glow accent", () => {
    // Arrange
    render(<Hero />);

    // Act
    const image = screen.getByRole("img", { name: /titus lim/i });

    // Assert
    expect(image).toBeInTheDocument();
    const headshot = image.parentElement;
    expect(headshot).toHaveStyle({ boxShadow: "0 0 0 3px #F59E0B, 0 0 30px rgba(245, 158, 11, 0.25)" });
  });

  it("should render key cta links", () => {
    // Arrange
    render(<Hero />);

    // Act
    const experienceCta = screen.getByRole("link", { name: /view experience/i });
    const writingCta = screen.getByRole("link", { name: /read writing/i });

    // Assert
    expect(experienceCta).toHaveAttribute("href", "#experience");
    expect(writingCta).toHaveAttribute("href", "#writing");
  });

  it("should render social icons in a horizontal row", () => {
    // Arrange
    render(<Hero />);

    // Act
    const githubLink = screen.getByTitle("GitHub");
    const linkedinLink = screen.getByTitle("LinkedIn");
    const mediumLink = screen.getByTitle("Medium");
    const coffeeLink = screen.getByTitle("Buy Me a Coffee");

    // Assert
    expect(githubLink).toBeInTheDocument();
    expect(linkedinLink).toBeInTheDocument();
    expect(mediumLink).toBeInTheDocument();
    expect(coffeeLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should render social icons with SVG and no text labels", () => {
    // Arrange
    render(<Hero />);

    // Act
    const githubLink = screen.getByTitle("GitHub");

    // Assert
    // SVG should be inside the link
    expect(githubLink.querySelector("svg")).toBeInTheDocument();
  });

  it("should render resume link as mailto with new text", () => {
    // Arrange
    render(<Hero />);

    // Act
    const resumeLink = screen.getByRole("link", { name: /resume on request/i });

    // Assert
    expect(resumeLink).toHaveAttribute("href", expect.stringContaining("mailto:tituslhy@gmail.com"));
    expect(resumeLink).not.toHaveAttribute("href", expect.stringMatching(/\.pdf/i));
  });

  it("should render name and tagline with proper accent color", () => {
    // Arrange
    render(<Hero />);

    // Act
    const nameHeading = screen.getByRole("heading", { name: /lim hsien yong/i });
    const titusSpan = screen.getByText(/\(titus\)/i);

    // Assert
    expect(nameHeading).toBeInTheDocument();
    expect(titusSpan).toBeInTheDocument();
    expect(titusSpan).toHaveStyle("color: #F59E0B");
  });

  it("should render all role label and taglines", () => {
    // Arrange
    render(<Hero />);

    // Assert
    expect(screen.getByText(/genai engineer & architect/i)).toBeInTheDocument();
    expect(screen.getByText(/i build ai systems/i)).toBeInTheDocument();
    expect(screen.getByText(/8\+ years building production ai/i)).toBeInTheDocument();
  });
});
