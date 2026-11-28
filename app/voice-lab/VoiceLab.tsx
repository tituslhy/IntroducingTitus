"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The spike's lab bench: load Kokoro in a worker, pick a voice, speak a sample, and see whether this device keeps up.

// First on Titus's Mac (Chrome, 2026-11-28): WebGPU fp16 ran 11–15× real time; fp32 the same at twice the size;
// q4f16 made a silent sentence; q8 (WebGPU or WASM) ran at 0.6×, too slow to keep up.
const ENGINES = [
  { id: "webgpu-fp16", label: "WebGPU · fp16 (≈163 MB)", device: "webgpu", dtype: "fp16" },
  { id: "webgpu-fp32", label: "WebGPU · fp32 (≈326 MB)", device: "webgpu", dtype: "fp32" },
  { id: "wasm-q8", label: "No GPU · WASM q8 (≈92 MB)", device: "wasm", dtype: "q8" },
] as const;
type EngineId = (typeof ENGINES)[number]["id"];

const VOICES = [
  { id: "am_michael", note: "American, male" },
  { id: "am_fenrir", note: "American, male" },
  { id: "am_puck", note: "American, male" },
  { id: "bm_george", note: "British, male" },
  { id: "bm_lewis", note: "British, male" },
  { id: "bm_fable", note: "British, male" },
  { id: "af_heart", note: "American, female (the best-rated voice, for reference)" },
  { id: "bf_emma", note: "British, female (for reference)" },
];

const SAMPLE =
  "I started in supply chain at Toyota Tsusho, then moved into data science, with four years at the Energy Market Authority. " +
  "Since then I've worked at Illumina and UOB, and I'm now Lead AI Engineer at Mastercard. " +
  "At Illumina I built a sixteen-part agentic RAG system with LlamaIndex and Qdrant. " +
  "My side project, fictional-bassoon, runs LangGraph, Celery and ClickHouse across fifty-four containers. " +
  "I've put the whole timeline on screen, if you want the dates.";

type Row = {
  n: number;
  text: string;
  genMs?: number;
  audioSec?: number;
  gapSec?: number;
  firstSoundSec?: number;
  /** Loudest sample: 0 (or NaN) means the model made silence, a broken engine rather than a slow one. */
  peak?: number;
  /** What the worker is doing with it now: "pronouncing" or "running the model". */
  stage?: string;
};

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function VoiceLab() {
  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; nextStart: number; prevEnd: number; clickedAt: number } | null>(null);
  const runRef = useRef(0);
  const filesRef = useRef<Record<string, { loaded: number; total: number }>>({});

  const [engine, setEngine] = useState<EngineId>("webgpu-fp16");
  const [voice, setVoice] = useState("am_michael");
  const [text, setText] = useState(SAMPLE);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [downloaded, setDownloaded] = useState({ loaded: 0, total: 0 });
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  // Counts the seconds while a sentence is being made, so "nothing yet" reads as slow or stuck, not as no sound.
  const [speakStartedAt, setSpeakStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const pending = rows.length > 0 && rows.some((r) => r.genMs === undefined);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      void audioRef.current?.ctx.close();
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const onAudio = useCallback((id: number, audio: Float32Array, sampleRate: number, genMs: number) => {
    const run = Math.floor(id / 1000);
    const a = audioRef.current;
    if (run !== runRef.current || !a) return;
    const n = id % 1000;
    const buffer = a.ctx.createBuffer(1, audio.length, sampleRate);
    buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
    const now = a.ctx.currentTime;
    // A gap opens when this sentence arrives after the last one finished playing (not counted for the first).
    const gapSec = n > 0 && now > a.prevEnd ? now - a.prevEnd : 0;
    const start = Math.max(now, a.nextStart);
    const source = a.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(a.ctx.destination);
    source.start(start);
    a.nextStart = start + buffer.duration;
    a.prevEnd = a.nextStart;
    const firstSoundSec = n === 0 ? (performance.now() - a.clickedAt) / 1000 : undefined;
    let peak = 0;
    for (const v of audio) peak = Math.max(peak, Math.abs(v));
    setRows((prev) =>
      prev.map((r) => (r.n === n ? { ...r, genMs, audioSec: buffer.duration, gapSec, firstSoundSec, peak } : r)),
    );
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../../lib/voice-reply/tts.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "progress") {
        filesRef.current[m.file] = { loaded: m.loaded ?? 0, total: m.total ?? 0 };
        const all = Object.values(filesRef.current);
        setDownloaded({
          loaded: all.reduce((s, f) => s + f.loaded, 0),
          total: all.reduce((s, f) => s + f.total, 0),
        });
      } else if (m.type === "ready") {
        setStatus("ready");
        setLoadMs(m.loadMs);
      } else if (m.type === "stage") {
        const n = m.id % 1000;
        if (Math.floor(m.id / 1000) === runRef.current) {
          setRows((prev) => prev.map((r) => (r.n === n ? { ...r, stage: m.stage } : r)));
        }
      } else if (m.type === "audio") {
        onAudio(m.id, m.audio, m.sampleRate, m.genMs);
      } else if (m.type === "error") {
        setError(m.message);
        if (m.id === undefined) setStatus("error");
      }
    };
    // The worker dying (often out of memory on a phone) sends no message of its own: say so.
    worker.onerror = (event) => {
      setError(`The voice process crashed${event.message ? `: ${event.message}` : " (no details; often out of memory)"}.`);
      setStatus("error");
      workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  }, [onAudio]);

  const loadModel = () => {
    const e = ENGINES.find((x) => x.id === engine)!;
    setStatus("loading");
    setError(null);
    filesRef.current = {};
    setDownloaded({ loaded: 0, total: 0 });
    getWorker().postMessage({ type: "load", device: e.device, dtype: e.dtype });
    void readDevice().then(setEnv);
  };

  // What this device offers: shader-f16 is what the fp16 model wants from the GPU.
  const readDevice = async (): Promise<Record<string, string>> => {
    type Adapter = { features: Set<string>; info?: { vendor?: string; architecture?: string } };
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      gpu?: { requestAdapter(): Promise<Adapter | null> };
    };
    let adapter: Adapter | null = null;
    try {
      adapter = (await nav.gpu?.requestAdapter()) ?? null;
    } catch {
      adapter = null;
    }
    return {
      WebGPU: nav.gpu ? (adapter ? "yes" : "API present, no adapter") : "no",
      "GPU shader-f16": adapter ? (adapter.features.has("shader-f16") ? "yes" : "no") : "?",
      GPU: adapter?.info ? `${adapter.info.vendor ?? "?"} ${adapter.info.architecture ?? ""}`.trim() : "?",
      "Cross-origin isolated (threads)": String(self.crossOriginIsolated),
      "CPU cores": String(nav.hardwareConcurrency ?? "?"),
      "Memory (GB, Chrome only)": String(nav.deviceMemory ?? "?"),
      Browser: nav.userAgent,
    };
  };

  // A half-second tone: proves this page can make sound here at all, apart from the voice.
  const testSound = () => {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    const ctx = new AudioContext();
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    osc.frequency.value = 440;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  };

  const stop = () => {
    runRef.current += 1;
    void audioRef.current?.ctx.close();
    audioRef.current = null;
  };

  const speak = () => {
    stop();
    // iPhone Safari plays Web Audio as "ambient" sound, which the silent switch mutes. "playback" plays it like a
    // video would, whatever the switch says (Audio Session API, Safari 16.4+; ignored elsewhere).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    // Made inside the tap: Safari only lets a page play audio that a tap started.
    const ctx = new AudioContext();
    void ctx.resume();
    audioRef.current = { ctx, nextStart: 0, prevEnd: 0, clickedAt: performance.now() };
    setSpeakStartedAt(performance.now());
    setNow(performance.now());
    const run = runRef.current;
    const parts = sentences(text);
    setRows(parts.map((t, n) => ({ n, text: t })));
    setCopied(false);
    parts.forEach((t, n) => getWorker().postMessage({ type: "speak", id: run * 1000 + n, text: t, voice }));
  };

  const done = rows.length > 0 && rows.every((r) => r.genMs !== undefined);
  const totalAudio = rows.reduce((s, r) => s + (r.audioSec ?? 0), 0);
  const totalGen = rows.reduce((s, r) => s + (r.genMs ?? 0), 0) / 1000;
  const totalGaps = rows.reduce((s, r) => s + (r.gapSec ?? 0), 0);
  const firstSound = rows[0]?.firstSoundSec;
  const mb = (b: number) => (b / 1e6).toFixed(1);

  const summary = [
    `Engine: ${ENGINES.find((x) => x.id === engine)!.label} · voice ${voice}`,
    `Downloaded: ${mb(downloaded.loaded)} MB · load ${loadMs !== null ? (loadMs / 1000).toFixed(1) + " s" : "?"}`,
    `First sound after tap: ${firstSound !== undefined ? firstSound.toFixed(1) + " s" : "?"}`,
    `Speed: ${totalGen > 0 ? (totalAudio / totalGen).toFixed(2) : "?"}× real time · gaps ${totalGaps.toFixed(1)} s`,
    ...(pending
      ? [
          `Still working: ${Math.max(0, Math.round((now - speakStartedAt) / 1000))} s since Speak, sentence ${
            (rows.find((r) => r.genMs === undefined)?.n ?? 0) + 1
          } ${rows.find((r) => r.genMs === undefined)?.stage ?? "queued"}`,
        ]
      : []),
    ...Object.entries(env).map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const btn =
    "border border-ink bg-ink px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper transition-colors hover:border-amber hover:bg-amber disabled:cursor-not-allowed disabled:opacity-40";
  const ghost =
    "border border-ink bg-paper px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink transition-colors hover:border-amber hover:text-amber disabled:opacity-40";

  return (
    <main className="mx-auto max-w-[760px] px-5 pb-24 pt-28 font-mono text-[13px] text-ink">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">Spike · not linked · previews only</p>
      <h1 className="mt-2 font-serif text-[34px] font-medium leading-tight">Voice lab</h1>
      <p className="mt-2 font-serif text-[16px] text-ink-soft">
        Load the voice, pick one, tap Speak. The table says whether this device keeps up.
      </p>

      <section className="mt-8 border-t border-rule pt-5">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">1 · Load</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sr-only">Engine</span>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as EngineId)}
              disabled={status !== "idle" && status !== "error"}
              className="border border-rule bg-paper px-2 py-2"
            >
              {ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={btn} onClick={loadModel} disabled={status === "loading" || status === "ready"}>
            {status === "ready" ? "Loaded" : status === "loading" ? "Loading…" : "Load the voice"}
          </button>
          <span role="status" className="text-ink-soft">
            {status === "loading" &&
              `${mb(downloaded.loaded)}${downloaded.total ? ` / ${mb(downloaded.total)}` : ""} MB`}
            {status === "ready" && `Ready in ${((loadMs ?? 0) / 1000).toFixed(1)} s · ${mb(downloaded.loaded)} MB fetched`}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          A second load in the same browser comes from its cache: reload the page to time that.
        </p>
        {error && (
          <p role="alert" className="mt-3 font-serif text-[14px] italic text-amber">
            {error}
          </p>
        )}
        {Object.keys(env).length > 0 && (
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px] text-ink-soft">
            {Object.entries(env)
              .filter(([k]) => k !== "Browser")
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="m-0 break-words">{v}</dd>
                </div>
              ))}
          </dl>
        )}
        <button type="button" className={`${ghost} mt-4`} onClick={testSound}>
          Test sound (a short beep)
        </button>
      </section>

      <section className="mt-8 border-t border-rule pt-5">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">2 · Voice</h2>
        <fieldset className="mt-3 grid gap-1.5 sm:grid-cols-2">
          <legend className="sr-only">Voice</legend>
          {VOICES.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-baseline gap-2 py-1">
              <input type="radio" name="voice" value={v.id} checked={voice === v.id} onChange={() => setVoice(v.id)} />
              <span className="text-ink">{v.id}</span>
              <span className="text-[11px] text-ink-faint">{v.note}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="mt-8 border-t border-rule pt-5">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">3 · Speak</h2>
        <label className="mt-3 block">
          <span className="sr-only">Text to speak</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full resize-y border border-rule bg-paper p-3 font-serif text-[15px] leading-relaxed"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={btn} onClick={speak} disabled={status !== "ready" || !text.trim()}>
            Speak
          </button>
          <button type="button" className={ghost} onClick={stop}>
            Stop
          </button>
          <button type="button" className={ghost} onClick={() => setText(SAMPLE)}>
            Reset text
          </button>
        </div>
        {status !== "ready" && (
          <p className="mt-2 text-[11px] text-ink-faint">Speak wakes up once the voice has loaded (step 1).</p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="mt-8 border-t border-rule pt-5">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">4 · Results</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Sentence</th>
                  <th className="py-1.5 pr-3 font-normal">Made in</th>
                  <th className="py-1.5 pr-3 font-normal">Lasts</th>
                  <th className="py-1.5 pr-3 font-normal">Speed</th>
                  <th className="py-1.5 pr-3 font-normal">Gap</th>
                  <th className="py-1.5 font-normal">Level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n} className="border-t border-rule align-top">
                    <td className="py-1.5 pr-3 font-serif text-[13px] text-ink-soft">{r.text}</td>
                    <td className="py-1.5 pr-3">
                      {r.genMs !== undefined
                        ? `${(r.genMs / 1000).toFixed(1)} s`
                        : r.n === rows.findIndex((x) => x.genMs === undefined)
                          ? `${r.stage ?? "queued"} ${Math.max(0, Math.round((now - speakStartedAt) / 1000))} s`
                          : "waiting"}
                    </td>
                    <td className="py-1.5 pr-3">{r.audioSec !== undefined ? `${r.audioSec.toFixed(1)} s` : ""}</td>
                    <td className="py-1.5 pr-3">
                      {r.genMs && r.audioSec ? `${(r.audioSec / (r.genMs / 1000)).toFixed(1)}×` : ""}
                    </td>
                    <td className={`py-1.5 pr-3 ${r.gapSec ? "text-amber" : ""}`}>
                      {r.gapSec !== undefined ? (r.gapSec ? `${r.gapSec.toFixed(1)} s` : "none") : ""}
                    </td>
                    <td className={`py-1.5 ${r.peak !== undefined && !(r.peak > 0.01) ? "text-amber" : ""}`}>
                      {r.peak !== undefined ? (r.peak > 0.01 ? r.peak.toFixed(2) : "silent") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {done && (
            <p className="mt-4 font-serif text-[16px]">
              {totalGaps < 0.5
                ? "Keeps up: after the first sentence, it never ran out of speech."
                : `Falls behind: ${totalGaps.toFixed(1)} s of silence between sentences.`}{" "}
              First sound {firstSound?.toFixed(1)} s after the tap.
            </p>
          )}
          {/* Shown while it's still working too, so a stuck run can be copied as it stands. */}
          <pre className="mt-3 whitespace-pre-wrap break-words border border-rule bg-paper-deep p-3 text-[11px] text-ink-soft">
            {summary}
          </pre>
          <button type="button" className={`${ghost} mt-3`} onClick={copy}>
            {copied ? "Copied" : "Copy results"}
          </button>
        </section>
      )}
    </main>
  );
}
