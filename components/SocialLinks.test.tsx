import { render, screen } from "@testing-library/react";
import SocialLinks from "./SocialLinks";

describe("SocialLinks", () => {
  it("should render all five social link cards", () => {
    // Arrange
    render(<SocialLinks />);

    // Assert
    expect(screen.getByRole("link", { name: /github/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /linkedin/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /buy me a coffee/i })).toBeInTheDocument();
  });

  it("should render icons for each social card", () => {
    // Arrange
    render(<SocialLinks />);

    // Act & Assert
    const githubLink = screen.getByRole("link", { name: /github/i });
    const linkedinLink = screen.getByRole("link", { name: /linkedin/i });
    const mediumLink = screen.getByRole("link", { name: /medium/i });
    const emailLink = screen.getByRole("link", { name: /email/i });
    const coffeeLink = screen.getByRole("link", { name: /buy me a coffee/i });

    expect(githubLink.querySelector("svg")).toBeInTheDocument();
    expect(linkedinLink.querySelector("svg")).toBeInTheDocument();
    expect(mediumLink.querySelector("svg")).toBeInTheDocument();
    expect(emailLink.querySelector("svg")).toBeInTheDocument();
    expect(coffeeLink.querySelector("svg")).toBeInTheDocument();
  });

  it("should render card labels with accent color", () => {
    // Arrange
    render(<SocialLinks />);

    // Assert
    const labels = screen.getAllByText(/GitHub|LinkedIn|Medium|Email|Buy Me a Coffee/i);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      if (label.textContent === "GitHub" || label.textContent === "LinkedIn" ||
          label.textContent === "Medium" || label.textContent === "Email" ||
          label.textContent === "Buy Me a Coffee") {
        expect(label).toHaveStyle("color: #F59E0B");
      }
    });
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

  it("should render Buy Me a Coffee with correct href", () => {
    // Arrange
    render(<SocialLinks />);

    // Act
    const coffeeLink = screen.getByRole("link", { name: /buy me a coffee/i });

    // Assert
    expect(coffeeLink).toHaveAttribute("href", "https://buymeacoffee.com/tituslhy");
    expect(coffeeLink).toHaveAttribute("target", "_blank");
    expect(coffeeLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should render email icon with outline style", () => {
    // Arrange
    render(<SocialLinks />);

    // Act
    const emailLink = screen.getByRole("link", { name: /email/i });
    const emailSvg = emailLink.querySelector("svg");

    // Assert
    expect(emailSvg).toHaveAttribute("fill", "none");
    expect(emailSvg).toHaveAttribute("stroke", "currentColor");
  });

  it("should render steam SVG inside Buy Me a Coffee card", () => {
    // Arrange
    render(<SocialLinks />);

    // Act
    const coffeeLink = screen.getByRole("link", { name: /buy me a coffee/i });
    const steamPaths = coffeeLink.querySelectorAll(".bmc-steam-a, .bmc-steam-b");

    // Assert
    expect(steamPaths.length).toBeGreaterThan(0);
  });

  it("should render resume request section at bottom", () => {
    // Arrange
    const { container } = render(<SocialLinks />);

    // Assert
    const resumeText = screen.getByText(/resume available on request/i);
    expect(resumeText).toBeInTheDocument();

    // Find the resume email link in the footer specifically
    const resumeLink = container.querySelector('a[href*="subject=Resume"]') as HTMLAnchorElement;
    expect(resumeLink).toBeInTheDocument();
    expect(resumeLink).toHaveAttribute("href", expect.stringContaining("mailto:tituslhy@gmail.com"));
  });

  it("should render location footer", () => {
    // Arrange
    render(<SocialLinks />);

    // Assert
    expect(screen.getByText(/Titus Lim Hsien Yong · Singapore/i)).toBeInTheDocument();
  });
});
