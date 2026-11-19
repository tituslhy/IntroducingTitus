# Mobile Hero Order + Chat Privacy Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the name and tagline on the first phone screen, label the mobile contact CTA, and replace the drawer's contradictory privacy lines with one honest statement.

**Architecture:** Tailwind `order-*` changes inside the existing mobile `display: contents` grid in `Hero.tsx` (desktop `min-[880px]:order-none` untouched); one extra mobile-only span in the nav CTA; a copy edit in `CopilotBubble.tsx`.

**Tech Stack:** Next.js 14, Tailwind, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-mobile-hero-and-chat-privacy-copy-design.md`

## Global Constraints
- Desktop (≥880px hero, ≥721px nav) must render exactly as today.
- Headshot keeps `object-position: 50% 30%` and the saturate/contrast filter; 3:4 on desktop.
- Footer copy, verbatim: `Messages go to OpenAI to generate a reply and are logged so I can improve answers. Nothing is stored in your browser.`
- Fit-mode line `Sent to OpenAI to write the brief; not stored.` stays — `/api/fit` is never traced, so it is accurate.
- Per CLAUDE.md, test edits go through the unit-test-writer agent; Task 1 is styling-only and skips it.

## Review Focus
1. Phone at 390×844: name + tagline visible without scrolling — checked by screenshot in Task 1.
2. Screen readers on mobile: CTA accessible name stays "Email Titus" (aria-label), not "Get in touch Contact".
3. 721–879px (tablet portrait): nav shows "Get in touch" while hero is still in mobile order — must look sane.
4. Drawer header must still link "How this works" after the sentence is removed.
5. Colophon line 72 already says conversations are logged privately — footer copy must not contradict it (it doesn't).

---

### Task 1: Mobile hero order + shorter crop (styling only)

**Files:**
- Modify: `components/Hero.tsx:98-191`

- [ ] **Step 1: Reorder mobile-only `order-*` classes**, keeping every `min-[880px]:order-none`:
  meta `<p>` order-1 · `<h1>` order-2 · rule `<div>` order-3 · tagline `<p>` order-4 · sub-tagline order-5 · CTA row order-6 · `<figure>` order-7 · social row order-8 · kickers `<ul>` order-9.
- [ ] **Step 2: Shorter mobile crop** — the figure's inner div: `aspect-[3/4]` → `aspect-[4/3] min-[880px]:aspect-[3/4]`.
- [ ] **Step 3: Verify** — `npm run lint && npx jest components/Hero` → PASS; `npm run dev`, screenshot at 390×844 (name + tagline above fold) and 1440×900 (identical to production).
- [ ] **Step 4: Commit** — `git commit -m "fix(hero): lead with name and tagline on mobile"`

### Task 2: Mobile CTA label

**Files:**
- Modify: `components/Navigation.tsx:142`
- Test: `components/Navigation.test.tsx` (via unit-test-writer)

- [ ] **Step 1: Failing test** — `it("should show a Contact label on screens 720px and below")`: `cta.querySelector("span:nth-child(3)")` has text `"Contact"` and class `min-[721px]:hidden`; accessible name still matches `/email titus/i`.
- [ ] **Step 2: Run** `npx jest components/Navigation` → new test FAILS.
- [ ] **Step 3: Implement** — after the "Get in touch" span add `<span className="min-[721px]:hidden">Contact</span>`. Existing nth-child(2) tests keep passing.
- [ ] **Step 4: Run** `npx jest components/Navigation` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(nav): label the contact CTA on mobile"`

### Task 3: One honest privacy statement in the drawer

**Files:**
- Modify: `components/CopilotBubble.tsx:677-678, 957`
- Test: `components/CopilotBubble.test.tsx:120-127, 855-865` (via unit-test-writer)

- [ ] **Step 1: Update tests** — header test becomes `"should not repeat the logging disclosure in the drawer header"`: `queryByText(/chats are logged/i)` is null. Footer test asserts the Global Constraints copy verbatim and that `/does not save your chat history/i` is absent.
- [ ] **Step 2: Run** `npx jest components/CopilotBubble` → both FAIL.
- [ ] **Step 3: Implement** — header blurb becomes `Grounded in my public work and writing. It answers about my work.`; footer `<p>` gets the verbatim copy.
- [ ] **Step 4: Run** `npx jest components/CopilotBubble` → PASS; then full `npm test && npm run build` → green.
- [ ] **Step 5: Commit** — `git commit -m "fix(copilot): single, consistent privacy statement"`
