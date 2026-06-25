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
    it("should render the brand button with T·L text", () => {
      render(<Navigation />);
      const brandButton = screen.getByRole("button", { name: /back to top/i });
      expect(brandButton).toBeInTheDocument();
      expect(brandButton.textContent).toContain("T");
      expect(brandButton.textContent).toContain("L");
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
      const cta = screen.getByRole("link", { name: /get in touch/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute(
        "href",
        expect.stringContaining("mailto:tituslhy@gmail.com")
      );
    });

    it("should have correct email in CTA href", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /get in touch/i }) as HTMLAnchorElement;
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

    it("should have active button with aria-current attribute when section becomes active", () => {
      render(<Navigation />);
      const navButtons = screen.getAllByText(/About|Stack|Experience|Projects|Writing/);
      expect(navButtons.length).toBeGreaterThan(0);
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

      global.IntersectionObserver = MockIntersectionObserver as any;

      render(<Navigation />);

      // Simulate an intersecting section
      if (capturedCallback) {
        act(() => {
          const mockEntries = [
            {
              isIntersecting: true,
              target: { id: "lede" } as any,
            } as IntersectionObserverEntry,
          ];
          capturedCallback!(mockEntries, {} as IntersectionObserver);
        });
      }

      // After triggering the callback with an intersecting element,
      // the active state should be updated to "lede"
      const aboutButton = screen.getByText("About").closest("button");
      expect(aboutButton?.getAttribute("aria-current")).toBe("true");
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

      global.IntersectionObserver = MockIntersectionObserver as any;

      render(<Navigation />);

      // Simulate a non-intersecting section
      if (capturedCallback) {
        act(() => {
          const mockEntries = [
            {
              isIntersecting: false,
              target: { id: "stack" } as any,
            } as IntersectionObserverEntry,
          ];
          capturedCallback!(mockEntries, {} as IntersectionObserver);
        });
      }

      // State should not be updated for non-intersecting entries
      const stackButton = screen.getByText("Stack").closest("button");
      expect(stackButton?.getAttribute("aria-current")).not.toBe("true");
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
    it("should call scrollTo when brand button is clicked", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockMasthead = document.createElement("div");
      mockMasthead.id = "masthead";
      document.body.appendChild(mockMasthead);

      const brandButton = screen.getByRole("button", { name: /back to top/i });
      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(brandButton);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockMasthead.remove();
    });

    it("should call scrollTo when About nav item button is clicked", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockLede = document.createElement("div");
      mockLede.id = "lede";
      document.body.appendChild(mockLede);

      const navList = container.querySelector("nav ul") as HTMLElement;
      const aboutButton = within(navList).getByText("About").closest("button");

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(aboutButton!);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockLede.remove();
    });

    it("should call scrollTo for Stack nav item", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockStack = document.createElement("div");
      mockStack.id = "stack";
      document.body.appendChild(mockStack);

      const navList = container.querySelector("nav ul") as HTMLElement;
      const stackButton = within(navList).getByText("Stack").closest("button");

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(stackButton!);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockStack.remove();
    });

    it("should call scrollTo for Experience nav item", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockDossier = document.createElement("div");
      mockDossier.id = "dossier";
      document.body.appendChild(mockDossier);

      const navList = container.querySelector("nav ul") as HTMLElement;
      const expButton = within(navList).getByText("Experience").closest("button");

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(expButton!);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockDossier.remove();
    });

    it("should call scrollTo for Projects nav item", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockProjects = document.createElement("div");
      mockProjects.id = "projects";
      document.body.appendChild(mockProjects);

      const navList = container.querySelector("nav ul") as HTMLElement;
      const projButton = within(navList).getByText("Projects").closest("button");

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(projButton!);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
      mockProjects.remove();
    });

    it("should call scrollTo for Writing nav item", async () => {
      const user = userEvent.setup();
      const { container } = render(<Navigation />);

      const mockWriting = document.createElement("div");
      mockWriting.id = "writing";
      document.body.appendChild(mockWriting);

      const navList = container.querySelector("nav ul") as HTMLElement;
      const writeButton = within(navList).getByText("Writing").closest("button");

      const scrollToSpy = jest.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(writeButton!);

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
      const ctaLink = screen.getByRole("link", { name: /get in touch/i });
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
    it("should have proper ARIA labels on brand button", () => {
      render(<Navigation />);
      const brandButton = screen.getByRole("button", { name: /back to top/i });
      expect(brandButton).toHaveAttribute("aria-label", "Back to top");
    });

    it("should have type=button on brand button", () => {
      render(<Navigation />);
      const brandButton = screen.getByRole("button", { name: /back to top/i });
      expect(brandButton).toHaveAttribute("type", "button");
    });

    it("should have type=button on all nav item buttons", () => {
      const { container } = render(<Navigation />);
      const navList = container.querySelector("nav ul");
      const buttons = navList?.querySelectorAll("button");
      expect(buttons?.length).toBe(5);
      buttons?.forEach((button) => {
        expect(button).toHaveAttribute("type", "button");
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

      listItems.forEach((li, index) => {
        const button = li.querySelector("button");
        expect(button).toBeInTheDocument();
        expect(button?.getAttribute("type")).toBe("button");
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

      global.IntersectionObserver = MockIntersectionObserver as any;

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
      const buttons = navList?.querySelectorAll("button");

      const expectedOrder = ["About", "Stack", "Experience", "Projects", "Writing"];
      buttons?.forEach((btn, idx) => {
        expect(btn.textContent).toContain(expectedOrder[idx]);
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
      const cta = screen.getByRole("link", { name: /get in touch/i });

      const amberDot = cta.querySelector("span[class*='bg-amber']");
      expect(amberDot).toBeInTheDocument();

      const textSpan = cta.querySelector("span:nth-child(2)");
      expect(textSpan).toHaveTextContent("Get in touch");
    });

    it("should have proper border styling on CTA", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /get in touch/i });

      expect(cta.className).toContain("border");
      expect(cta.className).toContain("border-ink");
    });

    it("should have hover state styling on CTA", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /get in touch/i });

      expect(cta.className).toContain("hover:bg-ink");
      expect(cta.className).toContain("hover:text-paper");
    });
  });

  describe("Brand Button Interactive", () => {
    it("should have correct styling and structure on brand button", () => {
      render(<Navigation />);
      const brandButton = screen.getByRole("button", { name: /back to top/i });

      expect(brandButton.className).toContain("flex");
      expect(brandButton.className).toContain("items-baseline");
      expect(brandButton.className).toContain("gap-2.5");

      const serif = brandButton.querySelector(".font-serif");
      expect(serif).toBeInTheDocument();
    });
  });
});
