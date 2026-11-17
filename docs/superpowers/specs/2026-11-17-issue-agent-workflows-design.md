# Issue Agent Workflows — Design (rev 2: one Haiku agent)

**Date:** 2026-11-17 (revised same day)
**Status:** Draft, awaiting Titus's approval

> Rev 1 (two tracks, Sonnet/Opus, plan-reviewer, plan PRs) was built on
> `feature/issue-agent` but not merged. Rev 2 replaces it: Titus wants one
> cheap agent for a first attempt, so a hard bug can't burn many tokens.

## Intent

When I label my own issue, **one agent on Haiku 5.5** picks it up:

- **`agent:bug`** → asks questions if blocked, triages, **attempts a fix**, runs
  lint/test/build, re-reads its own diff once, and opens a **PR**. If it can't
  get green, a **draft** PR saying what fails; if the bug is too big for it, a
  triage comment saying so.
- **`agent:feature`** → grills me one question at a time until I reply
  `approved`, then posts a **to-do task as an issue comment** (goal, task
  checklist with files, acceptance criteria). No PR. I implement later on my
  laptop with "implement issue #N".

## Goals

- Cheap and bounded: Haiku, low turn cap, short timeout.
- Only I can drive it; nothing anyone else writes is read as instructions.
- Bug PRs never claim checks passed that weren't run.
- The feature path can't change the repo at all.

## Non-goals

- A second reviewer agent (plan-reviewer, code-reviewer pass). Dropped for cost.
- Plan files or plan PRs. Feature output is an issue comment.
- Auto-merge; CI for other PRs; responding on PRs.

## Anti-goals

- A runaway run on a complex bug.
- Acting on a stranger's text; app secrets on the runner.
- An agent push that reaches `main`, or a command that writes outside the
  workspace or posts arbitrary files.

## Decisions (Titus's)

- One agent, **`claude-haiku-5-5`**, for both labels.
- Opt-in labels `agent:bug` / `agent:feature`; owner-only.
- Bugs: attempt a fix → PR (draft if not green).
- Features: grill → `approved` → to-do **issue comment**.
- Auth: `CLAUDE_CODE_OAUTH_TOKEN` (subscription).
- Handoff README committed (already done on the branch).

## Design

### Workflow — one job

`.github/workflows/issue-agent.yml`, job `agent`, triggers `issues: [labeled]`
and `issue_comment: [created]`. Gate (unchanged from rev 1): sender and issue
author are the owner, issue open, not a PR, no `agent:off`, and either the
triggering label or (for comments) a label on the issue is `agent:bug` or
`agent:feature`. Job-level `concurrency: issue-agent-<N>`, no cancel.

`TRACK` = `bug` if the triggering label is `agent:bug`, or on a comment the
issue carries `agent:bug`; otherwise `feature`. The prompt names the track and
points at `.github/issue-agent/bug.md` or `.github/issue-agent/feature.md`.

Caps: `--model claude-haiku-5-5`, `--max-turns 25`, `timeout-minutes: 15`.

Action pinned to a commit SHA. Workflow token: `contents: write`,
`pull-requests: write`, `issues: write`. `ISSUE` and `TRACK` are passed as env
to the Claude step so the helper scripts can read them.

### Permissions — managed policy, chosen by track

Kept from rev 1: a managed settings file installed at
`/etc/claude-code/managed-settings.json` before Claude runs
(`allowManagedPermissionRulesOnly`, `denyInsteadOfPrompting`, sandbox off,
denies on `.env`, and Edit/Write on `.github/`, `.claude/`, `.git/`,
`package*.json`, jest/eslint config). One file per track:

- **feature policy:** Read/Glob/Grep, Write (only for the comment body), and
  exactly `bash .github/issue-agent/{thread,comment,label}.sh …`. No git
  writes, no push, no PR, no npm.
- **bug policy:** the feature policy plus Edit; `npm ci`, `npm run lint`,
  `npm test`, `npx jest …`, `npm run build`; fixed-form git commands
  (`git status --short`, `git diff`, `git diff main...HEAD`,
  `git log --oneline -20`, `git checkout -b agent/issue-…`,
  `git checkout agent/issue-…`, `git checkout main`, `git checkout -`,
  `git add -A`, `git commit -m …`, `git stash -u`, `git stash pop`,
  `git branch -r --list …`); and `bash .github/issue-agent/{push,pr}.sh …`.
  No open-ended `git diff:*`/`git log:*`, no raw `git push`, no raw `gh`.

### Helper scripts (hardening — replace prefix rules)

All read `ISSUE` from env and validate it is numeric.

- `thread.sh` — as rev 1 (owner + agent comments only; refuses non-owner
  issues), now issue number from env.
- `comment.sh` — posts exactly `.issue-agent-tmp/comment.md` to `ISSUE`.
- `label.sh add|remove <label>` — label must be one of the `agent:*` set.
- `push.sh` — current branch must match `^agent/issue-$ISSUE-[a-z0-9-]+$`;
  runs `git push -u origin HEAD:refs/heads/<branch>` with no other args.
- `pr.sh state|create|draft|update` — operates only on the current
  `agent/issue-$ISSUE-*` branch; title from first line of
  `.issue-agent-tmp/pr.md`, body from the rest; `state` prints the PR's
  state (none/open/merged/closed).

### Bug track (`bug.md`) — Haiku, ≤25 turns

0. Where am I: `pr.sh state` → merged/closed: remove `agent:bug`, comment,
   stop. Open: latest comment is a change request (ignore non-actionable).
1. Triage comment (bug, root cause `file:line`, impact, plan). Blocked → one
   `Q<n>` with recommendation, label `agent:waiting-on-titus`, stop.
   **Too big** (can't pin a root cause after reading the obvious code, or the
   fix spans many files) → post triage + "this needs a bigger session", label
   `agent:waiting-on-titus`, stop.
2. Fix on `agent/issue-<N>-<slug>`; smallest change; one regression test where
   testable (written by this agent — see Claude's calls).
3. `npm ci`, lint, test, build. On failure, `git stash -u` → re-run → `pop`
   to tell pre-existing from caused.
4. Commit; re-read `git diff main...HEAD` once against the triage; fix
   anything wrong.
5. `push.sh`, `pr.sh create` (or `draft` if not green; body says what fails),
   comment link, label `agent:pr-open`.

### Feature track (`feature.md`) — Haiku, ≤25 turns per run

Read `requirements.md`, `CLAUDE.md`, handoff README, relevant code first; never
ask what they answer. One `Q<n>` per run (question / my recommendation / why it
matters), label `agent:waiting-on-titus`. When nothing material is open: scope
summary → I reply `approved` → post the to-do comment:

```
## To-do (approved scope)
**Goal:** …
**Tasks**
- [ ] 1. … — files: `…` — test: …
**Acceptance criteria**
- [ ] …
**Out of scope:** …
Implement with: `implement issue #<N>`
```

Then label `agent:ready`, remove `agent:feature` and `agent:waiting-on-titus`
(so later comments don't re-trigger; re-add `agent:feature` to revise).

### Labels

`agent:bug`, `agent:feature`, `agent:waiting-on-titus`, `agent:pr-open`,
`agent:ready`, `agent:off`.

## Claude's calls (correct any)

- Keep two short instruction files, one job, one agent — simpler for Haiku
  than one long file with branches.
- 25 turns / 15 min for both tracks (a feature run is one question, so it
  stops far below the cap).
- **The bug agent writes its own regression test** instead of delegating to
  `unit-test-writer` — a subagent doubles the cost, which is what you're
  avoiding. This overrides the CLAUDE.md test-routing rule *on the runner only*.
- Helper scripts replace prefix rules for push/PR/comment/label (closes the
  refspec, `--body-file ../.git/config`, and label-flag smuggling findings);
  git read commands narrowed to fixed forms (closes `--output`).
- Branch protection on `main` stays a setup step (belt and braces).
- `plan-reviewer.md` deleted; `code-reviewer`/`unit-test-writer` untouched
  (still used locally).

## Left to the builder

- Exact wording of `bug.md` / `feature.md`.
- Script implementation details within the contracts above.
- Verifying in the smoke test that `ISSUE`/`TRACK` env reach the agent's Bash.
