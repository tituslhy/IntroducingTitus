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
});
