import { act, render, screen, within } from "@testing-library/react";
import Navigation from "./Navigation";
import { EMAIL } from "@/lib/profile";

// The nav reads the current route. Each test sets the pathname it wants before rendering.
let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const NAV_HREFS = ["/experience", "/education", "/projects", "/writing", "/about", "/colophon"];

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, configurable: true, writable: true });
}

function scrollTo(value: number) {
  act(() => {
    setScrollY(value);
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("Navigation", () => {
  beforeEach(() => {
    mockPathname = "/";
    setScrollY(0);
  });

  describe("Rendering", () => {
    it("renders the brand as a link home with the T·L mark", () => {
      render(<Navigation />);
      const brand = screen.getByRole("link", { name: "Titus Lim, home" });
      expect(brand).toHaveAttribute("href", "/");
      expect(brand.textContent).toContain("T");
      expect(brand.textContent).toContain("L");
    });

    it("renders the brand subtitle, hidden below 1080px", () => {
      render(<Navigation />);
      const subtitle = screen.getByText("Titus Lim · Personal site");
      expect(subtitle.className).toContain("max-[1080px]:hidden");
    });

    it("renders the six links in order with their labels", () => {
      render(<Navigation />);
      const list = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const links = within(list).getAllByRole("link");
      expect(links.map((a) => a.textContent)).toEqual([
        "01Experience",
        "02Education",
        "03Projects",
        "04Writing",
        "05About",
        "06Ask Titus",
      ]);
    });

    it("links each item to its route, with 06 Ask Titus going to the colophon", () => {
      render(<Navigation />);
      const list = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const hrefs = within(list)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href"));
      expect(hrefs).toEqual(NAV_HREFS);
    });

    it("prefixes each item with its folio number", () => {
      render(<Navigation />);
      const list = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const folios = within(list)
        .getAllByRole("link")
        .map((a) => a.querySelector("span")?.textContent);
      expect(folios).toEqual(["01", "02", "03", "04", "05", "06"]);
    });

    it("renders the Get in touch CTA as a resume-request mailto", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i }) as HTMLAnchorElement;
      expect(cta.getAttribute("href")).toBe(`mailto:${EMAIL}?subject=Resume Request`);
      expect(cta.href).toContain(EMAIL);
      expect(cta.href).toContain("subject");
      expect(cta.href).toContain("Resume");
    });

    it("labels the nav landmark", () => {
      render(<Navigation />);
      expect(screen.getByRole("navigation", { name: "Site navigation" })).toBeInTheDocument();
    });
  });

  describe("Active page", () => {
    it("marks the current page with aria-current and an amber underline", () => {
      mockPathname = "/experience";
      render(<Navigation />);
      const list = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const links = within(list).getAllByRole("link");

      expect(links[0]).toHaveAttribute("aria-current", "page");
      links.slice(1).forEach((link) => expect(link).not.toHaveAttribute("aria-current"));

      const underline = links[0].querySelector("span.bg-amber");
      expect(underline).toBeInTheDocument();
      links.slice(1).forEach((link) => expect(link.querySelector("span.bg-amber")).toBeNull());
    });

    it("marks Education as current on /education", () => {
      mockPathname = "/education";
      render(<Navigation />);
      expect(screen.getByRole("link", { name: /education/i })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: /experience/i })).not.toHaveAttribute("aria-current");
    });

    it("marks Ask Titus as current on the colophon", () => {
      mockPathname = "/colophon";
      render(<Navigation />);
      expect(screen.getByRole("link", { name: /ask titus/i })).toHaveAttribute("aria-current", "page");
    });

    it("keeps the item active on a nested path", () => {
      mockPathname = "/projects/fictional-bassoon";
      render(<Navigation />);
      expect(screen.getByRole("link", { name: /projects/i })).toHaveAttribute("aria-current", "page");
    });

    it("does not mark a prefix of another route as current", () => {
      mockPathname = "/experiences-archive";
      render(<Navigation />);
      expect(screen.getByRole("link", { name: /experience/i })).not.toHaveAttribute("aria-current");
    });

    it("marks nothing as current on the front page", () => {
      mockPathname = "/";
      const { container } = render(<Navigation />);
      expect(container.querySelector('[aria-current="page"]')).toBeNull();
    });

    it("uses route links, not in-page anchors, and never tracks sections with an observer", () => {
      const observerSpy = jest.fn();
      const original = global.IntersectionObserver;
      global.IntersectionObserver = class {
        constructor() {
          observerSpy();
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof IntersectionObserver;
      try {
        render(<Navigation />);
        const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
        expect(hrefs.some((h) => h?.startsWith("#"))).toBe(false);
        expect(observerSpy).not.toHaveBeenCalled();
      } finally {
        global.IntersectionObserver = original;
      }
    });
  });

  describe("Scroll behaviour (hide on scroll-down, reveal on scroll-up)", () => {
    it("remains visible when scrollY is less than 80px", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(50);
      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("hides when scrolling down past 80px", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(100);
      expect(nav.style.transform).toBe("translateY(-110%)");
    });

    it("shows again on any upward scroll after being hidden", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(200);
      expect(nav.style.transform).toBe("translateY(-110%)");
      scrollTo(100);
      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("shows immediately when back near the top (scrollY < 80)", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(200);
      expect(nav.style.transform).toBe("translateY(-110%)");
      scrollTo(50);
      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("requires a 4px downward move before hiding", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(100);
      expect(nav.style.transform).toBe("translateY(-110%)");
      scrollTo(90);
      expect(nav.style.transform).toBe("translateY(0)");
      scrollTo(92);
      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("reveals on an upward scroll of 1px once hidden", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      scrollTo(300);
      expect(nav.style.transform).toBe("translateY(-110%)");
      scrollTo(299);
      expect(nav.style.transform).toBe("translateY(0)");
    });

    it("removes its scroll listener on unmount", () => {
      const removeSpy = jest.spyOn(window, "removeEventListener");
      const { unmount } = render(<Navigation />);
      unmount();
      expect(removeSpy.mock.calls.some(([type]) => type === "scroll")).toBe(true);
      removeSpy.mockRestore();
    });
  });

  describe("Styling and layout", () => {
    it("is sticky at the top, above the page", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      expect(nav.className).toContain("sticky");
      expect(nav.className).toContain("top-0");
      expect(nav.className).toContain("z-50");
    });

    it("is fully opaque paper, with no blur or see-through background", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      expect(nav.className).toContain("bg-paper");
      expect(nav.className).not.toContain("backdrop-blur");
      expect(nav.className).not.toMatch(/color-mix/);
    });

    it("has a hairline bottom rule and animates its transform", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      expect(nav.className).toContain("border-b");
      expect(nav.className).toContain("border-rule");
      expect(nav.className).toContain("transition-transform");
    });

    it("centres the links from 721px and wider, and lets the list scroll only as a fallback", () => {
      render(<Navigation />);
      const navList = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      expect(navList.className).toContain("min-[721px]:[justify-content:safe_center]");
      expect(navList.classList.contains("overflow-x-auto")).toBe(true);
      expect(navList.classList.contains("relative")).toBe(true);
    });

    it("renders no decorative fade overlays", () => {
      const { container } = render(<Navigation />);
      expect(container.querySelectorAll("nav div[aria-hidden='true']")).toHaveLength(0);
    });
  });

  describe("Phone layout (720px and narrower)", () => {
    const expectClasses = (el: HTMLElement, classes: string[]) => {
      classes.forEach((cls) => expect(el.classList.contains(cls)).toBe(true));
    };

    it("puts brand and email on the top row of a two-column grid", () => {
      render(<Navigation />);
      const grid = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("div") as HTMLElement;
      const brand = screen.getByRole("link", { name: "Titus Lim, home" });
      const cta = screen.getByRole("link", { name: /email titus/i });

      expectClasses(grid, ["max-[720px]:h-auto", "max-[720px]:grid-cols-[1fr_auto]"]);
      expectClasses(brand, ["max-[720px]:col-start-1", "max-[720px]:row-start-1"]);
      expectClasses(cta, ["max-[720px]:col-start-2", "max-[720px]:row-start-1"]);
    });

    it("gives the link list its own full-width second row", () => {
      render(<Navigation />);
      const navList = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const listWrapper = navList.parentElement as HTMLElement;

      expectClasses(listWrapper, ["max-[720px]:col-span-2", "max-[720px]:row-start-2", "max-[720px]:-mx-1.5", "max-[360px]:-mx-1"]);
      expectClasses(navList, ["max-[720px]:flex-wrap", "max-[720px]:justify-between", "max-[720px]:gap-0", "max-[720px]:px-0"]);
    });

    it("tightens link padding and type on small phones", () => {
      render(<Navigation />);
      const navList = screen.getByRole("navigation", { name: "Site navigation" }).querySelector("ul") as HTMLElement;
      const links = within(navList).getAllByRole("link");
      expect(links).toHaveLength(6);
      links.forEach((link) => expectClasses(link, ["max-[720px]:px-1.5", "max-[360px]:px-1", "max-[360px]:text-[11px]"]));
    });

    it("hides the CTA text under 720px and shows the short Contact label instead", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });
      expect(cta.querySelector("span:nth-child(2)")).toHaveClass("max-[720px]:hidden");
      const contact = cta.querySelector("span:nth-child(3)");
      expect(contact).toHaveTextContent("Contact");
      expect(contact).toHaveClass("min-[721px]:hidden");
    });
  });

  describe("Active link centring on phones", () => {
    // jsdom has no layout engine: stub the geometry the effect reads, then change the route so the effect runs.
    const stubLayout = (
      list: HTMLElement,
      link: HTMLElement,
      geometry: { scrollWidth: number; clientWidth: number; offsetLeft: number; offsetWidth: number }
    ) => {
      Object.defineProperty(list, "scrollWidth", { value: geometry.scrollWidth, configurable: true });
      Object.defineProperty(list, "clientWidth", { value: geometry.clientWidth, configurable: true });
      Object.defineProperty(link, "offsetLeft", { value: geometry.offsetLeft, configurable: true });
      Object.defineProperty(link, "offsetWidth", { value: geometry.offsetWidth, configurable: true });
    };

    it("centres the active link when the list overflows", () => {
      const { container, rerender } = render(<Navigation />);
      const navList = container.querySelector("nav ul") as HTMLElement;
      const writingLink = within(navList).getAllByRole("link")[3];
      stubLayout(navList, writingLink, { scrollWidth: 600, clientWidth: 300, offsetLeft: 400, offsetWidth: 60 });

      mockPathname = "/writing";
      rerender(<Navigation />);

      expect(writingLink).toHaveAttribute("aria-current", "page");
      // offsetLeft - (clientWidth - offsetWidth) / 2 = 400 - 120
      expect(navList.scrollLeft).toBe(280);
    });

    it("leaves scrollLeft at 0 when the list fits without overflowing", () => {
      const { container, rerender } = render(<Navigation />);
      const navList = container.querySelector("nav ul") as HTMLElement;
      const writingLink = within(navList).getAllByRole("link")[3];
      stubLayout(navList, writingLink, { scrollWidth: 300, clientWidth: 300, offsetLeft: 400, offsetWidth: 60 });

      mockPathname = "/writing";
      rerender(<Navigation />);

      expect(writingLink).toHaveAttribute("aria-current", "page");
      expect(navList.scrollLeft).toBe(0);
    });

    it("insets the active underline more tightly on phones", () => {
      mockPathname = "/about";
      const { container } = render(<Navigation />);
      const aboutLink = within(container.querySelector("nav ul") as HTMLElement).getAllByRole("link")[4];
      const underline = aboutLink.querySelector("span.bg-amber") as HTMLElement;
      expect(underline).toBeInTheDocument();
      expect(underline.classList.contains("max-[720px]:inset-x-1.5")).toBe(true);
      expect(underline.classList.contains("max-[360px]:inset-x-1")).toBe(true);
    });
  });

  describe("Accessibility", () => {
    it("gives the brand link an accessible name and a home href", () => {
      render(<Navigation />);
      expect(screen.getByRole("link", { name: "Titus Lim, home" })).toHaveAttribute("href", "/");
    });

    it("gives the CTA an accessible name", () => {
      render(<Navigation />);
      expect(screen.getByRole("link", { name: "Email Titus" })).toBeInTheDocument();
    });

    it("renders the page links as a list inside the nav", () => {
      render(<Navigation />);
      const nav = screen.getByRole("navigation", { name: "Site navigation" });
      const list = nav.querySelector("ul");
      expect(list).toBeInTheDocument();
      expect(list?.querySelectorAll(":scope > li")).toHaveLength(6);
    });

    it("keeps the CTA styled as an outlined button that fills on hover", () => {
      render(<Navigation />);
      const cta = screen.getByRole("link", { name: /email titus/i });
      expect(cta.className).toContain("border-ink");
      expect(cta.className).toContain("hover:bg-ink");
      expect(cta.className).toContain("hover:text-paper");
    });
  });
});
