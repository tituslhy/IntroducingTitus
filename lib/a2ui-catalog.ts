import { z } from "zod";
import { CommonSchemas } from "@a2ui/web_core/v1_0";

// ---------------------------------------------------------------------------
// My A2UI v1.0 component catalog: the pieces Google's basic catalog can't say
// (drawer-plans/2. ask-titus-beyond-text.md). Shared by the server, which
// builds and checks cards against it, and the drawer, which draws it. Cards mix
// it with the basic catalog in one surface (v1.0 allows mixing): structure from
// basic (Card, Row, Column, Image, Text, Button, Divider, openUrl), these on top.
//
// Adding a widget keeps this id; changing what an existing one means gets a
// new id (…/v2.json), so old messages never break.
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = "1.0" as const;

/** Google's basic catalog for v1.0 (the id the spec gives it). */
export const BASIC_CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";

/** Mine. A URI by convention; it doesn't have to resolve. */
export const TITUS_CATALOG_ID = "https://introducing-titus.vercel.app/a2ui/catalogs/titus/v1.json";

/**
 * How the drawer draws a card: a card may borrow its page's flair. Sent as a surface extension, so a client that
 * doesn't know it still draws a plain card. Extension keys must be identifiers.
 */
export const FLAIR_EXTENSION = "titusFlair";
export { FLAIRS, type Flair, CARD_KINDS, type CardKind } from "@/lib/card-flair";

/** Small capital mono label heading a group ("WHERE I DID IT"). */
export const LabelApi = {
  name: "Label",
  schema: z
    .object({
      text: CommonSchemas.DynamicString,
      /** amber for a kicker (a desk name), ink for a group label. */
      tone: z.enum(["ink", "amber"]).optional(),
    })
    .strict(),
};

/** Newsreader serif heading. `lead` for the one big item on a card, `item` for the rest. */
export const TitleApi = {
  name: "Title",
  schema: z
    .object({
      text: CommonSchemas.DynamicString,
      level: z.enum(["lead", "item"]).optional(),
    })
    .strict(),
};

/** A rounded tool tag. */
export const PillApi = {
  name: "Pill",
  schema: z.object({ text: CommonSchemas.DynamicString }).strict(),
};

/** The dark tile: one figure, huge in amber, with a caption. */
export const FigureApi = {
  name: "Figure",
  schema: z
    .object({
      value: CommonSchemas.DynamicString,
      caption: CommonSchemas.DynamicString,
    })
    .strict(),
};

/** A table: column headings, then labelled rows. On a phone it is drawn as one block per column. */
export const TableApi = {
  name: "Table",
  schema: z
    .object({
      columns: CommonSchemas.DynamicStringList,
      rows: CommonSchemas.ChildList,
    })
    .strict(),
  allowedChildren: ["TableRow"],
};

/** One labelled row of a Table: one cell per column, each a component (Text, or a Button for a link). */
export const TableRowApi = {
  name: "TableRow",
  schema: z
    .object({
      label: CommonSchemas.DynamicString,
      cells: CommonSchemas.ChildList,
    })
    .strict(),
  allowedParents: ["Table"],
};

/** A swatch colour: an oklch() colour from lib/profile.ts and nothing else, since it is drawn as CSS. */
export const SWATCH_COLOR = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+\s*\)$/;

/**
 * One place on the site behind an answer: a role (with its company's colour), a project or a school, and one line
 * on what I did there. Tapping it shows it on the page.
 */
export const PlaceApi = {
  name: "Place",
  schema: z
    .object({
      name: CommonSchemas.DynamicString,
      line: CommonSchemas.DynamicString,
      mark: z.enum(["role", "project", "school"]),
      color: z.string().regex(SWATCH_COLOR).optional(),
      action: CommonSchemas.Action,
    })
    .strict(),
  allowedParents: ["PlaceGrid"],
};

/** Places as small tiles, two to a row. */
export const PlaceGridApi = {
  name: "PlaceGrid",
  schema: z.object({ places: CommonSchemas.ChildList }).strict(),
  allowedChildren: ["Place"],
};

/** One of my articles an answer cites, under its citation number. Tapping it opens the article. */
export const SourceApi = {
  name: "Source",
  schema: z
    .object({
      n: z.number().int().positive(),
      title: CommonSchemas.DynamicString,
      action: CommonSchemas.Action,
    })
    .strict(),
};

export const TITUS_COMPONENTS = [LabelApi, TitleApi, PillApi, FigureApi, TableApi, TableRowApi, PlaceApi, PlaceGridApi, SourceApi];

/** Scrolls to, or opens, a place on the site (an id from PAGE_TARGETS in lib/profile.ts). */
export const ShowOnPageApi = {
  name: "showOnPage",
  returnType: "void" as const,
  requiresUserActivation: true,
  allowedCallers: "rendererOnly" as const,
  description: "Shows a place on the site: scrolls to it, opening its page if needed.",
  schema: z.object({ target: z.string() }).strict(),
};

/** Sends a follow-up question to Ask Titus, as if the visitor had typed it. */
export const AskApi = {
  name: "ask",
  returnType: "void" as const,
  requiresUserActivation: true,
  allowedCallers: "rendererOnly" as const,
  description: "Asks Ask Titus a follow-up question, as if the visitor had typed it.",
  schema: z.object({ question: z.string() }).strict(),
};

export const TITUS_FUNCTIONS = [ShowOnPageApi, AskApi];

/** Every component name a card may use, per catalog: anything else is a builder bug. */
export const BASIC_COMPONENT_NAMES = ["Card", "Row", "Column", "Image", "Text", "Button", "Divider"] as const;
export const TITUS_COMPONENT_NAMES = TITUS_COMPONENTS.map((c) => c.name);
