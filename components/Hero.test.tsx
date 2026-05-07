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

  it("should render resume link as mailto and never as pdf", () => {
    // Arrange
    render(<Hero />);

    // Act
    const resumeLink = screen.getByRole("link", { name: /resume available on request/i });

    // Assert
    expect(resumeLink).toHaveAttribute("href", expect.stringContaining("mailto:tituslhy@gmail.com"));
    expect(resumeLink).not.toHaveAttribute("href", expect.stringMatching(/\.pdf/i));
  });
});
