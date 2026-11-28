import { canSpeak, isVoiceCached, needsDownloadOffer } from "@/lib/voice-reply/support";

const MODEL_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx";

describe("canSpeak", () => {
  it("says no when the browser has no WebGPU", async () => {
    expect(await canSpeak({})).toBe(false);
  });

  it("says no when WebGPU hands back no adapter", async () => {
    expect(await canSpeak({ gpu: { requestAdapter: async () => null } })).toBe(false);
  });

  it("says no when asking for an adapter fails", async () => {
    const gpu = { requestAdapter: async () => Promise.reject(new Error("blocked")) };
    expect(await canSpeak({ gpu })).toBe(false);
  });

  it("says no when asking for an adapter throws straight away", async () => {
    const gpu = {
      requestAdapter: () => {
        throw new Error("blocked");
      },
    };
    expect(await canSpeak({ gpu })).toBe(false);
  });

  it("says yes when an adapter comes back", async () => {
    expect(await canSpeak({ gpu: { requestAdapter: async () => ({}) } })).toBe(true);
  });
});

/** A stand-in for Cache Storage that remembers which cache was opened and which URL was asked for. */
function fakeCaches(hit: boolean) {
  const opened: string[] = [];
  const matched: string[] = [];
  const api = {
    open: async (name: string) => {
      opened.push(name);
      return {
        match: async (url: string) => {
          matched.push(url);
          return hit ? ({} as Response) : undefined;
        },
      };
    },
  } as unknown as CacheStorage;
  return { api, opened, matched };
}

describe("isVoiceCached", () => {
  it("says yes when the model file is in the cache", async () => {
    expect(await isVoiceCached(fakeCaches(true).api, MODEL_URL)).toBe(true);
  });

  it("says no when the model file is not in the cache", async () => {
    expect(await isVoiceCached(fakeCaches(false).api, MODEL_URL)).toBe(false);
  });

  it("looks in the cache transformers.js writes to, for the model's own URL", async () => {
    const fake = fakeCaches(true);
    await isVoiceCached(fake.api, MODEL_URL);
    expect(fake.opened).toEqual(["transformers-cache"]);
    expect(fake.matched).toEqual([MODEL_URL]);
  });

  it("says no when the browser has no Cache Storage", async () => {
    expect(await isVoiceCached(undefined, MODEL_URL)).toBe(false);
  });

  it("says no when opening the cache fails", async () => {
    const api = {
      open: async () => Promise.reject(new Error("denied")),
    } as unknown as CacheStorage;
    expect(await isVoiceCached(api, MODEL_URL)).toBe(false);
  });
});

describe("needsDownloadOffer", () => {
  const roomy = { coarsePointer: false, cached: false };

  it("never asks when the voice is already downloaded", () => {
    expect(
      needsDownloadOffer({
        coarsePointer: true,
        connection: { type: "cellular", saveData: true },
        cached: true,
      }),
    ).toBe(false);
  });

  it("asks on a phone-like touch screen", () => {
    expect(needsDownloadOffer({ ...roomy, coarsePointer: true })).toBe(true);
  });

  it("asks on a mobile data connection even with a mouse", () => {
    expect(needsDownloadOffer({ ...roomy, connection: { type: "cellular" } })).toBe(true);
  });

  it("asks when the visitor has asked the browser to save data", () => {
    expect(needsDownloadOffer({ ...roomy, connection: { saveData: true } })).toBe(true);
  });

  it("does not ask on a mouse and wifi", () => {
    expect(needsDownloadOffer({ ...roomy, connection: { type: "wifi", saveData: false } })).toBe(false);
  });

  it("does not ask when the browser says nothing about the connection", () => {
    expect(needsDownloadOffer(roomy)).toBe(false);
  });
});
