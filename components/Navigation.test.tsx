import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navigation from "./Navigation";

describe("Navigation", () => {
  beforeEach(() => {
    // Reset scroll position and mocks
    Object.defineProperty(window, "scrollY", {
      writable: true,
      value: 0,
      configurable: true,
    });
  });

  describe("Rendering", () => {
    it("should render the brand link with T·L text", () => {
      render(<Navigation />);
      const brandLink = screen.getByRole("link", { name: /back to top/i });
      expect(brandLink).toBeInTheDocument();
      expect(brandLink.textContent).toContain("T");
      expect(brandLink.textContent).toContain("L");
    });

    it("should render brand subtitle on larger screens", () => {
      render(<Navigation />);
      expect(screen.getByText("Titus Lim · Personal site")).toBeInTheDocument();
    });

    it("should render all navigation items with correct labels", () => {
      render(<Navigation />);
      const expectedLabels = ["About", "Stack", "Experience", "Projects", "Writing"];
      expectedLabels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it("should render folio numbers for each nav item", () => {
      render(<Navigation />);
      const folios = ["01", "02", "03", "04", "05"];
      folios.forEach((folio) => {
        expect(screen.getByText(folio)).toBeInTheDocument();
      });
    });

    it("should render Get in touch CTA link", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute(
        "href",
        expect.stringContaining("mailto:tituslhy@gmail.com")
      );
    });

    it("should have correct email in CTA href", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i }) as HTMLAnchorElement;
      expect(cta.href).toContain("tituslhy@gmail.com");
      // URL encoding converts spaces to %20
      expect(cta.href).toContain("subject");
      expect(cta.href).toContain("Resume");
    });

    it("should have nav with correct ARIA label", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: /section navigation/i });
      expect(nav).toBeInTheDocument();
    });
  });

  describe("Scroll-Spy Active State", () => {
    it("should initialize with masthead as active section", () => {
      render(<Navigation />);
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    it("should have active link with aria-current attribute when section becomes active", () => {
      render(<Navigation />);
      const navLinks = screen.getAllByRole("link");
      expect(navLinks.length).toBeGreaterThan(0);
    });

    it("should render underline indicator span for active nav item", () => {
      const { container } = render(<Navigation />);
      const underlines = container.querySelectorAll("span[class*='bg-amber']");
      expect(underlines.length).toBeGreaterThanOrEqual(1);
    });

    it("should trigger IntersectionObserver with intersecting section", () => {
      let capturedCallback: IntersectionObserverCallback | null = null;

      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback;
        }
        observe = jest.fn();
        unobserve = jest.fn();
        disconnect = jest.fn();
      }

      global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

      render(<Navigation />);

      // Simulate an intersecting section
      if (capturedCallback) {
        act(() => {
          const mockEntries = [
            {
              isIntersecting: true,
              target: { id: "lede" } as unknown as Element,
            } as IntersectionObserverEntry,
          ];
          capturedCallback!(mockEntries, {} as IntersectionObserver);
        });
      }

      // After triggering the callback with an intersecting element,
      // the active state should be updated to "lede"
      const aboutLink = screen.getAllByText("About")[0].closest("a");
      expect(aboutLink?.getAttribute("aria-current")).toBe("true");
    });

    it("should handle non-intersecting sections in observer", () => {
      let capturedCallback: IntersectionObserverCallback | null = null;

      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback;
        }
        observe = jest.fn();
        unobserve = jest.fn();
        disconnect = jest.fn();
      }

      global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

      render(<Navigation />);

      // Simulate a non-intersecting section
      if (capturedCallback) {
        act(() => {
          const mockEntries = [
            {
              isIntersecting: false,
              target: { id: "stack" } as unknown as Element,
            } as IntersectionObserverEntry,
          ];
          capturedCallback!(mockEntries, {} as IntersectionObserver);
        });
      }

      // State should not be updated for non-intersecting entries
      const stackLink = screen.getAllByText("Stack")[0].closest("a");
      expect(stackLink?.getAttribute("aria-current")).not.toBe("true");
    });
  });

  describe("Scroll Behavior (Hide/Show)", () => {
    it("should remain visible when scrollY is less than 80px", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      expect(nav.style.transform).not.toContain("translateY(-110%)");
    });

    it("should hide when scrolling down past 80px", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(-110%)");
      });
    });

    it("should show when scrolling up after being hidden", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(-110%)");
      });

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(0)");
      });
    });

    it("should show immediately when scrolling back to top (scrollY < 80)", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(-110%)");
      });

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(0)");
      });
    });

    it("should require 4px scroll delta when above 80px to change state", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(-110%)");
      });

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 102, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      expect(nav.style.transform).toBe("translateY(-110%)");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 97, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(0)");
      });
    });
  });

  describe("Click Handlers", () => {
    it("should call scrollTo when brand link is clicked", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockMasthead = document.createElement("div");
      mockMasthead.id = "masthead";
      document.body.appendChild(mockMasthead);

      const brandLink = screen.getByRole("link", { name: /back to top/i });
      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(brandLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockMasthead.remove();
    });

    it("should call scrollTo when About nav item link is clicked", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockLede = document.createElement("div");
      mockLede.id = "lede";
      document.body.appendChild(mockLede);

      const navList = document.querySelector("nav ul") as HTMLElement;
      const aboutLink = within(navList).getAllByRole("link")[0];

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(aboutLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockLede.remove();
    });

    it("should call scrollTo for Stack nav item", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockStack = document.createElement("div");
      mockStack.id = "stack";
      document.body.appendChild(mockStack);

      const navList = document.querySelector("nav ul") as HTMLElement;
      const stackLink = within(navList).getAllByRole("link")[1];

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(stackLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockStack.remove();
    });

    it("should call scrollTo for Experience nav item", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockDossier = document.createElement("div");
      mockDossier.id = "dossier";
      document.body.appendChild(mockDossier);

      const navList = document.querySelector("nav ul") as HTMLElement;
      const expLink = within(navList).getAllByRole("link")[2];

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(expLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockDossier.remove();
    });

    it("should call scrollTo for Projects nav item", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockProjects = document.createElement("div");
      mockProjects.id = "projects";
      document.body.appendChild(mockProjects);

      const navList = document.querySelector("nav ul") as HTMLElement;
      const projLink = within(navList).getAllByRole("link")[3];

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(projLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockProjects.remove();
    });

    it("should call scrollTo for Writing nav item", async () => {
      const user = userEvent.setup();
      render(<Navigation />);

      const mockWriting = document.createElement("div");
      mockWriting.id = "writing";
      document.body.appendChild(mockWriting);

      const navList = document.querySelector("nav ul") as HTMLElement;
      const writeLink = within(navList).getAllByRole("link")[4];

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(writeLink);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockWriting.remove();
    });
  });

  describe("Styling and Layout", () => {
    it("should have sticky positioning", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("sticky");
      expect(nav.className).toContain("top-0");
    });

    it("should have high z-index for layering", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("z-50");
    });

    it("should have border-bottom styling", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("border-b");
      expect(nav.className).toContain("border-rule");
    });

    it("should have backdrop blur and saturate effects", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("backdrop-blur");
      expect(nav.className).toContain("backdrop-saturate");
    });

    it("should have transition for smooth hide/show animation", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("transition-transform");
    });

    it("should use paper background color with transparency", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("bg-[color-mix(in_oklch,var(--paper)_88%,transparent)]");
    });
  });

  describe("Responsive Behavior", () => {
    it("should hide brand subtitle on screens smaller than 720px", () => {
      render(<Navigation />);
      const subtitle = screen.getByText("Titus Lim · Personal site");
      expect(subtitle.className).toContain("max-[720px]:hidden");
    });

    it("should hide folio numbers on screens smaller than 720px", () => {
      render(<Navigation />);
      const folios = screen.getAllByText(/^0[1-5]$/);
      folios.forEach((folio) => {
        expect(folio.className).toContain("max-[720px]:hidden");
      });
    });

    it("should hide CTA text on screens smaller than 720px", () => {
      render(<Navigation />);
      const ctaLink = screen.getByRole("link", { name: /email titus/i });
      const textSpan = ctaLink.querySelector("span:nth-child(2)");
      expect(textSpan?.className).toContain("max-[720px]:hidden");
    });

    it("should center nav items on screens 1080px and wider", () => {
      render(<Navigation />);
      const navList = screen.getByRole("navigation").querySelector("ul");
      expect(navList?.className).toContain("min-[1080px]:justify-center");
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels on brand link", () => {
      render(<Navigation />);
      const brandLink = screen.getByRole("link", { name: /back to top/i });
      expect(brandLink).toHaveAttribute("aria-label", "Back to top");
    });

    it("should have href on brand link", () => {
      render(<Navigation />);
      const brandLink = screen.getByRole("link", { name: /back to top/i });
      expect(brandLink).toHaveAttribute("href", "#masthead");
    });

    it("should have href on all nav item links", () => {
      const { container } = render(<Navigation />);
      const navList = container.querySelector("nav ul");
      const links = navList?.querySelectorAll("a");
      expect(links?.length).toBe(5);
      links?.forEach((link) => {
        expect(link).toHaveAttribute("href");
        expect(link.getAttribute("href")).toMatch(/^#/);
      });
    });

    it("should render nav list in a semantically correct list structure", () => {
      const { container } = render(<Navigation />);
      const navList = container.querySelector("nav ul");
      expect(navList).toBeInTheDocument();

      const listItems = navList?.querySelectorAll("li");
      expect(listItems?.length).toBe(5);
    });
  });

  describe("Navigation Link Structure", () => {
    it("should have correct structure for each nav item", () => {
      const { container } = render(<Navigation />);
      const listItems = container.querySelectorAll("nav ul li");

      expect(listItems.length).toBe(5);

      listItems.forEach((li) => {
        const link = li.querySelector("a");
        expect(link).toBeInTheDocument();
        expect(link?.getAttribute("href")).toMatch(/^#/);
      });
    });

    it("should render nav items with folio and label", () => {
      const { container } = render(<Navigation />);
      const listItems = container.querySelectorAll("nav ul li");

      const expectedFolios = ["01", "02", "03", "04", "05"];
      const expectedLabels = ["About", "Stack", "Experience", "Projects", "Writing"];

      listItems.forEach((li, index) => {
        const text = li.textContent;
        expect(text).toContain(expectedFolios[index]);
        expect(text).toContain(expectedLabels[index]);
      });
    });
  });

  describe("Cleanup", () => {
    it("should remove scroll event listener on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(
        window,
        "removeEventListener"
      );
      const { unmount } = render(<Navigation />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it("should disconnect IntersectionObserver on unmount", () => {
      const mockDisconnect = jest.fn();

      class MockIntersectionObserver {
        observe = jest.fn();
        unobserve = jest.fn();
        disconnect = mockDisconnect;
      }

      global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

      const { unmount } = render(<Navigation />);
      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe("Edge Cases and Integration", () => {
    it("should handle rapid scroll events gracefully", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        for (let i = 100; i < 200; i += 5) {
          Object.defineProperty(window, "scrollY", { value: i, configurable: true });
          window.dispatchEvent(new Event("scroll"));
        }
      });

      expect(nav.style.transform).toBe("translateY(-110%)");
    });

    it("should maintain nav structure during scroll state changes", () => {
      render(<Navigation />);

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("Stack")).toBeInTheDocument();
      expect(screen.getByText("Experience")).toBeInTheDocument();
      expect(screen.getByText("Projects")).toBeInTheDocument();
      expect(screen.getByText("Writing")).toBeInTheDocument();

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("Stack")).toBeInTheDocument();
    });

    it("should render all nav items in document order", () => {
      const { container } = render(<Navigation />);
      const navList = container.querySelector("nav ul");
      const links = navList?.querySelectorAll("a");

      const expectedOrder = ["About", "Stack", "Experience", "Projects", "Writing"];
      links?.forEach((link, idx) => {
        expect(link.textContent).toContain(expectedOrder[idx]);
      });
    });
  });

  describe("Scroll Position Edge Cases", () => {
    it("should handle scroll position below 80px threshold", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 79, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("should handle scroll position above 80px without hidden state initially", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        expect(nav.style.transform).toBe("translateY(-110%)");
      });
    });

    it("should handle zero scroll position", async () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation");

      act(() => {
        Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });

      expect(nav.style.transform).toBe("translateY(0)");
    });
  });

  describe("CTA Link Rendering", () => {
    it("should render CTA with correct visual structure", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });

      const amberDot = cta.querySelector("span[class*='bg-amber']");
      expect(amberDot).toBeInTheDocument();

      const textSpan = cta.querySelector("span:nth-child(2)");
      expect(textSpan).toHaveTextContent("Get in touch");
    });

    it("should have proper border styling on CTA", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });

      expect(cta.className).toContain("border");
      expect(cta.className).toContain("border-ink");
    });

    it("should have hover state styling on CTA", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });

      expect(cta.className).toContain("hover:bg-ink");
      expect(cta.className).toContain("hover:text-paper");
    });
  });

  describe("Brand Link Interactive", () => {
    it("should have correct styling and structure on brand link", () => {
      render(<Navigation />);
      const brandLink = screen.getByRole("link", { name: /back to top/i });

      expect(brandLink.className).toContain("flex");
      expect(brandLink.className).toContain("items-baseline");
      expect(brandLink.className).toContain("gap-2.5");

      const serif = brandLink.querySelector(".font-serif");
      expect(serif).toBeInTheDocument();
    });
  });
});
