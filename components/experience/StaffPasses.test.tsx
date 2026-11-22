import { useState, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import StaffPasses, { fanPose, type Pass } from "./StaffPasses";

const NAME = { preferred: "Titus Lim", full: "Lim Hsien Yong" };

// Oldest first, as the component receives them.
const passes: Pass[] = [
  {
    slug: "toyota-tsusho",
    short: "Toyota Tsusho",
    role: "Demand & Supply Analyst",
    from: "Jun 2015",
    to: "Apr 2017",
    brand: { color: "oklch(0.48 0.16 258)", logo: "toyota-tsusho.png" },
    bottom: { figure: "~25%", caption: "better long-term forecast accuracy" },
  },
  {
    slug: "jobtech",
    short: "JobTech",
    role: "Data Scientist",
    from: "Apr 2017",
    to: "Aug 2017",
    brand: { color: "oklch(0.6 0.14 145)", logo: "jobtech.png" },
    bottom: null,
  },
  {
    slug: "ema",
    short: "EMA",
    role: "Principal Engineer, Research & Statistics",
    from: "Apr 2018",
    to: "Aug 2022",
    brand: { color: "oklch(0.55 0.17 25)", logo: "ema.png" },
    bottom: { figure: "4 yrs 4 mos", caption: "in the role" },
  },
  {
    slug: "mastercard",
    short: "Mastercard",
    role: "Lead AI Engineer",
    from: "Jul 2026",
    to: null,
    brand: { color: "oklch(0.64 0.2 42)", logo: "mastercard.svg" },
    bottom: { figure: "Tech lead", caption: "and anchor contributor for the core SDK" },
  },
];

const tabFor = (slug: string) => document.getElementById(`pass-${slug}`) as HTMLElement;
/** The printed face of a pass: everything except the lanyard, which repeats the logo and short name. */
const faceOf = (tab: HTMLElement) => tab.querySelector<HTMLElement>(".staff-pass-face")!;
const lanyards = () => Array.from(document.querySelectorAll<HTMLElement>(".lanyard"));
const tabs = () => screen.getAllByRole("tab");
const selected = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true");

/** The decorative barcode is the one aria-hidden span carrying the repeating-gradient class. */
const barcode = (tab: HTMLElement) =>
  Array.from(tab.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')).find((el) =>
    el.className.includes("repeating-linear-gradient"),
  );

/**
 * A desk that holds its own pick, the way PassDesk does, so clicks and keys move the pick.
 * StaffPasses itself is controlled: these tests pass `picked` and `onPick` through this harness.
 */
function Desk({
  list = passes,
  initial,
  onPick,
  footer,
}: {
  list?: Pass[];
  initial?: string | null;
  onPick?: (slug: string) => void;
  footer?: ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(initial === undefined ? (list.at(-1)?.slug ?? null) : initial);
  return (
    <StaffPasses
      passes={list}
      name={NAME}
      picked={picked}
      onPick={(slug) => {
        onPick?.(slug);
        setPicked(slug);
      }}
      footer={footer}
    />
  );
}

let scrollSpy: jest.SpyInstance;

beforeEach(() => {
  scrollSpy = jest.spyOn(Element.prototype, "scrollIntoView");
  scrollSpy.mockClear();
});

afterEach(() => {
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

describe("fanPose", () => {
  it("sits a lone pass level, in the middle, at the mid-point of the desk", () => {
    expect(fanPose(0, 1)).toEqual({ rot: 0, top: 40, leftPct: 50, leftPx: 110 });
  });

  it("leans the outer passes out and down, and keeps the middle one level", () => {
    const [left, mid, right] = [0, 1, 2].map((i) => fanPose(i, 3));
    expect(left.rot).toBeCloseTo(-4.2);
    expect(mid.rot).toBe(0);
    expect(right.rot).toBeCloseTo(4.2);
    expect(left.top).toBeCloseTo(44.8);
    expect(mid.top).toBe(40);
    // The spec's formula (|k|*k*1.2 + |k|*6) is not mirror-symmetric: the right-hand pass drops further.
    expect(right.top).toBeCloseTo(47.2);
  });

  it("gives the outer passes of a wider fan a steeper tilt and a deeper drop", () => {
    const outer = fanPose(4, 5);
    expect(outer.rot).toBeCloseTo(8.4);
    expect(outer.top).toBeCloseTo(56.8);
    expect(fanPose(0, 5).top).toBeCloseTo(47.2);
  });

  it("drops every outer pass below the middle one, on both sides", () => {
    for (let n = 2; n <= 7; n++) {
      const middle = fanPose((n - 1) / 2, n).top;
      for (let i = 0; i < n; i++) {
        if (i === (n - 1) / 2) continue;
        expect(fanPose(i, n).top).toBeGreaterThan(middle);
      }
    }
  });

  it("places the first pass at the left edge and the last at the right edge of the 220px track", () => {
    expect(fanPose(0, 4)).toMatchObject({ leftPct: 0, leftPx: 0 });
    expect(fanPose(3, 4)).toMatchObject({ leftPct: 100, leftPx: 220 });
  });

  it("spaces the passes evenly and in order from left to right", () => {
    const lefts = [0, 1, 2, 3, 4, 5, 6].map((i) => fanPose(i, 7).leftPx);
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect(lefts[1] - lefts[0]).toBeCloseTo(lefts[2] - lefts[1]);
  });

  it("tilts the two sides of the fan in opposite directions for every fan size", () => {
    for (let n = 1; n <= 7; n++) {
      for (let i = 0; i < n; i++) {
        expect(fanPose(i, n).rot).toBeCloseTo(-fanPose(n - 1 - i, n).rot);
      }
    }
  });
});

describe("StaffPasses", () => {
  describe("rendering", () => {
    it("is a tablist labelled 'One staff pass per role'", () => {
      render(<Desk />);
      expect(screen.getByRole("tablist", { name: "One staff pass per role" })).toBeInTheDocument();
    });

    it("renders one tab per pass, in the order given (oldest first)", () => {
      render(<Desk />);
      expect(tabs().map((t) => t.id)).toEqual(passes.map((p) => `pass-${p.slug}`));
    });

    it("counts the passes in the caption, and says how to pick one up", () => {
      render(<Desk />);
      expect(screen.getByText(`${passes.length} staff passes`)).toBeInTheDocument();
      expect(screen.getByText("Pick one up to read about it")).toBeInTheDocument();
    });

    it("labels each tab with its short name, role, and dates, using 'present' for the current role", () => {
      render(<Desk />);
      expect(tabFor("toyota-tsusho")).toHaveAttribute("aria-label", "Toyota Tsusho, Demand & Supply Analyst, Jun 2015 to Apr 2017");
      expect(tabFor("jobtech")).toHaveAttribute("aria-label", "JobTech, Data Scientist, Apr 2017 to Aug 2017");
      expect(tabFor("mastercard")).toHaveAttribute("aria-label", "Mastercard, Lead AI Engineer, Jul 2026 to present");
    });

    it("points each tab at its role anchor with aria-controls", () => {
      document.body.replaceChildren();
      for (const p of passes) {
        const anchor = document.createElement("article");
        anchor.id = `role-${p.slug}`;
        document.body.appendChild(anchor);
      }
      render(<Desk />);
      for (const p of passes) {
        const tab = tabFor(p.slug);
        expect(tab).toHaveAttribute("aria-controls", `role-${p.slug}`);
        expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBeInTheDocument();
      }
    });

    it("gives each tab the logo from public/logos/companies, with empty alt text", () => {
      const { container } = render(<Desk />);
      for (const p of passes) {
        const img = faceOf(tabFor(p.slug)).querySelector("img");
        expect(img).not.toBeNull();
        expect(img).toHaveAttribute("src", `/logos/companies/${p.brand.logo}`);
        expect(img).toHaveAttribute("alt", "");
      }
      expect(container.querySelectorAll(".staff-pass-face img")).toHaveLength(passes.length);
    });

    it("shows the short name, the STAFF label, both names, and the role on every pass", () => {
      render(<Desk />);
      for (const p of passes) {
        const face = within(faceOf(tabFor(p.slug)));
        expect(face.getByText(p.short)).toBeInTheDocument();
        expect(face.getByText("STAFF")).toBeInTheDocument();
        expect(face.getByText(NAME.preferred)).toBeInTheDocument();
        expect(face.getByText(NAME.full)).toBeInTheDocument();
        expect(face.getByText(p.role)).toBeInTheDocument();
      }
    });

    it("hides the decorative T·L stub from assistive tech", () => {
      render(<Desk />);
      expect(within(tabFor("toyota-tsusho")).getByText("T·L")).toHaveAttribute("aria-hidden", "true");
    });

    it("gives the caption its hint about the picking gesture", () => {
      render(<Desk />);
      expect(screen.getByText("Click a pass to pick it up. ← → move along.")).toBeInTheDocument();
    });

    it("renders the footer under the desk, beside the hint", () => {
      render(<Desk footer={<button type="button">Show all roles</button>} />);
      const footer = screen.getByRole("button", { name: "Show all roles" });
      expect(footer.parentElement).toContainElement(screen.getByText("Click a pass to pick it up. ← → move along."));
    });

    it("renders no footer when none is given", () => {
      render(<Desk />);
      expect(screen.queryByRole("button")).toBeNull();
    });
  });

  describe("controlled pick", () => {
    it("shows whichever pass the parent says is picked, not the newest", () => {
      render(<StaffPasses passes={passes} name={NAME} picked="jobtech" onPick={() => {}} />);
      expect(tabFor("jobtech")).toHaveAttribute("aria-selected", "true");
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "false");
    });

    it("reports a click to the parent with the pass's slug, and leaves the pick where the parent put it", () => {
      const onPick = jest.fn();
      render(<StaffPasses passes={passes} name={NAME} picked="mastercard" onPick={onPick} />);
      fireEvent.click(tabFor("toyota-tsusho"));
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick).toHaveBeenCalledWith("toyota-tsusho");
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "true");
      expect(tabFor("toyota-tsusho")).toHaveAttribute("aria-selected", "false");
    });

    it("with no pick given, shows nothing picked", () => {
      render(<StaffPasses passes={passes} name={NAME} picked={null} onPick={() => {}} />);
      expect(selected()).toHaveLength(0);
      expect(tabs().every((t) => t.tabIndex === -1)).toBe(true);
    });

    it("never scrolls the page itself: scrolling to the role is PassDesk's job", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      fireEvent.keyDown(tabFor("toyota-tsusho"), { key: "ArrowRight" });
      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });

  describe("dates and the current tag", () => {
    it("shows the valid-from and to dates on a pass that is not picked", () => {
      render(<Desk />);
      expect(tabFor("toyota-tsusho")).toHaveTextContent("Valid from Jun 2015");
      expect(tabFor("toyota-tsusho")).toHaveTextContent("to Apr 2017");
    });

    it("shows 'to present' for the current role once it is no longer picked", () => {
      render(<Desk />);
      // The newest pass starts picked, so pick another one to see its dates.
      fireEvent.click(tabFor("ema"));
      expect(tabFor("mastercard")).toHaveTextContent("Valid from Jul 2026");
      expect(tabFor("mastercard")).toHaveTextContent("to present");
    });

    it("draws a barcode on a pass that is not picked", () => {
      render(<Desk />);
      expect(barcode(tabFor("toyota-tsusho"))).toBeDefined();
      expect(barcode(tabFor("toyota-tsusho"))).toHaveAttribute("aria-hidden", "true");
    });

    it("gives the CURRENT tag only to the pass with no end date", () => {
      render(<Desk />);
      expect(within(tabFor("mastercard")).getByText("CURRENT")).toBeInTheDocument();
      for (const slug of ["toyota-tsusho", "jobtech", "ema"]) {
        expect(within(tabFor(slug)).queryByText("CURRENT")).toBeNull();
      }
    });
  });

  describe("picking", () => {
    it("starts with the newest pass picked, and the rest unpicked", () => {
      render(<Desk />);
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "true");
      expect(tabFor("mastercard")).toHaveAttribute("tabindex", "0");
      for (const slug of ["toyota-tsusho", "jobtech", "ema"]) {
        expect(tabFor(slug)).toHaveAttribute("aria-selected", "false");
        expect(tabFor(slug)).toHaveAttribute("tabindex", "-1");
      }
    });

    it("keeps exactly one tab selected at a time", () => {
      render(<Desk />);
      fireEvent.click(tabFor("jobtech"));
      expect(selected()).toEqual([tabFor("jobtech")]);
    });

    it("moves the picked state and tab stop to a tab when it is clicked", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      expect(tabFor("toyota-tsusho")).toHaveAttribute("aria-selected", "true");
      expect(tabFor("toyota-tsusho")).toHaveAttribute("tabindex", "0");
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "false");
      expect(tabFor("mastercard")).toHaveAttribute("tabindex", "-1");
    });

    it("reports each click once, with that pass's slug", () => {
      const onPick = jest.fn();
      render(<Desk onPick={onPick} />);
      fireEvent.click(tabFor("ema"));
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick).toHaveBeenCalledWith("ema");
    });

    it("picks a pass without throwing when its role anchor is missing from the page", () => {
      document.body.replaceChildren();
      render(<Desk />);
      expect(() => fireEvent.click(tabFor("jobtech"))).not.toThrow();
      expect(tabFor("jobtech")).toHaveAttribute("aria-selected", "true");
      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it("shows a picked pass's highlight in place of its dates and barcode", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      const tab = tabFor("toyota-tsusho");
      expect(within(tab).getByText("~25%")).toBeInTheDocument();
      expect(within(tab).getByText("better long-term forecast accuracy")).toBeInTheDocument();
      expect(tab).not.toHaveTextContent("Valid from");
      expect(barcode(tab)).toBeUndefined();
    });

    it("shows a picked finished role's tenure in place of its dates", () => {
      render(<Desk />);
      fireEvent.click(tabFor("ema"));
      expect(within(tabFor("ema")).getByText("4 yrs 4 mos")).toBeInTheDocument();
      expect(within(tabFor("ema")).getByText("in the role")).toBeInTheDocument();
    });

    it("shows the dates and barcode of a picked pass that has no bottom", () => {
      render(<Desk />);
      fireEvent.click(tabFor("jobtech"));
      expect(tabFor("jobtech")).toHaveTextContent("Valid from Apr 2017");
      expect(tabFor("jobtech")).toHaveTextContent("to Aug 2017");
      expect(barcode(tabFor("jobtech"))).toBeDefined();
    });

    it("hides a pass's highlight once another pass is picked, and shows its dates again", () => {
      render(<Desk />);
      // Mastercard starts picked, so its highlight shows.
      expect(within(tabFor("mastercard")).getByText("Tech lead")).toBeInTheDocument();
      fireEvent.click(tabFor("toyota-tsusho"));
      expect(within(tabFor("mastercard")).queryByText("Tech lead")).toBeNull();
      expect(tabFor("mastercard")).toHaveTextContent("Valid from Jul 2026");
      expect(tabFor("mastercard")).toHaveTextContent("to present");
      expect(barcode(tabFor("mastercard"))).toBeDefined();
    });

    it("does not show the highlight of a pass that is not picked", () => {
      render(<Desk />);
      expect(screen.queryByText("~25%")).toBeNull();
    });
  });

  describe("keyboard", () => {
    it("moves the pick to the neighbour on the left with ArrowLeft, and focuses it", () => {
      render(<Desk />);
      fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowLeft" });
      expect(tabFor("ema")).toHaveAttribute("aria-selected", "true");
      expect(tabFor("ema")).toHaveAttribute("tabindex", "0");
      expect(document.activeElement).toBe(tabFor("ema"));
    });

    it("moves the pick to the neighbour on the right with ArrowRight, and focuses it", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      fireEvent.keyDown(tabFor("toyota-tsusho"), { key: "ArrowRight" });
      expect(tabFor("jobtech")).toHaveAttribute("aria-selected", "true");
      expect(document.activeElement).toBe(tabFor("jobtech"));
    });

    it("walks the whole row one step at a time", () => {
      render(<Desk />);
      for (const slug of ["ema", "jobtech", "toyota-tsusho"]) {
        fireEvent.keyDown(selected()[0], { key: "ArrowLeft" });
        expect(tabFor(slug)).toHaveAttribute("aria-selected", "true");
      }
    });

    it("does not wrap past the oldest pass: ArrowLeft on the first stays put", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      fireEvent.keyDown(tabFor("toyota-tsusho"), { key: "ArrowLeft" });
      expect(tabFor("toyota-tsusho")).toHaveAttribute("aria-selected", "true");
      expect(selected()).toHaveLength(1);
    });

    it("does not wrap past the newest pass: ArrowRight on the last stays put", () => {
      render(<Desk />);
      fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowRight" });
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "true");
      expect(selected()).toHaveLength(1);
    });

    it("does not report an arrow past either end to the parent", () => {
      const onPick = jest.fn();
      render(<Desk onPick={onPick} />);
      fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowRight" });
      expect(onPick).not.toHaveBeenCalled();
    });

    it("prevents the page from scrolling on an arrow key, even at the end of the row", () => {
      render(<Desk />);
      const notCancelled = fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowRight" });
      expect(notCancelled).toBe(false);
    });

    it("ignores every other key: the pick stays and the default is not prevented", () => {
      const onPick = jest.fn();
      render(<Desk onPick={onPick} />);
      for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Home", "End", "a"]) {
        const notCancelled = fireEvent.keyDown(tabFor("mastercard"), { key });
        expect(notCancelled).toBe(true);
        expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "true");
      }
      expect(selected()).toHaveLength(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it("does not scroll the page on a key move", () => {
      render(<Desk />);
      fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowLeft" });
      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it("reports an arrow move to the parent as the neighbour's slug and focuses it, leaving the pick to the parent", () => {
      const onPick = jest.fn();
      render(<StaffPasses passes={passes} name={NAME} picked="mastercard" onPick={onPick} />);
      fireEvent.keyDown(tabFor("mastercard"), { key: "ArrowLeft" });
      expect(onPick).toHaveBeenCalledWith("ema");
      expect(document.activeElement).toBe(tabFor("ema"));
      expect(tabFor("mastercard")).toHaveAttribute("aria-selected", "true");
    });

    it("moves from no pick to the oldest pass with ArrowRight", () => {
      const onPick = jest.fn();
      render(<StaffPasses passes={passes} name={NAME} picked={null} onPick={onPick} />);
      fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
      expect(onPick).toHaveBeenCalledWith("toyota-tsusho");
    });

    it("listens on the tablist, so a key pressed while focus is on the tablist also moves the pick", () => {
      render(<Desk />);
      fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
      expect(tabFor("ema")).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("inline style", () => {
    it("gives each pass its company colour as --brand", () => {
      render(<Desk />);
      for (const p of passes) {
        expect(tabFor(p.slug).style.getPropertyValue("--brand")).toBe(p.brand.color);
      }
    });

    it("tilts each pass by its fan pose, except the picked one, which is level", () => {
      render(<Desk />);
      passes.forEach((p, i) => {
        const expected = i === passes.length - 1 ? "0deg" : `${fanPose(i, passes.length).rot}deg`;
        expect(tabFor(p.slug).style.getPropertyValue("--rot")).toBe(expected);
      });
    });

    it("levels the pass when it is picked up, and tilts it back when another is picked", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      expect(tabFor("toyota-tsusho").style.getPropertyValue("--rot")).toBe("0deg");
      expect(tabFor("mastercard").style.getPropertyValue("--rot")).toBe(`${fanPose(3, 4).rot}deg`);
    });

    it("raises the picked pass above the rest with z-index 20", () => {
      render(<Desk />);
      expect(tabFor("mastercard").style.zIndex).toBe("20");
      expect(tabFor("toyota-tsusho").style.zIndex).toBe("1");
    });

    it("stacks unpicked passes by their position, oldest at the bottom", () => {
      render(<Desk />);
      expect(tabFor("toyota-tsusho").style.zIndex).toBe("1");
      expect(tabFor("jobtech").style.zIndex).toBe("2");
      expect(tabFor("ema").style.zIndex).toBe("3");
    });

    it("moves the raised z-index to the newly picked pass and drops the old one back to its place", () => {
      render(<Desk />);
      fireEvent.click(tabFor("jobtech"));
      expect(tabFor("jobtech").style.zIndex).toBe("20");
      expect(tabFor("mastercard").style.zIndex).toBe("4");
    });

    it("places each pass by its fan pose along the desk", () => {
      render(<Desk />);
      passes.forEach((p, i) => {
        expect(tabFor(p.slug).style.top).toBe(`${fanPose(i, passes.length).top}px`);
      });
    });
  });

  describe("lanyard", () => {
    const strapsOf = (lanyard: HTMLElement) =>
      Array.from(lanyard.querySelectorAll<HTMLElement>(".lanyard-straps > span"));

    it("hangs a lanyard from the picked pass only", () => {
      render(<Desk />);
      expect(lanyards()).toHaveLength(1);
      expect(tabFor("mastercard").querySelectorAll(".lanyard")).toHaveLength(1);
      for (const slug of ["toyota-tsusho", "jobtech", "ema"]) {
        expect(tabFor(slug).querySelector(".lanyard")).toBeNull();
      }
    });

    it("hides the lanyard from assistive tech", () => {
      render(<Desk />);
      expect(tabFor("mastercard").querySelector(".lanyard")).toHaveAttribute("aria-hidden", "true");
    });

    it("moves the lanyard to whichever pass is picked", () => {
      render(<Desk />);
      fireEvent.click(tabFor("toyota-tsusho"));
      expect(lanyards()).toHaveLength(1);
      expect(tabFor("toyota-tsusho").querySelector(".lanyard")).not.toBeNull();
      expect(tabFor("mastercard").querySelector(".lanyard")).toBeNull();
    });

    it("prints the picked company's logo and short name, six times on each of its two straps", () => {
      render(<Desk />);
      const lanyard = tabFor("mastercard").querySelector<HTMLElement>(".lanyard")!;
      const straps = strapsOf(lanyard);
      expect(straps).toHaveLength(2);
      for (const strap of straps) {
        const logos = strap.querySelectorAll("img");
        expect(logos).toHaveLength(6);
        logos.forEach((img) => {
          expect(img).toHaveAttribute("src", "/logos/companies/mastercard.svg");
          expect(img).toHaveAttribute("alt", "");
        });
        expect(within(strap).getAllByText("Mastercard")).toHaveLength(6);
      }
      expect(lanyard.querySelectorAll("img")).toHaveLength(12);
      expect(within(lanyard).getAllByText("Mastercard")).toHaveLength(12);
    });

    it("prints whichever company is picked, not the newest", () => {
      render(<Desk />);
      fireEvent.click(tabFor("ema"));
      const lanyard = tabFor("ema").querySelector<HTMLElement>(".lanyard")!;
      expect(lanyard.querySelectorAll('img[src="/logos/companies/ema.png"]')).toHaveLength(12);
      expect(within(lanyard).getAllByText("EMA")).toHaveLength(12);
      expect(within(lanyard).queryByText("Mastercard")).toBeNull();
    });

    it("hangs no lanyard when nothing is picked", () => {
      render(<StaffPasses passes={passes} name={NAME} picked={null} onPick={() => {}} />);
      expect(lanyards()).toHaveLength(0);
    });
  });

  describe("a single pass", () => {
    it("starts picked, level, and at the middle of the desk", () => {
      render(<Desk list={[passes[0]]} />);
      const tab = tabFor("toyota-tsusho");
      expect(tab).toHaveAttribute("aria-selected", "true");
      expect(tab.style.getPropertyValue("--rot")).toBe("0deg");
      expect(tab.style.top).toBe("40px");
    });
  });

  describe("an empty desk", () => {
    it("renders no tabs and picks nothing, without throwing", () => {
      render(<Desk list={[]} />);
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });

    it("ignores arrow keys with nothing to pick", () => {
      const onPick = jest.fn();
      render(<Desk list={[]} onPick={onPick} />);
      expect(() => fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" })).not.toThrow();
      expect(onPick).not.toHaveBeenCalled();
    });
  });
});
