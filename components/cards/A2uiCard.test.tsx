import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import A2uiCard from "./A2uiCard";
import { buildCard, parseShowCardArgs } from "@/lib/cards";
import { ARTICLES } from "@/lib/articles";
import { mediumPostId } from "@/lib/citation-ledger";
import type { AgentToRendererMessage } from "@a2ui/web_core/v1_0";

const RAFT = ARTICLES.find((a) => /How to RAFT your LLM/.test(a.title))!;
const BOUNCER = ARTICLES.find((a) => /Needs a Bouncer/.test(a.title))!;

/** Builds a card the way the server does: parse the model's arguments, then build from my data. */
function built(raw: unknown) {
  const args = parseShowCardArgs(JSON.stringify({ card: raw }));
  if (!args) throw new Error("fixture: parse failed");
  const result = buildCard(args, "card_1", { catalog: ARTICLES, numberOf: (slug) => (slug === RAFT.slug ? 2 : undefined) });
  if (!result.ok) throw new Error(`fixture: build failed: ${result.error}`);
  return result.card;
}

const evidenceCard = () =>
  built({
    kind: "evidence",
    places: [
      { target: "role-illumina", line: "Built the RAG stack" },
      { target: "project-margin-call", line: "Side project" },
    ],
    articles: [mediumPostId(RAFT.url)],
  });

/** A role and a school: the school has no company colour, and the role does. */
const roleAndSchoolCard = () =>
  built({
    kind: "evidence",
    places: [
      { target: "role-mastercard", line: "Tech lead" },
      { target: "edu-smu", line: "Studied AI" },
    ],
    articles: [],
  });

const compareCard = () =>
  built({
    kind: "compare",
    title: "LoRA or RAFT",
    options: [
      { name: "LoRA", article: null },
      { name: "RAFT", article: mediumPostId(RAFT.url) },
    ],
    rows: [
      { label: "Trains on", cells: ["Adapters", "Docs and answers"] },
      { label: "Good for", cells: ["Style", "Facts"] },
    ],
  });

const handlers = () => ({ onShow: jest.fn(), onAsk: jest.fn() });

let open: jest.SpyInstance;
beforeEach(() => {
  open = jest.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => {
  open.mockRestore();
});

describe("A2uiCard: evidence card", () => {
  const LABEL = "Where I did it, and sources";
  /** The Place button for a name (its name is the text beside its swatch). */
  const place = (name: string) => screen.getByText(name).closest("button") as HTMLButtonElement;
  /** A swatch: the small square drawn in a company's colour, beside a role's name. */
  const swatchOf = (button: HTMLElement) => button.querySelector("span.rounded-\\[2px\\]");

  it("draws the place label, the places, and the sources under their number, in the group named by the label", () => {
    const card = evidenceCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);

    const group = screen.getByRole("group", { name: LABEL });
    expect(within(group).getByText("Where I did it")).toBeInTheDocument();
    expect(within(group).getByText("Built the RAG stack")).toBeInTheDocument();
    expect(within(group).getByText("Side project")).toBeInTheDocument();
    expect(within(group).getByText("Sources")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: (n) => n.includes(RAFT.title) })).toBeInTheDocument();
    expect(within(group).getByText("2")).toBeInTheDocument();
  });

  it("no longer draws the Titus Times nameplate that the retired reading list had", () => {
    const card = evidenceCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);
    expect(screen.queryByText("The Titus Times")).toBeNull();
  });

  it("marks a project with a play triangle, and gives it no swatch", () => {
    const card = evidenceCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);

    expect(place("TheMarginCall")).toHaveTextContent("▶");
    expect(swatchOf(place("TheMarginCall"))).toBeNull();
  });

  it("gives a role a swatch in its company's colour, and no triangle", () => {
    const card = evidenceCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);

    expect(swatchOf(place("Illumina"))).not.toBeNull();
    expect(place("Illumina")).not.toHaveTextContent("▶");
  });

  it("gives a school neither a swatch nor a triangle", () => {
    const card = roleAndSchoolCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);

    expect(swatchOf(place("SMU"))).toBeNull();
    expect(place("SMU")).not.toHaveTextContent("▶");
    expect(swatchOf(place("Mastercard"))).not.toBeNull();
  });

  it("calls onShow with the place's target when a place is pressed", async () => {
    const user = userEvent.setup();
    const card = evidenceCard();
    const h = handlers();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...h} />);

    await user.click(place("Illumina"));
    expect(h.onShow).toHaveBeenLastCalledWith("role-illumina");

    await user.click(place("TheMarginCall"));
    expect(h.onShow).toHaveBeenLastCalledWith("project-margin-call");
    expect(h.onAsk).not.toHaveBeenCalled();
  });

  it("opens a source's Medium link in a new window, from my data", async () => {
    const user = userEvent.setup();
    const card = evidenceCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);

    await user.click(screen.getByRole("button", { name: (n) => n.includes(RAFT.title) }));
    expect(open).toHaveBeenLastCalledWith(RAFT.url, expect.anything(), expect.anything());
  });

  it("draws no sources at all when the card lists none", () => {
    const card = roleAndSchoolCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label={LABEL} {...handlers()} />);
    expect(screen.queryByText("Sources")).toBeNull();
  });

  it("draws nothing for a Place whose colour is not an oklch colour, and does not break the drawer", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const catalogId = "https://introducing-titus.vercel.app/a2ui/catalogs/titus/v1.json";
    const messages = [
      { version: "1.0", createSurface: { surfaceId: "s", catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json", metadata: {} } },
      {
        version: "1.0",
        updateComponents: {
          surfaceId: "s",
          components: [
            { id: "root", component: "Card", child: "grid" },
            { id: "grid", component: "PlaceGrid", places: ["p"], "@catalogId": catalogId },
            {
              id: "p",
              component: "Place",
              name: "Mastercard",
              line: "Tech lead",
              mark: "role",
              color: "#ff0000",
              action: { functionCall: { "@call": "showOnPage", catalogId, args: { target: "role-mastercard" } } },
              "@catalogId": catalogId,
            },
          ],
        },
      },
    ] as unknown as AgentToRendererMessage[];
    const { container } = render(<A2uiCard messages={messages} flair="plain" label={LABEL} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
    warn.mockRestore();
  });
});

describe("A2uiCard: compare table", () => {
  it("draws the compare label, the desk when shared, and a grid with the option columns", () => {
    const card = compareCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label="Compare table" {...handlers()} />);

    expect(screen.getByText("Compare · LoRA or RAFT")).toBeInTheDocument();
    const grid = screen.getByRole("table");
    const headers = within(grid).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Row", "LoRA", "RAFT"]);
    expect(within(grid).getByRole("rowheader", { name: "Trains on" })).toBeInTheDocument();
    expect(within(grid).getByText("Docs and answers")).toBeInTheDocument();
  });

  it("puts the My article links in the RAFT column, and a dash under LoRA", () => {
    const card = compareCard();
    render(<A2uiCard messages={card.messages} flair={card.flair} label="Compare table" {...handlers()} />);

    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("rowheader", { name: "My article" })).toBeInTheDocument();
    expect(within(grid).getByText("—")).toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "May 2025 [2]" })).toBeInTheDocument();
  });

  it("draws the same cells once per option for a phone, one block per column", () => {
    const card = compareCard();
    const { container } = render(<A2uiCard messages={card.messages} flair={card.flair} label="Compare table" {...handlers()} />);

    // The phone blocks sit beside the grid (CSS shows one or the other); each option gets its own heading.
    const phoneHeadings = Array.from(container.querySelectorAll("div.sm\\:hidden > div > p.font-serif")).map((p) => p.textContent);
    expect(phoneHeadings).toEqual(["LoRA", "RAFT"]);
    expect(container.querySelectorAll("div.sm\\:hidden").length).toBe(1);
    expect(screen.getAllByText("Docs and answers").length).toBeGreaterThanOrEqual(2);
  });

  it("calls onShow when a showOnPage action is pressed", async () => {
    const user = userEvent.setup();
    const h = handlers();
    const messages = showOnPageMessages();
    render(<A2uiCard messages={messages} flair="plain" label="Card" {...h} />);

    await user.click(screen.getByRole("button", { name: "Show on page" }));
    expect(h.onShow).toHaveBeenCalledWith("role-illumina");
    expect(h.onAsk).not.toHaveBeenCalled();
  });
});

/** A hand-written surface with one showOnPage button (the server does not build one, so this is test-only). */
function showOnPageMessages(): AgentToRendererMessage[] {
  const catalogId = "https://introducing-titus.vercel.app/a2ui/catalogs/titus/v1.json";
  return [
    { version: "1.0", createSurface: { surfaceId: "s", catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json", metadata: {} } },
    {
      version: "1.0",
      updateComponents: {
        surfaceId: "s",
        components: [
          { id: "root", component: "Card", child: "btn" },
          { id: "btn", component: "Button", child: "btn_t", action: { functionCall: { "@call": "showOnPage", catalogId, args: { target: "role-illumina" } } } },
          { id: "btn_t", component: "Text", text: "Show on page" },
        ],
      },
    },
  ] as unknown as AgentToRendererMessage[];
}

describe("A2uiCard: invalid messages", () => {
  it("renders nothing when the messages are not valid A2UI", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <A2uiCard
        messages={[{ version: "1.0", updateComponents: { surfaceId: "nope", components: [] } }] as unknown as AgentToRendererMessage[]}
        flair="plain"
        label="Card"
        {...handlers()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    warn.mockRestore();
  });

  it("renders nothing for a surface on a catalog nobody knows", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <A2uiCard
        messages={
          [
            { version: "1.0", createSurface: { surfaceId: "s", catalogId: "https://example.com/unknown.json", metadata: {} } },
            { version: "1.0", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Card", child: "t" }, { id: "t", component: "Text", text: "x" }] } },
          ] as unknown as AgentToRendererMessage[]
        }
        flair="plain"
        label="Card"
        {...handlers()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    warn.mockRestore();
  });

  it("renders nothing for an empty message list", () => {
    const { container } = render(<A2uiCard messages={[]} flair="plain" label="Card" {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
