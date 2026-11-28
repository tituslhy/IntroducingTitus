# Drawer plans

Plans for **Ask Titus**, the copilot drawer on every page. Each plan is built one step at a time ("implement drawer
plan `<file>`"); this page says where each one stands. Last updated 2026-11-28.

| Plan | What it's for | Status |
|---|---|---|
| [1. Ask Titus becomes a small agent](1.%20ask-titus-agent.md) | A tool loop, answers from my Medium articles, the "How Ask Titus works" page | ✅ Done |
| [2. Ask Titus beyond text](2.%20ask-titus-beyond-text.md) | Cards in replies, images in, the microphone, voice out | 🟡 Half done |

---

## Plan 1: Ask Titus becomes a small agent · ✅ done

| Phase | What | Status |
|---|---|---|
| 1 | A hand-written tool loop in `/api/chat` (≤4 rounds, no agent framework); `show_on_page` moved onto it | ✅ Shipped |
| 2 | `search_writing`: answers from my Medium articles (via Jev), with `[n]` footnotes and a Sources row | ✅ Shipped |
| 3 | `/colophon`, "How Ask Titus works", with the eval scorecard | ✅ Shipped |

The acceptance checklists inside the plan were never ticked off; the work itself shipped.

---

## Plan 2: Ask Titus beyond text · 🟡 half done

The file's header still says "draft, not started"; it's out of date. Where each step really is:

| Step | What | Status |
|---|---|---|
| 1 | **Cards**: A2UI v1.0 evidence card and compare table; article questions filter the Writing page | ✅ Shipped (PR #21) |
| 2 | **More cards**, only as they earn a place | ⚪ Nothing planned. The tool element and staff-pass cards were dropped: they copied a page into the drawer |
| 3 | **Images in**: show it an architecture diagram, get a reading path | ⏸️ On hold since 2026-11-27 (no images for now) |
| 4 | **Microphone in**: speak a question, the words land in the box to check and send | ✅ Shipped (PR #22) |
| 5 | **Voice out**: hear the reply | 🔵 In progress on branch `voice-reply`; the plan changed (below) |

### Step 5 changed: it speaks back when you speak to it

The plan's version (a "Listen" button, my cloned voice via ElevenLabs, or no voice) was replaced on 2026-11-28:

- **If you speak your question, the reply is spoken back. If you type, it stays silent.** Only for that one question.
- The voice is **Kokoro**, an open model that runs **in the visitor's browser** (WebGPU): free per reply, nothing
  sent anywhere. Not my voice; a stock voice I pick by ear.
- Spec: `docs/superpowers/specs/2026-11-28-voice-reply-design.md`. Build plan (10 tasks):
  `docs/superpowers/plans/2026-11-28-voice-reply.md`. Mock: the "Ask Titus · voice reply states" canvas.

**Done so far (the spike, a test page at `/voice-lab` on previews only):**
- Kokoro runs in the browser; on my Mac it speaks 15× faster than real time, first sound about 1 s after the tap.
- Found and fixed four iPhone and runtime problems: Safari couldn't unpack Kokoro's pronunciation dictionary; the
  iPhone's silent switch muted the audio; the older ONNX Runtime hung on the iPhone; the newer one filled the audio
  with NaN (an averaging step overflowing half-precision numbers).
- Fixed the "bad phone line" crackle by running the voice generator's last layers in full precision.
- The result is a **patched model, 172 MB** (scripts in `scripts/kokoro/`), clean in Chrome. The full-precision
  model (326 MB) crashes the iPhone, so phones need this one.

**Not done yet:**
- [ ] **Upload the patched model to my Hugging Face** (tonight; the folder is `voice-model-upload/`, kept out of git)
- [ ] Test it on my iPhone, and **pick the voice** by ear
- [ ] Build it for real (the 10-task plan, with subagents), including the first spoken question while the voice
      downloads (approved 2026-11-28: a real progress step, the reply never waits, "Hear this reply" if it's late)
- [ ] Update the privacy line, and elaborate the colophon's Voice section with how it works and the engineering story
- [ ] Re-record the tour so it mentions speaking to Ask Titus (needs my OpenAI key: `npm run tour:record`)

---

## Open questions

- **Images:** diagrams only, or screenshots of CVs and job posts too? (Moot while step 3 is on hold.)
- **Rate limits for images:** the same 10 a minute as text, or tighter? (Same.)
- **Voice:** which Kokoro voice (six male candidates)?

Answered: cards only when they help, at most one per reply; the mic puts words in the box rather than sending them;
voice out is Kokoro, spoken back only to spoken questions.

## Also open, outside these plans

- **The computer vision eval question** ("Have you worked on computer vision use cases?"): on the 26 Nov run the reply
  cited the right article but didn't name Illumina or SMU. The checker was loosened the next day ("SMU", "MITB" or
  "Singapore Management University" all count) but hasn't been rerun. To check:
  `npm run eval:writing -- --only "computer vision"` (needs my OpenAI key).
