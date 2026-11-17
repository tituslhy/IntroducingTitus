/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Security-shape guards for the issue agent GitHub Actions workflow and its CI Claude settings.
const WORKFLOW_PATH = ['.github', 'workflows', 'issue-agent.yml'];
const SETTINGS_PATH = ['.github', 'issue-agent', 'ci-settings.json'];
const JOBS = ['bug', 'feature'] as const;

let raw = '';
type Step = { id?: string; uses?: string; run?: string; with?: Record<string, string> };
type Job = { if?: string; steps: Step[]; [key: string]: unknown };
type Workflow = {
  on?: unknown;
  jobs?: Record<string, Job>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  [key: string]: unknown;
};

let wf: Workflow;

function readRepoFile(parts: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

// js-yaml may parse the unquoted `on` key as boolean true (YAML 1.1); accept either.
function triggers(w: Workflow): unknown {
  return w?.on ?? (w as Record<string, unknown>)?.["true"];
}

function job(name: string): Job {
  const j = wf?.jobs?.[name];
  if (!j) throw new Error(`workflow job "${name}" not found`);
  return j;
}

function claudeIndex(name: string): number {
  const idx: number = job(name).steps?.findIndex((s) => s?.id === 'claude') ?? -1;
  if (idx < 0) throw new Error(`job "${name}" has no step with id "claude"`);
  return idx;
}

function claudeStep(name: string): Step {
  return job(name).steps[claudeIndex(name)];
}

function claudeArgs(name: string): string {
  return String(claudeStep(name).with?.claude_args ?? '');
}

function jobIf(name: string): string {
  return String(job(name).if ?? '');
}

describe('issue-agent workflow', () => {
  beforeAll(() => {
    raw = readRepoFile(WORKFLOW_PATH);
    wf = yaml.load(raw) as Workflow;
  });

  it('triggers only on issue labeled and comment created', () => {
    expect(triggers(wf)).toEqual({
      issues: { types: ['labeled'] },
      issue_comment: { types: ['created'] },
    });
  });

  it('serialises runs per issue', () => {
    expect(wf.concurrency?.group).toBe('issue-agent-${{ github.event.issue.number }}');
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('each job gates on owner, issue author, open, not PR, not agent:off', () => {
    const required = [
      'github.event.sender.login == github.repository_owner',
      'github.event.issue.user.login == github.repository_owner',
      "github.event.issue.state == 'open'",
      '!github.event.issue.pull_request',
      "'agent:off'",
    ];
    for (const name of JOBS) {
      const cond = jobIf(name);
      const missing = required.filter((f) => !cond.includes(f));
      expect({ job: name, missing }).toEqual({ job: name, missing: [] });
    }
  });

  it('bug job routes on agent:bug, feature job on agent:feature', () => {
    const bugIf = jobIf('bug');
    const featureIf = jobIf('feature');
    expect({
      job: 'bug',
      hasOwnLabel: bugIf.includes("'agent:bug'"),
      hasOtherLabel: bugIf.includes("'agent:feature'"),
    }).toEqual({ job: 'bug', hasOwnLabel: true, hasOtherLabel: false });
    expect({
      job: 'feature',
      hasOwnLabel: featureIf.includes("'agent:feature'"),
      hasOtherLabel: featureIf.includes("'agent:bug'"),
    }).toEqual({ job: 'feature', hasOwnLabel: true, hasOtherLabel: false });
  });

  it('model, turns and timeout per track', () => {
    expect({
      job: 'bug',
      timeout: job('bug')['timeout-minutes'],
      model: claudeArgs('bug').includes('--model claude-sonnet-5-5'),
      turns: claudeArgs('bug').includes('--max-turns 40'),
    }).toEqual({ job: 'bug', timeout: 15, model: true, turns: true });
    expect({
      job: 'feature',
      timeout: job('feature')['timeout-minutes'],
      model: claudeArgs('feature').includes('--model claude-opus-5-5'),
      turns: claudeArgs('feature').includes('--max-turns 80'),
    }).toEqual({ job: 'feature', timeout: 30, model: true, turns: true });
  });

  it('strict permission mode and narrow tools', () => {
    const required = [
      '--permission-mode acceptEdits',
      'Bash(bash .github/issue-agent/thread.sh:*)',
      'Bash(gh pr create:*)',
    ];
    const forbidden = [
      'Bash(*)',
      'Bash(npx:*)',
      'Bash(git:*)',
      'Bash(npm install',
      'gh issue view',
      'WebFetch',
      'WebSearch',
    ];
    for (const name of JOBS) {
      const args = claudeArgs(name);
      const missing = required.filter((f) => !args.includes(f));
      const present = forbidden.filter((f) => args.includes(f));
      expect({ job: name, missing, present }).toEqual({ job: name, missing: [], present: [] });
    }
  });

  it('bug job can run checks, feature job cannot', () => {
    const bugChecks = ['Bash(npm ci)', 'Bash(npm run lint)', 'Bash(npm test:*)', 'Bash(npm run build)'];
    const featureForbidden = ['Bash(npm ci)', 'Bash(npm test', 'Bash(npm run build)'];
    const bugMissing = bugChecks.filter((f) => !claudeArgs('bug').includes(f));
    const featurePresent = featureForbidden.filter((f) => claudeArgs('feature').includes(f));
    expect({ bugMissing, featurePresent }).toEqual({ bugMissing: [], featurePresent: [] });
  });

  it('only the two allowed secrets', () => {
    const allowed = new Set(['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN']);
    const used = [...raw.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    const disallowed = used.filter((n) => !allowed.has(n));
    expect({ disallowed, unique: [...new Set(used)].sort() }).toEqual({
      disallowed: [],
      unique: ['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN'],
    });
    for (const banned of ['OPENAI_API_KEY', 'LANGSMITH_API_KEY', 'TYPESAFE_API_KEY']) {
      expect({ banned, found: raw.includes(banned) }).toEqual({ banned, found: false });
    }
  });

  it('action pinned and comments filtered', () => {
    for (const name of JOBS) {
      const step = claudeStep(name);
      expect({
        job: name,
        uses: step.uses,
        includeComments: step.with?.include_comments_by_actor,
        githubToken: step.with?.github_token,
        oauthToken: step.with?.claude_code_oauth_token,
      }).toEqual({
        job: name,
        uses: 'anthropics/claude-code-action@v1',
        includeComments: 'tituslhy,github-actions[bot]',
        githubToken: '${{ secrets.GITHUB_TOKEN }}',
        oauthToken: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
      });
    }
  });

  it('prompt never interpolates issue title or body', () => {
    const forbidden = ['github.event.issue.title', 'github.event.issue.body', 'github.event.comment.body'];
    const promptFile = { bug: '.github/issue-agent/bug.md', feature: '.github/issue-agent/feature.md' };
    for (const name of JOBS) {
      const prompt = String(claudeStep(name).with?.prompt ?? '');
      const present = forbidden.filter((f) => prompt.includes(f));
      const hasPromptFile = prompt.includes(promptFile[name]);
      expect({ job: name, present, hasPromptFile }).toEqual({ job: name, present: [], hasPromptFile: true });
    }
  });

  it('runner swaps in CI settings and hides the change from git', () => {
    const copy = 'cp .github/issue-agent/ci-settings.json .claude/settings.json';
    const skipWorktree = 'git update-index --skip-worktree .claude/settings.json';
    for (const name of JOBS) {
      const steps: Step[] = job(name).steps;
      const before = steps.slice(0, claudeIndex(name));
      const hasSetup = before.some((s) => {
        const run = String(s?.run ?? '');
        return run.includes(copy) && run.includes(skipWorktree);
      });
      expect({ job: name, hasSetup }).toEqual({ job: name, hasSetup: true });
    }
  });

  it('CI settings never prompt and keep secret-file denies', () => {
    const settings = JSON.parse(readRepoFile(SETTINGS_PATH));
    const ask = settings.permissions?.ask ?? [];
    expect(ask).toEqual([]);
    expect(settings.sandbox?.autoAllowBashIfSandboxed).not.toBe(true);
    expect(settings.permissions?.defaultMode).toBeUndefined();
    const deny: string[] = settings.permissions?.deny ?? [];
    expect(deny).toEqual(expect.arrayContaining(['Read(./.env)', 'Read(./.env.*)']));
  });

  it('workflow token permissions are scoped', () => {
    expect(wf.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
      issues: 'write',
      'id-token': 'write',
    });
  });
});
