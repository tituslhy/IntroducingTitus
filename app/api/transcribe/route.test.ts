/**
 * @jest-environment node
 */

jest.mock("openai", () => {
  const _create = jest.fn();
  class APIError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.name = "APIError";
      this.status = status;
    }
  }
  function MockOpenAI() {
    return { audio: { transcriptions: { create: _create } } };
  }
  (MockOpenAI as unknown as Record<string, unknown>).APIError = APIError;
  (MockOpenAI as unknown as Record<string, unknown>)._create = _create;
  return { __esModule: true, default: MockOpenAI };
});

import { POST } from "./route";
import { MAX_CLIP_BYTES, MIN_CLIP_BYTES } from "@/lib/voice-input";
import { transcriptionPrompt } from "@/lib/transcribe-prompt";
import type { NextRequest } from "next/server";

const OpenAIMock = jest.requireMock("openai").default as Record<string, unknown>;
const mockCreate = OpenAIMock._create as jest.Mock;
const ApiError = OpenAIMock.APIError as new (msg: string, status: number) => Error;

const URL = "http://localhost/api/transcribe";
// Multipart framing the route allows on top of the clip.
const FRAMING_BYTES = 64_000;
const OPENAI_TIMEOUT_MS = 30_000;

let ipCounter = 0;
/** A fresh visitor address, so no test shares a rate-limit bucket with another. */
function nextIp(): string {
  ipCounter++;
  return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

/** A clip of `bytes` bytes of the given type, as the drawer records it. */
const clip = (bytes: number, type = "audio/webm;codecs=opus") => new Blob([new Uint8Array(bytes)], { type });

/** The multipart body a browser sends for one audio field, and its content type. */
async function multipart(form: FormData): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const probe = new Request(URL, { method: "POST", body: form });
  return { bytes: await probe.arrayBuffer(), contentType: probe.headers.get("content-type")! };
}

async function audioForm({ bytes = 5_000, type, field = "audio" }: { bytes?: number; type?: string; field?: string } = {}) {
  const form = new FormData();
  form.append(field, clip(bytes, type), "clip");
  return form;
}

/**
 * A real multipart request, sized the way a browser sizes it: its content-length is the byte length of the body.
 * `form` replaces the default form when a test needs another shape.
 */
async function voiceRequest({
  bytes = 5_000,
  type,
  form,
  field = "audio",
  ip = nextIp(),
  origin,
  signal,
}: {
  bytes?: number;
  type?: string;
  form?: FormData;
  field?: string;
  ip?: string;
  origin?: string;
  signal?: AbortSignal;
} = {}): Promise<NextRequest> {
  const { bytes: body, contentType } = await multipart(form ?? (await audioForm({ bytes, type, field })));
  return new Request(URL, {
    method: "POST",
    body,
    signal,
    headers: {
      "content-type": contentType,
      "content-length": String(body.byteLength),
      "x-forwarded-for": ip,
      ...(origin ? { origin } : {}),
    },
  }) as unknown as NextRequest;
}

/**
 * A request whose body streams in with no declared length (a chunked upload, or a proxy that dropped the header).
 * `declared` sets a content-length header by hand, for the odd values a client can send.
 */
async function streamedRequest(
  body: Uint8Array,
  { contentType, declared, ip = nextIp(), signal }: { contentType?: string; declared?: string; ip?: string; signal?: AbortSignal } = {}
): Promise<NextRequest> {
  const type = contentType ?? (await multipart(await audioForm())).contentType;
  return new Request(URL, {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    }),
    duplex: "half",
    signal,
    headers: {
      "content-type": type,
      "x-forwarded-for": ip,
      ...(declared !== undefined ? { "content-length": declared } : {}),
    },
  } as RequestInit) as unknown as NextRequest;
}

/** A request built from headers alone, whose body reader the test controls (for the declared-size refusal). */
function headerRequest(headers: Record<string, string>, { ip = nextIp() }: { ip?: string } = {}): NextRequest {
  return {
    headers: new Headers({ "x-forwarded-for": ip, ...headers }),
    formData: jest.fn(async () => new FormData()),
  } as unknown as NextRequest;
}

describe("POST /api/transcribe", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ text: "What did you build at Illumina?" });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  describe("gates", () => {
    it("returns 503 without an API key, before anything else", async () => {
      delete process.env.OPENAI_API_KEY;
      const res = await POST(await voiceRequest({ origin: "https://evil.example" }));
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ error: "unavailable" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects a cross-site browser request with 403 origin_forbidden", async () => {
      const res = await POST(await voiceRequest({ origin: "https://evil.example" }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "origin_forbidden" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("a body with no declared length is read and sent like any other", async () => {
      const { bytes, contentType } = await multipart(await audioForm({ bytes: 5_000 }));
      const res = await POST(await streamedRequest(new Uint8Array(bytes), { contentType }));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ text: "What did you build at Illumina?" });
    });

    it.each([
      ["a content-length that is not a number", "abc"],
      ["a content-length of zero", "0"],
    ])("a body with %s is read by its bytes, not refused", async (_label, declared) => {
      const { bytes, contentType } = await multipart(await audioForm({ bytes: 5_000 }));
      const res = await POST(await streamedRequest(new Uint8Array(bytes), { contentType, declared }));
      expect(res.status).toBe(200);
    });

    it("returns 413 clip_too_large for a declared length past the clip limit plus framing, reading no form", async () => {
      const req = headerRequest({ "content-length": String(MAX_CLIP_BYTES + FRAMING_BYTES + 1) });
      const res = await POST(req);
      expect(res.status).toBe(413);
      await expect(res.json()).resolves.toEqual({ error: "clip_too_large" });
      expect(req.formData).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 413 clip_too_large for a body that streams past the cap with no declared length", async () => {
      const huge = new Uint8Array(MAX_CLIP_BYTES + FRAMING_BYTES + 1);
      const res = await POST(await streamedRequest(huge));
      expect(res.status).toBe(413);
      await expect(res.json()).resolves.toEqual({ error: "clip_too_large" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("a streamed body past the cap is read, so it does spend the visitor's minute allowance", async () => {
      const ip = nextIp();
      const huge = new Uint8Array(MAX_CLIP_BYTES + FRAMING_BYTES + 1);
      for (let i = 0; i < 5; i++) expect((await POST(await streamedRequest(huge, { ip }))).status).toBe(413);
      const res = await POST(await voiceRequest({ ip }));
      expect(res.status).toBe(429);
      expect((await res.json()).error).toBe("rate_limited");
    });

    it("a declared-oversized body spends no budget: the visitor can still send a clip right after", async () => {
      const ip = nextIp();
      for (let i = 0; i < 10; i++) {
        expect((await POST(headerRequest({ "content-length": String(MAX_CLIP_BYTES * 2) }, { ip }))).status).toBe(413);
      }
      expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
    });

    it("over the limits, the body is refused without being read", async () => {
      const ip = nextIp();
      for (let i = 0; i < 5; i++) expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
      const pulled = jest.fn();
      const body = new ReadableStream(
        {
          pull(controller) {
            pulled();
            controller.enqueue(new Uint8Array(10));
            controller.close();
          },
        },
        { highWaterMark: 0 }
      );
      const req = new Request(URL, {
        method: "POST",
        body,
        duplex: "half",
        headers: { "content-type": "multipart/form-data; boundary=x", "x-forwarded-for": ip },
      } as RequestInit) as unknown as NextRequest;
      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(pulled).not.toHaveBeenCalled();
    });

    it("an upload cut off part-way is 499 client_left, not a server error", async () => {
      const cut = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1_000));
          controller.error(new Error("connection reset"));
        },
      });
      const req = new Request(URL, {
        method: "POST",
        body: cut,
        duplex: "half",
        headers: { "content-type": "multipart/form-data; boundary=x", "x-forwarded-for": nextIp() },
      } as RequestInit) as unknown as NextRequest;
      const res = await POST(req);
      expect(res.status).toBe(499);
      await expect(res.json()).resolves.toEqual({ error: "client_left" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("accepts a declared length exactly at the limit plus framing", async () => {
      const res = await POST(await voiceRequest({ bytes: MIN_CLIP_BYTES }));
      expect(res.status).toBe(200);
    });

    it("rate-limits one visitor to five clips a minute, then says when to retry", async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await POST(await voiceRequest({ ip }))).status);
      expect(statuses).toEqual([200, 200, 200, 200, 200]);

      const res = await POST(await voiceRequest({ ip }));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe("rate_limited");
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it("a request already aborted by the visitor is refused 499 client_left, with no OpenAI call", async () => {
      const visitor = new AbortController();
      visitor.abort();
      const res = await POST(await voiceRequest({ signal: visitor.signal }));
      expect(res.status).toBe(499);
      await expect(res.json()).resolves.toEqual({ error: "client_left" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    describe("with the clock moved on", () => {
      let clock: number;
      beforeEach(() => {
        clock = Date.now();
        jest.spyOn(Date, "now").mockImplementation(() => clock);
      });

      it("allows a visitor thirty clips an hour, then refuses with a retry in more than a minute", async () => {
        const ip = nextIp();
        for (let batch = 0; batch < 6; batch++) {
          for (let i = 0; i < 5; i++) expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
          clock += 61_000;
        }
        const res = await POST(await voiceRequest({ ip }));
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toBe("rate_limited");
        expect(body.retryAfterSeconds).toBeGreaterThan(60);
      });

      it("a clip refused by the minute limit spends no hourly slot: a clip a minute later is allowed", async () => {
        const ip = nextIp();
        for (let i = 0; i < 5; i++) expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
        for (let i = 0; i < 25; i++) {
          const res = await POST(await voiceRequest({ ip }));
          expect(res.status).toBe(429);
          expect((await res.json()).retryAfterSeconds).toBeLessThanOrEqual(60);
        }
        clock += 61_000;
        expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
      });

      it("lets a clip through again once the hour has passed", async () => {
        const ip = nextIp();
        for (let batch = 0; batch < 6; batch++) {
          for (let i = 0; i < 5; i++) await POST(await voiceRequest({ ip }));
          clock += 61_000;
        }
        expect((await POST(await voiceRequest({ ip }))).status).toBe(429);
        clock += 60 * 60_000;
        expect((await POST(await voiceRequest({ ip }))).status).toBe(200);
      });
    });

    describe("when the visitor leaves or the call runs long", () => {
      const realSetTimeout = global.setTimeout;
      let timeouts: Array<() => void>;

      beforeEach(() => {
        // Captures the route's 30-second OpenAI timer, so the test can fire it. Every other timer runs as normal.
        timeouts = [];
        jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
          if (ms === OPENAI_TIMEOUT_MS) {
            timeouts.push(fn);
            return 0 as unknown as ReturnType<typeof setTimeout>;
          }
          return realSetTimeout(fn, ms, ...rest);
        }) as unknown as typeof setTimeout);
      });

      /** Waits (in real time) until OpenAI has been called, so the abort has something to reach. */
      async function untilOpenAiCalled() {
        for (let i = 0; i < 200 && mockCreate.mock.calls.length === 0; i++) {
          await new Promise((resolve) => realSetTimeout(resolve, 5));
        }
        expect(mockCreate).toHaveBeenCalledTimes(1);
      }
      const abortable = (_params: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });

      it("the visitor leaving stops the OpenAI call, and the answer says ERR_CLIENT_LEFT", async () => {
        mockCreate.mockImplementation(abortable);
        const visitor = new AbortController();
        const pending = POST(await voiceRequest({ signal: visitor.signal }));
        await untilOpenAiCalled();
        const openAiSignal = mockCreate.mock.calls[0][1].signal as AbortSignal;
        expect(openAiSignal.aborted).toBe(false);

        visitor.abort();
        const res = await pending;

        expect(openAiSignal.aborted).toBe(true);
        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toEqual({ error: "ERR_CLIENT_LEFT" });
      });

      it("the 30-second limit stopping the call says ERR_TIMEOUT, and the visitor did not leave", async () => {
        mockCreate.mockImplementation(abortable);
        const pending = POST(await voiceRequest());
        await untilOpenAiCalled();
        expect(timeouts).toHaveLength(1);

        timeouts[0]();
        const res = await pending;

        expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(true);
        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toEqual({ error: "ERR_TIMEOUT" });
      });

      it("an abort nobody asked for is not called a timeout or a leave: ERR_UNKNOWN", async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
        const res = await POST(await voiceRequest());
        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toEqual({ error: "ERR_UNKNOWN" });
      });
    });
  });

  describe("the form", () => {
    it("returns 400 audio_required when the audio field is missing", async () => {
      const res = await POST(await voiceRequest({ field: "sound" }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "audio_required" });
    });

    it("returns 400 audio_required when the audio field is text, not a file", async () => {
      const form = new FormData();
      form.append("audio", "not a clip");
      const res = await POST(await voiceRequest({ form }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "audio_required" });
    });

    it("returns 400 invalid_body when the body is not multipart form data", async () => {
      const res = await POST(await streamedRequest(new TextEncoder().encode("{}"), { contentType: "application/json" }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalid_body" });
    });
  });

  describe("the clip", () => {
    it("returns 413 clip_too_large for a clip over the limit", async () => {
      const res = await POST(await voiceRequest({ bytes: MAX_CLIP_BYTES + 1 }));
      expect(res.status).toBe(413);
      await expect(res.json()).resolves.toEqual({ error: "clip_too_large" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 422 clip_empty for a clip under the minimum, a tap with nothing said", async () => {
      const res = await POST(await voiceRequest({ bytes: MIN_CLIP_BYTES - 1 }));
      expect(res.status).toBe(422);
      await expect(res.json()).resolves.toEqual({ error: "clip_empty" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 415 unsupported_type for a type the route does not take", async () => {
      const res = await POST(await voiceRequest({ type: "text/plain" }));
      expect(res.status).toBe(415);
      await expect(res.json()).resolves.toEqual({ error: "unsupported_type" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("accepts a clip exactly at the minimum and exactly at the maximum", async () => {
      expect((await POST(await voiceRequest({ bytes: MIN_CLIP_BYTES }))).status).toBe(200);
      expect((await POST(await voiceRequest({ bytes: MAX_CLIP_BYTES }))).status).toBe(200);
    });

    it("accepts the video container types some browsers label an audio-only clip with", async () => {
      await POST(await voiceRequest({ type: "video/webm" }));
      expect(mockCreate.mock.calls[0][0].file.name).toBe("clip.webm");
      await POST(await voiceRequest({ type: "video/mp4" }));
      expect(mockCreate.mock.calls[1][0].file.name).toBe("clip.mp4");
    });

    it("names an AAC clip .m4a", async () => {
      await POST(await voiceRequest({ type: "audio/aac" }));
      expect(mockCreate.mock.calls[0][0].file.name).toBe("clip.m4a");
    });
  });

  describe("the OpenAI call", () => {
    it("sends the clip as a file named for its format, with the model, the prompt, English and a json response", async () => {
      await POST(await voiceRequest({ type: "audio/webm;codecs=opus" }));

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const [params, options] = mockCreate.mock.calls[0];
      expect(params.model).toBe("gpt-transcribe");
      expect(params.response_format).toBe("json");
      expect(params.language).toBe("en");
      expect(params.prompt).toBe(transcriptionPrompt());
      expect(params.file).toBeInstanceOf(File);
      expect(params.file.name).toBe("clip.webm");
      expect(options.signal).toBeDefined();
    });
  });

  describe("the transcript", () => {
    it("returns the words as text", async () => {
      const res = await POST(await voiceRequest());
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ text: "What did you build at Illumina?" });
    });

    it("collapses whitespace and trims the words", async () => {
      mockCreate.mockResolvedValue({ text: "  what did\n\nyou   build  " });
      const res = await POST(await voiceRequest());
      await expect(res.json()).resolves.toEqual({ text: "what did you build" });
    });

    it("caps the words at the chat's per-message limit", async () => {
      mockCreate.mockResolvedValue({ text: "x".repeat(5_000) });
      const res = await POST(await voiceRequest());
      const body = await res.json();
      expect(body.text).toHaveLength(4_000);
    });

    it("returns 422 nothing_heard when the transcript is empty", async () => {
      mockCreate.mockResolvedValue({ text: "   " });
      const res = await POST(await voiceRequest());
      expect(res.status).toBe(422);
      await expect(res.json()).resolves.toEqual({ error: "nothing_heard" });
    });

    it("returns 422 nothing_heard when OpenAI sends no text at all", async () => {
      mockCreate.mockResolvedValue({});
      const res = await POST(await voiceRequest());
      expect(res.status).toBe(422);
      await expect(res.json()).resolves.toEqual({ error: "nothing_heard" });
    });
  });

  describe("OpenAI errors", () => {
    it.each([
      [429, "ERR_RATE_LIMIT"],
      [402, "ERR_QUOTA"],
      [401, "ERR_AUTH"],
      [400, "ERR_BAD_AUDIO"],
      [500, "ERR_UNKNOWN"],
    ])("answers 502 with the code for an OpenAI %i, never passing the status on", async (status, code) => {
      mockCreate.mockRejectedValue(new ApiError("upstream", status));
      const res = await POST(await voiceRequest());
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({ error: code });
    });

    it("answers 502 ERR_UNKNOWN for any other failure", async () => {
      mockCreate.mockRejectedValue(new Error("network down"));
      const res = await POST(await voiceRequest());
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({ error: "ERR_UNKNOWN" });
    });
  });

  describe("logging", () => {
    it("logs the clip's size, format and the character count, never the audio or the words", async () => {
      const log = jest.spyOn(console, "log");
      await POST(await voiceRequest({ bytes: 5_000 }));

      const line = String(log.mock.calls.find((c) => String(c[0]).includes("copilot_transcribe"))?.[0]);
      const event = JSON.parse(line);
      expect(event).toMatchObject({ event: "copilot_transcribe", bytes: 5_000, type: "webm", chars: "What did you build at Illumina?".length });
      expect(line).not.toContain("What did you build");
    });

    it("logs a failure with its code and size, not the audio", async () => {
      mockCreate.mockRejectedValue(new ApiError("upstream", 429));
      const error = jest.spyOn(console, "error");
      await POST(await voiceRequest({ bytes: 5_000 }));

      const event = JSON.parse(String(error.mock.calls[0][0]));
      expect(event).toMatchObject({ event: "copilot_transcribe_failed", code: "ERR_RATE_LIMIT", bytes: 5_000 });
    });

    it("logs a rejected clip with its reason", async () => {
      const warn = jest.spyOn(console, "warn");
      await POST(await voiceRequest({ bytes: MIN_CLIP_BYTES - 1 }));
      const event = JSON.parse(String(warn.mock.calls[0][0]));
      expect(event).toMatchObject({ event: "copilot_transcribe_rejected", reason: "clip_empty" });
    });
  });

  describe("a clip refused by the hour spends no daily slot", () => {
    // A fresh copy of the route, so its daily budget starts at zero and nothing else in this file has touched it.
    let freshPost: (req: NextRequest) => Promise<Response>;
    let freshCreate: jest.Mock;
    let clock: number;

    beforeEach(() => {
      clock = Date.now();
      jest.spyOn(Date, "now").mockImplementation(() => clock);
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy of the module, on purpose
        freshPost = require("./route").POST;
        freshCreate = jest.requireMock("openai").default._create;
      });
      freshCreate.mockReset();
      freshCreate.mockResolvedValue({ text: "hi there" });
      jest.spyOn(console, "log").mockImplementation(() => {});
      jest.spyOn(console, "warn").mockImplementation(() => {});
      jest.spyOn(console, "error").mockImplementation(() => {});
    });

    it("the same visitor's refused attempts leave every other visitor's daily allowance intact", async () => {
      const visitor = nextIp();
      // Thirty clips over six minutes use up this visitor's hour...
      for (let batch = 0; batch < 6; batch++) {
        for (let i = 0; i < 5; i++) expect((await freshPost(await voiceRequest({ ip: visitor }))).status).toBe(200);
        clock += 61_000;
      }
      // ...and ten more attempts, all refused by the hour.
      for (let i = 0; i < 10; i++) expect((await freshPost(await voiceRequest({ ip: visitor }))).status).toBe(429);

      // Everyone else still has the full daily allowance: 300 clips in all, less the 30 this visitor used.
      let allowed = 0;
      for (let i = 0; i < 400; i++) {
        const res = await freshPost(await voiceRequest());
        if (res.status !== 200) {
          expect((await res.json()).retryAfterSeconds).toBeGreaterThan(3600);
          break;
        }
        allowed++;
      }
      expect(allowed).toBe(300 - 30);
    });
  });

  describe("the daily budget for everyone", () => {
    // Last in the file: the daily budget is shared by every visitor in this server instance, so it runs out here.
    it("refuses with a retry a day away once the daily clips are used up", async () => {
      let res: Response | null = null;
      for (let i = 0; i < 400 && (!res || res.status === 200); i++) {
        res = await POST(await voiceRequest());
      }
      expect(res!.status).toBe(429);
      const body = await res!.json();
      expect(body.error).toBe("rate_limited");
      expect(body.retryAfterSeconds).toBeGreaterThan(3600);
    });
  });
});
