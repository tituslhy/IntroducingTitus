import { render, screen } from "@testing-library/react";
import SocialLinks from "./SocialLinks";

describe("SocialLinks", () => {
  it("should render all social link cards", () => {
    // Arrange
    render(<SocialLinks />);

    // Assert
    expect(screen.getByRole("link", { name: /github/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /linkedin/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /email/i })).toBeInTheDocument();
  });

  it("should open external links in new tabs", () => {
    // Arrange
    render(<SocialLinks />);

    // Act
    const githubLink = screen.getByRole("link", { name: /github/i });

    // Assert
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should keep email link as mailto without target blank", () => {
    // Arrange
    render(<SocialLinks />);

    // Act
    const emailLink = screen.getByRole("link", { name: /email/i });

    // Assert
    expect(emailLink).toHaveAttribute("href", "mailto:tituslhy@gmail.com");
    expect(emailLink).not.toHaveAttribute("target");
  });
});
