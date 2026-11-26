import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AGENT_SUITE_URL, YEARS_EXPERIENCE_NUMBER } from "@/lib/content";
import { experienceResults, highlightKey, passDates } from "@/lib/experience";
import { NAME, ROLES, pageFolio, type Role } from "@/lib/profile";
import { techKey } from "@/lib/tech-key";
import Experience from "./Experience";

// Lets the edge-case tests swap in altered role data. With no override the real ROLES come through.
let mockRoles: Role[] | null = null;
jest.mock("@/lib/profile", () => {
  const actual = jest.requireActual("@/lib/profile");
  return {
    ...actual,
    get ROLES() {
      return mockRoles ?? actual.ROLES;
    },
  };
});

const FLASH_MS = 2400;
const TOTAL = ROLES.length;

const roleOf = (slug: string) => ROLES.find((r) => r.slug === slug) as Role;
/** Pass n of 7 counts from the oldest (Toyota Tsusho, Pass 1) up to the newest (Mastercard, Pass 7). */
const passNumber = (slug: string) => TOTAL - ROLES.findIndex((r) => r.slug === slug);

const article = (container: HTMLElement, slug: string) =>
  container.querySelector<HTMLElement>(`article#role-${slug}`) as HTMLElement;

const passTab = (slug: string) => document.getElementById(`pass-${slug}`) as HTMLElement;

/** The results-row buttons: every button that is not an Ask pill. */
const resultButtons = () => screen.getAllByRole("button", { name: (name) => !name.startsWith("Ask about") && !/^Show (all|one)/.test(name) });

let scrollSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  scrollSpy = jest.spyOn(Element.prototype, "scrollIntoView");
  scrollSpy.mockClear();
  // A reveal waits two frames; run them at once so the un-hide and the ring land inside the act.
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockRoles = null;
});

describe("Experience (the /experience page)", () => {
  describe("section and header", () => {
    it("is the dossier section, with the back-to-top link in its marker row", () => {
      const { container } = render(<Experience />);
      const section = container.querySelector("section#dossier");
      expect(section).toHaveClass("text-ink");
      const marker = container.querySelector("section#dossier header > div") as HTMLElement;
      const link = within(marker).getByRole("link", { name: /back to top/i });
      expect(link).toHaveAttribute("href", "#top");
    });

    it("has one h2 with 'worked' as the amber emphasis", () => {
      render(<Experience />);
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent("Where I have worked, in reverse.");
      expect(heading.querySelector("em")).toHaveClass("italic", "text-amber");
      expect(heading.querySelector("em")).toHaveTextContent("worked");
    });

    it("shows the folio from pageFolio and the kicker Experience in the marker row", () => {
      const { container } = render(<Experience />);
      const marker = container.querySelector("section#dossier header > div") as HTMLElement;
      expect(within(marker).getByText(pageFolio("/experience"))).toBeInTheDocument();
      expect(within(marker).getByText("Experience")).toBeInTheDocument();
    });
  });

  describe("results row", () => {
    it("renders one button per result from experienceResults, in order", () => {
      render(<Experience />);
      const results = experienceResults();
      const buttons = resultButtons();
      expect(buttons).toHaveLength(results.length);
      results.forEach((r, i) => {
        expect(buttons[i]).toHaveTextContent(r.label);
      });
    });

    it("leads with the years of experience, labelled as building production AI", () => {
      render(<Experience />);
      expect(resultButtons()[0]).toHaveTextContent(`${YEARS_EXPERIENCE_NUMBER}+`);
      expect(resultButtons()[0]).toHaveTextContent("years building production AI");
    });

    it("scrolls to the current role's highlight when the years result is clicked", async () => {
      const { container } = render(<Experience />);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /years building production AI/ })); });
      const tile = article(container, "mastercard").querySelector(`[data-tech="${highlightKey(roleOf("mastercard"))}"]`);
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
      expect(scrollSpy.mock.instances[0]).toBe(tile);
    });

    it("flashes the highlight a result came from, and removes the flash after 2.4 seconds", async () => {
      const { container } = render(<Experience />);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /fewer false positives, UOB/ })); });
      const tile = article(container, "uob").querySelector(`[data-tech="${highlightKey(roleOf("uob"))}"]`) as HTMLElement;
      expect(tile).toHaveClass("result-flash");

      act(() => {
        jest.advanceTimersByTime(FLASH_MS);
      });
      expect(tile).not.toHaveClass("result-flash");
    });

    it("flashes the Toyota Tsusho highlight in its role article when its result is clicked", async () => {
      const { container } = render(<Experience />);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /better forecast accuracy, Toyota Tsusho/ })); });
      const tile = article(container, "toyota-tsusho").querySelector(`[data-tech="${highlightKey(roleOf("toyota-tsusho"))}"]`);
      expect(tile).toHaveClass("result-flash");
    });
  });

  describe("staff passes", () => {
    it("renders the strip as a tablist with one tab per role, oldest first", () => {
      render(<Experience />);
      const tablist = screen.getByRole("tablist", { name: "One staff pass per role" });
      const tabs = within(tablist).getAllByRole("tab");
      expect(tabs.map((t) => t.id)).toEqual([...ROLES].reverse().map((r) => `pass-${r.slug}`));
    });

    it("labels each pass with its short name, role, and dates (present for the current role)", () => {
      render(<Experience />);
      for (const r of ROLES) {
        const { from, to } = passDates(r);
        expect(passTab(r.slug)).toHaveAttribute("aria-label", `${r.short}, ${r.role}, ${from} to ${to ?? "present"}`);
      }
    });

    it("points each pass at its role article", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(passTab(r.slug)).toHaveAttribute("aria-controls", `role-${r.slug}`);
        expect(article(container, r.slug)).toBeInTheDocument();
      }
    });

    it("starts with the newest pass (Mastercard) picked up, and the rest not", () => {
      render(<Experience />);
      expect(passTab("mastercard")).toHaveAttribute("aria-selected", "true");
      expect(passTab("mastercard")).toHaveAttribute("tabindex", "0");
      for (const r of ROLES.slice(1)) {
        expect(passTab(r.slug)).toHaveAttribute("aria-selected", "false");
        expect(passTab(r.slug)).toHaveAttribute("tabindex", "-1");
      }
    });

    it("gives each pass its company logo, with empty alt text", () => {
      render(<Experience />);
      for (const r of ROLES) {
        const img = passTab(r.slug).querySelector("img");
        expect(img).toHaveAttribute("src", `/logos/companies/${r.brand.logo}`);
        expect(img).toHaveAttribute("alt", "");
      }
    });

    it("shows the preferred and full name on every pass", () => {
      render(<Experience />);
      for (const r of ROLES) {
        expect(within(passTab(r.slug)).getByText(NAME.preferred)).toBeInTheDocument();
        expect(within(passTab(r.slug)).getByText(NAME.full)).toBeInTheDocument();
      }
    });

    it("gives the CURRENT tag only to the Mastercard pass", () => {
      render(<Experience />);
      expect(within(passTab("mastercard")).getByText("CURRENT")).toBeInTheDocument();
      for (const r of ROLES.slice(1)) {
        expect(within(passTab(r.slug)).queryByText("CURRENT")).toBeNull();
      }
    });

    it("shows the highlight on the picked-up Mastercard pass, in place of its dates", () => {
      render(<Experience />);
      const tab = passTab("mastercard");
      expect(within(tab).getByText("Tech lead")).toBeInTheDocument();
      expect(tab).not.toHaveTextContent("Valid from");
    });

    it("shows the tenure on a picked-up finished role without a highlight, captioned as in the role", () => {
      render(<Experience />);
      fireEvent.click(passTab("ema"));
      expect(within(passTab("ema")).getByText("4 yrs 4 mos")).toBeInTheDocument();
      expect(within(passTab("ema")).getByText("in the role")).toBeInTheDocument();
    });

    it("shows the four-month tenure on a picked-up JobTech pass", () => {
      render(<Experience />);
      fireEvent.click(passTab("jobtech"));
      expect(within(passTab("jobtech")).getByText("4 mos")).toBeInTheDocument();
    });

    it("shows the dates on a pass that is not picked up", () => {
      render(<Experience />);
      expect(passTab("toyota-tsusho")).toHaveTextContent("Valid from Jun 2015");
      expect(passTab("toyota-tsusho")).toHaveTextContent("to Apr 2017");
    });

    it("does not scroll when a pass is clicked while only one role is showing", () => {
      render(<Experience />);
      fireEvent.click(passTab("toyota-tsusho"));
      expect(scrollSpy).not.toHaveBeenCalled();
    });

    it("scrolls the role article into view when its pass is clicked with every role shown", () => {
      const { container } = render(<Experience />);
      fireEvent.click(screen.getByRole("button", { name: /^Show all \d+ roles/ }));
      fireEvent.click(passTab("toyota-tsusho"));
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      expect(scrollSpy.mock.instances[0]).toBe(article(container, "toyota-tsusho"));
    });

    it("picks the clicked pass and moves the picked state off Mastercard", () => {
      render(<Experience />);
      fireEvent.click(passTab("uob"));
      expect(passTab("uob")).toHaveAttribute("aria-selected", "true");
      expect(passTab("mastercard")).toHaveAttribute("aria-selected", "false");
    });

    it("moves the pick with the arrow keys, without wrapping at the ends", () => {
      render(<Experience />);
      fireEvent.keyDown(passTab("mastercard"), { key: "ArrowLeft" });
      expect(passTab("uob")).toHaveAttribute("aria-selected", "true");
      expect(document.activeElement).toBe(passTab("uob"));

      fireEvent.click(passTab("toyota-tsusho"));
      fireEvent.keyDown(passTab("toyota-tsusho"), { key: "ArrowLeft" });
      expect(passTab("toyota-tsusho")).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("role articles", () => {
    it("renders every role as an article with the id role-{slug}, newest first", () => {
      const { container } = render(<Experience />);
      const ids = Array.from(container.querySelectorAll("article[id^='role-']"), (a) => a.id);
      expect(ids).toEqual(ROLES.map((r) => `role-${r.slug}`));
    });

    it("places the role articles after the staff passes", () => {
      const { container } = render(<Experience />);
      const tablist = screen.getByRole("tablist");
      const first = container.querySelector("article[id^='role-']") as HTMLElement;
      expect(tablist.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("labels each article by its company heading", () => {
      render(<Experience />);
      for (const r of ROLES) {
        expect(screen.getByRole("article", { name: r.company, hidden: true })).toHaveAttribute("id", `role-${r.slug}`);
      }
    });

    it("gives each company its role title, location, and dates", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        const a = article(container, r.slug);
        expect(within(a).getByRole("heading", { level: 3, name: r.company, hidden: true })).toBeInTheDocument();
        expect(within(a).getByText(r.role)).toBeInTheDocument();
        expect(within(a).getByText(r.location)).toBeInTheDocument();
        expect(within(a).getAllByText(r.dates).length).toBeGreaterThan(0);
      }
    });

    it("writes the pass header line as Pass N of 7, the short name, and the dates", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(within(article(container, r.slug)).getByText(`Pass ${passNumber(r.slug)} of ${TOTAL} · ${r.short} · ${r.dates}`)).toBeInTheDocument();
      }
    });

    it("numbers Mastercard as Pass 7 and Toyota Tsusho as Pass 1", () => {
      const { container } = render(<Experience />);
      expect(within(article(container, "mastercard")).getByText(/^Pass 7 of 7 · Mastercard/)).toBeInTheDocument();
      expect(within(article(container, "toyota-tsusho")).getByText(/^Pass 1 of 7 · Toyota Tsusho/)).toBeInTheDocument();
    });

    it("paints each header's colour square in its pass's brand colour", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        const square = article(container, r.slug).querySelector<HTMLElement>('span[aria-hidden="true"]');
        expect(square).not.toBeNull();
        expect(square!.getAttribute("style")).toContain(r.brand.color);
      }
    });

    it("shows no Incoming chip on any real role", () => {
      const { container } = render(<Experience />);
      expect(screen.queryByText("Incoming")).toBeNull();
      expect(container.querySelectorAll("article").length).toBe(TOTAL);
    });

    it("shows the Agent Suite link and the R&D Foundry deck for Mastercard, opening in a new tab", () => {
      render(<Experience />);
      const link = screen.getByRole("link", { name: "Agent Suite" });
      expect(link).toHaveAttribute("href", AGENT_SUITE_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(screen.getByText(/at the R&D Foundry/i)).toBeInTheDocument();
    });

    it("keeps the deck's own wording and marks the link with an arrow, in place", () => {
      const { container } = render(<Experience />);
      const deck = within(article(container, "mastercard")).getByRole("link", { name: "Agent Suite" }).closest("p") as HTMLElement;
      expect(deck.textContent).toBe(roleOf("mastercard").deck.replace("Agent Suite", "Agent Suite ↗"));
    });

    it("shows the deck as plain text for a role without a deck link", () => {
      const { container } = render(<Experience />);
      const uob = article(container, "uob");
      expect(within(uob).getByText(roleOf("uob").deck)).toBeInTheDocument();
      expect(within(uob).queryByRole("link", { hidden: true })).toBeNull();
    });

    it("shows each role's body text under What I did", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        if (r.body) expect(within(article(container, r.slug)).getByText(r.body)).toBeInTheDocument();
      }
    });

    it("gives each role a What I did heading", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(within(article(container, r.slug)).getByRole("heading", { level: 4, name: "What I did", hidden: true })).toBeInTheDocument();
      }
    });

    it("gives each role with a highlight a Highlight tile keyed for the results row", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES.filter((x) => x.highlight)) {
        const tile = article(container, r.slug).querySelector(`[data-tech="${highlightKey(r)}"]`) as HTMLElement;
        expect(tile).toBeInTheDocument();
        expect(within(tile).getByText(r.highlight!.caption)).toBeInTheDocument();
        expect(within(article(container, r.slug)).getByRole("heading", { level: 4, name: "Highlight", hidden: true })).toBeInTheDocument();
      }
    });

    it("gives no Highlight tile or label to a role without a highlight", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES.filter((x) => !x.highlight)) {
        const a = article(container, r.slug);
        expect(a.querySelector(`[data-tech="${highlightKey(r)}"]`)).toBeNull();
        expect(within(a).queryByRole("heading", { level: 4, name: "Highlight" })).toBeNull();
      }
    });

    it("labels the Mastercard highlight tile, whose figure is a word rather than a number", () => {
      const { container } = render(<Experience />);
      const tile = article(container, "mastercard").querySelector(`[data-tech="${highlightKey(roleOf("mastercard"))}"]`) as HTMLElement;
      expect(within(tile).getByText("Tech lead")).toBeInTheDocument();
    });

    it("shows the Illumina highlight as its savings figure, and no longer renders its pull quote", () => {
      const { container } = render(<Experience />);
      const tile = article(container, "illumina").querySelector(`[data-tech="${highlightKey(roleOf("illumina"))}"]`) as HTMLElement;
      expect(within(tile).getByText("$9M")).toBeInTheDocument();
      expect(screen.queryByText(/anticipated to save usd 9 million/i)).toBeNull();
    });

    it("gives every role its stack as tags, each keyed by its tool", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        const a = article(container, r.slug);
        expect(a.querySelectorAll("li[data-tech]")).toHaveLength(r.tech.length);
        for (const tag of r.tech) {
          expect(within(a).getByText(tag)).toHaveAttribute("data-tech", techKey(tag));
        }
      }
    });

    it("gives Illumina's stack tags their own keys, so Docker+CUDA is not the same tool as Docker", () => {
      const { container } = render(<Experience />);
      expect(within(article(container, "illumina")).getByText("Docker+CUDA")).toHaveAttribute("data-tech", "docker+cuda");
    });

    it("gives the Stack label to every role", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(within(article(container, r.slug)).getByRole("heading", { level: 4, name: "Stack", hidden: true })).toBeInTheDocument();
      }
    });

    it("renders the Ask pill for each role that has an ask, naming its label", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES.filter((x) => x.ask)) {
        expect(within(article(container, r.slug)).getByRole("button", { name: `Ask about ${r.ask!.label}`, hidden: true })).toBeInTheDocument();
      }
    });

    it("sends the role's question to Ask Titus when its pill is clicked", () => {
      const { container } = render(<Experience />);
      const listener = jest.fn();
      window.addEventListener("copilot:open", listener);
      fireEvent.click(within(article(container, "uob")).getByRole("button", { name: `Ask about ${roleOf("uob").ask!.label}`, hidden: true }));
      window.removeEventListener("copilot:open", listener);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: "chat", prompt: roleOf("uob").ask!.question });
    });

    it("falls back to an Ask pill named for the pass, asking about the company, for a role with no ask", () => {
      const { container } = render(<Experience />);
      const ck = article(container, "ck-delta");
      const pill = within(ck).getByRole("button", { name: "Ask about CK Delta", hidden: true });
      const listener = jest.fn();
      window.addEventListener("copilot:open", listener);
      fireEvent.click(pill);
      window.removeEventListener("copilot:open", listener);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: "chat", prompt: "Tell me about your time at CK Delta." });
    });

    it("gives every role exactly one Ask pill", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(within(article(container, r.slug)).getAllByRole("button", { name: /^Ask about/, hidden: true })).toHaveLength(1);
      }
    });

    it("does not render the old pull-quote blockquote, nor any role's pull quote, on the page", () => {
      const { container } = render(<Experience />);
      expect(container.querySelector("blockquote")).toBeNull();
      for (const r of ROLES) {
        if (r.pullQuote) expect(container.textContent).not.toContain(r.pullQuote);
      }
    });

    it("has no Earlier roles section, heading, or latte box any more", () => {
      const { container } = render(<Experience />);
      expect(screen.queryByRole("heading", { name: "Earlier roles" })).toBeNull();
      expect(container.querySelector("section[aria-labelledby='earlier-roles']")).toBeNull();
      expect(container.querySelector("[class*='bg-latte']")).toBeNull();
    });
  });

  describe("one role at a time", () => {
    const boxFor = (container: HTMLElement, slug: string) => container.querySelector<HTMLElement>(`[data-reveal="${slug}"]`) as HTMLElement;
    const toggle = () => screen.getByRole("button", { name: /^Show (all \d+ roles|one at a time)/ });

    it("shows only the newest role by default, and keeps every other role in the page hidden", () => {
      const { container } = render(<Experience />);
      for (const r of ROLES) {
        expect(boxFor(container, r.slug).hidden).toBe(r.slug !== "mastercard");
      }
    });

    it("offers a toggle that counts every role, not pressed by default", () => {
      render(<Experience />);
      expect(toggle()).toHaveAttribute("aria-pressed", "false");
      expect(toggle()).toHaveTextContent(`Show all ${TOTAL} roles ↓`);
    });

    it("shows every role when the toggle is pressed", () => {
      const { container } = render(<Experience />);
      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-pressed", "true");
      expect(toggle()).toHaveTextContent("Show one at a time");
      for (const r of ROLES) expect(boxFor(container, r.slug).hidden).toBe(false);
    });

    it("shows just the picked pass's role when a pass is picked", () => {
      const { container } = render(<Experience />);
      fireEvent.click(passTab("uob"));
      expect(boxFor(container, "uob").hidden).toBe(false);
      expect(boxFor(container, "mastercard").hidden).toBe(true);
    });

    it("reveals a hidden role from the results row, and picks its pass", async () => {
      const { container } = render(<Experience />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /fewer false positives, UOB/ }));
      });
      expect(boxFor(container, "uob").hidden).toBe(false);
      expect(passTab("uob")).toHaveAttribute("aria-selected", "true");
      expect(boxFor(container, "mastercard").hidden).toBe(true);
    });
  });

  describe("Mastercard and UOB content", () => {
    it("does not leak internal compliance specifics on the Mastercard card", () => {
      const { container } = render(<Experience />);
      expect(article(container, "mastercard").textContent).not.toMatch(/audit hold|retention|purge|guardrail/i);
    });

    it("does not carry removed wording on the UOB card", () => {
      const { container } = render(<Experience />);
      const text = article(container, "uob").textContent ?? "";
      for (const phrase of [/Technical lead/i, /Sole owner/i, /multi-agent GenAI platform/i, /maintaining/i, /BYOA/, /BYOC/, /including the MCP tool/i]) {
        expect(text).not.toMatch(phrase);
      }
    });

    it("renders the job title in a serif element, separate from the location", () => {
      const { container } = render(<Experience />);
      const section = article(container, "uob");
      const title = within(section).getByText("Vice President, Generative AI");
      const location = within(section).getByText("Singapore");
      expect(title).toHaveClass("font-serif", "text-ink");
      expect(location).toHaveClass("font-mono");
      expect(title).not.toContainElement(location);
      expect(location).not.toContainElement(title);
    });
  });

  describe("tech highlighting", () => {
    it("marks the same tech in other roles when a Mastercard Docker tag is hovered", () => {
      const { container } = render(<Experience />);
      const mastercard = article(container, "mastercard");
      const uob = article(container, "uob");
      const illumina = article(container, "illumina");

      fireEvent.mouseOver(within(mastercard).getByText("Docker"));

      expect(within(mastercard).getByText("Docker")).toHaveAttribute("data-on");
      expect(within(uob).getByText("Docker")).toHaveAttribute("data-on");
      // Illumina lists "Docker+CUDA", a different tool key, so it stays unmarked.
      expect(within(illumina).getByText("Docker+CUDA")).not.toHaveAttribute("data-on");
    });

    it("does not mark a different tech such as Python when Docker is hovered", () => {
      const { container } = render(<Experience />);
      fireEvent.mouseOver(within(article(container, "mastercard")).getByText("Docker"));
      expect(within(article(container, "mastercard")).getByText("Python")).not.toHaveAttribute("data-on");
      expect(within(article(container, "illumina")).getByText("Python")).not.toHaveAttribute("data-on");
    });

    it("clears the highlight when the pointer leaves the roles", () => {
      const { container } = render(<Experience />);
      const mastercard = article(container, "mastercard");
      const uob = article(container, "uob");
      const wrapper = passTab("mastercard").closest("[role='tablist']")!.parentElement!.parentElement as HTMLElement;
      expect(wrapper).toContainElement(uob);

      fireEvent.mouseOver(within(mastercard).getByText("Docker"));
      expect(within(uob).getByText("Docker")).toHaveAttribute("data-on");

      fireEvent.mouseLeave(wrapper);
      expect(container.querySelectorAll("[data-on]")).toHaveLength(0);
    });

    it("gives each tech tag the highlight classes and a normalised data-tech key", () => {
      const { container } = render(<Experience />);
      const tag = within(article(container, "uob")).getByText("Java (Spring Boot)");
      expect(tag).toHaveAttribute("data-tech", "java (spring boot)");
      expect(tag).toHaveClass("data-[on]:bg-ink", "data-[on]:text-paper");
    });

  });

  describe("Education moved to its own page", () => {
    it("renders no education section or degree on the experience page", () => {
      const { container } = render(<Experience />);
      expect(container.querySelector("#education")).toBeNull();
      expect(container.querySelector("[id^='edu-']")).toBeNull();
      expect(screen.queryByText("Singapore Management University")).not.toBeInTheDocument();
    });

    it("ends with a link to /education, labelled as the next page", () => {
      render(<Experience />);
      const next = screen.getByRole("link", { name: /next: education/i });
      expect(next).toHaveAttribute("href", "/education");
      expect(next).toHaveTextContent("→");
    });

    it("places the link as the final content of the section, after the last role", () => {
      const { container } = render(<Experience />);
      const section = container.querySelector("section#dossier") as HTMLElement;
      const next = screen.getByRole("link", { name: /next: education/i });
      expect(section).toContainElement(next);
      expect(section.lastElementChild?.querySelector("a[href='/education']")).toBe(next);
    });
  });

  it("gives every element id on the page exactly once", () => {
    const { container } = render(<Experience />);
    const ids = Array.from(container.querySelectorAll("[id]"), (el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Experience with altered role data", () => {
  it("shows an Incoming chip on a role marked incoming, and on no other", () => {
    mockRoles = ROLES.map((r) => (r.slug === "uob" ? { ...r, incoming: true } : r));
    const { container } = render(<Experience />);
    for (const r of ROLES) {
      const chip = within(article(container, r.slug)).queryByText("Incoming");
      expect(!!chip).toBe(r.slug === "uob");
    }
  });

  it("shows the tech note in place of the tags when a role has one", () => {
    mockRoles = ROLES.map((r) => (r.slug === "ck-delta" ? { ...r, techNote: "Details under NDA." } : r));
    const { container } = render(<Experience />);
    const ck = article(container, "ck-delta");
    expect(within(ck).getByText("Details under NDA.")).toBeInTheDocument();
    expect(ck.querySelector("li[data-tech]")).toBeNull();
    expect(within(ck).queryByText("Streaming Pipelines")).toBeNull();
  });

  it("renders the deck as plain text when its link text is not in the deck", () => {
    mockRoles = ROLES.map((r) =>
      r.slug === "mastercard" ? { ...r, deckLink: { text: "Not in the deck", href: "https://example.com" } } : r,
    );
    const { container } = render(<Experience />);
    const mastercard = article(container, "mastercard");
    expect(within(mastercard).queryByRole("link", { name: "Not in the deck" })).toBeNull();
    expect(within(mastercard).getByText(roleOf("mastercard").deck)).toBeInTheDocument();
  });

  it("gives no Highlight tile when the current role's highlight is removed, and its pass shows its dates when picked", () => {
    mockRoles = ROLES.map((r) => (r.slug === "mastercard" ? { ...r, highlight: undefined } : r));
    const { container } = render(<Experience />);
    expect(article(container, "mastercard").querySelector(`[data-tech="${highlightKey(roleOf("mastercard"))}"]`)).toBeNull();
    expect(within(passTab("mastercard")).queryByText("Tech lead")).toBeNull();
    expect(passTab("mastercard")).toHaveTextContent("Valid from Jul 2026");
    expect(passTab("mastercard")).toHaveTextContent("to present");
  });

  it("shows the dates of a picked finished role whose tenure does not parse, with no bottom figure", () => {
    mockRoles = ROLES.map((r) => (r.slug === "jobtech" ? { ...r, dates: "Apr 2017 — Sometime" } : r));
    render(<Experience />);
    fireEvent.click(passTab("jobtech"));
    expect(passTab("jobtech")).toHaveTextContent("Valid from Apr 2017");
    expect(passTab("jobtech")).toHaveTextContent("to Sometime");
  });
});
