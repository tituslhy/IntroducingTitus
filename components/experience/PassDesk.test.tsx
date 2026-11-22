import { act, fireEvent, render, screen } from "@testing-library/react";
import { REVEAL_EVENT } from "@/lib/reveal";
import PassDesk from "./PassDesk";
import type { Pass } from "./StaffPasses";

const NAME = { preferred: "Titus Lim", full: "Lim Hsien Yong" };

// Oldest first, as they lie on the desk. "gamma" is the newest, so it is picked by default.
const passes: Pass[] = [
  { slug: "alpha", short: "Alpha", role: "First role", from: "Jan 2015", to: "Jan 2017", brand: { color: "oklch(0.5 0.1 20)", logo: "alpha.png" }, bottom: null },
  { slug: "beta", short: "Beta", role: "Second role", from: "Feb 2017", to: "Feb 2020", brand: { color: "oklch(0.5 0.1 120)", logo: "beta.png" }, bottom: null },
  { slug: "gamma", short: "Gamma", role: "Third role", from: "Mar 2020", to: null, brand: { color: "oklch(0.5 0.1 220)", logo: "gamma.png" }, bottom: null },
];

// Newest first, as they are listed. Each entry carries the id the pass scrolls to.
const roles = [...passes].reverse().map((p) => ({
  slug: p.slug,
  entry: <article id={`role-${p.slug}`}>{p.short} entry body</article>,
}));

const box = (slug: string) => document.querySelector<HTMLElement>(`[data-reveal="${slug}"]`) as HTMLElement;
const toggle = () => screen.getByRole("button", { name: /^Show (all \d+ roles|one at a time)/ });
const tab = (slug: string) => document.getElementById(`pass-${slug}`) as HTMLElement;

const originalMatchMedia = window.matchMedia;

function setReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia;
}

let scrollSpy: jest.SpyInstance;

beforeEach(() => {
  setReducedMotion(false);
  scrollSpy = jest.spyOn(Element.prototype, "scrollIntoView");
  scrollSpy.mockClear();
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

describe("PassDesk", () => {
  describe("default view", () => {
    it("picks the newest pass by default, and shows only that role", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      expect(tab("gamma")).toHaveAttribute("aria-selected", "true");
      expect(box("gamma")).not.toHaveAttribute("hidden");
      expect(box("beta")).toHaveAttribute("hidden");
      expect(box("alpha")).toHaveAttribute("hidden");
    });

    it("keeps every role in the DOM, hidden, so the page can still find them", () => {
      const { container } = render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      expect(container.querySelectorAll("[data-reveal]")).toHaveLength(roles.length);
      expect(document.getElementById("role-alpha")).toBeInTheDocument();
      expect(document.getElementById("role-alpha")!.closest("[hidden]")).toBe(box("alpha"));
    });

    it("lists the roles newest first, in the order given", () => {
      const { container } = render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      expect(Array.from(container.querySelectorAll("[data-reveal]"), (el) => el.getAttribute("data-reveal"))).toEqual(["gamma", "beta", "alpha"]);
    });

    it("shows the toggle as not pressed, counting every role", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      expect(toggle()).toHaveAttribute("aria-pressed", "false");
      expect(toggle()).toHaveTextContent("Show all 3 roles ↓");
    });

    it("renders the toggle inside the staff-pass desk, as its footer", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      expect(tab("gamma").closest("[role='tablist']")!.parentElement).toContainElement(toggle());
    });
  });

  describe("picking one at a time", () => {
    it("shows only the picked pass's role when another pass is picked", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(tab("alpha"));
      expect(box("alpha")).not.toHaveAttribute("hidden");
      expect(box("gamma")).toHaveAttribute("hidden");
      expect(box("beta")).toHaveAttribute("hidden");
    });

    it("does not scroll when picking a pass while only one role shows", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(tab("alpha"));
      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });

  describe("show all", () => {
    it("shows every role, and marks the toggle pressed with its other label", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-pressed", "true");
      expect(toggle()).toHaveTextContent("Show one at a time");
      for (const p of passes) expect(box(p.slug)).not.toHaveAttribute("hidden");
    });

    it("goes back to one role at a time, keeping the picked pass, when toggled off", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(tab("alpha"));
      fireEvent.click(toggle());
      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-pressed", "false");
      expect(box("alpha")).not.toHaveAttribute("hidden");
      expect(box("gamma")).toHaveAttribute("hidden");
    });

    it("scrolls the picked pass's role into view, smoothly, when picking with every role shown", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(toggle());
      fireEvent.click(tab("alpha"));
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      expect(scrollSpy.mock.instances[0]).toBe(document.getElementById("role-alpha"));
    });

    it("scrolls instantly when the visitor prefers reduced motion", () => {
      setReducedMotion(true);
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(toggle());
      fireEvent.click(tab("beta"));
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
      expect(scrollSpy.mock.instances[0]).toBe(document.getElementById("role-beta"));
    });

    it("asks the reduced-motion query, not some other one", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      fireEvent.click(toggle());
      fireEvent.click(tab("beta"));
      expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    });

    it("does not throw when picking with every role shown, if the role's anchor is missing", () => {
      render(<PassDesk passes={[passes[0], passes[2]]} name={NAME} roles={[roles[0], roles[2]]} />);
      fireEvent.click(toggle());
      document.getElementById("role-alpha")?.remove();
      expect(() => fireEvent.click(tab("alpha"))).not.toThrow();
      expect(tab("alpha")).toHaveAttribute("aria-selected", "true");
      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });

  describe("reveal", () => {
    it("picks the role a reveal event names, showing it instead of the current pick", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      const hidden = box("beta");
      expect(hidden).toHaveAttribute("hidden");
      act(() => {
        hidden.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: "beta" }));
      });
      expect(tab("beta")).toHaveAttribute("aria-selected", "true");
      expect(tab("gamma")).toHaveAttribute("aria-selected", "false");
      expect(box("beta")).not.toHaveAttribute("hidden");
      expect(box("gamma")).toHaveAttribute("hidden");
    });

    it("ignores a reveal event with no slug", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      act(() => {
        box("beta").dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: "" }));
      });
      expect(tab("gamma")).toHaveAttribute("aria-selected", "true");
    });

    it("ignores a reveal event that does not come from inside the role list", () => {
      render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      act(() => {
        tab("alpha").dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: "alpha" }));
      });
      expect(tab("gamma")).toHaveAttribute("aria-selected", "true");
      expect(box("alpha")).toHaveAttribute("hidden");
    });

    it("stops listening once unmounted", () => {
      const { unmount } = render(<PassDesk passes={passes} name={NAME} roles={roles} />);
      const hidden = box("beta");
      unmount();
      // The detached box still exists; dispatching on it must not throw or touch React state.
      expect(() => hidden.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: "beta" }))).not.toThrow();
    });
  });

  describe("an empty desk", () => {
    it("renders the toggle with zero roles, and no role boxes", () => {
      render(<PassDesk passes={[]} name={NAME} roles={[]} />);
      expect(toggle()).toHaveTextContent("Show all 0 roles ↓");
      expect(document.querySelectorAll("[data-reveal]")).toHaveLength(0);
    });
  });
});
