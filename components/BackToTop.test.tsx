import { render, screen } from "@testing-library/react";
import BackToTop from "./BackToTop";

describe("BackToTop", () => {
  it("should render a link to the masthead", () => {
    render(<BackToTop />);
    const link = screen.getByRole("link", { name: /back to top/i });
    expect(link).toHaveAttribute("href", "#top");
  });

  it("should show visible text with the arrow hidden from assistive tech", () => {
    const { container } = render(<BackToTop />);
    expect(screen.getByRole("link").textContent).toContain("Back to top");
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).toBe("↑");
  });

  it("should use muted ink colour and contain no emoji", () => {
    render(<BackToTop />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("text-ink-soft");
    expect(link.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
