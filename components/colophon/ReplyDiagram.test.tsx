import { fireEvent, render, screen } from "@testing-library/react";
import { MAX_ARTICLES_PER_REPLY, MAX_READING_CALLS, MAX_TOPICS, MIN_SCORE, RELEVANT, SECTION_BUDGET_CHARS, STAGE2_MAX } from "@/lib/search-config";
import ReplyDiagram from "./ReplyDiagram";

describe("ReplyDiagram", () => {
  it("renders a desktop and a mobile SVG, each labelled as an image", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    const svgs = container.querySelectorAll('svg[role="img"]');
    expect(svgs).toHaveLength(2);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("describes the search_writing path and the article count in each label", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("search_writing");
      expect(label).toContain("65 articles");
    }
  });

  it("labels the agent loop, GPT, the tools and the round-trip arrows in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const text = svg.textContent ?? "";
      for (const label of ["AGENT LOOP", "≤4 rounds", "GPT", "TOOLS", "show_on_page", "search_writing", "calls", "results", "answer"]) {
        expect(text).toContain(label);
      }
      expect(text).toMatch(/article text back to GPT/);
    }
  });

  it("describes the round trip in each aria-label", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("the tool results go back to GPT for the next round, for at most four rounds");
    }
  });

  it("shows the filter box as noul × articleCount, using the count passed in", () => {
    render(<ReplyDiagram articleCount={12} />);

    expect(screen.getAllByText("noul × 12")).toHaveLength(2);
    expect(screen.queryByText("noul × 65")).not.toBeInTheDocument();
  });
});

describe("ReplyDiagram read_writing", () => {
  it("shows the read_writing tool in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      expect(svg.textContent ?? "").toContain("read_writing");
    }
  });
});

describe("ReplyDiagram search_writing topics", () => {
  it("labels the search tool search_writing(topics) and says it searches each topic separately", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      expect(svg.textContent ?? "").toContain("search_writing(topics)");
      expect(svg.getAttribute("aria-label") ?? "").toMatch(/each topic separately/i);
    }
  });
});

describe("ReplyDiagram two routes", () => {
  const svgsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('svg[role="img"]'));

  it("draws the topic split and the merge, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("topic 1");
      expect(text).toContain("merge");
      expect(text).toContain("round-robin");
    }
  });

  it("draws the library-map route with no search, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("read_writing");
      expect(text).toContain("library map");
      expect(text).toContain("no search");
    }
  });

  it("both routes meet at Jev sections, under the reply cap, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={12} />);

    for (const svg of svgsOf(container)) {
      const text = svg.textContent ?? "";
      expect(text).toContain("Jev sections");
      expect(text).toContain(`≤${MAX_ARTICLES_PER_REPLY} articles a reply`);
    }
  });

  it("the description covers both routes", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgsOf(container)) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("library map");
      expect(label).toContain("read_writing");
      expect(label).toContain("Jev sections");
      expect(label).toMatch(/merge/i);
    }
  });
});

describe("ReplyDiagram either route, one call", () => {
  // The desktop SVG is hidden on mobile (class "hidden"); the mobile SVG is the one shown as a block.
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("marks the two routes as alternatives, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const texts = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent?.trim());
      expect(texts).toContain("or");
    }
  });

  it("says one search_writing call searches every topic, in each SVG", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    expect(desktopSvg(container).textContent ?? "").toContain("one call: each topic searched separately");
    expect(mobileSvg(container).textContent ?? "").toContain(`1 call, ≤${MAX_TOPICS} searches`);
  });

  it("the description says one route per call, and a reply can use both", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("one route per call");
      expect(label).toContain("a reply can use both");
      expect(label).toMatch(/in one call/i);
    }
  });
});

describe("ReplyDiagram names Jev's operations", () => {
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("the rank box says score × top N, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      expect(svg.textContent ?? "").toContain(`score × top ${STAGE2_MAX}`);
    }
  });

  it("the sections box says score per section and what it keeps, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const text = svg.textContent ?? "";
      expect(text).toContain("score × each section");
      expect(text).toContain(`keeps the best sections, ≤ ${SECTION_BUDGET_CHARS.toLocaleString("en-GB")} chars an article`);
    }
  });

  it("pass labels say what is measured, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of [desktopSvg(container), mobileSvg(container)]) {
      const text = svg.textContent ?? "";
      expect(text).toContain(`p(yes) ≥ ${RELEVANT}`);
      expect(text).toContain(`≥ ${MIN_SCORE.toFixed(1)} of 3`);
    }
  });

  it("the description names noul and score, and each section", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toContain("noul");
      expect(label).toContain("score");
      expect(label).toContain("each section");
    }
  });
});

describe("ReplyDiagram reading call limit", () => {
  it("shows the per-reply call limit of the reading tools, derived from MAX_READING_CALLS, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of Array.from(container.querySelectorAll('svg[role="img"]'))) {
      expect(svg.textContent ?? "").toContain(`≤${MAX_READING_CALLS} calls`);
      expect(svg.getAttribute("aria-label") ?? "").toContain(`at most ${MAX_READING_CALLS} times per reply`);
    }
  });
});


describe("ReplyDiagram still figure (no replay state)", () => {
  it("draws no data-state attributes when state is not given", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    expect(container.querySelectorAll("[data-state]")).toHaveLength(0);
  });

  it("does not show recorded topics without state, even when topics are passed", () => {
    const { container } = render(<ReplyDiagram articleCount={65} topics={["LangChain", "LangGraph"]} />);

    const text = container.textContent ?? "";
    expect(text).not.toContain("LangChain");
    expect(text).not.toContain("LangGraph");
    expect(text).toContain("topic 1");
    expect(text).toContain("topic 1 · 2 · 3");
  });

  it("draws the record box in both SVGs, unkeyed to any state", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    const records = container.querySelectorAll('g[data-k="record"]');
    expect(records).toHaveLength(2);
    records.forEach((g) => expect(g).not.toHaveAttribute("data-state"));
  });
});

describe("ReplyDiagram record box", () => {
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("says my record + library map on desktop and record + library map on mobile, with its sub-label", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    expect(desktopSvg(container).textContent ?? "").toContain("my record + library map");
    expect(desktopSvg(container).textContent ?? "").toContain("in the prompt");
    expect(mobileSvg(container).textContent ?? "").toContain("record + library map");
  });

  it("is lit while the first round runs, and done once it has finished", () => {
    const { container, rerender } = render(<ReplyDiagram articleCount={65} state={{ record: "lit" }} />);
    container.querySelectorAll('g[data-k="record"]').forEach((g) => {
      expect(g).toHaveAttribute("data-state", "lit");
      expect(g.querySelector("rect")).toHaveAttribute("fill", "var(--amber-hi)");
    });

    rerender(<ReplyDiagram articleCount={65} state={{ record: "done" }} />);
    container.querySelectorAll('g[data-k="record"]').forEach((g) => {
      expect(g).toHaveAttribute("data-state", "done");
      expect(g.querySelector("rect")).toHaveAttribute("fill", "var(--amber-soft)");
    });
  });
});

describe("ReplyDiagram replay state boxes", () => {
  it("gives every keyed box the state from the map in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ gpt: "lit", guards: "done" }} />);

    const gpt = container.querySelectorAll('g[data-k="gpt"]');
    expect(gpt.length).toBeGreaterThan(0);
    gpt.forEach((g) => expect(g).toHaveAttribute("data-state", "lit"));
    container.querySelectorAll('g[data-k="guards"]').forEach((g) => expect(g).toHaveAttribute("data-state", "done"));
  });

  it("treats a key left out of the map as idle, and fades it", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ gpt: "lit" }} />);

    const checks = container.querySelectorAll('g[data-k="checks"]');
    expect(checks.length).toBeGreaterThan(0);
    checks.forEach((g) => {
      expect(g).toHaveAttribute("data-state", "idle");
      expect(g).toHaveAttribute("opacity", "0.45");
    });
  });

  it("paints lit boxes in amber-hi and done boxes in amber-soft", () => {
    const { container, rerender } = render(<ReplyDiagram articleCount={65} state={{ gpt: "lit" }} />);
    container.querySelectorAll('g[data-k="gpt"] rect').forEach((r) => expect(r).toHaveAttribute("fill", "var(--amber-hi)"));

    rerender(<ReplyDiagram articleCount={65} state={{ gpt: "done" }} />);
    container.querySelectorAll('g[data-k="gpt"] rect').forEach((r) => expect(r).toHaveAttribute("fill", "var(--amber-soft)"));
  });

  it("keeps an accent box amber when it is idle, and plain paper for a non-accent one", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ gpt: "lit" }} />);

    container.querySelectorAll('g[data-k="merge"] rect').forEach((r) => expect(r).toHaveAttribute("fill", "var(--amber-soft)"));
    container.querySelectorAll('g[data-k="checks"] rect').forEach((r) => expect(r).toHaveAttribute("fill", "var(--paper)"));
  });

  it("turns an arrow amber once its key has run, and fades an arrow whose key is idle", () => {
    const { container, rerender } = render(<ReplyDiagram articleCount={65} state={{ record: "lit" }} />);
    const record = container.querySelector('path[data-k="record"]')!;
    expect(record).toHaveAttribute("stroke", "var(--dg-measure, var(--amber))");
    expect(record).toHaveAttribute("stroke-width", "1.6");

    rerender(<ReplyDiagram articleCount={65} state={{}} />);
    const idle = container.querySelector('path[data-k="record"]')!;
    expect(idle).toHaveAttribute("stroke", "var(--ink-soft)");
    expect(idle).toHaveAttribute("opacity", "0.4");
  });

  it("gives an arrow with no key the same stroke with or without state", () => {
    const still = render(<ReplyDiagram articleCount={65} />).container.querySelector("path:not([data-k])");
    const replay = render(<ReplyDiagram articleCount={65} state={{ gpt: "lit" }} />).container.querySelector("path:not([data-k])");

    expect(still).toHaveAttribute("stroke", "var(--ink-soft)");
    expect(replay).toHaveAttribute("stroke", "var(--ink-soft)");
  });
});

describe("ReplyDiagram recorded topics", () => {
  const desktopSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("hidden")) as SVGElement;
  const mobileSvg = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg[role="img"]')).find((s) => s.classList.contains("block")) as SVGElement;

  it("shows the recorded topics in the desktop topic boxes during a replay", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ search: "lit" }} topics={["LangChain", "LangGraph"]} />);

    const titles = Array.from(desktopSvg(container).querySelectorAll("text")).map((t) => t.textContent);
    expect(titles).toContain("LangChain");
    expect(titles).toContain("LangGraph");
  });

  it("fades the topic box past the recorded topics and leaves it unkeyed", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ search: "lit" }} topics={["LangChain", "LangGraph"]} />);

    const third = Array.from(desktopSvg(container).querySelectorAll("g")).find((g) => g.querySelector("text")?.textContent === "topic 3");
    expect(third).toBeDefined();
    expect(third).toHaveAttribute("opacity", "0.45");
    expect(third!.querySelector("[data-k]")).toBeNull();
  });

  it("joins the first three recorded topics into the mobile search box", () => {
    const { container } = render(
      <ReplyDiagram articleCount={65} state={{ search: "lit" }} topics={["LangChain", "LangGraph", "Helm", "Nginx"]} />
    );

    expect(mobileSvg(container).textContent ?? "").toContain("LangChain · LangGraph · Helm");
    expect(mobileSvg(container).textContent ?? "").not.toContain("Nginx");
  });

  it("keeps the topic placeholders on mobile when a replay has no recorded topics", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ search: "idle" }} />);

    expect(mobileSvg(container).textContent ?? "").toContain("topic 1 · 2 · 3");
  });
});

describe("ReplyDiagram stage tone", () => {
  it("draws a stage figure when tone is stage, and the paper figure by default", () => {
    const { container, rerender } = render(<ReplyDiagram articleCount={65} tone="stage" />);
    expect(container.querySelectorAll("figure.reply-stage")).toHaveLength(1);

    rerender(<ReplyDiagram articleCount={65} />);
    expect(container.querySelectorAll("figure.reply-stage")).toHaveLength(0);
    expect(container.querySelector("figure")).toHaveClass("my-[clamp(20px,3vw,32px)]");
  });
});

describe("ReplyDiagram measured and pickable boxes", () => {
  it("shows what a finished box measured in place of its explanation, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ gpt: "done" }} measured={{ gpt: "round 1 · 0.90s" }} />);

    const measured = container.querySelectorAll("text[data-measured]");
    expect(measured).toHaveLength(2);
    measured.forEach((t) => expect(t.textContent).toBe("round 1 · 0.90s"));
    expect(container.textContent).not.toContain("answer, or call tools?");
  });

  it("keeps the explanation for a box that has not run, even when a measure is given", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ gpt: "idle" }} measured={{ gpt: "round 1 · 0.90s" }} />);

    expect(container.querySelectorAll("text[data-measured]")).toHaveLength(0);
    expect(container.textContent).toContain("answer, or call tools?");
  });

  it("makes a pickable box a button with its label, pressed state and key, in both SVGs", () => {
    render(<ReplyDiagram articleCount={65} pickable={{ gpt: "GPT: open 2 spans" }} selected="gpt" onPick={jest.fn()} />);

    const gpts = screen.getAllByRole("button", { name: "GPT: open 2 spans" });
    expect(gpts).toHaveLength(2);
    gpts.forEach((g) => {
      expect(g).toHaveAttribute("aria-pressed", "true");
      expect(g).toHaveAttribute("tabindex", "0");
      expect(g).toHaveAttribute("data-pick", "gpt");
    });
  });

  it("calls onPick with the key and the element on click, Enter and Space, but not on other keys", () => {
    const onPick = jest.fn();
    render(<ReplyDiagram articleCount={65} pickable={{ sections: "Jev sections: open 1 span" }} onPick={onPick} />);
    const [first] = screen.getAllByRole("button", { name: "Jev sections: open 1 span" });

    fireEvent.click(first);
    expect(onPick).toHaveBeenLastCalledWith("sections", first);
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.keyDown(first, { key: " " });
    expect(onPick).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(first, { key: "a" });
    expect(onPick).toHaveBeenCalledTimes(3);
  });

  it("makes the tool rows pickable too, in both SVGs", () => {
    render(<ReplyDiagram articleCount={65} pickable={{ show: "show_on_page: open 1 span" }} onPick={jest.fn()} />);

    expect(screen.getAllByRole("button", { name: "show_on_page: open 1 span" })).toHaveLength(2);
  });

  it("draws no buttons without a pick handler, even when labels are given", () => {
    render(<ReplyDiagram articleCount={65} pickable={{ gpt: "GPT: open 2 spans" }} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("ReplyDiagram tool rows carry the replay state", () => {
  it("gives each tool row its state during a replay", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ show: "lit", search: "done" }} />);

    expect(container.querySelector('text[data-k="show"]')).toHaveAttribute("data-state", "lit");
    expect(container.querySelector('text[data-k="search"]')).toHaveAttribute("data-state", "done");
    expect(container.querySelector('text[data-k="read"]')).toHaveAttribute("data-state", "idle");
  });

  it("leaves the state off the tool rows of a still figure", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    container.querySelectorAll("text[data-k]").forEach((t) => expect(t).not.toHaveAttribute("data-state"));
  });
});

describe("ReplyDiagram voice step", () => {
  const svgs = (container: HTMLElement) => Array.from(container.querySelectorAll('svg[role="img"]')) as SVGElement[];
  const desktopSvg = (container: HTMLElement) => svgs(container).find((s) => s.classList.contains("hidden"))!;
  const mobileSvg = (container: HTMLElement) => svgs(container).find((s) => !s.classList.contains("hidden"))!;
  const num = (el: Element | null, attr: string) => Number(el?.getAttribute(attr));

  it("draws a dashed voice box, made on your device for spoken questions only, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgs(container)) {
      const voice = svg.querySelector('g[data-k="voice"]');
      expect(voice).not.toBeNull();
      expect(voice!.querySelector("rect")).toHaveAttribute("stroke-dasharray", "4 3");
      expect(voice!.textContent).toContain("voice, on your device");
      expect(voice!.textContent).toContain("spoken questions only");
    }
  });

  it("puts the voice step after the drawer, with a dashed arrow into it, in both SVGs", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgs(container)) {
      const drawer = svg.querySelector('g[data-k="drawer"]')!;
      const voice = svg.querySelector('g[data-k="voice"]')!;
      expect(drawer.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const arrows = svg.querySelectorAll('path[data-k="voice"]');
      expect(arrows.length).toBeGreaterThan(0);
      expect(arrows[0]).toHaveAttribute("stroke-dasharray", "4 3");
    }
  });

  it("keeps the end marker last: after the voice box, on desktop to its right and on mobile below it", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgs(container)) {
      const ends = svg.querySelectorAll('[data-terminal="end"]');
      expect(ends).toHaveLength(1);
      const voice = svg.querySelector('g[data-k="voice"]')!;
      expect(voice.compareDocumentPosition(ends[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    const dRect = desktopSvg(container).querySelector('g[data-k="voice"] rect')!;
    const dEnd = desktopSvg(container).querySelector('[data-terminal="end"] circle')!;
    expect(num(dEnd, "cx")).toBeGreaterThan(num(dRect, "x") + num(dRect, "width"));

    const mRect = mobileSvg(container).querySelector('g[data-k="voice"] rect')!;
    const mEnd = mobileSvg(container).querySelector('[data-terminal="end"] circle')!;
    expect(num(mEnd, "cy")).toBeGreaterThan(num(mRect, "y") + num(mRect, "height"));
  });

  it("keeps the end marker inside each SVG's view box", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgs(container)) {
      const [minX, minY, w, h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
      const g = svg.querySelector('[data-terminal="end"]')!;
      // The end marker sits inside the translated group in both layouts.
      const t = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(g.closest("g[transform]")?.getAttribute("transform") ?? "") ?? ["", "0", "0"];
      const circle = g.querySelector("circle")!;
      const label = g.querySelector("text")!;
      const cx = num(circle, "cx") + Number(t[1]);
      const cy = num(circle, "cy") + Number(t[2]);
      expect(cx + 8).toBeLessThanOrEqual(minX + w);
      // The ring (r 7.5) and the "end" label (10.5px, its baseline at y) both fit above the bottom edge.
      expect(cy + 8).toBeLessThanOrEqual(minY + h);
      expect(num(label, "y") + Number(t[2]) + 4).toBeLessThanOrEqual(minY + h);
    }
  });

  it("leaves no tall empty band below the end marker on mobile", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    const svg = mobileSvg(container);
    const [, minY, , h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const g = svg.querySelector('[data-terminal="end"]')!;
    const t = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(g.closest("g[transform]")?.getAttribute("transform") ?? "")!;
    const ringBottom = num(g.querySelector("circle"), "cy") + Number(t[2]) + 7.5;
    expect(minY + h - ringBottom).toBeLessThanOrEqual(16);
  });

  it("the description says a spoken question's reply is also read aloud on the visitor's device, and a typed one ends at the drawer", () => {
    const { container } = render(<ReplyDiagram articleCount={65} />);

    for (const svg of svgs(container)) {
      const label = svg.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/If the question was spoken, the reply is also read aloud by a voice made on the visitor's device/);
      expect(label).toMatch(/a typed question ends at the drawer/);
    }
  });

  it("stays idle and faded during a replay, since a recorded reply is typed", () => {
    const { container } = render(<ReplyDiagram articleCount={65} state={{ answer: "done", checks: "done", drawer: "done" }} />);

    const voice = container.querySelectorAll('g[data-k="voice"]');
    expect(voice).toHaveLength(2);
    voice.forEach((g) => {
      expect(g).toHaveAttribute("data-state", "idle");
      expect(g).toHaveAttribute("opacity", "0.45");
    });
  });
});
