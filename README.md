# IntroducingTitus

Personal website of **Lim Hsien Yong (Titus)** — GenAI Engineer & Architect.  
Live at: **https://tituslhy.github.io/IntroducingTitus/**

Built with Next.js 14 (App Router, static export) + Tailwind CSS. Deployed to GitHub Pages.

---

## Local Development

**Spin up:**
```bash
npm install       # first time only
npm run dev
```
Site is available at `http://localhost:3000`.

**Spin down:**  
`Ctrl + C` in the terminal running the dev server. Or if it's running in the background:
```bash
lsof -ti:3000 | xargs kill -9
```

---

## Deploy to GitHub Pages

```bash
npm run deploy
```

This runs `next build` (generates static output in `out/`) then pushes it to the `gh-pages` branch via the `gh-pages` package. Your source code on `main` is unaffected — commit and push that separately as usual.

**First-time setup:** After the first deploy, go to the repo on GitHub → Settings → Pages → set source branch to `gh-pages` → `/ (root)`.

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

**Recommended build pipeline** (from `requirements.md`):
1. Claude Code with Ralph Loop — implement features
2. `/coderabbit:code-review` — audit the changes
3. Claude Code — fix issues raised by CodeRabbit
4. `npm run deploy` — ship it

---

## Project Structure

```
app/              # Next.js App Router pages and layout
components/       # All page sections (Hero, Experience, ProjectsWriting, etc.)
public/           # Static assets (headshot.jpeg, .nojekyll)
CLAUDE.md         # Claude Code instructions and design rules
requirements.md   # Full product requirements document
```
