import { basicCatalog, BASIC_COMPONENTS } from "@a2ui/web_core/catalogs/basic/v1";
import {
  AskApi,
  BASIC_CATALOG_ID,
  BASIC_COMPONENT_NAMES,
  CARD_KINDS,
  FLAIR_EXTENSION,
  FLAIRS,
  PlaceApi,
  PlaceGridApi,
  PROTOCOL_VERSION,
  SourceApi,
  SWATCH_COLOR,
  ShowOnPageApi,
  TITUS_CATALOG_ID,
  TITUS_COMPONENT_NAMES,
  TITUS_COMPONENTS,
  TITUS_FUNCTIONS,
} from "./a2ui-catalog";
import { CARD_KINDS as CARD_KINDS_FROM_FLAIR } from "./card-flair";

describe("catalog ids", () => {
  it("BASIC_CATALOG_ID equals the id of Google's basic catalog for v1.0", () => {
    expect(BASIC_CATALOG_ID).toBe(basicCatalog.id);
  });

  it("uses protocol version 1.0", () => {
    expect(PROTOCOL_VERSION).toBe("1.0");
  });

  it("gives my catalog an https id that is not the basic catalog's", () => {
    expect(TITUS_CATALOG_ID).toMatch(/^https:\/\//);
    expect(TITUS_CATALOG_ID).not.toBe(BASIC_CATALOG_ID);
    expect(TITUS_CATALOG_ID.endsWith("/v1.json")).toBe(true);
  });
});

describe("flair", () => {
  it("names the flair extension with an identifier-safe key", () => {
    expect(FLAIR_EXTENSION).toBe("titusFlair");
    expect(FLAIR_EXTENSION).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });

  it("offers only the plain flair: the clipping flair was retired with the reading list", () => {
    expect(FLAIRS).toEqual(["plain"]);
  });
});

describe("card kinds", () => {
  it("offers the compare and evidence kinds, in that order", () => {
    expect(CARD_KINDS).toEqual(["compare", "evidence"]);
  });

  it("re-exports the same kinds the drawer reads from lib/card-flair", () => {
    expect(CARD_KINDS).toBe(CARD_KINDS_FROM_FLAIR);
  });
});

describe("basic component names", () => {
  it("lists the seven basic components the cards use", () => {
    expect(BASIC_COMPONENT_NAMES).toEqual(["Card", "Row", "Column", "Image", "Text", "Button", "Divider"]);
  });

  it("names only components that Google's basic catalog defines", () => {
    const googleNames = BASIC_COMPONENTS.map((c) => c.name);
    for (const name of BASIC_COMPONENT_NAMES) {
      expect(googleNames).toContain(name);
    }
  });
});

describe("my components", () => {
  it("lists Label, Title, Pill, Figure, Table, TableRow, Place, PlaceGrid and Source", () => {
    expect(TITUS_COMPONENT_NAMES).toEqual(["Label", "Title", "Pill", "Figure", "Table", "TableRow", "Place", "PlaceGrid", "Source"]);
  });

  it("names each component in TITUS_COMPONENTS, and nothing else", () => {
    expect(TITUS_COMPONENTS.map((c) => c.name)).toEqual(TITUS_COMPONENT_NAMES);
  });

  it("does not repeat a name that Google's basic catalog already has", () => {
    const googleNames = BASIC_COMPONENTS.map((c) => c.name);
    for (const name of TITUS_COMPONENT_NAMES) {
      expect(googleNames).not.toContain(name);
    }
  });

  it("gives Label a tone enum of ink and amber, and Title a level of lead or item", () => {
    const label = TITUS_COMPONENTS.find((c) => c.name === "Label")!;
    const title = TITUS_COMPONENTS.find((c) => c.name === "Title")!;
    expect(label.schema.safeParse({ text: "x", tone: "amber" }).success).toBe(true);
    expect(label.schema.safeParse({ text: "x", tone: "red" }).success).toBe(false);
    expect(title.schema.safeParse({ text: "x", level: "lead" }).success).toBe(true);
    expect(title.schema.safeParse({ text: "x", level: "huge" }).success).toBe(false);
  });

  it("makes TableRow a child of Table only, and Table take TableRow children", () => {
    const table = TITUS_COMPONENTS.find((c) => c.name === "Table") as { allowedChildren?: string[] };
    const row = TITUS_COMPONENTS.find((c) => c.name === "TableRow") as { allowedParents?: string[] };
    expect(table.allowedChildren).toEqual(["TableRow"]);
    expect(row.allowedParents).toEqual(["Table"]);
  });

  it("makes Place a child of PlaceGrid only, and PlaceGrid take Place children", () => {
    expect(PlaceApi.allowedParents).toEqual(["PlaceGrid"]);
    expect(PlaceGridApi.allowedChildren).toEqual(["Place"]);
    expect(TITUS_COMPONENTS).toEqual(expect.arrayContaining([PlaceApi, PlaceGridApi, SourceApi]));
  });
});

describe("Place, PlaceGrid and Source", () => {
  const ACTION = { functionCall: { "@call": "showOnPage", args: { target: "role-illumina" } } };

  it("takes a name, a line, a mark of role, project or school, an optional colour and an action", () => {
    const ok = { name: "Illumina", line: "Built the RAG stack", mark: "role", color: "oklch(0.72 0.16 65)", action: ACTION };
    expect(PlaceApi.schema.safeParse(ok).success).toBe(true);
    expect(PlaceApi.schema.safeParse({ name: "TheMarginCall", line: "x", mark: "project", action: ACTION }).success).toBe(true);
    expect(PlaceApi.schema.safeParse({ ...ok, mark: "company" }).success).toBe(false);
  });

  it("rejects a Place with an extra prop, since its schema is strict", () => {
    expect(PlaceApi.schema.safeParse({ name: "x", line: "y", mark: "role", action: ACTION, href: "https://x.y" }).success).toBe(false);
  });

  it("accepts only an oklch() colour, never a hex, rgb or css-injection string", () => {
    expect(SWATCH_COLOR.test("oklch(0.62 0.155 55)")).toBe(true);
    expect(SWATCH_COLOR.test("oklch(0.62 0.155 55 / 0.5)")).toBe(false);
    expect(SWATCH_COLOR.test("oklch(62% 0.155 55)")).toBe(true);
    expect(SWATCH_COLOR.test("#b76a23")).toBe(false);
    expect(SWATCH_COLOR.test("rgb(1, 2, 3)")).toBe(false);
    expect(SWATCH_COLOR.test("red")).toBe(false);
    expect(SWATCH_COLOR.test("oklch(0.5 0.1 0); background: url(x)")).toBe(false);
  });

  it("rejects a Place whose colour is not an oklch colour", () => {
    expect(PlaceApi.schema.safeParse({ name: "x", line: "y", mark: "role", color: "#ff0000", action: ACTION }).success).toBe(false);
  });

  it("takes an integer n of at least 1 and a title for a Source, and nothing else", () => {
    const source = { n: 2, title: "How to RAFT", action: ACTION };
    expect(SourceApi.schema.safeParse(source).success).toBe(true);
    expect(SourceApi.schema.safeParse({ ...source, n: 0 }).success).toBe(false);
    expect(SourceApi.schema.safeParse({ ...source, n: 1.5 }).success).toBe(false);
    expect(SourceApi.schema.safeParse({ ...source, url: "https://x.y" }).success).toBe(false);
  });
});

describe("my functions", () => {
  it("names showOnPage and ask, both renderer-only and needing a user action", () => {
    expect(TITUS_FUNCTIONS.map((f) => f.name)).toEqual(["showOnPage", "ask"]);
    for (const fn of TITUS_FUNCTIONS) {
      expect(fn.allowedCallers).toBe("rendererOnly");
      expect(fn.requiresUserActivation).toBe(true);
      expect(fn.returnType).toBe("void");
    }
  });

  it("takes a target for showOnPage and a question for ask, and nothing else", () => {
    expect(ShowOnPageApi.schema.safeParse({ target: "role-illumina" }).success).toBe(true);
    expect(ShowOnPageApi.schema.safeParse({ target: "role-illumina", extra: 1 }).success).toBe(false);
    expect(AskApi.schema.safeParse({ question: "What next?" }).success).toBe(true);
    expect(AskApi.schema.safeParse({}).success).toBe(false);
  });
});
