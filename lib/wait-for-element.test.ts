import { waitForElement } from "./wait-for-element";

/**
 * jsdom runs requestAnimationFrame on its own timer and reads the real clock, which makes
 * the timeout slow and flaky. Queue the frames by hand and drive the clock from the test.
 */
describe("waitForElement", () => {
  let frames: FrameRequestCallback[];
  let now: number;

  /** Runs one animation frame: every callback queued so far, with the current clock. */
  const runFrame = () => {
    const queued = frames;
    frames = [];
    queued.forEach((cb) => cb(now));
  };

  beforeEach(() => {
    frames = [];
    now = 1000;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    jest.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("resolves at once, without waiting a frame, when the element is already there", async () => {
    const el = document.createElement("section");
    el.id = "role-illumina";
    document.body.appendChild(el);

    const found = await waitForElement("role-illumina");

    expect(found).toBe(el);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("keeps checking each frame and resolves with the element once it renders", async () => {
    const pending = waitForElement("project-fictional-bassoon");
    let settled = false;
    void pending.then(() => (settled = true));

    runFrame();
    await Promise.resolve();
    expect(settled).toBe(false);

    const el = document.createElement("div");
    el.id = "project-fictional-bassoon";
    document.body.appendChild(el);
    runFrame();

    await expect(pending).resolves.toBe(el);
  });

  it("resolves null once the default 3 second timeout has passed without the element", async () => {
    const pending = waitForElement("never-rendered");

    now = 1000 + 2999;
    runFrame();
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    now = 1000 + 3000;
    runFrame();
    await expect(pending).resolves.toBeNull();
  });

  it("honours a custom timeout", async () => {
    const pending = waitForElement("never-rendered", 500);

    now = 1000 + 500;
    runFrame();

    await expect(pending).resolves.toBeNull();
  });

  it("does not poll after it has resolved", async () => {
    const el = document.createElement("div");
    el.id = "late";
    document.body.appendChild(el);

    await waitForElement("late");

    expect(frames).toHaveLength(0);
  });
});
