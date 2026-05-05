# Personal Website — Build Steps (Ralph Wiggum Pipeline)
**Repo:** tituslhy.github.io  
**Pipeline:** Claude Code (Ralph loop) → CodeRabbit audit → Claude Code fixes → Cursor unit tests → GitHub Pages deploy

---

## Pre-flight Checklist
- [ x ] `CLAUDE.md` in repo root
- [ x ] `requirements.md` in repo root
- [ x ] `.cursorrules` in repo root
- [ x ] `headshot.jpeg` in `/public/`
- [ x ] GitHub Pages enabled in repo settings → Source → GitHub Actions
- [ x ] fictional-bassoon repo confirmed public at `github.com/tituslhy/fictional-bassoon`

---

## Step 0 — Read (NOT a ralph loop, just Claude Code startup)
> Read CLAUDE.md and requirements.md completely. 
> Confirm understanding. Ask clarifying questions 
> if anything is ambiguous. Do not write code yet.
---

## Step 1 — Page 1: Home
```bash
/ralph-loop "Build Page 1 — Hero with headshot, tech stack tag grid, passions cards, and social links per CLAUDE.md. Dark mode only. Warm amber accent. DM Serif Display + IBM Plex Mono fonts." --max-iterations 10 --completion-promise "DONE"
```
🐇 CodeRabbit audit → Claude Code fixes → proceed only when clean

---

## Step 2 — Page 2: Experience
```bash
/ralph-loop "Build Page 2 — Reverse chronological experience timeline cards and education section per CLAUDE.md. Illumina is the crown jewel — give it maximum visual real estate." --max-iterations 10 --completion-promise "DONE"
```
🐇 CodeRabbit audit → Claude Code fixes → proceed only when clean

---

## Step 3 — Page 3: Projects + Writing
```bash
/ralph-loop "Build Page 3 — Project cards for fictional-bassoon and Illumina RAG system, open source contributions list, and 6 hardcoded Medium article cards per CLAUDE.md." --max-iterations 10 --completion-promise "DONE"
```
🐇 CodeRabbit audit → Claude Code fixes → proceed only when clean

---

## Step 4 — Unit Tests (Cursor)
Open project in Cursor. For each component:
```
"Write Jest + RTL unit tests for [ComponentName] 
following .cursorrules strictly."
```
Run tests:
```bash
npm test
```
✅ All tests passing before deploy

---

## Step 5 — Deploy
```bash
git add .
git commit -m "feat: complete portfolio site"
git push origin main
```
GitHub Actions picks up push → builds → deploys to `tituslhy.github.io` automatically.

---

## Step 6 — Post Deploy
- [ ] Verify live at https://tituslhy.github.io
- [ ] Check mobile responsiveness
- [ ] Check all links (GitHub, LinkedIn, Medium, mailto)
- [ ] Check headshot renders correctly
- [ ] Update Mastercard tech stack after onboarding (Jul 2026)

---

## Phase 2 — Copilot (Deferred)
Not in current build. Revisit after site is stable.
Will require: OpenAI API key, Vercel migration, RAG over resume content.