import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MicButton, StopRecordingButton, VoiceStatus, canRecord, useVoiceInput } from "./VoiceInput";
import { MAX_CLIP_BYTES, MAX_CLIP_SECONDS, MIN_CLIP_BYTES, VOICE_PROBLEMS } from "@/lib/voice-input";

// A MediaRecorder stand-in: `stop()` hands over the clip the test chose, then fires onstop, as a browser does.
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported: ((t: string) => boolean) | undefined = () => true;
  static throwOnConstruct = false;
  static throwOnStart = false;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  options: unknown;
  /** What the next stop() delivers: the recorded bytes (a tiny clip is "nothing said"). */
  clipBytes = 5_000;
  constructor(
    public stream: MediaStream,
    options?: unknown
  ) {
    if (FakeRecorder.throwOnConstruct) throw new Error("no recorder");
    this.options = options;
    FakeRecorder.instances.push(this);
  }
  start() {
    if (FakeRecorder.throwOnStart) throw new Error("cannot start");
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(this.clipBytes)], { type: "audio/webm" }) });
    this.onstop?.();
  }
}
(FakeRecorder as unknown as { isTypeSupported: unknown }).isTypeSupported = undefined;

const track = () => ({ stop: jest.fn() });
let tracks: ReturnType<typeof track>[];
let getUserMedia: jest.Mock;

function installRecorder() {
  Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
}
function removeRecorder() {
  delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
}

/** Shows what the hook reports, with buttons to drive it. */
function Harness({ onText }: { onText: (t: string) => void }) {
  const { state, seconds, supported, problem, autoStop, meterRef, start, stop, cancel, clearProblem } = useVoiceInput(onText);
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="seconds">{seconds}</span>
      <span data-testid="supported">{String(supported)}</span>
      <span data-testid="problem">{problem ?? ""}</span>
      <span data-testid="meter" ref={meterRef} />
      <span data-testid="auto">{String(autoStop)}</span>
      <button onClick={() => void start()}>start</button>
      <button onClick={stop}>stop</button>
      <button onClick={cancel}>cancel</button>
      <button onClick={clearProblem}>clear</button>
    </div>
  );
}

const fetchMock = () => global.fetch as unknown as jest.Mock;
const okResponse = (text: string) => ({ ok: true, status: 200, json: async () => ({ text }) }) as unknown as Response;
const errorResponse = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

/** Lets pending promises (permission, fetch, json) settle inside act. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  FakeRecorder.instances = [];
  FakeRecorder.isTypeSupported = undefined;
  FakeRecorder.throwOnConstruct = false;
  FakeRecorder.throwOnStart = false;
  tracks = [];
  getUserMedia = jest.fn(async () => {
    const t = track();
    tracks.push(t);
    return { getTracks: () => [t] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  global.fetch = jest.fn(async () => okResponse("What did you build at Illumina?")) as unknown as typeof fetch;
  installRecorder();
});

afterEach(() => {
  removeRecorder();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("canRecord", () => {
  it("is true when the browser has MediaRecorder and getUserMedia", () => {
    expect(canRecord()).toBe(true);
  });

  it("is false without MediaRecorder, as in an old browser", () => {
    removeRecorder();
    expect(canRecord()).toBe(false);
  });

  it("is false without getUserMedia, as on plain http", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    expect(canRecord()).toBe(false);
  });
});

describe("useVoiceInput: support", () => {
  it("reports supported where the browser can record, and the mic is then offered", () => {
    render(<Harness onText={() => {}} />);
    expect(screen.getByTestId("supported")).toHaveTextContent("true");
  });

  it("reports not supported without MediaRecorder", () => {
    removeRecorder();
    render(<Harness onText={() => {}} />);
    expect(screen.getByTestId("supported")).toHaveTextContent("false");
  });
});

describe("useVoiceInput: a clip", () => {
  it("starts recording: asks for the microphone, then shows the recording state", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true },
    });
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(FakeRecorder.instances[0].state).toBe("recording");
  });

  it("asks the browser for the first format it supports, best first", async () => {
    FakeRecorder.isTypeSupported = (t: string) => t === "audio/mp4";
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(FakeRecorder.instances[0].options).toEqual({ mimeType: "audio/mp4", audioBitsPerSecond: 32_000 });
  });

  it("lets the browser choose when it supports none of the listed formats", async () => {
    FakeRecorder.isTypeSupported = () => false;
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    // No mimeType in the options: the browser picks its own format, at the same bitrate.
    expect(FakeRecorder.instances[0].options).toEqual({ audioBitsPerSecond: 32_000 });
  });

  it("sends the clip to /api/transcribe as form data and hands the words to onText", async () => {
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe("/api/transcribe");
    expect(init.method).toBe("POST");
    const audio = (init.body as FormData).get("audio") as File;
    expect(audio.size).toBe(5_000);
    expect(audio.name).toBe("clip.webm");
    expect(onText).toHaveBeenCalledWith("What did you build at Illumina?");
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("trims the words it hands over", async () => {
    global.fetch = jest.fn(async () => okResponse("  spaced out  ")) as unknown as typeof fetch;
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(onText).toHaveBeenCalledWith("spaced out");
  });

  it("releases the microphone when the clip ends", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it("shows the transcribing state while the clip is on its way", async () => {
    let finish!: (r: Response) => void;
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as unknown as typeof fetch;
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();
    expect(screen.getByTestId("state")).toHaveTextContent("transcribing");

    await act(async () => finish(okResponse("Done.")));
    await flush();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("does not start a second recording while one is on", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances).toHaveLength(1);
  });
});

describe("useVoiceInput: problems", () => {
  async function recordAndStop(clipBytes = 5_000) {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    FakeRecorder.instances[0].clipBytes = clipBytes;
    fireEvent.click(screen.getByText("stop"));
    await flush();
  }

  it("asks for the mic with automatic gain off and noise suppression on, so a fan isn't turned back up in a pause", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true },
    });
  });

  it("retries once with plain { audio: true } when the browser can't honour those settings (OverconstrainedError)", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "OverconstrainedError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("retries once with plain { audio: true } on a TypeError for the constraint object", async () => {
    getUserMedia.mockRejectedValueOnce(new TypeError("bad constraints"));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true });
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
  });

  it("does not retry on other errors (a refused permission stays blocked) and retries only once", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.blocked);
  });

  it("when the plain retry fails too, reports that failure's problem", async () => {
    getUserMedia
      .mockRejectedValueOnce(Object.assign(new Error("no"), { name: "OverconstrainedError" }))
      .mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotFoundError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.no_mic);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("says the mic is blocked when the visitor refused it, and stays idle", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.blocked);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("says there is no microphone when the device has none", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotFoundError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.no_mic);
  });

  it("says it failed when the recorder cannot be made, and gives the mic back", async () => {
    FakeRecorder.throwOnConstruct = true;
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.failed);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("says nothing was heard for a clip under the minimum, without sending it", async () => {
    await recordAndStop(MIN_CLIP_BYTES - 1);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.silent);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("sends a clip exactly at the minimum", async () => {
    await recordAndStop(MIN_CLIP_BYTES);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("says nothing was caught when the transcript is empty", async () => {
    global.fetch = jest.fn(async () => okResponse("   ")) as unknown as typeof fetch;
    await recordAndStop();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.empty);
  });

  it("says nothing was caught for a 422 from the route", async () => {
    global.fetch = jest.fn(async () => errorResponse(422)) as unknown as typeof fetch;
    await recordAndStop();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.empty);
  });

  it("says too many clips for a 429 from the route", async () => {
    global.fetch = jest.fn(async () => errorResponse(429)) as unknown as typeof fetch;
    await recordAndStop();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.too_many);
  });

  it.each([502, 500])("says the clip did not come through for a %i from the route", async (status) => {
    global.fetch = jest.fn(async () => errorResponse(status)) as unknown as typeof fetch;
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.failed);
    expect(onText).not.toHaveBeenCalled();
  });

  it("says the clip was too long, without sending it, when it is over what the route takes", async () => {
    await recordAndStop(MAX_CLIP_BYTES + 1);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.too_long);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("sends a clip exactly at the route's limit", async () => {
    await recordAndStop(MAX_CLIP_BYTES);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("says the clip was too long for a 413 from the route", async () => {
    global.fetch = jest.fn(async () => errorResponse(413)) as unknown as typeof fetch;
    await recordAndStop();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.too_long);
  });

  it("says the clip did not come through when the network fails", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await recordAndStop();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.failed);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("clears the problem when a new recording starts", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.blocked);

    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("clears the problem on request", async () => {
    await recordAndStop(MIN_CLIP_BYTES - 1);
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.silent);

    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });
});

describe("useVoiceInput: the clock and the minute limit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("counts the seconds recorded", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(7_300);
    });

    expect(screen.getByTestId("seconds")).toHaveTextContent("7");
  });

  it("stops itself at a minute and sends what it has", async () => {
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    await act(async () => {
      jest.advanceTimersByTime(MAX_CLIP_SECONDS * 1000 - 1);
    });
    expect(FakeRecorder.instances[0].state).toBe("recording");

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await flush();

    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("What did you build at Illumina?");
  });

  it("stops the clock at a minute, however long the visitor waits", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(MAX_CLIP_SECONDS * 1000 + 5_000);
    });
    await flush();

    // At the limit the clock shows the full minute, not the last quarter-second sample before it.
    expect(screen.getByTestId("seconds").textContent).toBe(String(MAX_CLIP_SECONDS));
  });
});

describe("useVoiceInput: cancel", () => {
  it("drops a clip in progress: nothing is sent, the mic is released, and no words come back", async () => {
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("aborts a transcription in flight and reports no problem", async () => {
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }) as unknown as typeof fetch;
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("stop"));
    await flush();
    expect(screen.getByTestId("state")).toHaveTextContent("transcribing");

    fireEvent.click(screen.getByText("cancel"));
    await flush();

    expect(signal!.aborted).toBe(true);
    expect(onText).not.toHaveBeenCalled();
    expect(screen.getByTestId("problem")).toHaveTextContent("");
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("does nothing harmful when nothing is recording", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("cancel"));
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("is what happens when the page leaves mid-clip: nothing is sent, the mic is released", async () => {
    const onText = jest.fn();
    const { unmount } = render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    unmount();
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
  });
});

/** A permission prompt the test answers by hand: grant with a stream, or deny with an error. */
function pendingPrompt() {
  let grant!: (s: MediaStream) => void;
  let deny!: (e: unknown) => void;
  const promise = new Promise<MediaStream>((resolve, reject) => {
    grant = resolve;
    deny = reject;
  });
  return { promise, grant, deny };
}

describe("useVoiceInput: a permission prompt still up when the drawer closes", () => {
  it("cancel during the prompt, then grant: no recorder is made, the new stream's tracks stop, nothing is sent, state idle", async () => {
    const prompt = pendingPrompt();
    getUserMedia.mockReturnValueOnce(prompt.promise);
    const onText = jest.fn();
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();

    const track = { stop: jest.fn() };
    await act(async () => prompt.grant({ getTracks: () => [track] } as unknown as MediaStream));
    await flush();

    expect(FakeRecorder.instances).toHaveLength(0);
    expect(track.stop).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("cancel during the prompt, then deny: no problem is shown", async () => {
    const prompt = pendingPrompt();
    getUserMedia.mockReturnValueOnce(prompt.promise);
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();

    await act(async () => prompt.deny(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent("");
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("a second start while the first is waiting for the prompt is ignored: the prompt is asked once", async () => {
    const prompt = pendingPrompt();
    getUserMedia.mockReturnValueOnce(prompt.promise);
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    const track = { stop: jest.fn() };
    await act(async () => prompt.grant({ getTracks: () => [track] } as unknown as MediaStream));
    await flush();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(track.stop).not.toHaveBeenCalled();
  });
});

describe("useVoiceInput: a tap after cancelling, while the old prompt is still up", () => {
  const streamWith = (track: { stop: jest.Mock }) => ({ getTracks: () => [track] }) as unknown as MediaStream;

  it("asks again after a cancel; granting the old prompt stops its tracks and records nothing; granting the new one records", async () => {
    const old = pendingPrompt();
    const fresh = pendingPrompt();
    getUserMedia.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);

    const oldTrack = { stop: jest.fn() };
    await act(async () => old.grant(streamWith(oldTrack)));
    await flush();
    expect(oldTrack.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");

    const freshTrack = { stop: jest.fn() };
    await act(async () => fresh.grant(streamWith(freshTrack)));
    await flush();
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(freshTrack.stop).not.toHaveBeenCalled();
    expect(oldTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("a superseded denial shows no problem and leaves the new prompt's pending state alone: a third start is still ignored", async () => {
    const old = pendingPrompt();
    const fresh = pendingPrompt();
    getUserMedia.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();
    fireEvent.click(screen.getByText("start"));
    await flush();

    await act(async () => old.deny(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    await flush();
    expect(screen.getByTestId("problem")).toHaveTextContent("");
    expect(screen.getByTestId("state")).toHaveTextContent("idle");

    // The second prompt is still up: another tap is ignored, not a third prompt.
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);

    const freshTrack = { stop: jest.fn() };
    await act(async () => fresh.grant(streamWith(freshTrack)));
    await flush();
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });
});

// An analyser stand-in: every frame it is read is filled with `amp`, so the level is exactly `amp`.
class FakeAnalyser {
  fftSize = 0;
  amp = 0.001;
  reads = 0;
  getFloatTimeDomainData(frame: Float32Array) {
    this.reads++;
    frame.fill(this.amp);
  }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** When set, building the graph fails, as it can on a browser with a half-working Web Audio. */
  static throwOnSource = false;
  analyser = new FakeAnalyser();
  closed = false;
  resumed = false;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume() {
    this.resumed = true;
    return Promise.resolve();
  }
  createAnalyser() {
    return this.analyser;
  }
  createMediaStreamSource() {
    if (FakeAudioContext.throwOnSource) throw new Error("no source");
    return { connect: () => {} };
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("useVoiceInput: listening for speech", () => {
  const ctx = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
  const meter = () => screen.getByTestId("meter");
  const passTime = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    jest.useFakeTimers();
    FakeAudioContext.instances = [];
    FakeAudioContext.throwOnSource = false;
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true, writable: true });
  });

  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    jest.useRealTimers();
  });

  /** Starts a recording and lets half a second of quiet room go by, so the floor is set. */
  async function startInRoom(onText: (t: string) => void = () => {}) {
    render(<Harness onText={onText} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    await passTime(500);
  }

  it("stops itself after speech and a pause, then sends the clip", async () => {
    const onText = jest.fn();
    await startInRoom(onText);
    ctx().analyser.amp = 0.2;
    await passTime(400);
    expect(meter().style.transform).toBe("scale(2.25)");
    ctx().analyser.amp = 0;
    await passTime(1_400);
    await flush();

    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("What did you build at Illumina?");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("a short pause mid-sentence does not end the clip", async () => {
    await startInRoom();
    ctx().analyser.amp = 0.2;
    await passTime(400);
    ctx().analyser.amp = 0;
    await passTime(800);
    expect(FakeRecorder.instances[0].state).toBe("recording");
    ctx().analyser.amp = 0.2;
    await passTime(300);
    expect(FakeRecorder.instances[0].state).toBe("recording");
    ctx().analyser.amp = 0;
    await passTime(1_400);
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("with no speech for 7 seconds, stops itself, says it heard nothing, and sends nothing", async () => {
    await startInRoom();
    // Half a second of room is already in; six more seconds is still short of the no-speech limit.
    await passTime(6_000);
    expect(FakeRecorder.instances[0].state).toBe("recording");
    await passTime(600);
    await flush();

    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.silent);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });

  it("stopped by hand with no speech heard: says it heard nothing and sends nothing", async () => {
    await startInRoom();
    await passTime(1_000);
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.silent);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stopped by hand after speech: the clip is sent", async () => {
    await startInRoom();
    ctx().analyser.amp = 0.2;
    await passTime(400);
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("with no AudioContext, nothing is measured: Stop by hand sends the clip, as before", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    await startInRoom();
    await passTime(1_000);
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("with no AudioContext, the minute's limit still stops it and the clip is sent", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    await startInRoom();
    await passTime(MAX_CLIP_SECONDS * 1000);
    await flush();

    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("when building the graph throws, closes that context and falls back to the old behaviour", async () => {
    FakeAudioContext.throwOnSource = true;
    await startInRoom();
    const context = ctx();

    expect(context.closed).toBe(true);
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    await passTime(1_000);
    expect(context.analyser.reads).toBe(0);
    expect(FakeRecorder.instances[0].state).toBe("recording");

    fireEvent.click(screen.getByText("stop"));
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("stopping closes the audio context and stops reading the level", async () => {
    await startInRoom();
    const context = ctx();
    fireEvent.click(screen.getByText("stop"));
    await flush();
    const reads = context.analyser.reads;
    await passTime(1_000);

    expect(context.closed).toBe(true);
    expect(context.analyser.reads).toBe(reads);
  });

  it("cancelling closes the audio context and stops reading the level", async () => {
    await startInRoom();
    const context = ctx();
    fireEvent.click(screen.getByText("cancel"));
    await flush();
    const reads = context.analyser.reads;
    await passTime(1_000);

    expect(context.closed).toBe(true);
    expect(context.analyser.reads).toBe(reads);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("the meter dot grows with the level, and is back to normal size in quiet", async () => {
    await startInRoom();
    const scale = () => Number(/scale\(([\d.]+)\)/.exec(meter().style.transform)![1]);
    ctx().analyser.amp = 0.04;
    await passTime(100);
    expect(scale()).toBeCloseTo(1 + 0.5 * 1.25);
    ctx().analyser.amp = 0.001;
    await passTime(100);
    expect(scale()).toBeCloseTo(1 + 0.0125 * 1.25);
  });
});

describe("MicButton, VoiceStatus and StopRecordingButton", () => {
  it("MicButton is labelled, clickable, and disabled when asked", () => {
    const onClick = jest.fn();
    const { rerender } = render(<MicButton onClick={onClick} />);
    const mic = screen.getByRole("button", { name: "Speak your question" });
    fireEvent.click(mic);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mic).toBeEnabled();

    rerender(<MicButton onClick={onClick} disabled />);
    expect(screen.getByRole("button", { name: "Speak your question" })).toBeDisabled();
  });

  it("VoiceStatus while recording says Listening with the clock out of the limit", () => {
    render(<VoiceStatus state="recording" seconds={7} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Listening");
    expect(status).toHaveTextContent("0:07 / 1:00");
  });

  it("VoiceStatus while transcribing says Transcribing and shows no clock", () => {
    render(<VoiceStatus state="transcribing" seconds={0} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Transcribing…");
    expect(status).not.toHaveTextContent("Listening");
    expect(status).not.toHaveTextContent("/ 1:00");
  });

  it("StopRecordingButton is labelled and calls onClick", () => {
    const onClick = jest.fn();
    render(<StopRecordingButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("useVoiceInput: the audio graph is made in the tap, and closed on every way out", () => {
  const passTime = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  const ctx = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];

  beforeEach(() => {
    jest.useFakeTimers();
    FakeAudioContext.instances = [];
    FakeAudioContext.throwOnSource = false;
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true, writable: true });
  });

  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    jest.useRealTimers();
  });

  it("creates and resumes the context synchronously in the tap, before the permission prompt", () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx().resumed).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("closes the context when the visitor denies the prompt", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(ctx().closed).toBe(true);
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.blocked);
  });

  it("closes the context when the drawer closes during the prompt and the prompt is then granted", async () => {
    let grant!: (s: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => (grant = resolve)));
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    await flush();

    // The context is dropped when the prompt is answered (the grant is what hands the stream back).
    const track = { stop: jest.fn() };
    await act(async () => grant({ getTracks: () => [track] } as unknown as MediaStream));
    await flush();
    expect(ctx().closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("closes the context when the recorder cannot be made, and says it failed", async () => {
    FakeRecorder.throwOnConstruct = true;
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(ctx().closed).toBe(true);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.failed);
  });

  it("seven seconds of silent frames before the first sound do not count toward the no-speech limit", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    ctx().analyser.amp = 0;
    await passTime(8_000);
    expect(FakeRecorder.instances[0].state).toBe("recording");

    ctx().analyser.amp = 0.001;
    await passTime(1_000);
    expect(FakeRecorder.instances[0].state).toBe("recording");
    expect(screen.getByTestId("auto")).toHaveTextContent("true");
  });

  it("a single loud first frame does not count as speech: the clip waits out the no-speech limit, then says it heard nothing", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    ctx().analyser.amp = 0.2;
    await passTime(50);
    ctx().analyser.amp = 0;
    await passTime(1_400);
    expect(FakeRecorder.instances[0].state).toBe("recording");

    await passTime(6_000);
    await flush();
    expect(FakeRecorder.instances[0].state).toBe("inactive");
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.silent);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("when the recorder will not start, closes the context, hands the mic back and says it failed; a later start works", async () => {
    FakeRecorder.throwOnStart = true;
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();

    expect(ctx().closed).toBe(true);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByTestId("problem")).toHaveTextContent(VOICE_PROBLEMS.failed);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");

    FakeRecorder.throwOnStart = false;
    fireEvent.click(screen.getByText("start"));
    await flush();
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(screen.getByTestId("problem")).toHaveTextContent("");
    expect(FakeRecorder.instances).toHaveLength(2);
    expect(FakeRecorder.instances[1].state).toBe("recording");
  });

  it("does not auto-stop at the start: nothing is measured until a frame that is not all zeros", async () => {
    render(<Harness onText={() => {}} />);
    expect(screen.getByTestId("auto")).toHaveTextContent("false");
    fireEvent.click(screen.getByText("start"));
    await flush();
    ctx().analyser.amp = 0;
    await passTime(3_000);

    expect(screen.getByTestId("auto")).toHaveTextContent("false");
    expect(FakeRecorder.instances[0].state).toBe("recording");
  });

  it("the clip is sent on Stop when nothing has been measured, even with no voice in it, and no silent line is shown", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    ctx().analyser.amp = 0;
    await passTime(3_000);
    fireEvent.click(screen.getByText("stop"));
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("problem")).toHaveTextContent("");
  });

  it("turns auto-stop on once a frame that is not all zeros arrives", async () => {
    render(<Harness onText={() => {}} />);
    fireEvent.click(screen.getByText("start"));
    await flush();
    ctx().analyser.amp = 0;
    await passTime(200);
    expect(screen.getByTestId("auto")).toHaveTextContent("false");

    ctx().analyser.amp = 0.001;
    await passTime(50);
    expect(screen.getByTestId("auto")).toHaveTextContent("true");
  });
});

describe("VoiceStatus and StopRecordingButton: hints, the clock, and focus", () => {
  it("shows the pause hint only while auto-stop is on", () => {
    const { rerender } = render(<VoiceStatus state="recording" seconds={3} autoStop={false} />);
    expect(screen.queryByText(/pause when you/)).toBeNull();

    rerender(<VoiceStatus state="recording" seconds={3} autoStop />);
    expect(screen.getByText(/pause when you/)).toBeInTheDocument();
  });

  it("hides the recording clock from assistive tech, so it does not talk over the visitor", () => {
    render(<VoiceStatus state="recording" seconds={7} />);
    const clock = screen.getByText("0:07 / 1:00");
    expect(clock.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Listening");
  });

  it("the transcribing line takes focus and stays in the tab order, so Tab from it does not leave the drawer", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<VoiceStatus state="transcribing" seconds={0} focusRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("status"));
    expect(ref.current!.tabIndex).toBe(0);
  });

  it("the transcribing line shows a visible focus ring when focused from the keyboard", () => {
    render(<VoiceStatus state="transcribing" seconds={0} />);
    const line = screen.getByRole("status");
    expect(line).toHaveClass("focus-visible:border-amber", "focus-visible:ring-2", "focus-visible:ring-amber/40");
  });

  it("StopRecordingButton passes its element to buttonRef, so focus can land on it", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<StopRecordingButton onClick={() => {}} buttonRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Stop recording" }));
  });
});
