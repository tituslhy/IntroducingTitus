import { z } from "zod";
import { Catalog, MessageProcessor, type AgentToRendererMessage } from "@a2ui/web_core/v1_0";
import { BASIC_COMPONENTS, BASIC_FUNCTION_APIS } from "@a2ui/web_core/catalogs/basic/v1";
import themesFile from "@/content/article-themes.json";
import type { Article } from "@/lib/articles";
import { articleIdOf, mediumPostId } from "@/lib/citation-ledger";
import { EDUCATION, PROJECTS, ROLES } from "@/lib/profile";
import {
  BASIC_CATALOG_ID,
  BASIC_COMPONENT_NAMES,
  FLAIR_EXTENSION,
  PROTOCOL_VERSION,
  TITUS_CATALOG_ID,
  TITUS_COMPONENTS,
  TITUS_COMPONENT_NAMES,
  TITUS_FUNCTIONS,
  type CardKind,
  type Flair,
} from "@/lib/a2ui-catalog";

// ---------------------------------------------------------------------------
// Cards in Ask Titus replies, built by the server as A2UI v1.0 messages.
// SERVER ONLY (it reads the article corpus through its caller).
//
// A card is for an answer that organises something no single page shows: a
// comparison, or an answer that spans the site. Questions only about my
// articles filter the Writing page instead (show_on_page), and get no card.
//
// The model only picks: places on my site (role, project and school ids) with
// a few words each, and the ids of the articles it cites, for an evidence card;
// option names and short cells for a compare table. Every name, colour, title,
// date, link and citation number comes from my data here, never from the
// model, so a card can't show a role, article, link or date that doesn't exist.
// Each card is a recipe: existing pieces arranged, plus a flair tag.
// ---------------------------------------------------------------------------

/** Model-written text caps. Long text is cut at a word, never rejected: a phone wraps it anyway. */
export const MAX_LINE_CHARS = 48;
export const MAX_CELL_CHARS = 80;
export const MAX_NAME_CHARS = 28;
export const MAX_LABEL_CHARS = 24;
export const MAX_TITLE_CHARS = 48;
/** An evidence card is for a compound answer: at least two places behind it. */
export const MIN_PLACES = 2;
export const MAX_PLACES = 4;
export const MAX_SOURCES = 5;
export const MAX_OPTIONS = 3;
export const MAX_ROWS = 4;

export type EvidenceArgs = { kind: "evidence"; places: { target: string; line: string }[]; articles: string[] };
export type CompareArgs = {
  kind: "compare";
  title: string;
  options: { name: string; article: string | null }[];
  rows: { label: string; cells: string[] }[];
};
export type ShowCardArgs = EvidenceArgs | CompareArgs;

type Place = { name: string; mark: "role" | "project" | "school"; color?: string; path: string };

/** Every place an evidence card may name, by its show_on_page target id (lib/profile.ts PAGE_TARGETS). */
const PLACES = new Map<string, Place>([
  ...ROLES.map((r): [string, Place] => [`role-${r.slug}`, { name: r.short, mark: "role", color: r.brand.color, path: "/experience" }]),
  ...PROJECTS.map((p): [string, Place] => [`project-${p.slug}`, { name: p.title, mark: "project", path: "/projects" }]),
  ...EDUCATION.map((e): [string, Place] => [`edu-${e.slug}`, { name: e.short, mark: "school", path: "/education" }]),
]);
export const PLACE_TARGET_IDS = [...PLACES.keys()];

/** A link, an address or markup in model-written card text: never drawn (a card's only links come from my data). */
const UNSAFE_TEXT = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|io|ai|dev|org|net)\b|<\/?[a-z]|\]\(|javascript:)/i;

/** Trims, collapses spaces, and cuts at a word boundary with "…" past `max`. Null when blank or unsafe. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || UNSAFE_TEXT.test(text)) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** An article id as the model may write it: a 12-ish hex Medium post id, or a full Medium URL. */
function cleanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return articleIdOf(raw) || null;
}

/**
 * Returns the validated show_card arguments, or null. Unsafe or blank text, the wrong number of cells, or too many
 * items reject the card; overlong text is cut. Ids are only cleaned here: whether they exist is buildCard's check.
 */
export function parseShowCardArgs(raw: string): ShowCardArgs | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const card = (parsed as { card?: unknown } | null)?.card as Record<string, unknown> | undefined;
  if (!card || typeof card !== "object") return null;

  if (card.kind === "evidence") {
    const rawPlaces = card.places;
    const rawArticles = card.articles;
    if (!Array.isArray(rawPlaces) || rawPlaces.length < 1 || rawPlaces.length > MAX_PLACES) return null;
    // Fewer than MIN_PLACES is parsed, so buildCard can tell the model why it got no card.
    if (!Array.isArray(rawArticles) || rawArticles.length > MAX_SOURCES) return null;
    const places: EvidenceArgs["places"] = [];
    for (const item of rawPlaces as { target?: unknown; line?: unknown }[]) {
      const target = typeof item?.target === "string" ? item.target.trim() : "";
      const line = cleanText(item?.line, MAX_LINE_CHARS);
      if (!target || !line) return null;
      if (places.some((p) => p.target === target)) continue;
      places.push({ target, line });
    }
    const articles = [...new Set(rawArticles.map(cleanId).filter((id): id is string => id !== null))];
    return { kind: "evidence", places, articles };
  }

  if (card.kind === "compare") {
    const title = cleanText(card.title, MAX_TITLE_CHARS);
    const rawOptions = card.options;
    const rawRows = card.rows;
    if (!title || !Array.isArray(rawOptions) || !Array.isArray(rawRows)) return null;
    if (rawOptions.length < 2 || rawOptions.length > MAX_OPTIONS || rawRows.length < 1 || rawRows.length > MAX_ROWS) return null;
    const options: CompareArgs["options"] = [];
    for (const o of rawOptions as { name?: unknown; article?: unknown }[]) {
      const name = cleanText(o?.name, MAX_NAME_CHARS);
      if (!name) return null;
      options.push({ name, article: o?.article === null || o?.article === undefined ? null : cleanId(o.article) });
    }
    const rows: CompareArgs["rows"] = [];
    for (const r of rawRows as { label?: unknown; cells?: unknown }[]) {
      const label = cleanText(r?.label, MAX_LABEL_CHARS);
      if (!label || !Array.isArray(r?.cells) || r.cells.length !== options.length) return null;
      const cells = r.cells.map((c) => cleanText(c, MAX_CELL_CHARS));
      if (cells.some((c) => c === null)) return null;
      rows.push({ label, cells: cells as string[] });
    }
    return { kind: "compare", title, options, rows };
  }

  return null;
}

/** show_card's strict JSON schema for the Responses API: one card, of one of the two kinds. */
export const SHOW_CARD_PARAMETERS = {
  type: "object",
  properties: {
    card: {
      anyOf: [
        {
          type: "object",
          description:
            "An answer that spans my site: the roles, projects or schools behind it, and the articles of mine it cites.",
          properties: {
            kind: { type: "string", enum: ["evidence"] },
            places: {
              type: "array",
              minItems: MIN_PLACES,
              maxItems: MAX_PLACES,
              items: {
                type: "object",
                properties: {
                  target: {
                    type: "string",
                    enum: PLACE_TARGET_IDS,
                    description: "A role-, project- or edu- target from the Targets list.",
                  },
                  line: {
                    type: "string",
                    description: `What I did there, in a few words, at most ${MAX_LINE_CHARS} characters, e.g. "Tested, then red-teamed". No links.`,
                  },
                },
                required: ["target", "line"],
                additionalProperties: false,
              },
            },
            articles: {
              type: "array",
              maxItems: MAX_SOURCES,
              items: { type: "string" },
              description:
                "Ids of the articles of mine your answer cites, exactly as in My Library, only ones you read for this answer. May be empty.",
            },
          },
          required: ["kind", "places", "articles"],
          additionalProperties: false,
        },
        {
          type: "object",
          description: "2–3 options compared on 1–4 rows.",
          properties: {
            kind: { type: "string", enum: ["compare"] },
            title: { type: "string", description: `What is compared, e.g. "3 ways to fine-tune". At most ${MAX_TITLE_CHARS} characters.` },
            options: {
              type: "array",
              minItems: 2,
              maxItems: MAX_OPTIONS,
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: `The option's short name, e.g. "LoRA". At most ${MAX_NAME_CHARS} characters.` },
                  article: {
                    type: ["string", "null"],
                    description: "The id of my article on this option, from My Library, if I wrote one; else null.",
                  },
                },
                required: ["name", "article"],
                additionalProperties: false,
              },
            },
            rows: {
              type: "array",
              minItems: 1,
              maxItems: MAX_ROWS,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: `Row name, e.g. "Trains on". At most ${MAX_LABEL_CHARS} characters.` },
                  cells: {
                    type: "array",
                    items: { type: "string" },
                    description: `One short cell per option, in the options' order, at most ${MAX_CELL_CHARS} characters each. No links.`,
                  },
                },
                required: ["label", "cells"],
                additionalProperties: false,
              },
            },
          },
          required: ["kind", "title", "options", "rows"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["card"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

type Themes = { themes: { id: string; name: string }[]; assignments: Record<string, string[]> };
const THEMES = themesFile as unknown as Themes;
const THEME_NAMES = new Map(THEMES.themes.map((t) => [t.id, t.name]));

/** The article's first desk (theme) name on the Writing page, or null. */
export function deskOf(slug: string): string | null {
  const id = THEMES.assignments[slug]?.[0];
  return (id && THEME_NAMES.get(id)) || null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-06-18T…" → "Jun 2025". */
export function monthYear(publishedAt: string): string {
  const [y, m] = publishedAt.slice(0, 7).split("-").map(Number);
  return y && m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : publishedAt.slice(0, 4);
}

/** Only https links from my own data are ever put on a card. */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export type BuildDeps = {
  catalog: readonly Article[];
  /** The article's citation number in this conversation, if it has one (read this reply or cited earlier). */
  numberOf?: (slug: string) => number | undefined;
};

export type BuiltCard = {
  kind: CardKind;
  /** The A2UI v1.0 messages that draw it, in order. */
  messages: AgentToRendererMessage[];
  /** One line for the conversation history and the trace: later turns see this, never the card. */
  summary: string;
  flair: Flair;
  /** Articles on the card, by slug. */
  articles: string[];
  /** Citation numbers the card lists as sources: the drawer leaves them out of its own Sources row. */
  sources: number[];
};

export type BuildResult = { ok: true; card: BuiltCard } | { ok: false; error: string };

type Component = Record<string, unknown> & { id: string; component: string };

/** Marks a component as one of mine (the surface's default catalog is Google's basic one). */
const mine = (c: Component): Component => ({ ...c, "@catalogId": TITUS_CATALOG_ID });
const text = (id: string, value: string, variant?: "caption" | "body"): Component => ({
  id,
  component: "Text",
  text: value,
  ...(variant && { variant }),
});
const linkButton = (id: string, label: string, url: string, out: Component[]): Component => {
  out.push(text(`${id}_t`, label));
  return {
    id,
    component: "Button",
    variant: "borderless",
    child: `${id}_t`,
    action: { functionCall: { "@call": "openUrl", args: { url } } },
  };
};

function messagesFor(surfaceId: string, flair: Flair, components: Component[]): AgentToRendererMessage[] {
  return [
    {
      version: PROTOCOL_VERSION,
      createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID, metadata: { extensions: { [FLAIR_EXTENSION]: flair } } },
    },
    { version: PROTOCOL_VERSION, updateComponents: { surfaceId, components } },
  ] as AgentToRendererMessage[];
}

function lookupFor(catalog: readonly Article[]) {
  const byId = new Map<string, Article>();
  for (const a of catalog) {
    const pid = mediumPostId(a.url);
    if (pid && !byId.has(pid)) byId.set(pid, a);
  }
  return (id: string) => byId.get(id);
}

const quoted = (items: string[]) => items.map((t) => `“${t}”`).join(", ");

/**
 * An answer that spans the site: the places behind it as small tiles (each opens on the page), then the articles it
 * cites under their citation numbers. It must span at least two parts of the site, or it isn't worth a card.
 */
function buildEvidence(args: EvidenceArgs, surfaceId: string, deps: BuildDeps): BuildResult {
  const places = args.places.flatMap(({ target, line }) => {
    const place = PLACES.get(target);
    return place ? [{ ...place, target, line }] : [];
  });
  if (places.length === 0) return { ok: false, error: "none of those places is on my site" };
  if (places.length < MIN_PLACES) {
    return { ok: false, error: `this card is for compound answers: at least ${MIN_PLACES} roles, projects or schools` };
  }
  const lookup = lookupFor(deps.catalog);
  // Only articles read in this conversation have a number to cite them by.
  const sources = args.articles
    .flatMap((id) => {
      const a = lookup(id);
      const url = safeUrl(a?.url);
      const n = a ? deps.numberOf?.(a.slug) : undefined;
      return a && url && n ? [{ a, url, n }] : [];
    })
    .sort((x, y) => x.n - y.n);
  const parts = new Set(places.map((p) => p.path));
  if (sources.length > 0) parts.add("/writing");
  if (parts.size < 2) {
    return { ok: false, error: "this card is for answers that span my site: two or more of experience, projects, education and writing" };
  }

  const out: Component[] = [];
  const placeIds = places.map((p, i) => {
    out.push(
      mine({
        id: `p${i}`,
        component: "Place",
        name: p.name,
        line: p.line,
        mark: p.mark,
        ...(p.color && { color: p.color }),
        action: { functionCall: { "@call": "showOnPage", catalogId: TITUS_CATALOG_ID, args: { target: p.target } } },
      })
    );
    return `p${i}`;
  });
  out.push(mine({ id: "where", component: "Label", text: "Where I did it" }));
  out.push(mine({ id: "places", component: "PlaceGrid", places: placeIds }));
  const body = ["where", "places"];
  if (sources.length > 0) {
    const sourceIds = sources.map((s, i) => {
      out.push(
        mine({
          id: `s${i}`,
          component: "Source",
          n: s.n,
          title: s.a.title,
          action: { functionCall: { "@call": "openUrl", args: { url: s.url } } },
        })
      );
      return `s${i}`;
    });
    out.push(mine({ id: "read", component: "Label", text: "Sources" }));
    out.push({ id: "list", component: "Column", children: sourceIds });
    body.push("read", "list");
  }
  out.push({ id: "col", component: "Column", children: body });
  out.push({ id: "root", component: "Card", child: "col" });

  const cited = sources.length ? `; sources ${sources.map((s) => `[${s.n}]`).join(", ")}` : "";
  return {
    ok: true,
    card: {
      kind: "evidence",
      messages: messagesFor(surfaceId, "plain", out),
      summary: `[Card shown: where I did it, ${quoted(places.map((p) => p.name))}${cited}]`,
      flair: "plain",
      articles: sources.map((s) => s.a.slug),
      sources: sources.map((s) => s.n),
    },
  };
}

/** The compare table: options as columns, the model's short cells, and a row linking my article on each. */
function buildCompare(args: CompareArgs, surfaceId: string, deps: BuildDeps): BuildResult {
  const lookup = lookupFor(deps.catalog);
  // An unknown article id drops that link, not the card: the cells are still the answer.
  const linked = args.options.map((o) => {
    const a = o.article ? lookup(o.article) : undefined;
    const url = safeUrl(a?.url);
    return a && url ? { a, url } : null;
  });

  const out: Component[] = [];
  const rowIds = args.rows.map((r, i) => {
    const cells = r.cells.map((c, j) => {
      out.push(text(`r${i}c${j}`, c));
      return `r${i}c${j}`;
    });
    out.push(mine({ id: `r${i}`, component: "TableRow", label: r.label, cells }));
    return `r${i}`;
  });
  if (linked.some(Boolean)) {
    const cells = linked.map((l, j) => {
      const id = `rlc${j}`;
      if (!l) {
        out.push(text(id, "—"));
        return id;
      }
      const n = deps.numberOf?.(l.a.slug);
      out.push(linkButton(id, `${monthYear(l.a.publishedAt)}${n ? ` [${n}]` : ""}`, l.url, out));
      return id;
    });
    out.push(mine({ id: "rl", component: "TableRow", label: "My article", cells }));
    rowIds.push("rl");
  }
  out.push(mine({ id: "table", component: "Table", columns: args.options.map((o) => o.name), rows: rowIds }));

  const body = ["label"];
  out.push(mine({ id: "label", component: "Label", text: `Compare · ${args.title}` }));
  const desks = [...new Set(linked.flatMap((l) => (l ? [deskOf(l.a.slug)] : [])))];
  if (desks.length === 1 && desks[0]) {
    out.push(mine({ id: "desk", component: "Label", text: desks[0], tone: "amber" }));
    body.push("desk");
  }
  body.push("table");
  out.push({ id: "col", component: "Column", children: body });
  out.push({ id: "root", component: "Card", child: "col" });

  return {
    ok: true,
    card: {
      kind: "compare",
      messages: messagesFor(surfaceId, "plain", out),
      summary: `[Card shown: compare table of ${quoted(args.options.map((o) => o.name))} on ${quoted(args.rows.map((r) => r.label))}]`,
      flair: "plain",
      articles: linked.flatMap((l) => (l ? [l.a.slug] : [])),
      sources: [],
    },
  };
}

/** Builds the card from my data, then checks it against both catalogs. A card that fails the check is never sent. */
export function buildCard(args: ShowCardArgs, surfaceId: string, deps: BuildDeps): BuildResult {
  const built = args.kind === "evidence" ? buildEvidence(args, surfaceId, deps) : buildCompare(args, surfaceId, deps);
  if (!built.ok) return built;
  const problem = checkMessages(built.card.messages);
  return problem ? { ok: false, error: `card failed its A2UI check: ${problem}` } : built;
}

// ---------------------------------------------------------------------------
// Checking: Google's own message processor, run on the server against both
// catalogs' component definitions (schemas, allowed parents and children),
// plus the checks it leaves to renderers: only known components, https links.
// ---------------------------------------------------------------------------

let catalogs: Catalog<never>[] | null = null;

function checkingCatalogs() {
  catalogs ??= [
    new Catalog(BASIC_CATALOG_ID, PROTOCOL_VERSION, BASIC_COMPONENTS, BASIC_FUNCTION_APIS),
    new Catalog(TITUS_CATALOG_ID, PROTOCOL_VERSION, TITUS_COMPONENTS, TITUS_FUNCTIONS),
  ] as unknown as Catalog<never>[];
  return catalogs;
}

const KNOWN: Record<string, readonly string[]> = {
  [BASIC_CATALOG_ID]: BASIC_COMPONENT_NAMES,
  [TITUS_CATALOG_ID]: TITUS_COMPONENT_NAMES,
};

const UrlSchema = z.string().url().refine((u) => u.startsWith("https://"));

/** Null when the messages are valid A2UI v1.0 for my two catalogs; otherwise what is wrong. */
export function checkMessages(messages: readonly AgentToRendererMessage[]): string | null {
  for (const m of messages) {
    const update = (m as { updateComponents?: { components: Component[] } }).updateComponents;
    for (const c of update?.components ?? []) {
      const catalogId = (c["@catalogId"] as string | undefined) ?? BASIC_CATALOG_ID;
      if (!KNOWN[catalogId]?.includes(c.component)) return `unknown component ${c.component} (${c.id})`;
      if (c.component === "Image" && !UrlSchema.safeParse(c.url).success) return `image ${c.id} is not https`;
      const call = (c.action as { functionCall?: { "@call"?: string; args?: { url?: unknown } } } | undefined)?.functionCall;
      if (call?.["@call"] === "openUrl" && !UrlSchema.safeParse(call.args?.url).success) return `link ${c.id} is not https`;
    }
  }
  try {
    const processor = new MessageProcessor(checkingCatalogs());
    processor.processMessages(messages as AgentToRendererMessage[]);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
