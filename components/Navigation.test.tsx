import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navigation from "./Navigation";

describe("Navigation", () => {
  it("should render all navigation labels", () => {
    // Arrange
    render(<Navigation />);

    // Act
    const labels = ["Home", "Experience", "Projects", "Writing", "Contact"];

    // Assert
    labels.forEach((label) => {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    });
  });

  it("should open mobile menu when toggle button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Navigation />);

    // Act
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    // Assert
    expect(screen.getAllByRole("link", { name: "Projects" }).length).toBeGreaterThan(1);
  });

  it("should close mobile menu when mobile nav link is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Navigation />);
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    // Act
    await user.click(screen.getAllByRole("link", { name: "Contact" })[1]);

    // Assert
    expect(screen.getAllByRole("link", { name: "Contact" }).length).toBe(1);
  });

  it("should apply scrolled nav styles when window scroll passes threshold", async () => {
    // Arrange
    render(<Navigation />);
    const nav = screen.getByRole("navigation");
    Object.defineProperty(window, "scrollY", {
      get: () => 50,
      configurable: true,
    });

    // Act
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    // Assert
    await waitFor(() => {
      expect(nav.className).toContain("bg-[#0a0a0a]/95");
    });
  });
});
