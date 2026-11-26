import {
  COPILOT_OPEN_EVENT,
  COPILOT_TOUR_EVENT,
  COPILOT_TOUR_PAGE_EVENT,
  announceTourPage,
  openCopilot,
  startTour,
  type CopilotOpenDetail,
} from "./copilot-events";

describe("openCopilot", () => {
  let listener: jest.Mock;

  beforeEach(() => {
    listener = jest.fn();
    window.addEventListener(COPILOT_OPEN_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(COPILOT_OPEN_EVENT, listener);
  });

  it("dispatches copilot:open with the requested mode", () => {
    openCopilot("fit");

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>;
    expect(event.type).toBe("copilot:open");
    expect(event.detail).toEqual({ mode: "fit" });
  });

  it("defaults to chat mode", () => {
    openCopilot();

    expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({ mode: "chat" });
  });

  it("carries the prompt in the detail when one is given", () => {
    openCopilot("chat", "What did you build at Illumina?");

    expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({
      mode: "chat",
      prompt: "What did you build at Illumina?",
    });
  });

  it("leaves the prompt out of the detail when it is an empty string", () => {
    openCopilot("chat", "");

    expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({ mode: "chat" });
  });

  it("dispatches on window with the copilot:open type, so the drawer's listener hears it", () => {
    const seen: string[] = [];
    const onEvent = (e: Event) => seen.push(e.type);
    window.addEventListener(COPILOT_OPEN_EVENT, onEvent);
    try {
      openCopilot("chat", "hello");
      expect(seen).toEqual(["copilot:open"]);
    } finally {
      window.removeEventListener(COPILOT_OPEN_EVENT, onEvent);
    }
  });
});

describe("startTour", () => {
  it("dispatches copilot:tour on window exactly once", () => {
    const listener = jest.fn();
    window.addEventListener(COPILOT_TOUR_EVENT, listener);
    try {
      startTour();
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as Event).type).toBe("copilot:tour");
    } finally {
      window.removeEventListener(COPILOT_TOUR_EVENT, listener);
    }
  });

  it("names the event copilot:tour, apart from copilot:open", () => {
    expect(COPILOT_TOUR_EVENT).toBe("copilot:tour");
    expect(COPILOT_TOUR_EVENT).not.toBe(COPILOT_OPEN_EVENT);
  });

  it("does not fire the open event, which would send a question", () => {
    const open = jest.fn();
    window.addEventListener(COPILOT_OPEN_EVENT, open);
    try {
      startTour();
      expect(open).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(COPILOT_OPEN_EVENT, open);
    }
  });

  it("fires again on every call, so the tour can be restarted", () => {
    const listener = jest.fn();
    window.addEventListener(COPILOT_TOUR_EVENT, listener);
    try {
      startTour();
      startTour();
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(COPILOT_TOUR_EVENT, listener);
    }
  });

  it("stops reaching a listener that was removed", () => {
    const listener = jest.fn();
    window.addEventListener(COPILOT_TOUR_EVENT, listener);
    window.removeEventListener(COPILOT_TOUR_EVENT, listener);
    startTour();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("announceTourPage", () => {
  let listener: jest.Mock;

  beforeEach(() => {
    listener = jest.fn();
    window.addEventListener(COPILOT_TOUR_PAGE_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(COPILOT_TOUR_PAGE_EVENT, listener);
  });

  const lastDetail = () => (listener.mock.calls[listener.mock.calls.length - 1][0] as CustomEvent<string | null>).detail;

  it("names the event copilot:tour-page, apart from the other copilot events", () => {
    expect(COPILOT_TOUR_PAGE_EVENT).toBe("copilot:tour-page");
    expect(COPILOT_TOUR_PAGE_EVENT).not.toBe(COPILOT_TOUR_EVENT);
    expect(COPILOT_TOUR_PAGE_EVENT).not.toBe(COPILOT_OPEN_EVENT);
  });

  it("dispatches a CustomEvent on window carrying the path as its detail", () => {
    announceTourPage("/experience");

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<string | null>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe("copilot:tour-page");
    expect(event.detail).toBe("/experience");
  });

  it("carries null when no tour is playing", () => {
    announceTourPage(null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(lastDetail()).toBeNull();
  });

  it("fires on every call, with the latest path", () => {
    announceTourPage("/projects");
    announceTourPage("/about");
    announceTourPage(null);

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls.map(([e]) => (e as CustomEvent<string | null>).detail)).toEqual(["/projects", "/about", null]);
  });

  it("does not fire the open or tour events", () => {
    const open = jest.fn();
    const tour = jest.fn();
    window.addEventListener(COPILOT_OPEN_EVENT, open);
    window.addEventListener(COPILOT_TOUR_EVENT, tour);
    try {
      announceTourPage("/writing");
      expect(open).not.toHaveBeenCalled();
      expect(tour).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(COPILOT_OPEN_EVENT, open);
      window.removeEventListener(COPILOT_TOUR_EVENT, tour);
    }
  });

  it("stops reaching a listener that was removed", () => {
    window.removeEventListener(COPILOT_TOUR_PAGE_EVENT, listener);
    announceTourPage("/education");
    expect(listener).not.toHaveBeenCalled();
  });
});
