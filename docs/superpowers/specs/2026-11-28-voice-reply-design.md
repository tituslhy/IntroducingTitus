# Voice reply: speak to Ask Titus, and it speaks back

Date: 2026-11-28. Status: draft for Titus's approval. Experimental.

Mock: the "Ask Titus · voice reply states" canvas (https://claude.ai/artifact/Tg93ACrZKf43X6qnDyLffV), five states:
thinking, speaking, done, device too slow, on a phone. Approved by Titus 2026-11-28.

## Why

Voice in shipped (drawer plan 2, step 4): tap the mic, speak, the words land in the box. A visitor who talks to
Ask Titus expects it to talk back. Typing stays silent; speaking gets a spoken answer. Nothing to switch on.

## Goals

- A question sent from the mic gets its reply **shown and spoken**. A typed question is never spoken.
- Only for that one question: the next typed question comes back as text.
- **Costs nothing per reply.** The voice is Kokoro (open model, Apache-2.0) running in the visitor's browser via
  `kokoro-js`. OpenAI's speech models (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`) shut down on 2027-01-06, and their
  replacement (`gpt-realtime-2.1-mini`) is about 2 cents a reply; ElevenLabs is out on cost (Titus's call).
- One consistent voice for every visitor (the browser's own voices were tried and rejected: they differ per device and
  the defaults sound bad).

## Non-goals

- No paid speech API, no voice cloning.
- No hands-free conversation: each spoken reply ends; the next question needs a mic tap.
- No speaking typed questions, starter prompts, the tour or recruiter mode (no mic there).
- English only.

## Anti-goals (a failure even if it works)

- **Never surprises.** The drawer says it's about to answer out loud before any sound plays.
- **Never takes a phone's data unasked.** On a phone, the one-off download is offered, not taken.
- **Never stumbles.** On a device too slow to keep up, it stops speaking and says so, rather than stuttering.
- **Never says what the text doesn't.** The spoken words are the shown reply, minus citation markers. No separate
  spoken script.
- **Never hard to stop.** Stop is one tap; typing, the mic, sending, closing the drawer or starting the tour all stop it.

## Design

### When a reply is spoken

A message is *spoken* when its text came from the mic: the transcription filled the box and the visitor sent it
(light edits allowed). Emptying the box, picking a starter or an "Ask about X" pill, or switching to recruiter mode
clears it. The flag belongs to that one message.

### One reply, written to be heard

The drawer sends `spoken: true` with that request. `/api/chat` accepts an optional boolean `spoken` (anything else is
a 400) and, when true, adds one system message after the conversation context:

> This question was spoken, and your reply will be read aloud by a voice in the visitor's browser as well as shown.
> Write it to be heard: plain sentences; no lists, tables, headings, bold or code; no URLs (say "my Medium" or the
> article's name). At most two short paragraphs, story questions included. When you show a card or move the page,
> say so in one plain line ("I've put the timeline on screen") instead of reading it out. Cite as usual: the [n]
> markers are shown, not spoken.

Everything else (scope, honesty, first person, tools, cards, page moves) is unchanged. The trace records
`spoken: true`; no audio ever reaches the server.

### Turning the reply into speech (`lib/voice-reply/`)

- **Speakable text:** from the reply's markdown: drop `[n]` citations, markdown syntax and bare URLs (link text stays),
  then split into sentences, each with its place in the shown text (for the highlight).
- **Pronunciation map:** a small fixed list for names the model may mangle (e.g. "UOB" → "U O B", "LlamaIndex" →
  "Llama Index", "Tsusho"), settled in the spike by ear.
- **Engine in a Web Worker:** `kokoro-js` on **WebGPU with the `fp16` model (163 MB, plus one ~0.5 MB voice file)**
  loads and runs in a worker so the drawer never freezes. One fixed voice, picked by Titus in the spike.
- **No WebGPU, no voice:** a browser without WebGPU (or whose GPU adapter fails) answers in text, with state 4's line.
  WASM was measured at 0.6× real time (it runs on one thread: the site isn't cross-origin isolated, and isolating it
  would break Medium's cover pictures and the YouTube embed), so it can never keep up.
- **Streaming:** as the reply streams in, each finished sentence goes to the worker; audio comes back per sentence and
  plays in order, so speech starts after the first sentence, not the whole reply.
- **Playback:** an `AudioContext` made and resumed **inside the mic tap** (Safari only lets audio play from a page if
  a tap started it), kept for that reply, scheduling one buffer per sentence. Before it, `navigator.audioSession.type
  = "playback"` (Safari's Audio Session API): otherwise iPhone Safari treats Web Audio as ambient sound and the silent
  switch mutes it (found on Titus's iPhone in the spike).
- **Highlight:** the sentence playing gets a soft amber wash using the CSS Custom Highlight API, without touching the
  rendered markdown. Where the browser lacks it, no highlight; speech still plays.

### What the visitor sees (the mock's states)

1. **Thinking:** the question is tagged "You · spoken". Under the dots: "You asked out loud, so I'll answer out loud."
2. **Speaking:** a strip above the input row: moving bars, "Speaking", "type to cut in", and an amber Stop button
   (styled like the mic's Stop). The box and mic stay live. "Speaking" is announced to screen readers once.
   Reduced motion: the bars stand still.
3. **Done:** the strip goes. The reply gets "hear again" beside "copy" (replays from the start; audio for the last
   spoken reply is kept in memory only, for this visit).
4. **Device too slow / voice failed:** the reply stays as text, with one italic line: "My voice couldn't keep up on
   this device, so this one's written out." No "hear again".
5. **Phone:** the same states at phone width; Send shrinks to its arrow as today.

### The download

- **Desktop:** the model starts downloading at the mic tap, silently, so it is usually ready before the reply.
- **Phone** (a coarse pointer, or the browser reports cellular or Save-Data): the first spoken question shows a
  one-tap line in the thinking state: "I can answer out loud. It's a one-off 163 MB download." **Speak replies** /
  **Text is fine**. Yes starts the download while it thinks; No answers in text and doesn't ask again this visit
  (in memory only).
- **Already downloaded** (the model is in the browser's cache): no question, anywhere.
- **Still downloading when the reply's text is done:** the strip reads "Getting my voice ready · 40%" with Stop.

### Too slow, or it fails

Stop speaking and show state 4 when: the model can't load (no WASM, out of memory, download fails); the first
sentence's audio isn't ready within a few seconds of its text arriving; or, mid-reply, the next sentence isn't ready
when the last one ends (a gap of more than about 2 s). Exact thresholds are set in the spike on Titus's Mac and
iPhone.

### Stopping

Stop, typing in the box, tapping the mic, sending a message, closing the drawer, starting the tour, or a new spoken
reply all stop playback at once and drop the sentences still queued. Page moves (`show_on_page`) do not stop it: the
drawer lives across pages.

### Privacy copy (needs Titus's sign-off)

Today's drawer line says "Nothing is stored in your browser." With the voice cached, that is no longer true. Proposed,
where voice is supported:

> Messages go to OpenAI to generate a reply and are logged so I can improve answers. Your messages aren't stored in
> your browser. Voice clips go to OpenAI to be transcribed; I don't keep them. Spoken replies are made on your device,
> with a voice downloaded once from Hugging Face and kept in your browser's cache.

The colophon's Voice section and its guardrail row gain the same facts (spoken replies made on the device; no audio
sent; the model's host).

### Third parties

- **Hugging Face** serves the model and voice files (the visitor's browser downloads them; nothing is uploaded).
- **onnxruntime-web's runtime files** (`ort-wasm-simd-threaded.jsep.{mjs,wasm}`, 21.6 MB; needed even on WebGPU):
  `transformers.js` fetches them from jsDelivr by default (seen in the spike). Plan: serve them from the site instead,
  copied from `node_modules` at build time (not committed), so the only third party is Hugging Face.
- **Dependencies:** `kokoro-js` 1.2.1 → `@huggingface/transformers` 3.8.1. Its server-only `sharp` is pinned to
  0.35.5 (Next's own) through `overrides`, so the audit gains nothing; it never runs in the browser.

## Step 0: the spike (go / no-go before the real build)

A throwaway page, `/voice-lab` (dev and Vercel previews only; production gets a 404; not linked) that:

1. Loads `kokoro-js` in a Web Worker under Next.js 16's bundler (Turbopack). **Done: it builds and runs.**
2. Measures on Titus's Mac (Chrome, Safari) and iPhone (Safari): download size and time, load time, and how fast it
   speaks compared with real time.
3. Plays the candidate voices for Titus to pick one (male: `am_michael`, `am_fenrir`, `am_puck`, `bm_george`,
   `bm_lewis`, `bm_fable`; others on request).
4. Reads a sample reply with the hard names (Illumina, UOB, Toyota Tsusho, LlamaIndex, LangGraph, fictional-bassoon)
   to settle the pronunciation map.

First results (2026-11-28, Chrome on Titus's Mac, via Playwright):

| Engine | Download | Speed vs real time | Note |
|---|---|---|---|
| WebGPU fp16 | 163 MB | 11–15× | first sound 2.3 s after the tap; **picked** |
| WebGPU fp32 | 326 MB | 14–16× | same speed, twice the size |
| WebGPU q4f16 | 155 MB | 13× | one sentence came out silent: broken |
| WebGPU q8 | 92 MB | 0.6× | quantized ops fall back to the CPU |
| WASM q8 | 92 MB | 0.6× | one thread only |

Still to measure: Safari on the Mac, and the iPhone (WebGPU needs HTTPS, so on a Vercel preview).

Go if the iPhone keeps up with real time after loading and Titus likes a voice. No-go means we stop here; voice in
keeps working as today.

Known risk: `kokoro-js` was last published in May 2025 (1.2.1, on `@huggingface/transformers` 3.x). If it no longer
builds cleanly, the spike says so before any real code is written.

## Testing

- Unit tests (the unit-test-writer agent): speakable text and sentence splitting; the pronunciation map; the
  spoken-message flag (set by a transcription, cleared by the listed actions); the route's `spoken` validation and
  its system message; the phone download offer; the stop rules; the too-slow rules, with a fake worker and fake
  audio clock.
- Eval: `npm run eval:writing` gains spoken cases (no list markup, no URLs, two paragraphs at most, a card mentioned
  in a plain line).
- By hand, on a Vercel preview: iPhone Safari, Android Chrome, desktop Chrome, Safari and Firefox. Check that audio is
  allowed to play, the highlight, Stop, "hear again", the phone offer, and the slow-device line (simulated with CPU
  throttling).

## Build order

0. The spike (above). Titus picks the voice; go / no-go.
1. Route: `spoken` flag and its system message; eval cases.
2. `lib/voice-reply/`: speakable text, pronunciation map, sentence queue, worker, playback, too-slow rules.
3. Drawer: the spoken flag, the five states, the phone offer, stopping, "hear again".
4. Copy: drawer privacy line, colophon Voice section and guardrail row.
5. Preview checks on real devices, then a PR.
