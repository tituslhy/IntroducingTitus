/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, type SpawnSyncReturns } from 'child_process';

// Behaviour tests for the issue agent helper scripts in .github/issue-agent/.
// Each script runs under bash with fake `gh` and `git` binaries first on PATH;
// the fakes log their argv to CALLS_LOG so tests can assert on what would have
// been sent to GitHub or the remote.

type Vars = Record<string, string>;
type Result = SpawnSyncReturns<string>;

const GH_FAKE = `#!/usr/bin/env bash
printf 'gh %s\\n' "$*" >> "$CALLS_LOG"
printf '%s' "\${FAKE_GH_OUT:-}"
`;

const GIT_FAKE = `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >> "$CALLS_LOG"
if [ "$*" = "rev-parse --abbrev-ref HEAD" ]; then printf '%s' "\${FAKE_BRANCH:-}"; fi
if [ "$1" = "branch" ] && [ "$2" = "-r" ]; then printf '%s' "\${FAKE_REMOTE:-}"; fi
exit 0
`;

const BRANCH = 'agent/issue-7-nav-fix';
const PR_MD = 'fix: nav overlaps hero\nFixes #7\n\n## Triage\nNav bar covers the masthead below 768px.\n';

const madeDirs: string[] = [];

function writeExecutable(file: string, body: string): void {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function makeSandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  madeDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'bin'));
  writeExecutable(path.join(dir, 'bin', 'gh'), GH_FAKE);
  writeExecutable(path.join(dir, 'bin', 'git'), GIT_FAKE);
  return dir;
}

function writeTmp(dir: string, name: string, content: string): void {
  const file = path.join(dir, '.issue-agent-tmp', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function scriptPath(name: string): string {
  return path.join(process.cwd(), '.github/issue-agent', name);
}

function logPath(dir: string): string {
  return path.join(dir, 'calls.log');
}

function run(dir: string, script: string, args: string[] = [], vars: Vars = {}): Result {
  const file = scriptPath(script);
  if (!fs.existsSync(file)) throw new Error(`missing script: ${file}`);
  return spawnSync('bash', [file, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 15000,
    // Deliberately not spreading process.env: ISSUE must be truly unset unless a test sets it.
    env: {
      PATH: `${dir}/bin:${process.env.PATH ?? ''}`,
      CALLS_LOG: logPath(dir),
      // Typed ProcessEnv requires NODE_ENV in this repo's @types/node setup.
      NODE_ENV: 'test',
      ...vars,
    },
  });
}

function calls(dir: string): string[] {
  if (!fs.existsSync(logPath(dir))) return [];
  return fs
    .readFileSync(logPath(dir), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

function ghCalls(dir: string): string[] {
  return calls(dir).filter((line) => line.startsWith('gh '));
}

function pushCalls(dir: string): string[] {
  return calls(dir).filter((line) => line.startsWith('git push'));
}

// gh calls that look up PRs for a branch, restricted to same-repo PRs.
function sameRepoLookups(dir: string, branch: string): string[] {
  const prefix = `gh pr list --head ${branch} --state all --json number,state,url,isCrossRepository --jq`;
  return ghCalls(dir).filter(
    (c) => c.startsWith(prefix) && c.includes('isCrossRepository == false'),
  );
}

function threadJson(issueAuthor: string): string {
  return JSON.stringify({
    title: 'T',
    body: 'B',
    state: 'OPEN',
    labels: [{ name: 'agent:bug' }],
    author: { login: issueAuthor },
    comments: [
      { author: { login: 'tituslhy' }, createdAt: 't1', body: 'mine' },
      { author: { login: 'stranger' }, createdAt: 't2', body: 'EVIL' },
    ],
  });
}

describe('issue-agent helper scripts', () => {
  afterEach(() => {
    for (const dir of madeDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('every script refuses a missing or non-numeric ISSUE', () => {
    const cases: { script: string; args: string[] }[] = [
      { script: 'thread.sh', args: [] },
      { script: 'comment.sh', args: [] },
      { script: 'push.sh', args: [] },
      { script: 'label.sh', args: ['add', 'agent:ready'] },
      { script: 'pr.sh', args: ['state'] },
    ];
    const issueEnvs: Vars[] = [{}, { ISSUE: '5; rm -rf /' }];

    for (const { script, args } of cases) {
      for (const env of issueEnvs) {
        const dir = makeSandbox();
        writeTmp(dir, 'comment.md', 'hello');
        const r = run(dir, script, args, { FAKE_BRANCH: BRANCH, ...env });
        const refused = r.status !== 0;
        expect({ script, env, refused }).toEqual({ script, env, refused: true });
        expect(ghCalls(dir)).toEqual([]);
        expect(pushCalls(dir)).toEqual([]);
      }
    }
  });

  test('comment.sh posts only the fixed body file', () => {
    const dir = makeSandbox();
    writeTmp(dir, 'comment.md', 'hello');
    const ok = run(dir, 'comment.sh', [], { ISSUE: '7' });
    expect(ok.status).toBe(0);
    expect(calls(dir)).toContain('gh issue comment 7 --body-file .issue-agent-tmp/comment.md');

    const withArg = makeSandbox();
    writeTmp(withArg, 'comment.md', 'hello');
    const argRun = run(withArg, 'comment.sh', ['../.git/config'], { ISSUE: '7' });
    expect(argRun.status).toBe(5);
    expect(ghCalls(withArg)).toEqual([]);

    const missing = makeSandbox();
    const missingRun = run(missing, 'comment.sh', [], { ISSUE: '7' });
    expect(missingRun.status).toBe(4);
    expect(ghCalls(missing)).toEqual([]);

    const empty = makeSandbox();
    writeTmp(empty, 'comment.md', '');
    const emptyRun = run(empty, 'comment.sh', [], { ISSUE: '7' });
    expect(emptyRun.status).toBe(4);
    expect(ghCalls(empty)).toEqual([]);
  });

  test('label.sh allows only agent status labels', () => {
    const allowed: { args: string[]; call: string }[] = [
      { args: ['add', 'agent:ready'], call: 'gh issue edit 7 --add-label agent:ready' },
      {
        args: ['remove', 'agent:waiting-on-titus'],
        call: 'gh issue edit 7 --remove-label agent:waiting-on-titus',
      },
    ];
    for (const { args, call } of allowed) {
      const dir = makeSandbox();
      const r = run(dir, 'label.sh', args, { ISSUE: '7' });
      expect({ args, status: r.status }).toEqual({ args, status: 0 });
      expect(calls(dir)).toContain(call);
    }

    const rejected: string[][] = [
      ['add', 'agent:off'],
      ['add', 'bug'],
      ['add', 'agent:ready --body x'],
      ['delete', 'agent:ready'],
      ['add'],
      ['add', 'agent:ready', 'extra'],
    ];
    for (const args of rejected) {
      const dir = makeSandbox();
      const r = run(dir, 'label.sh', args, { ISSUE: '7' });
      expect({ args, status: r.status }).toEqual({ args, status: 5 });
      expect(ghCalls(dir)).toEqual([]);
    }
  });

  test('push.sh pushes only this issue\'s agent branch', () => {
    const dir = makeSandbox();
    const ok = run(dir, 'push.sh', [], { ISSUE: '7', FAKE_BRANCH: BRANCH });
    expect(ok.status).toBe(0);
    expect(calls(dir)).toContain(`git push -u origin HEAD:refs/heads/${BRANCH}`);

    const badBranches = [
      'agent/issue-8-x',
      'main',
      'agent/issue-7-X_bad',
      'agent/issue-7-a:main',
      'agent/issue-77-x',
    ];
    for (const branch of badBranches) {
      const d = makeSandbox();
      const r = run(d, 'push.sh', [], { ISSUE: '7', FAKE_BRANCH: branch });
      expect({ branch, status: r.status }).toEqual({ branch, status: 6 });
      expect(pushCalls(d)).toEqual([]);
    }

    const withArg = makeSandbox();
    const argRun = run(withArg, 'push.sh', ['--force'], { ISSUE: '7', FAKE_BRANCH: BRANCH });
    expect(argRun.status).toBe(5);
    expect(pushCalls(withArg)).toEqual([]);
  });

  test('pr.sh create builds title and body from pr.md', () => {
    const prVars: Vars = { ISSUE: '7', FAKE_BRANCH: BRANCH };
    const title = 'fix: nav overlaps hero';
    const bodyFile = '.issue-agent-tmp/pr-body.md';

    const created = makeSandbox();
    writeTmp(created, 'pr.md', PR_MD);
    const createRun = run(created, 'pr.sh', ['create'], prVars);
    expect(createRun.status).toBe(0);
    expect(ghCalls(created)).toContain(
      `gh pr create --base main --head ${BRANCH} --title ${title} --body-file ${bodyFile}`,
    );
    const body = fs.readFileSync(path.join(created, bodyFile), 'utf8');
    expect(body.startsWith('Fixes #7')).toBe(true);

    const drafted = makeSandbox();
    writeTmp(drafted, 'pr.md', PR_MD);
    const draftRun = run(drafted, 'pr.sh', ['draft'], prVars);
    expect(draftRun.status).toBe(0);
    expect(ghCalls(drafted)).toContain(
      `gh pr create --base main --head ${BRANCH} --title ${title} --body-file ${bodyFile} --draft`,
    );

    const updated = makeSandbox();
    writeTmp(updated, 'pr.md', PR_MD);
    const updateRun = run(updated, 'pr.sh', ['update'], { ...prVars, FAKE_GH_OUT: '9' });
    expect(updateRun.status).toBe(0);
    expect(sameRepoLookups(updated, BRANCH).length).toBeGreaterThan(0);
    expect(ghCalls(updated)).toContain(`gh pr edit 9 --title ${title} --body-file ${bodyFile}`);
    expect(ghCalls(updated).some((c) => c.startsWith('gh pr edit agent/'))).toBe(false);

    const wrongBranch = makeSandbox();
    writeTmp(wrongBranch, 'pr.md', PR_MD);
    const wrongRun = run(wrongBranch, 'pr.sh', ['create'], { ISSUE: '7', FAKE_BRANCH: 'main' });
    expect(wrongRun.status).toBe(6);
    expect(ghCalls(wrongBranch)).toEqual([]);

    const noFile = makeSandbox();
    const noFileRun = run(noFile, 'pr.sh', ['create'], prVars);
    expect(noFileRun.status).toBe(4);
    expect(ghCalls(noFile)).toEqual([]);

    const unknown = makeSandbox();
    writeTmp(unknown, 'pr.md', PR_MD);
    const unknownRun = run(unknown, 'pr.sh', ['merge'], prVars);
    expect(unknownRun.status).toBe(5);
    expect(ghCalls(unknown)).toEqual([]);
  });

  test('pr.sh update refuses when no same-repo PR exists', () => {
    const dir = makeSandbox();
    writeTmp(dir, 'pr.md', PR_MD);
    const r = run(dir, 'pr.sh', ['update'], {
      ISSUE: '7',
      FAKE_BRANCH: BRANCH,
      FAKE_GH_OUT: '',
    });
    expect(r.status).toBe(7);
    expect(ghCalls(dir).some((c) => c.startsWith('gh pr edit'))).toBe(false);
  });

  test('pr.sh state reports none without a branch', () => {
    const dir = makeSandbox();
    const r = run(dir, 'pr.sh', ['state'], { ISSUE: '7', FAKE_BRANCH: 'main', FAKE_REMOTE: '' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('none');
    expect(ghCalls(dir)).toEqual([]);
  });

  test('pr.sh state reports the PR for a remote agent branch', () => {
    const dir = makeSandbox();
    const r = run(dir, 'pr.sh', ['state'], {
      ISSUE: '7',
      FAKE_BRANCH: 'main',
      FAKE_REMOTE: `  origin/${BRANCH}\n`,
      FAKE_GH_OUT: 'OPEN https://github.com/o/r/pull/9',
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('open https://github.com/o/r/pull/9 agent/issue-7-nav-fix');
    expect(sameRepoLookups(dir, BRANCH).length).toBeGreaterThan(0);
  });

  test('thread.sh reads the issue from env', () => {
    const owner: Vars = { ISSUE: '7', OWNER: 'tituslhy' };

    const dir = makeSandbox();
    const r = run(dir, 'thread.sh', [], { ...owner, FAKE_GH_OUT: threadJson('tituslhy') });
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('# #7 T')).toBe(true);
    expect(r.stdout).toContain('mine');
    expect(r.stdout).not.toContain('EVIL');
    expect(ghCalls(dir).some((c) => c.startsWith('gh issue view 7 '))).toBe(true);

    const stranger = makeSandbox();
    const strangerRun = run(stranger, 'thread.sh', [], {
      ...owner,
      FAKE_GH_OUT: threadJson('stranger'),
    });
    expect(strangerRun.status).toBe(3);

    const positional = makeSandbox();
    const posRun = run(positional, 'thread.sh', ['8'], {
      ...owner,
      FAKE_GH_OUT: threadJson('tituslhy'),
    });
    expect([0, 5]).toContain(posRun.status);
    expect(ghCalls(positional).some((c) => c.startsWith('gh issue view 8'))).toBe(false);
    if (posRun.status === 0) {
      expect(ghCalls(positional).some((c) => c.startsWith('gh issue view 7 '))).toBe(true);
    } else {
      expect(ghCalls(positional)).toEqual([]);
    }
  });

  describe('summary.sh (runs in the workflow after the agent)', () => {
    const STARTED = '2026-11-17T14:35:57Z';
    const RESULT_WITH_DENIALS = JSON.stringify([
      { type: 'system', subtype: 'init' },
      {
        type: 'result',
        subtype: 'success',
        num_turns: 11,
        total_cost_usd: 0.0082,
        result: 'I could not post the triage.',
        permission_denials: [
          { tool_name: 'Bash', tool_input: { command: 'gh issue view 10' } },
          { tool_name: 'Write', tool_input: { file_path: '/tmp/x.md', content: 'body' } },
        ],
      },
    ]);

    function summaryVars(dir: string, execJson: string | null, ghOut: string): Vars {
      const vars: Vars = {
        ISSUE: '7',
        STARTED,
        RUN_URL: 'https://example/run',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_STEP_SUMMARY: path.join(dir, 'step-summary.md'),
        FAKE_GH_OUT: ghOut,
      };
      if (execJson !== null) {
        const exec = path.join(dir, 'exec.json');
        fs.writeFileSync(exec, execJson);
        vars.EXEC = exec;
      }
      return vars;
    }

    it('prints turns, cost, denials and the last message', () => {
      const dir = makeSandbox();
      const result = run(dir, 'summary.sh', [], summaryVars(dir, RESULT_WITH_DENIALS, '1'));
      expect(result.status).toBe(0);
      for (const text of [
        'turns: 11',
        'cost: $0.0082',
        'blocked: 2',
        '- Bash: gh issue view 10',
        '- Write: /tmp/x.md',
        'I could not post the triage.',
      ]) {
        expect(result.stdout).toContain(text);
      }
      expect(fs.readFileSync(path.join(dir, 'step-summary.md'), 'utf8')).toContain('blocked: 2');
      expect(ghCalls(dir).some((c) => c.startsWith('gh issue comment'))).toBe(false);
    });

    it('comments when the agent posted nothing', () => {
      const dir = makeSandbox();
      const result = run(dir, 'summary.sh', [], summaryVars(dir, RESULT_WITH_DENIALS, '0'));
      expect(result.status).toBe(0);
      const lookup = ghCalls(dir).find((c) =>
        c.startsWith('gh api repos/o/r/issues/7/comments --paginate --jq'),
      );
      expect(lookup).toBeDefined();
      expect(lookup).toContain(STARTED);
      const comment = ghCalls(dir).find((c) => c.startsWith('gh issue comment 7 --body-file '));
      expect(comment).toBeDefined();
      const bodyFile = (comment ?? '').split(' ').pop() ?? '';
      const body = fs.readFileSync(path.resolve(dir, bodyFile), 'utf8');
      for (const text of [
        'finished without posting anything',
        'blocked: 2',
        'gh issue view 10',
        'https://example/run',
      ]) {
        expect(body).toContain(text);
      }
    });

    it('handles a single result object and missing denials', () => {
      const dir = makeSandbox();
      const exec = JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        num_turns: 35,
        total_cost_usd: 0.05,
        result: 'ran out',
      });
      const result = run(dir, 'summary.sh', [], summaryVars(dir, exec, '3'));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('turns: 35');
      expect(result.stdout).toContain('blocked: 0');
      expect(result.stdout).toContain('ran out');
      expect(ghCalls(dir).some((c) => c.startsWith('gh issue comment'))).toBe(false);
    });

    it('is a no-op without an execution file', () => {
      const unset = makeSandbox();
      const noExec = run(unset, 'summary.sh', [], summaryVars(unset, null, '0'));
      expect(noExec.status).toBe(0);
      expect(noExec.stdout).toContain('no execution file');
      expect(ghCalls(unset)).toEqual([]);

      const missing = makeSandbox();
      const vars = { ...summaryVars(missing, null, '0'), EXEC: path.join(missing, 'nope.json') };
      const missingRun = run(missing, 'summary.sh', [], vars);
      expect(missingRun.status).toBe(0);
      expect(missingRun.stdout).toContain('no execution file');
      expect(ghCalls(missing)).toEqual([]);
    });

    it('refuses a missing or non-numeric ISSUE', () => {
      for (const issue of [undefined, '5; rm -rf /']) {
        const dir = makeSandbox();
        const vars = summaryVars(dir, RESULT_WITH_DENIALS, '0');
        if (issue === undefined) delete vars.ISSUE;
        else vars.ISSUE = issue;
        const result = run(dir, 'summary.sh', [], vars);
        expect(result.status).not.toBe(0);
        expect(ghCalls(dir)).toEqual([]);
      }
    });
  });
});
