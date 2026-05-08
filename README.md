# IntroducingTitus

Personal website of **Lim Hsien Yong (Titus)** — GenAI Engineer & Architect.  
Live at: **https://introducing-titus.vercel.app/**

Built with Next.js 14 (App Router) + Tailwind CSS. Deployed to Vercel.

---

## Features

- **Personal site** — Hero, Experience, Projects, Writing, Contact sections
- **Copilot chat bubble** — floating AI assistant (bottom-right, all pages) powered by OpenAI `gpt-4o-mini` via a server-side `/api/chat` route. Answers questions about Titus's work only. Requires `OPENAI_API_KEY` in environment.

---

## Local Development

**Spin up:**
```bash
npm install       # first time only
npm run dev
```
Site is available at `http://localhost:3000`.

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` for the Copilot chat feature to work locally.

**Spin down:**  
`Ctrl + C` in the terminal running the dev server. Or if it's running in the background:
```bash
lsof -ti:3000 | xargs kill -9
```

---

## Deploying to Vercel

Deployments are handled automatically by Vercel on push to `main` (production) or any branch (preview). No manual deploy command needed.

**Environment variables** are managed in the Vercel dashboard (or via `vercel env`). The required key is:
- `OPENAI_API_KEY` — used server-side by `/api/chat`

To deploy manually from the CLI:
```bash
vercel              # preview deployment
vercel --prod       # production deployment
```

---

## Working with Claude Code

**Invoke Claude:**
```bash
claude
```
Claude Code reads `CLAUDE.md` at the root for project-specific instructions. Always follow the Ralph Wiggum Protocol defined there: read `requirements.md` before writing any code.

**Start a Ralph Loop** (iterative build loop — Claude works autonomously in cycles):
```
/ralph-loop
```
Run this inside a Claude Code session. Ralph will loop through tasks, pause for review, and continue. To stop it early:
```
/cancel-ralph
```
For help on Ralph:
```
/ralph-loop:help
```

---

## Build Pipeline

1. **Claude Code + Ralph Loop** — implement features
2. **CodeRabbit** (`/coderabbit:code-review`) — AI code audit on the changes
3. **SonarQube** — static code analysis (configured via `sonar-project.properties`)
4. **Unit tests** — written in Cursor (primary); Claude Code `unit-test-writer` subagent as fallback when on Cursor free tier
5. **Vercel** — auto-deploys on merge to `main`

---

## Project Structure

```
app/
  api/chat/         # Server-side OpenAI proxy for Copilot
  ...               # Next.js App Router pages and layout
components/         # All page sections (Hero, Experience, ProjectsWriting, etc.)
public/             # Static assets (headshot.jpeg)
copilot-system-prompt.md  # System prompt for the Copilot chat feature
sonar-project.properties  # SonarQube static analysis config
CLAUDE.md           # Claude Code instructions and design rules
requirements.md     # Full product requirements document
```
