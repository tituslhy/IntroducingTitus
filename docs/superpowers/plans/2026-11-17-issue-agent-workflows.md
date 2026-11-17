# Issue Agent (rev 2: one Haiku agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rev 1 two-track/multi-model agent on `feature/issue-agent` with one Haiku 5.5 agent: bugs → triage + fix attempt + PR; features → grill + to-do issue comment.

**Architecture:** One job in `.github/workflows/issue-agent.yml` computes `TRACK` (bug/feature) from labels, installs the matching managed policy, and runs the pinned `claude-code-action` with Haiku. Every outward action (read thread, comment, label, push, PR) goes through a small validated script that takes the issue number from env; git reads are fixed forms. Two jest suites guard the workflow/policy shape and the scripts' behaviour.

**Tech Stack:** GitHub Actions, `anthropics/claude-code-action` (SHA `cc98b3ae241b0fcfb6a42a2690751afffecb4452`, v1.0.278), Claude Code managed settings, bash + `gh` + `jq`, Jest + `js-yaml`.

**Spec:** `docs/superpowers/specs/2026-11-17-issue-agent-workflows-design.md` (rev 2)

## Global Constraints

- Model `claude-haiku-5-5`; `--max-turns 25`; `timeout-minutes: 15`; `--permission-mode default` (rules come only from the managed policy; nothing broad is allowed).
- Labels: `agent:bug`, `agent:feature` (triggers); `agent:waiting-on-titus`, `agent:pr-open`, `agent:ready` (status); `agent:off` (kill switch, not settable by the agent).
- Gate (kept from rev 1): sender and issue author are `github.repository_owner`; issue open; not a PR; no `agent:off`; triggering label (labeled) or an issue label (comment) is `agent:bug`/`agent:feature`.
- Job-level `concurrency: { group: issue-agent-${{ github.event.issue.number }}, cancel-in-progress: false }`.
- Workflow `permissions: { contents: write, pull-requests: write, issues: write }`. Secrets: only `CLAUDE_CODE_OAUTH_TOKEN`, `GITHUB_TOKEN`.
- Env on the job: `ISSUE` (issue number), `TRACK` (`bug`|`feature`); on the Claude step also `OWNER: ${{ github.repository_owner }}` and `GH_TOKEN`.
- Scripts live in `.github/issue-agent/`, read `ISSUE` from env, exit non-zero with a one-line stderr reason on any validation failure.
- Bug branches: `agent/issue-<N>-<slug>`, slug `[a-z0-9-]+`. Comment body file: `.issue-agent-tmp/comment.md`. PR file: `.issue-agent-tmp/pr.md` (line 1 = title, rest = body).
- Feature path: no repo writes, no git, no npm, no push, no PR.
- The runner bug agent writes its own regression test (spec: Claude's call). Locally, `CLAUDE.md`'s rule stands: all test writing in this plan goes to the **unit-test-writer** agent.
- Commit only on Titus's say-so for push/merge; local commits on `feature/issue-agent` are fine (existing branch).

## Review Focus

1. **`ISSUE` env missing or non-numeric** (e.g. the action doesn't pass step env to Bash): every script must refuse, not act on issue `""`. (Task 1 tests.)
2. **Push from a branch for a different issue or from `main`**: `push.sh` refuses. (Task 1 test.)
3. **`--body-file` traversal**: no allowed command can post an arbitrary file; `comment.sh` takes no arguments. (Task 1 test; Task 2 policy test: no raw `gh` rules.)
4. **Comment on an issue carrying both `agent:bug` and `agent:feature`**: TRACK resolves to `bug`, deterministically. (Task 2 test on the TRACK expression.)
5. **Run hits the turn/time cap silently**: a `failure()`/`cancelled()` step comments on the issue. (Task 2 test.)

---

### Task 0: Commit the revised spec and plan

- [ ] Commit `docs/superpowers/specs/2026-11-17-issue-agent-workflows-design.md` and this plan: `docs(issue-agent): rev 2 — one Haiku agent`.

### Task 1: Helper scripts + behaviour tests

**Files:**
- Create: `.github/issue-agent/lib.sh`, `comment.sh`, `label.sh`, `push.sh`, `pr.sh`
- Modify: `.github/issue-agent/thread.sh` (issue from `ISSUE` env, owner from `OWNER` env default `tituslhy`; no positional arg)
- Test: `__tests__/issue-agent-scripts.test.ts`

**Interfaces (Produces):**
- `lib.sh`: `require_issue` (exit 2 unless `ISSUE` matches `^[0-9]+$`); `agent_branch_re` → `^agent/issue-${ISSUE}-[a-z0-9-]+$`.
- `comment.sh`, `push.sh`: any argument → exit 5 (they take none).
- `comment.sh` (no args): exit 4 if `.issue-agent-tmp/comment.md` missing/empty; else `gh issue comment "$ISSUE" --body-file .issue-agent-tmp/comment.md`.
- `label.sh add|remove <label>`: exit 5 unless action ∈ {add, remove} and label ∈ {`agent:bug`,`agent:feature`,`agent:waiting-on-titus`,`agent:pr-open`,`agent:ready`}; runs `gh issue edit "$ISSUE" --add-label|--remove-label "$label"`.
- `push.sh` (no args): exit 6 unless current branch matches `agent_branch_re`; runs `git push -u origin "HEAD:refs/heads/$branch"`.
- `pr.sh state`: branch = current if it matches, else first `git branch -r --list "origin/agent/issue-$ISSUE-*"` minus `origin/`; prints `none` if no branch or no PR, else `<state> <url>` with state lowercased (`open|merged|closed`).
- `pr.sh create|draft|update`: exit 6 unless current branch matches; exit 4 unless `.issue-agent-tmp/pr.md` has a non-empty line 1; writes lines 2..n to `.issue-agent-tmp/pr-body.md`; `create`/`draft` → `gh pr create --base main --head "$branch" --title "$title" --body-file .issue-agent-tmp/pr-body.md` (+ `--draft`); `update` → `gh pr edit "$branch" --title "$title" --body-file .issue-agent-tmp/pr-body.md`.

- [ ] **Step 1: Write failing tests** (→ unit-test-writer). `/** @jest-environment node */`. Each test makes a temp dir (`fs.mkdtempSync(os.tmpdir())`) as cwd, with a `bin/` holding fake `gh` and `git` that append `"$0 $*"` lines to `calls.log` (fake `git rev-parse --abbrev-ref HEAD` echoes `$FAKE_BRANCH`; fake `git branch -r` echoes `$FAKE_REMOTE`; fake `gh pr list` echoes `$FAKE_PR_JSON`-derived output via `--jq` passthrough — simplest: fake `gh` prints `$FAKE_GH_OUT`). Run scripts with `spawnSync('bash', [abs script], { cwd, env: { PATH: bin+':'+process.env.PATH, ISSUE, ... } })`. Tests:
  - `every script refuses a missing or non-numeric ISSUE` — for each of comment/label/push/pr/thread with `ISSUE` unset and `ISSUE='5; rm -rf /'`: status ≠ 0, `calls.log` absent.
  - `comment.sh posts only the fixed body file` — with file: calls.log has `gh issue comment 7 --body-file .issue-agent-tmp/comment.md`; with an argument `../.git/config`: status 5, no log; without file: status 4, no log.
  - `label.sh allows only agent status labels` — `add agent:ready` → `gh issue edit 7 --add-label agent:ready`; `add agent:off`, `add bug`, `add 'agent:ready --body x'`, `delete agent:ready` → non-zero, no log.
  - `push.sh pushes only this issue's agent branch` — `FAKE_BRANCH=agent/issue-7-nav-fix` → `git push -u origin HEAD:refs/heads/agent/issue-7-nav-fix`; `agent/issue-8-x`, `main`, `agent/issue-7-X_bad`, `agent/issue-7-a:main` → status 6, no push line.
  - `pr.sh create builds title and body from pr.md` — pr.md `fix: nav\nFixes #7\n...` → `gh pr create --base main --head agent/issue-7-nav-fix --title fix: nav --body-file .issue-agent-tmp/pr-body.md`; pr-body.md starts `Fixes #7`; `draft` adds `--draft`; wrong branch → 6.
  - `pr.sh state reports none without a branch` — no current match, `FAKE_REMOTE=''` → stdout `none`.
  - `thread.sh reads the issue from env` — `ISSUE=7`, fake gh returns owner-authored JSON → status 0, output starts `# #7`; stranger author → status 3.
- [ ] **Step 2:** `npx jest __tests__/issue-agent-scripts.test.ts` → FAIL (scripts missing).
- [ ] **Step 3:** Implement the scripts per Interfaces (`set -euo pipefail`, `source "$(dirname "$0")/lib.sh"`).
- [ ] **Step 4:** Same command → PASS; `npx eslint __tests__/issue-agent-scripts.test.ts` clean.
- [ ] **Step 5:** Commit `feat(issue-agent): validated helper scripts for thread, comment, label, push, PR`.

### Task 2: One job, two policies, guard test

**Files:**
- Modify: `.github/workflows/issue-agent.yml` (single job `agent`)
- Modify: `.github/issue-agent/managed-settings.bug.json`, `managed-settings.feature.json`
- Modify: `__tests__/issue-agent-workflow.test.ts` (rewrite for rev 2)

**Interfaces:** Consumes Task 1 script names. Policy allow lists (exact):
- feature: `Read`, `Glob`, `Grep`, `Write(**/.issue-agent-tmp/**)`, `Bash(bash .github/issue-agent/thread.sh)`, `Bash(bash .github/issue-agent/comment.sh)`, `Bash(bash .github/issue-agent/label.sh add:*)`, `Bash(bash .github/issue-agent/label.sh remove:*)`.
- bug: feature list + `Edit`, `Write`, `Bash(npm ci)`, `Bash(npm run lint)`, `Bash(npm test)`, `Bash(npm test -- :*)`, `Bash(npx jest :*)`, `Bash(npm run build)`, `Bash(git status --short)`, `Bash(git diff)`, `Bash(git diff main...HEAD)`, `Bash(git log --oneline -20)`, `Bash(git checkout -b agent/issue-__ISSUE__-:*)`, `Bash(git checkout agent/issue-__ISSUE__-:*)`, `Bash(git checkout main)`, `Bash(git checkout -)`, `Bash(git add -A)`, `Bash(git commit -m :*)`, `Bash(git stash -u)`, `Bash(git stash pop)`, `Bash(git branch -r --list :*)`, `Bash(bash .github/issue-agent/push.sh)`, `Bash(bash .github/issue-agent/pr.sh :*)`.
- both: deny list unchanged from rev 1 fix pass; `allowManagedPermissionRulesOnly: true`, `permissions.denyInsteadOfPrompting: true`, `sandbox.enabled: false`, `env.npm_config_cache: /home/runner/.npm`.

- [ ] **Step 1: Rewrite the guard test** (→ unit-test-writer). Keep: triggers; secrets-only-two; prompt never interpolates issue title/body/comment; old `ci-settings.json` gone; permissions `{contents, pull-requests, issues}: write`; action pinned to 40-hex SHA. New/changed:
  - `one job named agent` — `Object.keys(wf.jobs)` equals `['agent']`.
  - `gate` — `jobs.agent.if` contains the five rev 1 gate fragments plus `'agent:bug'` and `'agent:feature'`.
  - `job-level concurrency only` — top-level undefined; job deep-equals the Global Constraints value.
  - `TRACK resolves bug first` — `jobs.agent.env.TRACK` contains `'agent:bug'`, `&& 'bug' ||`, `'feature'`; `jobs.agent.env.ISSUE === '${{ github.event.issue.number }}'`.
  - `Haiku with caps` — claude_args contains `--model claude-haiku-5-5`, `--max-turns 25`, `--permission-mode default`; not `--allowedTools`, not `--dangerously`; `timeout-minutes === 15`.
  - `prompt points at the track file` — prompt contains `.github/issue-agent/${{ env.TRACK }}.md`.
  - `claude step env` — has `OWNER: '${{ github.repository_owner }}'` and `GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}'`; no `include_comments_by_actor`, no `branch_prefix` (no-ops removed).
  - `policy install step` — a step before claude with `run` containing `managed-settings.${TRACK}.json`, `__ISSUE__`, `/etc/claude-code/managed-settings.json`; no step mentions `.claude/settings.json`.
  - `failure notice` — a step after claude with `if` containing `failure()` and `cancelled()` whose `run` contains `gh issue comment "$ISSUE"`.
  - `managed policy is the only source` — both files: `allowManagedPermissionRulesOnly`, `denyInsteadOfPrompting`, `sandbox.enabled === false`, no `ask`, no `defaultMode`.
  - `feature policy cannot change the repo` — allow equals the feature list exactly (sorted compare).
  - `bug policy is fixed-form` — allow equals the bug list exactly (sorted compare); no entry matches `/^Bash\((gh|git push|git diff:|git log:)/`.
  - `deny rules kept` — both files' deny include the rev 1 fix-pass list (`Read(**/.env)`, `Read(**/.env.*)`, Edit/Write on `**/.github/**`, `**/.claude/**`, `**/.git/**`, `**/package.json`, `**/package-lock.json`, `**/jest.config.*`).
- [ ] **Step 2:** `npx jest __tests__/issue-agent-workflow.test.ts` → FAIL on the new tests.
- [ ] **Step 3:** Rewrite the workflow: one job `agent` (gate, `runs-on: ubuntu-latest`, `timeout-minutes: 15`, concurrency, `env: { ISSUE, TRACK }`); steps: checkout (`fetch-depth: 0`); setup-node 24 with `cache: npm` and `if: env.TRACK == 'bug'`; "Install the issue agent's permission policy" (`sed "s/__ISSUE__/${ISSUE}/g" .github/issue-agent/managed-settings.${TRACK}.json > "$RUNNER_TEMP/managed-settings.json"` + `sudo install -D -m 0644 … /etc/claude-code/managed-settings.json` + git user config); claude step (pinned SHA; `claude_code_oauth_token`, `github_token`; env `GH_TOKEN`, `OWNER`; prompt with REPO/ISSUE/EVENT/TRIGGER_LABEL/TRACK and "Read and follow `.github/issue-agent/${{ env.TRACK }}.md` exactly."; claude_args per Global Constraints); "Tell Titus the run stopped" (`if: failure() || cancelled()`, env `GH_TOKEN`, `RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`, `run: gh issue comment "$ISSUE" --body "The issue agent stopped before finishing (error, turn limit or timeout): $RUN_URL"`). Rewrite both policy files to the Interfaces lists.
- [ ] **Step 4:** Guard test → PASS; `npm test` → all green; `npm run lint` → 0 errors.
- [ ] **Step 5:** Commit `feat(issue-agent): one Haiku job with per-track policy`.

### Task 3: Instructions for Haiku; remove plan-reviewer

**Files:**
- Rewrite: `.github/issue-agent/bug.md`, `.github/issue-agent/feature.md`
- Delete: `.claude/agents/plan-reviewer.md`

- [ ] **Step 1: `bug.md`** — short, imperative, numbered (Haiku follows lists best). Must contain: the exact allowed commands list (copy of the bug policy's Bash forms, in the order used); thread/data rule; "you can't edit .github/.claude/.git/package*/jest config — if the fix needs that, say so and stop"; step 0 `bash .github/issue-agent/pr.sh state` → merged/closed: `label.sh remove agent:bug`, comment, stop; open: change request or ignore; relabel from feature → `label.sh remove agent:feature`; steps 1–5 per spec including the **too big** rule ("if after reading the obvious files you can't name a root cause `file:line`, or the fix needs more than ~3 files, post the triage and stop"); turn budget note ("you have 25 turns; spend ≤8 on triage"); regression test written by you, one test; verify commands; `git stash -u` / `git stash pop` check; commit then `git diff main...HEAD` self-check; `push.sh`; write `.issue-agent-tmp/pr.md` (title line + body with `Fixes #<N>`, Triage, Root cause, Change, Verification with real results, Notes); `pr.sh create` or `pr.sh draft`; comment link; `label.sh add agent:pr-open`.
- [ ] **Step 2: `feature.md`** — allowed commands (thread/comment/label only; Write only to `.issue-agent-tmp/`); read context first; state detection (latest own comment is a `Q<n>` → Titus answered → next question or summary; own scope summary + Titus `approved` (case-insensitive, whole comment) → post to-do; summary + anything else → updated summary); one question per run with the Q/recommendation/why format then `label.sh add agent:waiting-on-titus`; the to-do comment template from the spec ending `Implement with: \`implement issue #<N>\``; after posting: `label.sh add agent:ready`, `label.sh remove agent:feature`, `label.sh remove agent:waiting-on-titus`; relabel from bug → `label.sh remove agent:bug`.
- [ ] **Step 3:** `git rm .claude/agents/plan-reviewer.md`; `grep -rn "plan-reviewer\|ci-settings\|code-reviewer" .github` → no hits.
- [ ] **Step 4:** Commit `feat(issue-agent): Haiku instructions for bug and feature tracks`.

### Task 4: CLAUDE.md section

- [ ] **Step 1:** Rewrite the "Issue Agent" section (≤15 lines): one Haiku agent; what each label does; to-do lands as an issue comment (`implement issue #N` needs `gh` locally: `brew install gh && gh auth login`); status labels incl. `agent:ready`; scripts are the only way it comments/labels/pushes; policies in `managed-settings.{bug,feature}.json`; runner writes its own regression test (local rule unchanged); setup commands with the label loop including `agent:ready`; Actions-may-create-PRs setting; branch protection on `main`.
- [ ] **Step 2:** `npm test` green; commit `docs(claude-md): issue agent rev 2`.

### Task 5: Ship and smoke test (needs Titus)

- [ ] Titus: approve → push, PR, merge; run setup (secret, labels, Actions PR setting, branch protection); `actionlint .github/workflows/issue-agent.yml`.
- [ ] **Bug smoke:** small real bug labelled `agent:bug` → triage comment, PR `agent/issue-<N>-…` with real verification, `agent:pr-open`. Confirms `ISSUE`/`TRACK`/`OWNER` reach the scripts and the policy file is honoured (a denied command shows in the run log).
- [ ] **Feature smoke:** small idea labelled `agent:feature` → `Q1`; reply; … `approved` → to-do comment, `agent:ready`, `agent:feature` removed.
- [ ] **Gate smoke:** comment from another account → no run; agent's next read omits it.
