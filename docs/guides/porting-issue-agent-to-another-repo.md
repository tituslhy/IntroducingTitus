# Porting the issue agent to another repo

How to copy the Claude Code issue agent from this repo into a new one. For what the agent does and how to use it, see [claude-code-issue-agent-setup.md](claude-code-issue-agent-setup.md).

**Short answer:** copying `.github/` doesn't work out of the box. The security parts carry over unchanged. The parts that describe this repo (its stack, its build/test commands, its docs) need editing. The feature track is close to copy-paste; the bug track takes about 15 minutes.

---

## What to copy

```
.github/workflows/issue-agent.yml
.github/issue-agent/            # all of it: *.md, *.json, *.sh
__tests__/issue-agent-workflow.test.ts    # optional, see "Guard tests" below
__tests__/issue-agent-scripts.test.ts
```

Add this to the new repo's `.gitignore`:

```
.issue-agent-tmp/
```

---

## What works in any repo as it is

| Part | Where |
|---|---|
| Gate: only the repo owner triggers it, only on their own open issues, `agent:off` stops it | job `if:` in `issue-agent.yml` |
| Validated scripts for every outward action | `thread.sh`, `comment.sh`, `label.sh`, `push.sh`, `pr.sh`, `lib.sh` |
| Run summary and "finished without posting" notice | `summary.sh` + the last two workflow steps |
| Policy that's the only source of permission rules, plus the deny list | `allowManagedPermissionRulesOnly`, `deny` in `managed-settings.*.json` |
| Turn caps, timeouts, the per-issue concurrency group | `issue-agent.yml` |

The gate uses `github.repository_owner`, so it follows whoever owns the new repo. It doesn't need editing.

---

## What to change

### 1. `bug.md` and `feature.md`: the agent's instructions

These describe this site. In both files, look for:

- **Stack line**, e.g. "personal site (Next.js 16, TypeScript, Jest)". Describe the new repo.
- **"Read these first"**: `requirements.md`, `CLAUDE.md`, `design_handoff_personal_site/README.md`. Point at the new repo's equivalents (README, CONTRIBUTING, architecture notes).
- **"Follow `CLAUDE.md` design and content rules"**. Keep it if the new repo has a `CLAUDE.md`; otherwise drop it or name the file that holds the rules.
- **Name**: "Titus". Fine if it's still you.

In `bug.md` also update:

- **The allowed-commands list** (rule 2). It must match the new policy exactly (step 2 below).
- **Step 3: verify**: `npm run lint`, `npm test`, `npm run build`. Use the new repo's commands.
- **Test file style**: `*.test.ts(x)`. Use the new repo's convention, e.g. `tests/test_*.py`.

### 2. `managed-settings.bug.json`: what the bug agent may run

Replace the npm rules:

```json
"Bash(npm run lint)", "Bash(npm test)", "Bash(npm test -- *)", "Bash(npx jest *)", "Bash(npm run build)"
```

with the new repo's, for example in Python:

```json
"Bash(ruff check .)", "Bash(pytest)", "Bash(pytest *)", "Bash(python -m build)"
```

In the `deny` list, swap the JS config files the agent must not edit (`package.json`, `package-lock.json`, `jest.config.*`, `jest.setup.*`, `eslint.config.*`, `.eslintrc*`) for the new repo's: e.g. `pyproject.toml`, `uv.lock`, `requirements*.txt`, `setup.cfg`, `ruff.toml`, `conftest.py`. The aim is the same: the agent can't loosen the checks that judge its own fix.

Remove `env.npm_config_cache` if the repo doesn't use npm.

Rule syntax that bit us here, in case you write new ones:

- `Bash(X)` matches exactly `X`; `Bash(X *)` matches `X` plus arguments. Don't use `X :*`.
- Write file permissions as `Edit(path)`. `Write(path)` rules never match, and a bare `Edit` doesn't let the agent create new files. Keep `Edit(./**)` and `Edit(.issue-agent-tmp/**)`.
- A command chained with `&&` needs every part allowed.

`managed-settings.feature.json` needs no changes: the feature track only reads files and uses the scripts.

### 3. `issue-agent.yml`: the bug track's setup steps

The bug track runs `actions/setup-node` (Node 24, npm cache) and `npm ci`. Swap them for the new repo's, e.g.:

```yaml
      - uses: actions/setup-python@v5
        if: env.TRACK == 'bug'
        with:
          python-version: '3.13'
          cache: pip

      - name: Install dependencies (bug track)
        if: env.TRACK == 'bug'
        run: pip install -e '.[dev]'
```

Optionally tune `--max-turns` (bug 50, feature 15) and the timeouts (20-min step inside a 25-min job) for a repo with a slower test suite.

### 4. Small things

- **`thread.sh`** falls back to `tituslhy` as the owner if `OWNER` isn't set. The workflow always sets it, so this only matters if you call the script by hand.
- **The `agent:waiting-on-titus` label** is hard-coded in `label.sh`, `bug.md` and `feature.md`. Fine if it's still you. If you rename it, change all of those plus the label setup below.
- **"Tell Titus the run stopped"** is just a step name.

---

## Guard tests

`__tests__/issue-agent-*.test.ts` check the workflow and policy (gate, pinned action, caps, deny list) and run the scripts against fake `gh`/`git` binaries. They need Jest with TypeScript support (this repo uses `next/jest`) and `js-yaml`.

- **JS/TS repo:** copy them, then update the expected bug allow list (`BUG_EXTRA_ALLOW`) to your new npm commands.
- **Other languages:** port them or drop them. If you port just one, port the check that **every backticked command in `bug.md` / `feature.md` is allowed by its policy**. It caught broken rules here that would otherwise have silently blocked the agent on every run.

---

## One-time GitHub setup in the new repo

Secrets and settings don't copy over with the files.

1. **Token.** The same subscription token works:
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<new-repo>
   ```
   No token to hand? Run `claude setup-token` again.
2. **Labels:**
   ```bash
   for l in agent:bug agent:feature agent:waiting-on-titus agent:pr-open agent:ready agent:off; do
     gh label create "$l" --force --repo <owner>/<new-repo>
   done
   ```
3. **Settings → Actions → General → Workflow permissions →** tick **Allow GitHub Actions to create and approve pull requests**.
4. **Branch ruleset on `main`** (required, don't skip): Settings → Rulesets → New branch ruleset → default branch → Repository admin in the bypass list → Restrict deletions, Block force pushes, Require a pull request (0 approvals). Same steps as Step 5 in the setup guide.
5. **Merge the files to `main`.** Issue-triggered workflows only run from the default branch, so nothing happens while they sit on a feature branch.
6. Optional: **Settings → General → Automatically delete head branches**, so merged agent branches clean themselves up.

---

## First run checklist

1. Open a small issue, add `agent:feature`, and wait for **Q1** (about 2 minutes). This proves the token, labels and gate.
2. Then try a tiny, real bug with `agent:bug`. You want a triage comment, then a PR.
3. If a run "succeeds" with nothing posted, open the run's **Run summary** step. A `blocked:` line names the command or file the policy denied; add the rule to `managed-settings.bug.json` (and the guard test, if you kept it).

---

## Checklist

- [ ] Copied `.github/workflows/issue-agent.yml` and `.github/issue-agent/`
- [ ] Added `.issue-agent-tmp/` to `.gitignore`
- [ ] `bug.md` / `feature.md`: stack line, "read these first" files, rules file, verify commands, test style
- [ ] `managed-settings.bug.json`: allowed build/test/lint commands, deny list of config files, npm env removed if unused
- [ ] Bug matches policy: every command in `bug.md` is in the allow list
- [ ] Workflow: language setup + dependency install for the bug track
- [ ] Guard tests copied and updated, ported, or deliberately dropped
- [ ] Secret, labels, Actions PR permission, branch ruleset, auto-delete branches
- [ ] Merged to `main`, test feature issue posted Q1
