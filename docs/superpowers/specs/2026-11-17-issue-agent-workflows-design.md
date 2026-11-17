# Issue Agent Workflows — Design

**Date:** 2026-11-17
**Status:** Draft, awaiting Titus's approval

## Intent

When I tag an issue on this repo, an agent should pick it up and take it as far
as it can without me sitting at a terminal:

- **Bugs** → triaged, fixed, linted, tested, quickly reviewed, and delivered as
  a **PR**. Speed matters most here.
- **Features** → grilled in the issue thread until the scope is unambiguous,
  then turned into an **implementation plan delivered as a PR**. I merge it,
  pull it on my laptop, and run it in VS Code with Claude Code + superpowers
  (`implement <plan>.md`).

Two agents per track: a main agent that does the Q&A and the work, and a second
agent that reviews (code review for bugs, plan review for features).

## Goals

- Only I can drive it. Nothing anyone else writes starts a run or is treated as
  an instruction.
- Bug PRs arrive fast and green on lint, tests, and build, with a triage note
  and one review pass applied.
- Feature plans are complete enough that the implementing agents on my laptop
  never need to come back to me.
- The issue thread is the whole conversation and the whole memory — no external
  state store.
- The agent opens its own PRs; I never have to click a "create PR" link.

## Non-goals

- Auto-merging anything. Every PR waits for me.
- A general CI workflow for all PRs (worth adding later, separate piece of work).
- Responding to PR review comments (`@claude` on PRs). Possible follow-up.
- Implementing features. The feature track stops at a reviewed plan PR.
- Acting on untagged issues. Chores, questions and notes-to-self stay mine.

## Anti-goals (failure even if it "works")

- Acting on a stranger's issue or comment, or obeying instructions embedded in
  their text.
- Any app secret (`OPENAI_API_KEY`, `LANGSMITH_API_KEY`, `TYPESAFE_API_KEY`)
  reaching the runner.
- Endless grilling with no clear exit.
- A bug PR that claims tests pass when they weren't run, or a plan that silently
  guesses at scope I never confirmed.
- A slow, heavyweight bug track. If a one-line fix takes 20 minutes, it failed.

## Constraints (from the repo and the tool)

- No `.github/` exists yet; this is the repo's first automation.
- Checks available: `npm run lint` (eslint), `npm test` (jest), `npm run build`
  (Next.js 16). No `.nvmrc`/`engines`; Vercel's default is Node 24.
- Existing agents in `.claude/agents/`: `code-reviewer` (sonnet) and
  `unit-test-writer`. `CLAUDE.md` routes all test writing to
  `unit-test-writer`; Claude Code in Actions loads `CLAUDE.md` and
  `.claude/agents/`, so the rule carries over.
- **Committed `.claude/settings.json` conflicts with unattended runs:** it has
  `ask: Bash(git push:*)` (would block the PR step with nobody to answer),
  broad allows (`npx:*`, `npm install:*`, `python:*`, `WebFetch(domain:*)`)
  that would widen the runner's tool list, and a sandbox block with
  `autoAllowBashIfSandboxed`. The runner must not inherit these; my local setup
  must not change.
- **`design_handoff_personal_site/` is gitignored.** The runner and fresh
  clones can't see the README that `CLAUDE.md` calls the design source of
  truth. Fix: commit `design_handoff_personal_site/README.md` (keep `source/`
  ignored).
- Existing plans live in `docs/superpowers/plans/` in the superpowers
  writing-plans format (header with Goal / Architecture / Tech Stack / Spec,
  Global Constraints, Review Focus, numbered Tasks with Files and checkbox
  steps). Example: `docs/superpowers/plans/2026-11-14-copilot-writing-tree.md`.
- `claude-code-action@v1` facts that shape the design:
  - By default only users with write access can trigger it.
  - `include_comments_by_actor` filters which comments Claude sees at all.
  - In automation (`prompt`) mode it commits to a branch but does **not** open
    PRs by itself — the instructions must have it run `gh pr create`.
  - Default permission mode is "auto"; for a strict tool allowlist use
    `--permission-mode acceptEdits` with a narrow `--allowedTools`.
  - Creating an issue with labels fires both `opened` and `labeled`; trigger on
    `labeled` only to avoid double runs.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **A. GitHub Agentic Workflows (`gh aw`)** | Agent runs read-only; writes happen in a separate "safe outputs" job. Technical preview, fast-moving. Doesn't reuse `.claude/agents/` as naturally. | Not chosen |
| **B. `anthropics/claude-code-action@v1`** | Plain YAML + prompt. Reuses `CLAUDE.md`, `code-reviewer`, `unit-test-writer`. Agent writes with the workflow token directly (mitigated by owner-only gating, no app secrets, and a narrow tool list). | **Chosen** |
| C. Hand-rolled Agent SDK script in Actions | Full control, but rebuilds what B gives for free. | Dropped |

## Decisions (Titus's)

- Approach B, `claude-code-action`.
- Runs only on issues and comments I author.
- **Opt-in by label:** only `agent:bug` / `agent:feature` start anything.
- Bug output: a PR, opened by the agent. Bug track optimised for speed.
- Feature output: a plan document written by one agent and reviewed by
  another, delivered **as a PR** opened by the agent. Implemented later on my
  laptop with Claude Code + superpowers.
- Auth: Claude subscription via `CLAUDE_CODE_OAUTH_TOKEN`, not an API key.
- Commit `design_handoff_personal_site/README.md` so the design source of truth
  is in the repo.

## Design

### Triggers and gating

One workflow file, `.github/workflows/issue-agent.yml`, with two jobs, `bug`
and `feature`.

Events:

- `issues: [labeled]` — I add `agent:bug` or `agent:feature` (at creation or
  later).
- `issue_comment: [created]` — my replies in an agent thread.

Shared gate (all must hold):

- `github.event.sender.login == github.repository_owner`.
- Comments: the issue is not a PR (`!github.event.issue.pull_request`).
- The issue does not carry `agent:off`.

Job selection:

- `bug` runs when the triggering label is `agent:bug`, or on a comment when the
  issue carries `agent:bug`.
- `feature` likewise for `agent:feature`.
- Any other label: no job runs.

Relabelling: adding the other track's label starts that track; the job removes
the old track label and says so in a comment. It never closes an existing PR —
it notes it on the issue and leaves it for me.

Action input `include_comments_by_actor: tituslhy` so Claude never sees other
people's comments, even on issues I drive.

`concurrency: { group: issue-agent-${{ issue.number }}, cancel-in-progress: false }`
so quick successive replies queue rather than race.

Bot-authored comments and labels can't loop: the owner-only gate rejects them.

### Runner permissions (overriding `.claude/settings.json`)

On the runner only, the committed `.claude/settings.json` must be neutralised:
no `ask` on `git push`, no broad allows, no sandbox auto-allow. Mechanism is
the builder's choice — e.g. the action's `settings` input, or overwriting the
file in the runner checkout with a CI version marked
`git update-index --skip-worktree` so the agent can't commit the change — but
the builder must **verify** that `CLAUDE.md` and `.claude/agents/` still load
and that `git push` succeeds unattended. The narrow tool list is
defence-in-depth (only I can trigger runs and no app secrets are present), so
best effort is acceptable; an unattended `git push` is not optional.

Agent instructions live in repo files so I can edit behaviour without touching
YAML: `.github/issue-agent/bug.md` and `.github/issue-agent/feature.md`. The
workflow prompt just passes the issue number and says to follow the file.

### Bug track (`bug.md`) — fast

Model: **Sonnet 5.5** (`claude-sonnet-5-5`). `--max-turns 40`,
`timeout-minutes: 15`.

1. **Triage.** Restate the bug, locate the code, identify root cause, rate
   impact. Post a short triage comment. If something only I can answer blocks a
   confident fix, ask one question (with its recommended answer), label
   `agent:waiting-on-titus`, and stop.
2. **Fix** on branch `agent/issue-<N>-<slug>`. Smallest change that fixes the
   root cause. One regression test where the bug is testable, via
   `unit-test-writer` (project rule).
3. **Verify.** `npm ci`, then lint, test, build. Only if something fails, check
   whether it also fails on `main` (pre-existing failures are noted, not
   fixed). Paste the actual results into the PR body. If it can't get green,
   open a **draft** PR that says exactly what's failing and why.
4. **Quick review.** One `code-reviewer` pass on the diff only; apply what's
   valid; list what was declined and why. No second round.
5. **Deliver.** `gh pr create` with `Fixes #<N>`; body = triage summary, root
   cause, change, verification output, review notes. Comment the PR link on the
   issue; label `agent:pr-open`.

My comments after the PR exists = change requests: push to the same branch,
update the PR, reply on the issue.

### Feature track (`feature.md`) — thorough

Model: **Opus 5.5** (`claude-opus-5-5`). `--max-turns 80`,
`timeout-minutes: 30`.

1. **Read context:** `requirements.md`, `CLAUDE.md`,
   `design_handoff_personal_site/README.md`, and the code the feature touches.
   Never ask what these already answer.
2. **Grill.** One question per comment, numbered (`Q3`), each with the agent's
   recommended answer and why the answer changes the build, so I can reply
   "yes" or correct it. One question ends the run (label
   `agent:waiting-on-titus`); my reply starts the next.
3. **Scope summary.** When nothing material is open, post a summary: goal,
   non-goals, constraints, decisions (marked mine vs. its calls), acceptance
   criteria. Ask me to reply `approved`. Grilling ends only on my `approved`.
4. **Write the plan** at `docs/superpowers/plans/YYYY-MM-DD-issue-<N>-<slug>.md`
   in the superpowers writing-plans format used by the existing plans
   (`2026-11-14-copilot-writing-tree.md` is the template), including the
   "For agentic workers" header pointing at
   `superpowers:subagent-driven-development`. Additions for parallel work:
   - Each task gets a `**Depends on:** Task N, …` line (or `none`).
   - A **Waves** section after Global Constraints groups tasks that can run in
     parallel (Wave 1: tasks with no deps; Wave 2: tasks depending only on
     Wave 1; …).
   - Tests are stated per task and routed to `unit-test-writer`.
5. **Review.** New agent `plan-reviewer` (read-only tools) critiques the plan
   against the approved scope summary, the repo, and the design rules in
   `CLAUDE.md` + the handoff README: gaps, ambiguous tasks, missing acceptance
   criteria, wrong file paths, wrong dependencies/waves, design-rule
   violations. Main agent revises. Max 2 review rounds; unresolved points go in
   the PR body under "Open points".
6. **Deliver.** `gh pr create` on branch `agent/plan-issue-<N>-<slug>` with
   `Refs #<N>` (not `Fixes` — merging a plan shouldn't close the feature).
   Comment the PR link on the issue; label `agent:pr-open`.

My comments after the plan PR exists = revision requests: revise the plan on
the same branch (re-run `plan-reviewer` if the change is material), update the
PR, reply on the issue. No re-grilling unless I ask.

### Labels

`agent:bug`, `agent:feature` (triggers), `agent:waiting-on-titus`,
`agent:pr-open` (status, maintained by the agent), `agent:off` (my kill
switch).

### Runner

- `runs-on: ubuntu-latest`, Node 24 via `actions/setup-node` with npm cache,
  `actions/checkout` with full history.
- `permissions: contents: write, pull-requests: write, issues: write,
  id-token: write`.
- No app secrets in the environment. Only `CLAUDE_CODE_OAUTH_TOKEN`.
- `claude_args` (model, turns per track as above) plus
  `--permission-mode acceptEdits` and `--allowedTools` limited to:
  `Read, Edit, Write, Glob, Grep, Task`,
  `Bash(npm ci)`, `Bash(npm run lint)`, `Bash(npm test:*)`,
  `Bash(npx jest:*)`, `Bash(npm run build)`,
  `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`,
  `Bash(git checkout:*)`, `Bash(git add:*)`, `Bash(git commit:*)`,
  `Bash(git push:*)`, `Bash(gh issue view:*)`, `Bash(gh issue comment:*)`,
  `Bash(gh issue edit:*)`, `Bash(gh pr create:*)`, `Bash(gh pr view:*)`,
  `Bash(gh pr edit:*)`. The feature job doesn't need the npm entries.

### Files to add or change

- `.github/workflows/issue-agent.yml`
- `.github/issue-agent/bug.md`, `.github/issue-agent/feature.md`
- `.claude/agents/plan-reviewer.md`
- `.gitignore`: ignore `design_handoff_personal_site/*` except `README.md`;
  commit `design_handoff_personal_site/README.md`.
- A short "Issue agent" section in `CLAUDE.md` pointing at the above.

### One-time setup (Titus, manual)

1. `claude setup-token` locally, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`.
   (The workflow uses the built-in `GITHUB_TOKEN` for GitHub access, so the
   Claude GitHub App isn't required.)
2. Create the labels (builder provides a `gh label create` snippet).
3. Repo Settings → Actions → General → allow GitHub Actions to create and
   approve pull requests.
4. Optional: Settings → Moderation → interaction limits, and branch
   protection on `main`.

## Claude's calls (correct any)

- One workflow, two jobs selected by label — the label decides the track, so
  no classifier is needed.
- Bug track speed comes from: Sonnet instead of Opus, no upfront baseline run
  (only check `main` when something fails), one regression test, one review
  pass, a 15-minute cap.
- Bug track fixes without waiting for my go-ahead; the PR is the gate.
- Parallelism notation (`Depends on` + Waves) added to the superpowers format.
- No superpowers plugin on the runner; the plan format is taught by pointing at
  the existing plan file.
- Branch prefix `agent/` to keep them distinct from my `claude/` and `feature/`
  branches.
- (Added in planning) The **issue author** must also be me, not just the
  person labelling or commenting — so labelling a stranger's issue never feeds
  their text to the agent.
- (Added in planning) The agent reads the thread only through
  `.github/issue-agent/thread.sh`, which drops non-owner comments in code;
  `gh issue view` is not in its tool list.
- (Added in planning) GitHub access uses the built-in `GITHUB_TOKEN`
  (PRs authored by `github-actions[bot]`), not the Claude GitHub App. Its
  events can't trigger further workflow runs, which also prevents loops.

## Left to the builder

- Exact prompt wording in the two instruction files and `plan-reviewer.md`.
- Label colours and descriptions.
- The mechanism for neutralising `.claude/settings.json` on the runner (must
  be verified, see above).
- Verifying that `npm test` and `npm run build` pass with no API keys present;
  if build needs a key at build time, stub it with a dummy value, never the
  real one.
