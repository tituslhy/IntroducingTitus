import { render, screen } from "@testing-library/react";
import Footer from "./Footer";
import { SIGN_OFF_TITLE } from "@/lib/profile";

describe("Footer", () => {
  it("should render footer with colophon id", () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector("footer#colophon");
    expect(footer).toBeInTheDocument();
  });

  it("should render brand name", () => {
    render(<Footer />);
    expect(screen.getByText("Titus Lim")).toBeInTheDocument();
  });

  it("should render brand tagline", () => {
    render(<Footer />);
    expect(screen.getByText(SIGN_OFF_TITLE)).toBeInTheDocument();
    expect(SIGN_OFF_TITLE).toBe("Lead AI Engineer");
  });

  it("should render GitHub social link with correct href", () => {
    render(<Footer />);
    const githubLink = screen.getByRole("link", { name: /github/i });
    expect(githubLink).toHaveAttribute("href", "https://github.com/tituslhy");
  });

  it("should render LinkedIn social link with correct href", () => {
    render(<Footer />);
    const linkedinLink = screen.getByRole("link", { name: /linkedin/i });
    expect(linkedinLink).toHaveAttribute("href", "https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/");
  });

  it("should render Medium social link with correct href", () => {
    render(<Footer />);
    const mediumLink = screen.getByRole("link", { name: /medium/i });
    expect(mediumLink).toHaveAttribute("href", "https://medium.com/@tituslhy");
  });

  it("should render Coffee link with correct href", () => {
    render(<Footer />);
    const coffeeLink = screen.getByRole("link", { name: /coffee/i });
    expect(coffeeLink).toHaveAttribute("href", "https://buymeacoffee.com/tituslhy");
  });

  it("should render Email link with correct mailto href", () => {
    render(<Footer />);
    const emailLink = screen.getByRole("link", { name: /email/i });
    expect(emailLink).toHaveAttribute("href", "mailto:tituslhy@gmail.com");
  });

  it("should render all social link text labels", () => {
    render(<Footer />);
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("linkedin")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("coffee")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("should render resume text", () => {
    render(<Footer />);
    expect(screen.getByText("Resume on request")).toBeInTheDocument();
  });

  it("should render email address as link in resume section", () => {
    render(<Footer />);
    const emailLink = screen.getByRole("link", { name: /tituslhy@gmail.com/i });
    expect(emailLink).toHaveAttribute("href", "mailto:tituslhy@gmail.com?subject=Resume Request");
  });

  it("should render copyright text", () => {
    render(<Footer />);
    expect(screen.getByText(/© 2026 Lim Hsien Yong \(Titus\)/)).toBeInTheDocument();
  });

  it("should render Singapore location", () => {
    render(<Footer />);
    expect(screen.getByText("Singapore")).toBeInTheDocument();
  });

  it("should have footer navigation with correct aria-label", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: /footer/i });
    expect(nav).toBeInTheDocument();
  });

  it("should render external social links with target blank", () => {
    render(<Footer />);
    const githubLink = screen.getByRole("link", { name: /github/i });
    const linkedinLink = screen.getByRole("link", { name: /linkedin/i });
    const mediumLink = screen.getByRole("link", { name: /medium/i });

    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(linkedinLink).toHaveAttribute("target", "_blank");
    expect(mediumLink).toHaveAttribute("target", "_blank");
  });

  it("should render external links with noopener noreferrer", () => {
    render(<Footer />);
    const githubLink = screen.getByRole("link", { name: /github/i });
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should have proper footer styling classes", () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector("footer#colophon");
    expect(footer).toHaveClass("text-ink");
    expect(footer).toHaveClass("mx-auto");
    expect(footer).toHaveClass("max-w-[1280px]");
  });

  it("should render social links in a nav element", () => {
    const { container } = render(<Footer />);
    const navs = container.querySelectorAll("nav");
    expect(navs.length).toBeGreaterThan(0);
    const socialNav = Array.from(navs).find(nav => nav.getAttribute("aria-label") === "Footer");
    expect(socialNav).toBeInTheDocument();
  });

  it("should have divider line at top of footer", () => {
    const { container } = render(<Footer />);
    const divider = container.querySelector("footer > div:first-child");
    expect(divider).toHaveClass("h-px");
    expect(divider).toHaveClass("bg-ink");
  });

  it("should render footer in grid layout", () => {
    const { container } = render(<Footer />);
    const grid = container.querySelector("footer .grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("min-[880px]:grid-cols-[auto_1fr_auto]");
  });

  it("should not expose private email in plain text on social links", () => {
    const { container } = render(<Footer />);
    const emailLinks = screen.getAllByRole("link", { name: /email/i });
    emailLinks.forEach(link => {
      expect(link).toHaveAttribute("href");
      const href = link.getAttribute("href");
      expect(href).toMatch(/^mailto:/);
    });
  });

  it("should render exactly 5 social links", () => {
    const { container } = render(<Footer />);
    const socialNav = container.querySelector('nav[aria-label="Footer"]');
    const links = socialNav?.querySelectorAll("a") || [];
    expect(links).toHaveLength(5);
  });

  it("should render meta information with proper styling", () => {
    const { container } = render(<Footer />);
    const metaDiv = container.querySelector("footer > div:last-child");
    expect(metaDiv).toHaveClass("border-t");
    expect(metaDiv).toHaveClass("border-rule");
  });
});

describe("Footer colophon link", () => {
  it("links How the assistant works to /colophon", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: /how the assistant works/i })).toHaveAttribute("href", "/colophon");
  });
});
