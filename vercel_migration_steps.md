# Migration & Copilot Build — Step by Step
**Date:** 7 May 2026  
**Prerequisites:** Node.js installed, repo cloned locally, OpenAI API key ready

---

## Phase 1: Vercel Migration (Do This Manually — NOT Claude Code)

These are human steps. Do them before invoking Claude Code.

### Step 1 — Install Vercel CLI
```bash
npm i -g vercel
```

### Step 2 — Update next.config.js
Remove `output: 'export'` and `images: { unoptimized: true }` is fine to keep.

Your new `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  basePath: '',
}

module.exports = nextConfig
```

### Step 3 — Deploy to Vercel
In your repo root:
```bash
vercel
```
Follow the prompts:
- Set up and deploy? **Y**
- Which scope? **Your personal account**
- Link to existing project? **N**
- Project name? **introducing-titus** (or whatever you like)
- Directory? **.** (current directory)
- Override settings? **N**

Vercel will build and give you a live URL like `introducing-titus.vercel.app`.

### Step 4 — Add OpenAI API Key to Vercel
Go to: https://vercel.com/dashboard → your project → Settings → Environment Variables

Add:
- **Name:** `OPENAI_API_KEY`
- **Value:** your OpenAI API key
- **Environments:** Production, Preview, Development ✅ all three

### Step 5 — Redeploy with env vars
```bash
vercel --prod
```

### Step 6 — Verify the site is live
Visit your Vercel URL. Check all sections load. Check headshot appears. Check links work.

### Step 7 — Update repo files
Replace the content of `CLAUDE.md` and `requirements.md` with the updated versions from this session (already generated — see artifacts).

Also add `copilot-system-prompt.md` to the repo root.

Commit and push:
```bash
git add .
git commit -m "migrate to vercel, add copilot requirements"
git push
```

---

## Phase 2: Copilot Bubble (Invoke Claude Code After Phase 1)

Once Vercel is live and `OPENAI_API_KEY` is set, open Claude Code in the repo and invoke:

```
claude
```

Then start a fresh session and paste this as your first message:

---

**Claude Code prompt to paste:**

```
Read CLAUDE.md and requirements.md completely before doing anything.

I want you to build the copilot bubble feature described in requirements.md under "Copilot Bubble — Phase 2".

Here is the complete scope:

1. Create `/app/api/chat/route.ts` — a POST API route that:
   - Accepts `{ messages: [{role, content}] }` in the request body
   - Reads OPENAI_API_KEY from environment variables (never expose to client)
   - Calls OpenAI Responses API with model gpt-4o-mini
   - Enables the web_search_preview tool
   - Uses the system prompt from copilot-system-prompt.md
   - Returns the assistant's response as JSON

2. Create `/components/CopilotBubble.tsx` — a floating chat component that:
   - Fixed bottom-right on all pages
   - Amber circular button matching accent color (#F59E0B range)
   - Click opens a chat panel (slide up animation)
   - Header text: "Ask me anything about my work"
   - Input placeholder: "Ask about my experience, projects, or writing..."
   - Typing indicator (animated dots) while awaiting response
   - Messages in useState only — no persistence
   - Close button
   - Mobile responsive
   - Calls /api/chat with full message history on each send

3. Add <CopilotBubble /> to the root layout so it appears on all pages.

Design rules are non-negotiable — dark mode, amber accent, IBM Plex Mono for chat text.
Do not break any existing pages or components.
Do not expose the OpenAI API key to the client.
```

---

## Phase 3: After Claude Code Builds It

1. Test locally: `npm run dev` → visit localhost:3000 → click the bubble → ask a question
2. Verify the API key is NOT visible in browser dev tools (Network tab)
3. Run CodeRabbit: `/coderabbit:code-review`
4. Fix any issues Claude Code raises
5. Deploy: `vercel --prod`
6. Test on live Vercel URL

---

## After Everything Is Live

- Update LinkedIn with new Vercel URL
- Update GitHub profile README if you have one
- Note the URL somewhere safe
- Retire the GitHub Pages version (or leave it — it'll just sit there quietly)

---

## Spending Cap Reminder
Set an OpenAI usage limit before going live:
https://platform.openai.com/settings/organization/limits
Suggested: $10/month hard cap. The model is gpt-4o-mini — it's cheap. $10 will last a long time.