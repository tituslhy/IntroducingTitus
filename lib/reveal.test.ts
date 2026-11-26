import { PENDING_SHOW_MS, REVEAL_EVENT, SHOW_EVENT, reveal, requestShow, takePendingShow, type ShowDetail } from "./reveal";

/** Frames are queued by hand, so each test decides when the next paint happens. */
let frames: FrameRequestCallback[] = [];
const paint = () => {
  const due = frames;
  frames = [];
  due.forEach((cb) => cb(0));
};

const originalRaf = window.requestAnimationFrame;

/** Listeners on the document, removed after each test so they do not leak into the next. */
const attached: EventListener[] = [];
const listen = (fn: EventListener) => {
  attached.push(fn);
  document.addEventListener(REVEAL_EVENT, fn);
};

/** Settles a promise into a flag, so a test can check it has or has not resolved. */
function track(p: Promise<void> | null) {
  const state = { done: p === null };
  void p?.then(() => {
    state.done = true;
  });
  return state;
}

/** Lets pending promise callbacks run. */
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  frames = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  };
  document.body.replaceChildren();
});

afterEach(() => {
  attached.splice(0).forEach((fn) => document.removeEventListener(REVEAL_EVENT, fn));
  window.requestAnimationFrame = originalRaf;
  jest.restoreAllMocks();
});

function hiddenRole(slug: string) {
  const box = document.createElement("div");
  box.dataset.reveal = slug;
  box.hidden = true;
  const inner = document.createElement("p");
  box.appendChild(inner);
  document.body.appendChild(box);
  return { box, inner };
}

function shownRole(slug: string) {
  const box = document.createElement("div");
  box.dataset.reveal = slug;
  const inner = document.createElement("p");
  box.appendChild(inner);
  document.body.appendChild(box);
  return { box, inner };
}

describe("REVEAL_EVENT", () => {
  it("is the event name 'reveal'", () => {
    expect(REVEAL_EVENT).toBe("reveal");
  });
});

describe("reveal", () => {
  describe("when the content is already showing", () => {
    it("returns null, with nothing to wait for, for an element in a visible role box", async () => {
      const { inner } = shownRole("alpha");
      expect(reveal(inner)).toBeNull();
      expect(frames).toHaveLength(0);
    });

    it("does not dispatch the reveal event when nothing is hidden", async () => {
      const { inner } = shownRole("alpha");
      const listener = jest.fn();
      listen(listener);
      await reveal(inner);
      expect(listener).not.toHaveBeenCalled();
    });

    it("returns null, with nothing to wait for, for an element that is not in any role box at all", async () => {
      const loose = document.createElement("p");
      document.body.appendChild(loose);
      expect(reveal(loose)).toBeNull();
      expect(frames).toHaveLength(0);
    });
  });

  describe("when the content is hidden", () => {
    it("dispatches the reveal event from the box, naming its slug in the detail", () => {
      const { box, inner } = hiddenRole("beta");
      const seen: { slug: unknown; target: EventTarget | null }[] = [];
      listen((e) => seen.push({ slug: (e as CustomEvent).detail, target: e.target }));
      void reveal(inner);
      expect(seen).toEqual([{ slug: "beta", target: box }]);
    });

    it("dispatches a bubbling event, so a listener on an ancestor such as the role list hears it", () => {
      const { box, inner } = hiddenRole("beta");
      const list = document.createElement("div");
      document.body.appendChild(list);
      list.appendChild(box);
      const onList = jest.fn();
      list.addEventListener(REVEAL_EVENT, onList);
      void reveal(inner);
      expect(onList).toHaveBeenCalledTimes(1);
      expect((onList.mock.calls[0][0] as CustomEvent).bubbles).toBe(true);
    });

    it("dispatches the event before it waits for the paint", () => {
      const { inner } = hiddenRole("beta");
      const listener = jest.fn();
      listen(listener);
      void reveal(inner);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
    });

    it("does not resolve until two animation frames have passed", async () => {
      const { inner } = hiddenRole("beta");
      const state = track(reveal(inner));
      await flushMicrotasks();
      expect(state.done).toBe(false);

      paint();
      await flushMicrotasks();
      expect(state.done).toBe(false);

      paint();
      await flushMicrotasks();
      expect(state.done).toBe(true);
    });

    it("resolves on the second frame, not the first, so React has time to un-hide the box", async () => {
      const { inner } = hiddenRole("beta");
      const order: string[] = [];
      listen(() => order.push("event"));
      const done = reveal(inner)!.then(() => order.push("resolved"));
      paint();
      await flushMicrotasks();
      expect(order).toEqual(["event"]);
      paint();
      await done;
      expect(order).toEqual(["event", "resolved"]);
    });

    it("resolves even when no listener un-hides the box, so the caller is never left waiting", async () => {
      const { box, inner } = hiddenRole("beta");
      const state = track(reveal(inner));
      paint();
      paint();
      await flushMicrotasks();
      expect(state.done).toBe(true);
      expect(box.hidden).toBe(true);
    });

    it("un-hides the box when a listener does, before the promise resolves", async () => {
      const { box, inner } = hiddenRole("beta");
      listen(() => {
        box.hidden = false;
      });
      const done = reveal(inner);
      paint();
      paint();
      await done;
      expect(box.hidden).toBe(false);
    });

    it("names the nearest role box's slug when role boxes are nested", () => {
      const outer = hiddenRole("outer");
      const innerBox = document.createElement("div");
      innerBox.dataset.reveal = "inner";
      innerBox.hidden = true;
      const target = document.createElement("span");
      innerBox.appendChild(target);
      outer.box.appendChild(innerBox);
      const slugs: unknown[] = [];
      listen((e) => slugs.push((e as CustomEvent).detail));
      void reveal(target);
      expect(slugs).toEqual(["inner"]);
    });

    it("accepts the element itself being the role box", () => {
      const { box } = hiddenRole("beta");
      const slugs: unknown[] = [];
      listen((e) => slugs.push((e as CustomEvent).detail));
      void reveal(box);
      expect(slugs).toEqual(["beta"]);
    });
  });
});

describe("SHOW_EVENT", () => {
  it("is the event name 'copilot:show'", () => {
    expect(SHOW_EVENT).toBe("copilot:show");
  });
});

describe("requestShow", () => {
  beforeEach(() => {
    // Clear any request left by an earlier test in this file.
    takePendingShow(() => true);
  });

  it("dispatches a bubbling SHOW_EVENT from the element, carrying the ids as detail", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    const seen: { event: CustomEvent<ShowDetail>; target: EventTarget | null }[] = [];
    const listener = (e: Event) => seen.push({ event: e as CustomEvent<ShowDetail>, target: e.target });
    document.addEventListener(SHOW_EVENT, listener);
    try {
      requestShow(el, ["tool-tigergraph", "tool-neo4j"]);
    } finally {
      document.removeEventListener(SHOW_EVENT, listener);
    }
    expect(seen).toHaveLength(1);
    expect(seen[0].event.bubbles).toBe(true);
    expect(seen[0].event.detail).toEqual({ ids: ["tool-tigergraph", "tool-neo4j"] });
    expect(seen[0].target).toBe(el);
  });

  it("reaches a listener on the element's ancestor, not only the document", () => {
    const list = document.createElement("div");
    const el = document.createElement("button");
    list.appendChild(el);
    document.body.appendChild(list);
    const onList = jest.fn();
    list.addEventListener(SHOW_EVENT, onList);
    requestShow(el, ["tool-neo4j"]);
    expect(onList).toHaveBeenCalledTimes(1);
    expect((onList.mock.calls[0][0] as CustomEvent<ShowDetail>).detail).toEqual({ ids: ["tool-neo4j"] });
  });

  it("keeps the request for a later owner, even when nothing is listening", () => {
    const el = document.createElement("button");
    requestShow(el, ["tool-neo4j"]);
    expect(takePendingShow(() => true)).toEqual(["tool-neo4j"]);
  });
});

describe("takePendingShow", () => {
  beforeEach(() => {
    takePendingShow(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns null when no request has been made", () => {
    expect(takePendingShow(() => true)).toBeNull();
  });

  it("returns the pending ids once, then null", () => {
    requestShow(document.createElement("button"), ["tool-tigergraph"]);
    expect(takePendingShow(() => true)).toEqual(["tool-tigergraph"]);
    expect(takePendingShow(() => true)).toBeNull();
  });

  it("passes the pending ids to accept", () => {
    requestShow(document.createElement("button"), ["tool-tigergraph", "role-illumina"]);
    const accept = jest.fn(() => true);
    takePendingShow(accept);
    expect(accept).toHaveBeenCalledWith(["tool-tigergraph", "role-illumina"]);
  });

  it("returns null once the request is older than PENDING_SHOW_MS, and does not call accept", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    requestShow(document.createElement("button"), ["tool-neo4j"]);
    now.mockReturnValue(1_000_000 + PENDING_SHOW_MS + 1);
    const accept = jest.fn(() => true);
    expect(takePendingShow(accept)).toBeNull();
    expect(accept).not.toHaveBeenCalled();
  });

  it("still returns a request exactly PENDING_SHOW_MS old", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    requestShow(document.createElement("button"), ["tool-neo4j"]);
    now.mockReturnValue(1_000_000 + PENDING_SHOW_MS);
    expect(takePendingShow(() => true)).toEqual(["tool-neo4j"]);
  });

  it("returns null when accept rejects the ids, and leaves the request for an accepting caller", () => {
    requestShow(document.createElement("button"), ["tool-neo4j"]);
    expect(takePendingShow(() => false)).toBeNull();
    expect(takePendingShow(() => true)).toEqual(["tool-neo4j"]);
  });

  it("a rejected request is not taken by a caller that wants other ids", () => {
    requestShow(document.createElement("button"), ["role-illumina"]);
    expect(takePendingShow((ids) => ids.includes("tool-neo4j"))).toBeNull();
    expect(takePendingShow((ids) => ids.includes("role-illumina"))).toEqual(["role-illumina"]);
  });

  it("a newer request replaces an older one that was never taken", () => {
    const el = document.createElement("button");
    requestShow(el, ["tool-tigergraph"]);
    requestShow(el, ["tool-neo4j"]);
    expect(takePendingShow(() => true)).toEqual(["tool-neo4j"]);
    expect(takePendingShow(() => true)).toBeNull();
  });

  it("a newer request restarts the age, so it is not judged by the older one's time", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    requestShow(document.createElement("button"), ["tool-tigergraph"]);
    now.mockReturnValue(1_000_000 + PENDING_SHOW_MS);
    requestShow(document.createElement("button"), ["tool-neo4j"]);
    now.mockReturnValue(1_000_000 + PENDING_SHOW_MS + 1);
    expect(takePendingShow(() => true)).toEqual(["tool-neo4j"]);
  });
});
