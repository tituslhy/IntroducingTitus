import { COPILOT_OPEN_EVENT, openCopilot, type CopilotOpenDetail } from "./copilot-events";

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
