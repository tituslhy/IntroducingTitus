# Setting up the Claude Code issue agent (GitHub Actions)

A step-by-step guide to the issue agent in this repo: what it does, how to switch it on, how to use it, and what to do when a run goes wrong. Copying it into another repo? See [porting-issue-agent-to-another-repo.md](porting-issue-agent-to-another-repo.md).

---

## What you get

Label one of **your own** issues and a Claude **Haiku 5.5** agent picks it up in GitHub Actions:

| Label | What the agent does | Output | Cap |
|---|---|---|---|
| `agent:bug` | Triages, attempts the smallest fix (up to ~12 files) with regression tests, runs lint/test/build, re-reads its diff | A PR (`Fixes #N`), or a **draft** PR if checks aren't green, or a triage comment if the bug is too big | 50 turns |
| `agent:feature` | Asks one question per run until you reply `approved` to its scope summary | A **to-do comment** on the issue + `agent:ready` label. No repo changes | 15 turns per run |

If a run errors, hits its turn cap, or times out, it comments the run-log link on the issue.

---

## How it works (one minute)

```
You label your issue ──► .github/workflows/issue-agent.yml
                           │  gate: you opened it, you labelled/commented, issue open, no agent:off
                           │  TRACK = bug | feature (from the label)
                           ▼
                     install permission policy  (.github/issue-agent/managed-settings.<track>.json
                           │                      → /etc/claude-code/managed-settings.json)
                           ▼
                     claude-code-action (Haiku 5.5)
                           │  follows .github/issue-agent/<track>.md
                           │  acts ONLY through the scripts:
                           │    thread.sh  – reads the issue (drops other people's comments)
                           │    comment.sh – posts .issue-agent-tmp/comment.md
                           │    label.sh   – adds/removes agent:* status labels
                           │    push.sh    – pushes agent/issue-N-<slug> only   (bug only)
                           │    pr.sh      – opens/updates that branch's PR     (bug only)
                           ▼
                     comment / labels / PR on your issue
```

| File | Purpose |
|---|---|
| `.github/workflows/issue-agent.yml` | Trigger, gate, model, turn caps, timeouts |
| `.github/issue-agent/bug.md`, `feature.md` | What the agent is told to do — edit these to change behaviour |
| `.github/issue-agent/managed-settings.{bug,feature}.json` | Exactly which commands the agent may run |
| `.github/issue-agent/*.sh` | The only way the agent comments, labels, pushes, or opens PRs |
| `__tests__/issue-agent-*.test.ts` | Guard tests for the above (run with `npm test`) |

---

## One-time setup

You need admin access to the repo and a Claude Pro/Max subscription.

### Step 1 — Install the GitHub CLI

```bash
brew install gh
gh auth login
```

Pick **GitHub.com → HTTPS → Login with a web browser**. Copy the one-time code, approve it in the browser, then **go back to the terminal and press Enter** — `gh` only finishes once you do. You should see `✓ Logged in as <you>`.

### Step 2 — Store your Claude token as a repo secret

```bash
claude setup-token          # prints a long-lived token tied to your subscription
gh secret set CLAUDE_CODE_OAUTH_TOKEN
```

Paste the token when `gh secret set` asks. (Using an API key instead? Store it as `ANTHROPIC_API_KEY` and change `claude_code_oauth_token:` to `anthropic_api_key:` in the workflow.)

### Step 3 — Create the labels

```bash
for l in agent:bug agent:feature agent:waiting-on-titus agent:pr-open agent:ready agent:off; do
  gh label create "$l" --force
done
```

| Label | Meaning |
|---|---|
| `agent:bug` / `agent:feature` | **You** add these to start the agent |
| `agent:waiting-on-titus` | The agent asked you something — reply on the issue |
| `agent:pr-open` | Bug PR is open |
| `agent:ready` | Feature to-do is posted |
| `agent:off` | Kill switch — the agent ignores the issue while this is on |

### Step 4 — Let Actions open pull requests

**Settings → Actions → General → Workflow permissions** → tick **Allow GitHub Actions to create and approve pull requests** → **Save**.

Leave **Require actions to be pinned to a full-length commit SHA** unticked — the Claude action is pinned, but `actions/checkout` and `actions/setup-node` aren't.

### Step 5 — Protect `main` (required)

**Settings → Rulesets → New ruleset → New branch ruleset**

1. **Name:** `protect main` · **Enforcement status:** Active
2. **Target branches → Add target → Include default branch**
3. **Bypass list:** add **Repository admin** (you can still merge; the agent runs as `github-actions`, which isn't an admin)
4. **Rules:** tick **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (required approvals: **0** — you can't approve your own PRs)
5. **Create**

Why required: the bug agent runs tests it wrote itself. The scripts and policy keep its normal path narrow, but this ruleset is what guarantees nothing it does can land on `main` without you.

---

## Using it

### Feature

1. **Issues → New issue.** Describe the idea in a sentence or two.
2. Add the **`agent:feature`** label (at creation or later — the label is what starts it).
3. Within ~2 minutes: a **Q1.** comment with the agent's recommendation and why it matters.
4. Reply on the issue. Each reply starts the next run (Q2, Q3, … or a **Scope summary**).
5. When the summary is right, reply exactly **`approved`**.
6. You get a **To-do** comment (goal, task checklist with files and tests, acceptance criteria) and the `agent:ready` label.
7. Implement locally: open Claude Code in the repo and say `implement issue #N`.

### Bug

1. **New issue** describing what's wrong and where. Add **`agent:bug`**.
2. You get a **Triage** comment (root cause, impact, plan) — or one question if it's blocked.
3. Then a PR from `agent/issue-N-<slug>` with real lint/test/build results. Review and merge it yourself.
4. Want changes? Comment on the **issue** (not the PR). The agent updates the same PR.
5. Once the PR is merged or closed, the agent removes `agent:bug` and stops.

### Stopping or restarting

- **Stop:** add `agent:off`.
- **Restart a finished issue:** add a new comment, then re-add `agent:bug` / `agent:feature`.
- **Switch track:** add the other label — the agent removes the old one and carries on.

---

## Watching a run

- **Actions** tab → **Issue agent** → the run → **agent** job, or `gh run watch` in the terminal.
- A healthy feature run: checkout ✓ → setup-node ⊘ and install-deps ⊘ (skipped, bug only) → install policy ✓ → claude-code-action ✓ → "Tell Titus the run stopped" ⊘.
- First ~30 s of the Claude step is the action installing Bun and Claude Code — that's normal.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No run starts | Issue opened by someone else, label added by someone else, issue closed, `agent:off` on, or a different label | Only your own open issues with `agent:bug`/`agent:feature` trigger it |
| Run fails immediately in the Claude step with an auth error | Missing/expired `CLAUDE_CODE_OAUTH_TOKEN` | Re-run Step 2 |
| Log shows a command was **denied** | The agent tried something outside its policy | Usually harmless (it retries the allowed form). If a needed command is blocked, add it to `managed-settings.<track>.json` **and** keep `npm test` green — the guard test checks every command in `bug.md`/`feature.md` is allowed |
| Bug agent pushes a branch but no PR appears | Step 4 not done | Tick "Allow GitHub Actions to create and approve pull requests" |
| "The issue agent stopped before finishing" comment | Error, turn cap, or timeout | Open the run log link; a hard bug may simply need a bigger local session |
| Feature agent keeps asking questions | It only stops on an exact `approved` reply | Reply `approved` (just that word) |
| Run succeeded but nothing was posted | Every write was denied | Check the log for `denied`; fix the policy as above |

---

## Changing things

| To change… | Edit |
|---|---|
| What the agent does / says | `.github/issue-agent/bug.md` or `feature.md` |
| Commands it may run | `.github/issue-agent/managed-settings.<track>.json` (not `.claude/settings.json` — the runner ignores that for permissions) |
| Model, turn caps, timeouts | `claude_args` and `timeout-minutes` in `.github/workflows/issue-agent.yml` |
| Who can trigger it | the job `if:` in the workflow (currently: repo owner only) |

After any change, run `npm test` and `actionlint .github/workflows/issue-agent.yml` (`brew install actionlint`). Workflow changes only take effect once merged to `main`.

---

## Cost notes

- Runs use your Claude subscription via `CLAUDE_CODE_OAUTH_TOKEN`, so they count against your usage limits.
- Haiku 5.5 with 50/15 turn caps and a 20-minute agent step keeps a single run small; a feature run is usually one question and stops well under the cap.
- GitHub Actions minutes: a feature run is ~2–3 min; a bug run includes `npm ci` + lint/test/build, typically 5–10 min.
