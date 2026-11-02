import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COPILOT_OPEN_EVENT, type CopilotOpenDetail } from "@/lib/copilot-events";
import RecruiterModeButton from "./RecruiterModeButton";

describe("RecruiterModeButton", () => {
  it("opens the drawer in fit mode when clicked", async () => {
    const user = userEvent.setup();
    const listener = jest.fn();
    window.addEventListener(COPILOT_OPEN_EVENT, listener);
    try {
      render(<RecruiterModeButton />);

      await user.click(screen.getByRole("button", { name: /check a role against my record/i }));

      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({ mode: "fit" });
    } finally {
      window.removeEventListener(COPILOT_OPEN_EVENT, listener);
    }
  });
});
