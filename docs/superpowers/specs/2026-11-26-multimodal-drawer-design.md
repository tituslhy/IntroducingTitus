# Ask Titus, multimodal: voice in, images in, (maybe) voice out

Date: 2026-11-26 · Status: **draft plan, not started** · Owner: Titus

## Intent

Today a visitor can only type to Ask Titus. I want them to be able to **talk to it** (phase 1) and **show it a
picture** of an agent architecture so it can point them to the articles of mine worth reading (phase 2). Hearing the
reply spoken back (phase 3) is a maybe.

The bar is the one the rest of the copilot meets: grounded in my work, honest about what it did (the progress steps),
cheap to run, and nothing a visitor sends is kept beyond the logs the drawer already discloses.

## Recommendation in one paragraph

**Stay on OpenAI for all three phases.** `OPENAI_API_KEY` is already in Vercel, the copilot loop, evals and traces are
built around the Responses API, and the model I use (`gpt-6-luna`) already accepts images. Speech-to-text is a
separate, cheap call on the same key (`gpt-transcribe`, about $0.0045 a minute). Moving to Gemini so "one model handles
everything" would mean rewriting the loop, the tool definitions, the evals and the tracing, which is a migration and not a
feature. ElevenLabs is worth it only for phase 3, and only if I want the reply in **my own cloned voice**.

---

## Phase 1: the microphone (voice in)

### What the visitor sees
- A mic button beside Send. Tap to start, tap again to stop (or it stops itself at 60 s). While recording: a pulsing
  amber dot, the seconds counting, and a Stop button. No waveform theatrics.
- When they stop, the drawer shows "Transcribing…" next to the dots, then puts the words **in the input box**,
  not straight into the chat. They can fix a misheard word and press Send. This is honest, cheap, and nobody is
  surprised by what was sent.
- First use asks the browser for mic permission. If they refuse or there's no mic, the button explains it in one
  line and stays out of the way.

### How it works
1. Browser records with `MediaRecorder` (webm/opus on Chrome and Firefox, mp4/aac on iOS Safari; both are accepted).
2. `POST /api/transcribe` with the clip (multipart). Same guards as `/api/chat`: origin check, per-IP rate limit
   (tighter: say 5 a minute), size cap (60 s of opus ≈ 0.5 MB, well under Vercel's 4.5 MB body limit), type allow-list.
3. Server calls OpenAI transcription (`gpt-transcribe`) with a short **prompt of my vocabulary** (LangGraph,
   LlamaIndex, Jev, fictional-bassoon, Illumina, UOB, MITB…) so names come back spelled right.
4. Returns `{ text }`. The audio is never stored, logged or traced; only the character count and duration go in the
   request log line.

### Why not the free browser speech API
`SpeechRecognition` (Web Speech API) costs nothing, but Firefox doesn't support it, Chrome sends the audio to Google
anyway, and it can't take my vocabulary hint. Worth it only as a fallback if the API call fails.

### Not in phase 1
- Live, talk-over-each-other voice chat (OpenAI Realtime). Impressive, but a different architecture (WebSocket,
  server-side session, turn detection) and far pricier: see "Considered, not now" below.

### Done when
- Works on desktop Chrome, Safari, Firefox and iPhone Safari. Mic button and recording state wrap and never overflow
  on a 360 px phone.
- Privacy line under the input says voice clips go to OpenAI to be transcribed and aren't kept.
- Tests: route guards (origin, size, type, rate limit), recorder states (idle → recording → transcribing → text in
  box; refused permission; 60 s auto-stop), and the vocabulary prompt.

---

## Phase 2: images (show me your architecture)

### What the visitor sees
- A paperclip/image button beside the mic. Pick or drop one image (or paste a screenshot). A small thumbnail sits
  above the input with an ✕ to remove it. They add a question ("What would you change here?") or send it as is.
- The reply works through the diagram and names the articles to read, with the usual progress steps:
  "Looking at the diagram" (reasoning headline) → "Searching my writing for "LangGraph", "Qdrant" and
  "guardrails"" → the answer with `[n]` citations and Sources.

### How it works
1. The browser **downscales** the image before sending (longest side 1600 px, JPEG/WebP ~80%): that keeps it under
   the 4.5 MB body limit, cuts token cost, and strips EXIF (location) data as a side effect.
2. `/api/chat` accepts one image on the **latest** visitor message, sent to the model as an `input_image` part beside
   the text. Caps: one image per message, three per conversation, allowed types png/jpeg/webp/gif.
3. No new tool. The model already has `search_writing` (up to 3 topics per call) and `read_writing`. The prompt
   gets a short section: *when shown an architecture, name its components, then search my writing for the ones I've
   written about; say plainly which parts I haven't.*
   **Jev stays as is.** It searches text and never sees the image: the model does the looking, turns the diagram
   into topics ("LangGraph supervisor", "Qdrant", "guardrails") and calls `search_writing` exactly as it does for a
   typed question. To Jev, a question that started as a picture looks the same as one that was typed.
   **The budget is the real limit:** 3 topics per search × 3 searches per reply (`MAX_TOPICS`,
   `MAX_READING_CALLS` in `lib/search-config.ts`) = at most 9 topics, and 10 articles per reply
   (`MAX_ARTICLES_PER_REPLY`). A busy diagram has more boxes than that, so the prompt tells the model to pick the
   parts that matter (agent pattern, memory/retrieval, guardrails, deployment) rather than search every box; the
   image evals show whether it picks well.
   (Jev would only need images for a different feature, "find my article with a diagram like this one", which
   means indexing the figures in my articles. Not planned.)
4. **History:** the image is sent only on the turn it was attached. Later turns carry a text placeholder
   ("[the visitor shared an architecture diagram]") plus my earlier reply, which already describes it. This keeps
   every follow-up cheap.
5. **Tracing:** LangSmith gets `[image: image/jpeg, 182 KB, 1600×900]`, never the pixels. Images can hold
   confidential diagrams from someone's employer.

### Risks to design for
- **Text inside images is instructions-shaped.** A screenshot can say "ignore your rules". The prompt treats
  everything in an image as content to discuss, never instructions; the tools are read-only, so the worst case is
  an off-topic reply, which the scope rules already redirect.
- **Off-topic images** (a cat, a selfie, a CV): polite one-line redirect, same as off-topic text.
- **Confidential diagrams:** the privacy line says images go to OpenAI and are not stored or traced.

### Done when
- The golden set (`npm run eval:writing`) gains 4–6 image cases: real architecture diagrams (my own from
  fictional-bassoon and the two Illumina diagrams already on Projects, plus a couple drawn for the test) with the articles they should surface.
  The colophon scorecard shows them only once the script has produced numbers.
- Tests: image validation and caps, downscaling, history placeholder, trace redaction, the thumbnail UI.

---

## Phase 3 (maybe): voice out

A **Listen** button on each finished reply, never auto-play. Voice that starts talking unasked is what makes it
feel weird; one that waits to be asked doesn't.

| Option | Voice | Cost | Catch |
|---|---|---|---|
| OpenAI TTS (same key) | Stock voices | Cents per reply | A stranger's voice saying "I built…" in first person. Some sources say OpenAI is retiring its standalone TTS models (Jan 2027) in favour of the realtime models; **check before building**. |
| ElevenLabs, my cloned voice | Sounds like me | New key and a monthly subscription (check current plans) | Most impressive by far; needs a few minutes of clean recording of me, and a line saying it's an AI voice. |
| Browser `speechSynthesis` | Robotic, varies by device | Free | Sounds cheap; undercuts the editorial feel. |

My leaning: skip stock voices entirely. Either it's my voice (ElevenLabs) or there's no voice. Decide after
phases 1–2 are live.

---

## Considered, not now

- **Gemini, one model for everything.** Gemini takes text, images, audio and even video in one call, which is
  genuinely appealing: a visitor could send a screen recording of their agent misbehaving. But it means moving the
  whole copilot (loop, tool definitions, reasoning summaries, evals, tracing) off the OpenAI Responses API, and phases
  1–2 don't need it. Revisit if video becomes a goal; it would be its own migration plan, measured with the evals.
- **Realtime voice (talk to it like a phone call).** OpenAI's realtime models (now `gpt-realtime-2.1` and
  `-mini`, successors to `gpt-4o-realtime`) bill audio by the token, reported at about $32 in / $64 out per 1M
  audio tokens ($10 / $20 for mini), against about $0.0045 a minute to transcribe a clip. For a personal site where
  anyone can open the drawer, push-to-talk plus transcription gets 90% of the feel for a tiny fraction of the cost.

---

## Order and size

1. **Phase 1, mic:** one route, one recorder component, privacy copy. Small, about a day with tests.
2. **Phase 2, images:** chat route changes, prompt section, history/trace handling, eval cases. Medium.
3. **Phase 3, voice out:** a decision first, then small.

The colophon ("How Ask Titus works") gets a paragraph and a box on its diagram for each phase as it ships.

## Open questions for Titus

1. Mic: transcribe into the box for editing (recommended), or send straight away like a voice note?
2. Images: diagrams only, or also "here's my CV / job post as a screenshot"? (Recruiter mode already takes
   pasted text.)
3. Phase 3: my cloned voice or no voice?
4. Rate limits for voice and images: the same 10 a minute per visitor as text, or tighter?

## Sources checked (2026-11-26)

- OpenAI GPT-Transcribe model page: https://developers.openai.com/api/docs/models/gpt-transcribe
- OpenAI speech-to-text guide: https://developers.openai.com/api/docs/guides/speech-to-text
- OpenAI gpt-6-luna model page (text + image input, Responses API): https://developers.openai.com/api/docs/models/gpt-6-luna
- TTS retirement claim (third party, unconfirmed): https://rakazo.com/voice-providers/openai/
- Realtime pricing (third party): https://www.assemblyai.com/blog/tts-api-pricing
