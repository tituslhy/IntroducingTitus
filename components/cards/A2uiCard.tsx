"use client";

import { Component as ReactComponent, Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { A2uiSurface, createComponentImplementation } from "@a2ui/react";
import {
  Catalog,
  MessageProcessor,
  createFunctionImplementation,
  sanitizeMediaUrl,
  type AgentToRendererMessage,
} from "@a2ui/web_core/v1_0";
import {
  ButtonApi,
  CardApi,
  ColumnApi,
  DividerApi,
  ImageApi,
  OpenUrlImplementation,
  RowApi,
  TextApi,
} from "@a2ui/web_core/catalogs/basic/v1";
import {
  AskApi,
  BASIC_CATALOG_ID,
  FigureApi,
  LabelApi,
  PillApi,
  PlaceApi,
  PlaceGridApi,
  PROTOCOL_VERSION,
  ShowOnPageApi,
  SourceApi,
  SWATCH_COLOR,
  TITUS_CATALOG_ID,
  TableApi,
  TableRowApi,
  TitleApi,
  type Flair,
} from "@/lib/a2ui-catalog";

// ---------------------------------------------------------------------------
// Draws a card from its A2UI v1.0 messages. Google's engine (@a2ui/web_core's
// MessageProcessor, @a2ui/react's A2uiSurface) reads the messages, checks them
// and binds the data; every component is drawn here, in the site's own grammar,
// against Google's own component definitions. A flair (a card borrowing its
// page's look) only changes how the pieces are drawn.
// Loaded lazily by the drawer, only once a card arrives.
// ---------------------------------------------------------------------------

const FlairContext = createContext<Flair>("plain");
/** Where a piece sits, so it can take the right size: on a button, in a table cell. */
const PlaceContext = createContext<"card" | "button" | "cell">("card");
/** Set while a Table draws one column at a time (phones): TableRow then draws only that column's cell. */
const ColumnContext = createContext<{ index: number; name: string } | null>(null);
/** How deep in Columns a piece sits: the card's outer column is 0. */
const DepthContext = createContext(0);

type Ref = string | { id: string; basePath: string };
const refId = (r: Ref) => (typeof r === "string" ? r : r.id);
const refPath = (r: Ref) => (typeof r === "string" ? undefined : r.basePath);
const childList = (list: unknown): Ref[] => (Array.isArray(list) ? (list as Ref[]) : []);

// --- Google's basic catalog, drawn my way ----------------------------------

const Card = createComponentImplementation(CardApi, ({ props, buildChild }) => (
  <section className="rounded-[20px] bg-paper-deep px-4 pb-4 pt-3.5">{buildChild(props.child as string)}</section>
));

/** The card's outer column spaces its groups; a column inside it (one story) sits tighter. */
const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => {
  const depth = useContext(DepthContext);
  return (
    <div className={`flex min-w-0 flex-col ${depth === 0 ? "gap-3" : "gap-1.5"}`}>
      <DepthContext.Provider value={depth + 1}>
        {childList(props.children).map((c) => (
          <Fragment key={refId(c)}>{buildChild(refId(c), refPath(c))}</Fragment>
        ))}
      </DepthContext.Provider>
    </div>
  );
});

/** A row of stories: side by side under a column rule when there's room, stacked on a phone. */
const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => (
  <div className="grid grid-cols-1 gap-3 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-3 sm:grid-cols-2 sm:gap-0 sm:[&>*+*]:border-l sm:[&>*+*]:border-t-0 sm:[&>*+*]:pl-3 sm:[&>*+*]:pt-0 sm:[&>*]:pr-3 sm:[&>*:last-child]:pr-0">
    {childList(props.children).map((c) => (
      <div key={refId(c)} className="min-w-0">
        {buildChild(refId(c), refPath(c))}
      </div>
    ))}
  </div>
));

const Image = createComponentImplementation(ImageApi, ({ props }) => {
  const src = typeof props.url === "string" ? sanitizeMediaUrl(props.url) : null;
  if (!src) return null;
  const large = props.variant === "largeFeature" || props.variant === "header";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Medium's CDN, as on the Writing page
    <img
      src={src}
      alt={typeof props.description === "string" ? props.description : ""}
      loading="lazy"
      className={`block rounded-xl bg-latte object-cover ${large ? "h-32 w-full" : "h-[76px] w-[76px]"}`}
    />
  );
});

const Text = createComponentImplementation(TextApi, ({ props }) => {
  const place = useContext(PlaceContext);
  const value = typeof props.text === "string" ? props.text : "";
  if (place === "button") return <>{value}</>;
  if (place === "cell") return <p lang="en" className="hyphens-auto font-serif text-[13.5px] leading-[1.4] text-ink [overflow-wrap:anywhere]">{value}</p>;
  if (props.variant === "caption") return <p className="font-mono text-[10px] leading-relaxed text-ink-faint">{value}</p>;
  return <p className="font-serif text-[13.5px] leading-[1.45] text-ink-soft">{value}</p>;
});

const Button = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const onClick = () => void props.action?.();
  const label = <PlaceContext.Provider value="button">{buildChild(props.child as string)}</PlaceContext.Provider>;
  if (props.variant === "borderless") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="self-start text-left font-mono text-[11px] text-amber underline decoration-dotted underline-offset-[3px] transition-colors hover:text-ink"
      >
        {label}
        <span aria-hidden="true"> ↗</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mt-1 inline-flex items-center gap-1.5 self-start rounded-full border border-ink px-3.5 py-2 text-left font-mono text-[12px] text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      {label}
      <span aria-hidden="true" className="font-semibold text-amber group-hover:text-amber-hi">
        →
      </span>
    </button>
  );
});

const Divider = createComponentImplementation(DividerApi, () => <hr className="border-0 border-t border-rule" />);

// --- My catalog ---------------------------------------------------------------

const Label = createComponentImplementation(LabelApi, ({ props }) => {
  const value = typeof props.text === "string" ? props.text : "";
  return props.tone === "amber" ? (
    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-amber">{value}</p>
  ) : (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">{value}</p>
  );
});

const Title = createComponentImplementation(TitleApi, ({ props }) => {
  const value = typeof props.text === "string" ? props.text : "";
  return props.level === "lead" ? (
    <h4 className="font-serif text-[21px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">{value}</h4>
  ) : (
    <h4 className="font-serif text-[15.5px] font-medium leading-[1.2] text-ink">{value}</h4>
  );
});

const Pill = createComponentImplementation(PillApi, ({ props }) => (
  <span className="inline-block rounded-full border border-rule-strong bg-paper px-2.5 py-1 font-mono text-[11px] text-ink-soft">
    {typeof props.text === "string" ? props.text : ""}
  </span>
));

const Figure = createComponentImplementation(FigureApi, ({ props }) => (
  <div className="glow-tile rounded-2xl bg-ink px-4 py-3.5">
    <p className="font-serif text-[36px] font-medium leading-none tracking-[-0.03em] text-amber-hi">
      {typeof props.value === "string" ? props.value : ""}
    </p>
    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-paper/75">
      {typeof props.caption === "string" ? props.caption : ""}
    </p>
  </div>
));

/**
 * A table where there's room: a grid with table roles (A2UI wraps each piece in its own element, which an HTML
 * <table> doesn't allow). On a phone, one block per column (option), so it never scrolls sideways. Both are in the
 * page; CSS shows one.
 */
const Table = createComponentImplementation(TableApi, ({ props, buildChild }) => {
  const columns = Array.isArray(props.columns) ? props.columns.map(String) : [];
  const rows = childList(props.rows);
  return (
    <div>
      <div
        role="table"
        className="hidden sm:grid"
        style={{ gridTemplateColumns: `78px repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
      >
        <div role="row" className="contents">
          <span role="columnheader" className="pb-1">
            <span className="sr-only">Row</span>
          </span>
          {columns.map((c) => (
            <span key={c} role="columnheader" className="px-2 pb-1 font-serif text-[18px] font-medium leading-tight text-ink">
              {c}
            </span>
          ))}
        </div>
        <PlaceContext.Provider value="cell">
          {rows.map((r) => (
            <Fragment key={refId(r)}>{buildChild(refId(r), refPath(r))}</Fragment>
          ))}
        </PlaceContext.Provider>
      </div>
      <div className="flex flex-col gap-2.5 sm:hidden">
        {columns.map((name, index) => (
          <div key={name} className="flex flex-col gap-1.5 rounded-2xl bg-paper px-3.5 py-3">
            <p className="font-serif text-[17px] font-medium text-ink">{name}</p>
            <ColumnContext.Provider value={{ index, name }}>
              <PlaceContext.Provider value="cell">
                {rows.map((r) => (
                  <Fragment key={refId(r)}>{buildChild(refId(r), refPath(r))}</Fragment>
                ))}
              </PlaceContext.Provider>
            </ColumnContext.Provider>
          </div>
        ))}
      </div>
    </div>
  );
});

const TableRow = createComponentImplementation(TableRowApi, ({ props, buildChild }) => {
  const column = useContext(ColumnContext);
  const label = typeof props.label === "string" ? props.label : "";
  const cells = childList(props.cells);
  if (column) {
    const cell = cells[column.index];
    return (
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-soft">{label}</p>
        {cell && buildChild(refId(cell), refPath(cell))}
      </div>
    );
  }
  return (
    <div role="row" className="contents">
      <span
        role="rowheader"
        className="border-t border-rule py-2.5 pr-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-soft"
      >
        {label}
      </span>
      {cells.map((c) => (
        <span key={refId(c)} role="cell" className="flex flex-col border-t border-rule px-2 py-2.5">
          {buildChild(refId(c), refPath(c))}
        </span>
      ))}
    </div>
  );
});

/** Places as small tiles, two to a row (one on the narrowest phones). */
const PlaceGrid = createComponentImplementation(PlaceGridApi, ({ props, buildChild }) => (
  <div className="grid grid-cols-1 gap-1.5 min-[300px]:grid-cols-2">
    {childList(props.places).map((c) => (
      <Fragment key={refId(c)}>{buildChild(refId(c), refPath(c))}</Fragment>
    ))}
  </div>
));

/** A role, project or school: its name with its mark (a company's colour, or ▶ for a project), and what I did there. */
const Place = createComponentImplementation(PlaceApi, ({ props }) => {
  const name = typeof props.name === "string" ? props.name : "";
  const line = typeof props.line === "string" ? props.line : "";
  // Only a colour from my data is ever drawn as CSS.
  const color = typeof props.color === "string" && SWATCH_COLOR.test(props.color) ? props.color : null;
  return (
    <button
      type="button"
      onClick={() => void props.action?.()}
      className="flex min-h-[64px] min-w-0 flex-col gap-1 rounded-[14px] bg-latte px-2.5 py-2 text-left transition-colors hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber [&:hover_.place-line]:text-paper/80"
    >
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-medium leading-snug">
        {props.mark === "project" ? (
          <span aria-hidden="true" className="text-[8px] text-latte-accent">
            ▶
          </span>
        ) : color ? (
          <span aria-hidden="true" className="h-[9px] w-[9px] flex-none rounded-[2px]" style={{ background: color }} />
        ) : null}
        <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
      </span>
      <span className="place-line font-serif text-[13.5px] leading-[1.3] text-[oklch(0.3_0.012_60)]">{line}</span>
    </button>
  );
});

/** One cited article under its number: the same number as the [n] in the answer. */
const Source = createComponentImplementation(SourceApi, ({ props }) => (
  <button
    type="button"
    onClick={() => void props.action?.()}
    className="grid grid-cols-[16px_1fr] border-t border-dotted border-rule py-1.5 text-left font-serif text-[14px] leading-[1.3] text-ink transition-colors hover:text-amber"
  >
    <b className="font-mono text-[10.5px] text-amber">{typeof props.n === "number" ? props.n : ""}</b>
    <span>
      {typeof props.title === "string" ? props.title : ""}
      <span aria-hidden="true"> ↗</span>
    </span>
  </button>
));

// --- The card -----------------------------------------------------------------

export type CardHandlers = { onShow: (target: string) => void; onAsk: (question: string) => void };

type Props = CardHandlers & {
  messages: AgentToRendererMessage[];
  flair: Flair;
  /** What the card is, for screen readers ("Compare table"). */
  label: string;
};

type Dispatch = <K extends keyof CardHandlers>(kind: K, arg: string) => void;

function createProcessor(dispatch: Dispatch) {
  const basic = new Catalog(BASIC_CATALOG_ID, PROTOCOL_VERSION, [Card, Column, Row, Image, Text, Button, Divider], [OpenUrlImplementation]);
  const mine = new Catalog(
    TITUS_CATALOG_ID,
    PROTOCOL_VERSION,
    [Label, Title, Pill, Figure, Table, TableRow, Place, PlaceGrid, Source],
    [
      createFunctionImplementation(ShowOnPageApi, ({ target }) => dispatch("onShow", target)),
      createFunctionImplementation(AskApi, ({ question }) => dispatch("onAsk", question)),
    ]
  );
  return new MessageProcessor([basic, mine]);
}

/** A card that can't be drawn is left out; it must never break the drawer. */
class Contain extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("Ask Titus card failed to draw:", err instanceof Error ? err.message : String(err));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function A2uiCard({ messages, flair, label, onShow, onAsk }: Props) {
  // The card's functions run on a click, long after render: they read the latest handlers from this ref.
  const handlers = useRef<CardHandlers>({ onShow, onAsk });
  useEffect(() => {
    handlers.current = { onShow, onAsk };
  }, [onShow, onAsk]);
  const dispatch = useCallback<Dispatch>((kind, arg) => handlers.current[kind](arg), []);
  // The processor only stores `dispatch` for the card's buttons; the ref is read on a click, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [surface] = useState(() => {
    try {
      const processor = createProcessor(dispatch);
      processor.processMessages(messages);
      return [...processor.model.surfacesMap.values()][0] ?? null;
    } catch (err) {
      console.warn("Ask Titus card was not valid A2UI:", err instanceof Error ? err.message : String(err));
      return null;
    }
  });
  if (!surface) return null;
  return (
    <Contain>
      <div role="group" aria-label={label} className="mt-3">
        <FlairContext.Provider value={flair}>
          <A2uiSurface surface={surface} />
        </FlairContext.Provider>
      </div>
    </Contain>
  );
}
