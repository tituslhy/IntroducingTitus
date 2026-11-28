# Voice Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A question sent from the mic gets its Ask Titus reply shown and spoken aloud by Kokoro running in the visitor's browser; typed questions stay silent.

**Architecture:** The drawer marks a message as spoken when its text came from the mic and sends `spoken: true`; `/api/chat` adds one system message so the reply is written to be heard. In the browser, pure helpers in `lib/voice-reply/` turn the streaming markdown into speakable sentences, a Web Worker runs Kokoro on WebGPU (fp16), a player schedules the audio and spots stalls, and a `useVoiceReply` hook in `components/VoiceReply.tsx` ties these together and owns the drawer's voice UI pieces. `CopilotBubble.tsx` only calls the hook.

**Tech Stack:** Next.js 16 (Turbopack), React 19, TypeScript, Tailwind, Jest + Testing Library, `kokoro-js` 1.2.1 → `@huggingface/transformers` 3.8.1 (onnxruntime-web, WebGPU), Web Audio API, CSS Custom Highlight API.

**Spec:** `docs/superpowers/specs/2026-11-28-voice-reply-design.md` (mock: https://claude.ai/artifact/Tg93ACrZKf43X6qnDyLffV)

## Global Constraints

- Gate: Task 1 waits for the spike's go (Titus's iPhone keeps up, and he has picked a voice). The voice id goes in `KOKORO_VOICE`.
- Engine: WebGPU only, `dtype: "fp16"`, model `onnx-community/Kokoro-82M-v1.0-ONNX`. No WASM fallback: without WebGPU the reply stays text, with state 4's line.
- Download size in copy: "163 MB".
- Copy, exact: thinking line "You asked out loud, so I’ll answer out loud."; strip "Speaking" · "type to cut in" · "Stop"; "hear again"; fallback "My voice couldn’t keep up on this device, so this one’s written out."; phone offer "I can answer out loud. It’s a one-off 163 MB download." with buttons "Speak replies" / "Text is fine"; loading strip "Getting my voice ready · N%".
- Voice rules for the site: no emoji, no exclamation points; curly apostrophes as the site uses them.
- Nothing about voice is stored except the model in the browser's cache; "don't ask again" lives in memory for the visit.
- Tests: per CLAUDE.md, test files are written by the unit-test-writer agent. Each task's test step is a brief for that agent: the test names and assertions below.
- Reduced motion: the strip's bars stand still. All controls keyboard-reachable; icon-only buttons have `aria-label`.
- Phones: nothing truncates or scrolls sideways (the strip wraps).

## Review Focus

- **A reply that's only a card, or very short (one sentence, no full stop):** it must still be spoken when the stream ends (the last fragment flushes on `finish`). Test in Task 2 (`speakableSentences` with `final: true`) and Task 4.
- **The visitor edits the transcription before sending, or clears it and types:** light edits stay spoken; an emptied box clears the flag. Test in Task 6.
- **A second spoken question while the first reply is still speaking:** the first stops at once, its queued sentences are dropped, and late audio from the first never plays. Test in Task 4 (generation ids) and Task 6.
- **The stream errors mid-reply** (rate limit, dropped connection): speech stops; the error message is never spoken. Test in Task 6.
- **The drawer closes (or Stop is tapped) while the model is still downloading:** playback never starts later out of nowhere when the download finishes. Test in Task 6.

---

### Task 1: Self-host the ONNX runtime and fix the engine's settings

**Files:**
- Create: `scripts/copy-ort.mjs`
- Modify: `package.json` (scripts `predev`, `prebuild`; add `@huggingface/transformers` `3.8.1` as a direct dependency), `.gitignore` (`/public/voice/ort/`), `lib/voice-reply/tts.worker.ts`
- Create: `lib/voice-reply/config.ts`

**Interfaces:**
- Produces: `KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"`, `KOKORO_DTYPE = "fp16"`, `KOKORO_VOICE` (Titus's pick), `ORT_PATH = "/voice/ort/"`, `MODEL_FILE_URL` (the fp16 `.onnx` URL on huggingface.co, used for the cache check), `DOWNLOAD_MB = 163` in `config.ts`.
- Produces (worker protocol, replaces the spike's): in `{ type: "load" }` | `{ type: "speak", id: number, text: string }` | `{ type: "cancel", upTo: number }`; out `{ type: "progress", loaded: number, total: number }` | `{ type: "ready" }` | `{ type: "audio", id, audio: Float32Array, sampleRate: number }` | `{ type: "error", id?: number, message: string }`. `cancel` drops queued `speak`s with `id <= upTo`.

- [ ] **Step 1:** `scripts/copy-ort.mjs` copies `ort-wasm-simd-threaded.jsep.mjs` and `.wasm` from `node_modules/@huggingface/transformers/dist/` to `public/voice/ort/` (creates the folder; exits non-zero if a source is missing). Wire it as `predev` and `prebuild`.
- [ ] **Step 2:** In the worker, import `env` from `@huggingface/transformers` and set `env.backends.onnx.wasm.wasmPaths = ORT_PATH` and `env.allowLocalModels = false` before loading; load with `device: "webgpu"`, `dtype: KOKORO_DTYPE`; speak with `KOKORO_VOICE`; sum progress across files into one `{loaded,total}`; implement `cancel`.
- [ ] **Step 3:** Point the lab at the new protocol (it keeps its engine and voice pickers by passing overrides; keep them as optional fields on `load`/`speak`).
- [ ] **Step 4: Verify** `npm run build` passes, then on `npx next start` load `/voice-lab` in Chrome and confirm in the Network panel that `ort-wasm-simd-threaded.jsep.wasm` comes from `/voice/ort/`, not jsDelivr, and that Speak still works.
- [ ] **Step 5: Commit** `feat(voice-reply): serve the ONNX runtime from the site; fix the engine to WebGPU fp16`.

### Task 2: Speakable sentences and the pronunciation map

**Files:**
- Create: `lib/voice-reply/speakable.ts`
- Test: `lib/voice-reply/speakable.test.ts`

**Interfaces:**
- Produces: `type Sentence = { index: number; shown: string; spoken: string }`; `toPlainText(markdown: string): string`; `speakableSentences(markdown: string, opts: { final: boolean }): Sentence[]`; `PRONUNCIATIONS: ReadonlyArray<[RegExp, string]>`.

- [ ] **Step 1: Tests (unit-test-writer brief):**
  - `toPlainText` drops citations: `"I built it [1] and shipped it [2, 3]."` → `"I built it and shipped it."`
  - keeps link text: `"See [my Medium](https://medium.com/@tituslhy)."` → `"See my Medium."`; drops bare URLs and tidies the space: `"Docs at https://x.y/z today."` → `"Docs at today."`
  - strips `**bold**`, `*em*`, `` `code` ``, `# Heading`, `- ` and `1. ` list markers; paragraphs join with a single space.
  - `speakableSentences("One. Two", { final: false })` → one sentence `"One."`; with `final: true` → `"One."`, `"Two"`.
  - indexes are stable as text grows: sentences from a prefix keep their `index` and `shown` when called on the longer text.
  - `shown` is the plain text as displayed (for the highlight); `spoken` has the map applied: `"UOB"` → `"U O B"`, `"LlamaIndex"` → `"Llama Index"` (whole words only: `"UOBX"` unchanged). The final map comes from the spike; test the entries it ends with.
  - an abbreviation or decimal doesn't split: `"It cut errors by 80.5 percent at U.S. banks."` is one sentence.
- [ ] **Step 2:** Run `npx jest lib/voice-reply/speakable.test.ts`; expect failures (module missing).
- [ ] **Step 3:** Implement. Split on `.`, `?`, `!` or `…` followed by whitespace and a capital letter or a quote, or on a paragraph break; not after a single capital letter or between digits. When `final` is false, the trailing fragment without terminal punctuation is held back.
- [ ] **Step 4:** Run the tests; expect PASS.
- [ ] **Step 5: Commit** `feat(voice-reply): turn a reply's markdown into sentences to speak`.

### Task 3: Where audio may play, and the download offer

**Files:**
- Create: `lib/voice-reply/support.ts`
- Test: `lib/voice-reply/support.test.ts`

**Interfaces:**
- Produces: `canSpeak(nav: { gpu?: { requestAdapter(): Promise<unknown | null> } }): Promise<boolean>` (true only when an adapter comes back; false on throw); `isVoiceCached(cachesApi: CacheStorage | undefined): Promise<boolean>` (opens `"transformers-cache"`, matches `MODEL_FILE_URL`; false on any error or when `caches` is missing); `needsDownloadOffer(env: { coarsePointer: boolean; connection?: { type?: string; saveData?: boolean }; cached: boolean }): boolean`.

- [ ] **Step 1: Tests:** `canSpeak` false with no `gpu`, false when `requestAdapter` resolves `null` or rejects, true with an adapter. `isVoiceCached` true when the cache matches the model URL, false when not, false when `caches` is undefined or `open` throws. `needsDownloadOffer`: cached → false whatever else; coarse pointer → true; fine pointer with `connection.type === "cellular"` → true; with `saveData` → true; fine pointer, no connection info → false.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5: Commit** `feat(voice-reply): decide where a reply can be spoken and when to offer the download`.

### Task 4: The player (scheduling, highlight timing, stalls)

**Files:**
- Create: `lib/voice-reply/player.ts`
- Test: `lib/voice-reply/player.test.ts`

**Interfaces:**
- Consumes: an `AudioContext`-like object (`currentTime`, `createBuffer`, `createBufferSource`, `destination`).
- Produces: `createReplyPlayer(ctx, opts: { onSentence(index: number): void; onDone(): void; onStall(): void; stallMs?: number; firstAudioMs?: number; now?: () => number }): ReplyPlayer` with `expect(index: number): void` (a sentence was sent to the engine), `play(index: number, audio: Float32Array, sampleRate: number): void`, `finish(): void` (no more sentences will come), `stop(): void`. Defaults: `STALL_MS = 2000`, `FIRST_AUDIO_MS = 8000`.

- [ ] **Step 1: Tests (fake context and fake timers):**
  - sentences play back to back in index order even when audio arrives out of order (2 before 1 → 1 then 2).
  - `onSentence(i)` fires when sentence i starts playing, not when its audio arrives.
  - `onDone` fires once, after the last sentence ends and only after `finish()`.
  - a sentence whose audio arrives more than `stallMs` after the previous one ended → `onStall`, nothing else plays afterwards.
  - no audio for sentence 0 within `firstAudioMs` of its `expect(0)` → `onStall`.
  - after `stop()`: started sources are stopped, later `play` calls are ignored, no callbacks fire.
  - a reply that ends with `finish()` before any `expect` → `onDone` immediately (nothing to say).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. Keep `nextStart`, schedule each buffer at `max(currentTime, nextStart)`; time `onSentence` with `setTimeout` from the scheduled start; check stalls with a timer armed when a sentence ends and the next isn't scheduled.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5: Commit** `feat(voice-reply): play a reply's sentences in order and give up when it stalls`.

### Task 5: The engine (worker client)

**Files:**
- Create: `lib/voice-reply/engine.ts`
- Test: `lib/voice-reply/engine.test.ts`

**Interfaces:**
- Consumes: Task 1's worker protocol and config.
- Produces: `getVoiceEngine(makeWorker?: () => Worker): VoiceEngine`, a per-page singleton: `state: "idle" | "loading" | "ready" | "failed"`; `load(): Promise<void>` (idempotent; rejects and sets `failed` on a worker error with no id); `onProgress(cb: (fraction: number) => void): () => void`; `speak(text: string): { id: number; audio: Promise<{ audio: Float32Array; sampleRate: number }> }`; `cancelAll(): void` (rejects pending speaks with an `AbortError`, tells the worker `cancel` up to the last id). `resetVoiceEngineForTests()`.

- [ ] **Step 1: Tests (fake worker):** `load` posts one `load` however often called; `ready` resolves it; an id-less `error` rejects it and sets `failed`; progress reports `loaded/total` as a fraction (0 when total is 0); `speak` resolves with the matching id's audio and ignores others; `cancelAll` rejects pending speaks with `name === "AbortError"` and posts `{ type: "cancel", upTo }`; audio arriving after `cancelAll` for a cancelled id is ignored.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; the default `makeWorker` is `new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" })`.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5: Commit** `feat(voice-reply): a client for the voice worker`.

### Task 6: `useVoiceReply` and the drawer's voice states

**Files:**
- Create: `components/VoiceReply.tsx` (the hook plus `SpokenTag`, `SpeakingStrip`, `ThinkingVoiceLine`, `DownloadOffer`, `HearAgainButton`, `VoiceFallbackLine`)
- Create: `lib/voice-reply/highlight.ts` (`highlightSentence(root: HTMLElement, shown: string): void`, `clearHighlight(): void`, using `CSS.highlights` under the name `"voice-reply"`; no-ops where unsupported)
- Modify: `components/CopilotBubble.tsx`, `app/globals.css` (`::highlight(voice-reply) { background-color: var(--amber-soft); }`)
- Test: `components/VoiceReply.test.tsx`, additions to `components/CopilotBubble.test.tsx`, `lib/voice-reply/highlight.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `useVoiceReply(): { prime(): void; begin(replyKey: string): void; feed(markdown: string): void; finish(markdown: string): void; stop(): void; hearAgain(replyKey: string): void; status: { key: string; phase: "offer" | "loading" | "speaking" | "done" | "failed"; progress: number } | null; answerOffer(yes: boolean): void; supported: boolean }`.
- `Message` gains `spoken?: boolean` (on the visitor's message).

- [ ] **Step 1: Tests (unit-test-writer brief; mock the engine, player and support modules):**
  - drawer: words from the mic then Send → the request body has `spoken: true` and the visitor's message shows the "spoken" tag; typed, a starter prompt or an "Ask about X" pill → no `spoken` key; mic words then the box emptied then typed → no `spoken`; mic words lightly edited → `spoken: true`.
  - thinking state of a spoken question shows "You asked out loud, so I’ll answer out loud." (desktop) or the download offer (coarse pointer, not cached).
  - "Text is fine" → no speech for this reply and no offer for the next spoken question this visit; "Speak replies" → `load()` called.
  - streaming deltas feed sentences to the engine as they complete; `finish` sends the last fragment.
  - while speaking: the strip shows "Speaking", "type to cut in", and Stop; Stop, typing, the mic, Send, closing the drawer and starting the tour each call `stop()` and the strip goes.
  - done: "hear again" appears on that reply only, and replays from sentence 0.
  - `onStall`, `load()` rejecting, or `canSpeak` false → the fallback line, no "hear again".
  - a stream error mid-reply stops speech; the error message is never sent to the engine.
  - a second spoken question during speech stops the first; late audio from the first never plays.
  - the drawer closed (or Stop tapped) while `load()` is pending: when it resolves, nothing is spoken.
  - reduced motion: the strip's bars have no animation class.
  - `highlightSentence` sets a highlight over the matching text across text nodes (bold inside a sentence), `clearHighlight` removes it, and both no-op without `CSS.highlights`.
- [ ] **Step 2:** Run `npx jest components/VoiceReply.test.tsx components/CopilotBubble.test.tsx lib/voice-reply/highlight.test.ts`; expect the new tests to FAIL.
- [ ] **Step 3: Implement the hook.** `prime()` (called in the mic tap and in Send/Enter, both user gestures) sets `navigator.audioSession.type = "playback"` where it exists (else the iPhone's silent switch mutes Web Audio), creates or resumes one `AudioContext` and, on desktop when `canSpeak`, starts `load()`. `begin` decides offer / loading / speaking. Each `onSentence` highlights in `#copilot-msg-<id>`.
- [ ] **Step 4: Wire the drawer.** Set a `spokenDraft` ref in the `useVoiceInput` callback; clear it when the box is emptied; `sendMessage(textOverride)` with an override is never spoken. Include `spoken: true` in the body only when set. Call `begin` at send, `feed` from `appendDelta` with the message's full content, `finish` on stream end, `stop` on the listed actions and in the `catch`. Render the states per the mock (strip above the input row; offer and thinking line under the dots; "hear again" beside "copy"; fallback line under the reply).
- [ ] **Step 5:** Run the tests; expect PASS. Run `npm run lint` and `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat(ask-titus): speak to it, and it speaks back`.

### Task 7: The route's `spoken` flag and the eval

**Files:**
- Modify: `lib/copilot-prompt.ts` (export `SPOKEN_REPLY_RULES`, the spec's text verbatim), `app/api/chat/route.ts`, `scripts/eval-golden.ts`, `scripts/eval-writing.ts`
- Test: `app/api/chat/route.test.ts`, `scripts/eval-golden.test.ts`

**Interfaces:**
- Produces: request body `{ messages, citations?, spoken?: boolean }`; `spokenStyleProblems(reply: string): string[]` in `eval-golden.ts` (names each problem: `"list"`, `"heading"`, `"bold"`, `"url"`, `"more than two paragraphs"`); `GoldenRow.spoken?: true`.

- [ ] **Step 1: Tests:** route: `spoken: true` adds a system message equal to `SPOKEN_REPLY_RULES` after the conversation-context message; absent or `false` adds nothing; `"yes"`, `1` or `null` → 400. `spokenStyleProblems`: a clean two-paragraph reply → `[]`; `"- one\n- two"` → `["list"]`; a URL → `["url"]`; three paragraphs → `["more than two paragraphs"]`; `[1]` citations are fine.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. In the eval, add three spoken rows (one role question that shows a card, one writing question that cites, one project question) and report `spoken style: n/3 clean` without failing the run.
- [ ] **Step 4:** Run the tests; expect PASS. Run `npm run eval:writing -- --only "<one spoken row>"` locally if a key is set (skip if not, and say so).
- [ ] **Step 5: Commit** `feat(ask-titus): a spoken question gets a reply written to be heard`.

### Task 8: Copy (drawer privacy line, colophon) and the lab's fate

**Files:**
- Modify: `components/CopilotBubble.tsx` (privacy line), `app/colophon/page.tsx` (Voice section, guardrail row), their tests; `CLAUDE.md` and `requirements.md` (copilot behaviour bullet: voice reply); delete `app/voice-lab/` (the spike is done)
- Test: `components/CopilotBubble.test.tsx`, `app/colophon/page.test.tsx`

- [ ] **Step 1: Tests:** where voice is supported the privacy line reads exactly the spec's proposed text; where it isn't, today's line minus the voice sentences. The colophon's Voice section says spoken replies are made on the device, no audio is sent, and the voice comes from Hugging Face once and is kept in the browser's cache; its guardrail row adds `['Spoken replies made on your device; only a question you spoke is spoken back', 'Audio sent to a server; a typed question read aloud']`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement. **Step 4:** Run the full suite `npm test`; expect PASS; `npm run lint`; `npm run build`.
- [ ] **Step 5: Commit** `docs(ask-titus): say where spoken replies are made`.

### Task 9: Device checks and the PR

- [ ] **Step 1:** Push; on the Vercel preview check iPhone Safari, Android Chrome, desktop Chrome, Safari and Firefox: audio plays after a spoken question, the highlight follows, Stop and typing cut it off, "hear again" works, the phone offer shows once, and Chrome's CPU throttling (6×) brings up the fallback line instead of stutter.
- [ ] **Step 2:** Screenshots of the five states on desktop and phone for Titus.
- [ ] **Step 3:** Open the PR to `main` with the results table; ask Titus to review (memory: he doesn't read TypeScript, so explain in plain English).
