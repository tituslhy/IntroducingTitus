/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Security-shape guards for the issue agent GitHub Actions workflow and its per-track managed Claude policies.
const WORKFLOW_PATH = ['.github', 'workflows', 'issue-agent.yml'];
const OLD_CI_SETTINGS_PATH = '.github/issue-agent/ci-settings.json';
const JOBS = ['bug', 'feature'] as const;
type Track = (typeof JOBS)[number];

let raw = '';
type Step = {
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};
type Concurrency = { group?: string; 'cancel-in-progress'?: boolean };
type Job = {
  if?: string;
  steps: Step[];
  concurrency?: Concurrency;
  permissions?: Record<string, string>;
  [key: string]: unknown;
};
type Workflow = {
  on?: unknown;
  jobs?: Record<string, Job>;
  concurrency?: Concurrency;
  permissions?: Record<string, string>;
  [key: string]: unknown;
};
type ManagedSettings = {
  allowManagedPermissionRulesOnly?: boolean;
  sandbox?: { enabled?: boolean };
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
    defaultMode?: string;
    denyInsteadOfPrompting?: boolean;
  };
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

function managed(track: Track): ManagedSettings {
  return JSON.parse(readRepoFile(['.github', 'issue-agent', `managed-settings.${track}.json`])) as ManagedSettings;
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

  it('serialises runs per issue at job level, not workflow level', () => {
    expect(wf.concurrency).toBeUndefined();
    for (const name of JOBS) {
      expect({ job: name, concurrency: job(name).concurrency }).toEqual({
        job: name,
        concurrency: {
          group: 'issue-agent-${{ github.event.issue.number }}',
          'cancel-in-progress': false,
        },
      });
    }
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

  it('claude_args keep strict mode but carry no permission rules', () => {
    const required = ['--permission-mode acceptEdits'];
    const forbidden = ['--allowedTools', '--dangerously'];
    for (const name of JOBS) {
      const args = claudeArgs(name);
      const missing = required.filter((f) => !args.includes(f));
      const present = forbidden.filter((f) => args.includes(f));
      expect({ job: name, missing, present }).toEqual({ job: name, missing: [], present: [] });
    }
  });

  it('managed policy is the only source of permission rules', () => {
    for (const name of JOBS) {
      const m = managed(name);
      expect({
        job: name,
        allowManagedPermissionRulesOnly: m.allowManagedPermissionRulesOnly,
        denyInsteadOfPrompting: m.permissions?.denyInsteadOfPrompting,
        sandboxEnabled: m.sandbox?.enabled,
        ask: m.permissions?.ask ?? [],
        defaultMode: m.permissions?.defaultMode,
      }).toEqual({
        job: name,
        allowManagedPermissionRulesOnly: true,
        denyInsteadOfPrompting: true,
        sandboxEnabled: false,
        ask: [],
        defaultMode: undefined,
      });
    }
  });

  it('managed policy scopes the agent to its own issue and agent branches', () => {
    const required = [
      'Bash(bash .github/issue-agent/thread.sh __ISSUE__)',
      'Bash(gh issue comment __ISSUE__ --body-file .issue-agent-tmp/:*)',
      'Bash(gh issue edit __ISSUE__ --add-label:*)',
      'Bash(gh issue edit __ISSUE__ --remove-label:*)',
      'Bash(git push -u origin agent/:*)',
      'Bash(gh pr create --base main --head agent/:*)',
      'Bash(gh pr edit agent/:*)',
      'Bash(gh pr list --head agent/:*)',
    ];
    for (const name of JOBS) {
      const allow = managed(name).permissions?.allow ?? [];
      const missing = required.filter((f) => !allow.includes(f));
      expect({ job: name, missing }).toEqual({ job: name, missing: [] });
    }
  });

  it('managed policy grants nothing broad', () => {
    const forbiddenExact = [
      'Bash(*)',
      'Bash',
      'Bash(git push:*)',
      'Bash(git fetch:*)',
      'Bash(git ls-remote:*)',
      'Bash(npx:*)',
      'Bash(npm install:*)',
      'Bash(gh pr view:*)',
      'Bash(gh issue view:*)',
      'Bash(gh issue edit:*)',
      'Bash(gh issue comment:*)',
      'WebFetch',
      'WebSearch',
    ];
    for (const name of JOBS) {
      const allow = managed(name).permissions?.allow ?? [];
      const present = allow.filter((e) => forbiddenExact.includes(e));
      const ghApi = allow.filter((e) => e.includes('gh api'));
      expect({ job: name, present, ghApi }).toEqual({ job: name, present: [], ghApi: [] });
    }
  });

  it('managed policy blocks edits to control files and secrets', () => {
    const required = [
      'Read(**/.env)',
      'Read(**/.env.*)',
      'Edit(**/.github/**)',
      'Write(**/.github/**)',
      'Edit(**/.claude/**)',
      'Write(**/.claude/**)',
      'Edit(**/.git/**)',
      'Write(**/.git/**)',
      'Edit(**/package.json)',
      'Write(**/package.json)',
      'Edit(**/package-lock.json)',
      'Write(**/package-lock.json)',
      'Edit(**/jest.config.*)',
      'Write(**/jest.config.*)',
    ];
    for (const name of JOBS) {
      const deny = managed(name).permissions?.deny ?? [];
      const missing = required.filter((f) => !deny.includes(f));
      expect({ job: name, missing }).toEqual({ job: name, missing: [] });
    }
  });

  it('bug policy can run checks, feature policy cannot', () => {
    const bugChecks = [
      'Bash(npm ci)',
      'Bash(npm run lint)',
      'Bash(npm test:*)',
      'Bash(npx jest:*)',
      'Bash(npm run build)',
      'Bash(git stash:*)',
    ];
    const featureForbidden = [
      'Bash(npm ci)',
      'Bash(npm run lint)',
      'Bash(npm test:*)',
      'Bash(npx jest:*)',
      'Bash(npm run build)',
      'Bash(git stash:*)',
    ];
    const bugAllow = managed('bug').permissions?.allow ?? [];
    const featureAllow = managed('feature').permissions?.allow ?? [];
    const bugMissing = bugChecks.filter((f) => !bugAllow.includes(f));
    const featurePresent = featureForbidden.filter((f) => featureAllow.includes(f));
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
        uses: expect.stringMatching(/^anthropics\/claude-code-action@[0-9a-f]{40}$/),
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

  it('runner installs the track\'s managed policy before Claude runs', () => {
    for (const name of JOBS) {
      const steps: Step[] = job(name).steps;
      const before = steps.slice(0, claudeIndex(name));
      const managedFile = `.github/issue-agent/managed-settings.${name}.json`;
      const hasSetup = before.some((s) => {
        const run = String(s?.run ?? '');
        return (
          run.includes(managedFile) &&
          run.includes('/etc/claude-code/managed-settings.json') &&
          run.includes('__ISSUE__') &&
          s?.env?.ISSUE === '${{ github.event.issue.number }}'
        );
      });
      const touchesTrackedSettings = steps.some((s) => String(s?.run ?? '').includes('.claude/settings.json'));
      expect({ job: name, hasSetup, touchesTrackedSettings }).toEqual({
        job: name,
        hasSetup: true,
        touchesTrackedSettings: false,
      });
    }
  });

  it('old CI settings file is gone', () => {
    expect(fs.existsSync(path.join(process.cwd(), OLD_CI_SETTINGS_PATH))).toBe(false);
  });

  it('workflow token permissions are scoped', () => {
    expect(wf.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
      issues: 'write',
    });
  });
});
