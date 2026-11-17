/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Security-shape guards for the single-job issue agent workflow and its per-track managed Claude policies.
const WORKFLOW_PATH = ['.github', 'workflows', 'issue-agent.yml'];
const OLD_CI_SETTINGS_PATH = '.github/issue-agent/ci-settings.json';
const JOB = 'agent';
const TRACKS = ['bug', 'feature'] as const;
type Track = (typeof TRACKS)[number];

const ALLOWED_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_TOKEN'];
const BANNED_SECRETS = ['OPENAI_API_KEY', 'LANGSMITH_API_KEY', 'TYPESAFE_API_KEY'];
const PINNED_ACTION = /^anthropics\/claude-code-action@[0-9a-f]{40}$/;
const GITHUB_TOKEN_EXPR = '${{ secrets.GITHUB_TOKEN }}';
const OAUTH_TOKEN_EXPR = '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}';

const GATE = [
  'github.event.sender.login == github.repository_owner',
  'github.event.issue.user.login == github.repository_owner',
  "github.event.issue.state == 'open'",
  '!github.event.issue.pull_request',
  "'agent:off'",
  "'agent:bug'",
  "'agent:feature'",
];

const FEATURE_ALLOW = [
  'Read',
  'Glob',
  'Grep',
  'Write(**/.issue-agent-tmp/**)',
  'Bash(bash .github/issue-agent/thread.sh)',
  'Bash(bash .github/issue-agent/comment.sh)',
  'Bash(bash .github/issue-agent/label.sh add:*)',
  'Bash(bash .github/issue-agent/label.sh remove:*)',
];

const BUG_EXTRA_ALLOW = [
  'Edit',
  'Write',
  'Bash(npm ci)',
  'Bash(npm run lint)',
  'Bash(npm test)',
  'Bash(npm test -- :*)',
  'Bash(npx jest :*)',
  'Bash(npm run build)',
  'Bash(git status --short)',
  'Bash(git diff)',
  'Bash(git diff main...HEAD)',
  'Bash(git log --oneline -20)',
  'Bash(git checkout -b agent/issue-__ISSUE__-:*)',
  'Bash(git checkout agent/issue-__ISSUE__-:*)',
  'Bash(git checkout main)',
  'Bash(git checkout -)',
  'Bash(git add -A)',
  'Bash(git commit -m :*)',
  'Bash(git stash -u)',
  'Bash(git stash pop)',
  'Bash(git branch -r --list :*)',
  'Bash(bash .github/issue-agent/push.sh)',
  'Bash(bash .github/issue-agent/pr.sh :*)',
];

const BUG_ALLOW = [...FEATURE_ALLOW, ...BUG_EXTRA_ALLOW];

const DENY = [
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

// Allow entries that would let the agent talk to GitHub or git directly instead of through the helper scripts.
const DIRECT_CLI_ALLOW = /^Bash\((gh |git push|git diff:|git log:)/;

const BROAD_FORBIDDEN = [
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

type Step = {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};
type Concurrency = { group?: string; 'cancel-in-progress'?: boolean };
type Job = {
  if?: string;
  steps?: Step[];
  concurrency?: Concurrency;
  env?: Record<string, string>;
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
let raw = '';

function readRepoFile(parts: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

// js-yaml may parse the unquoted `on` key as boolean true (YAML 1.1); accept either.
function triggers(w: Workflow): unknown {
  return w.on ?? (w as Record<string, unknown>)['true'];
}

function agentJob(): Job {
  const j = wf.jobs?.[JOB];
  if (!j) throw new Error(`workflow job "${JOB}" not found`);
  return j;
}

function steps(): Step[] {
  return agentJob().steps ?? [];
}

function claudeIndex(): number {
  const idx = steps().findIndex((s) => s.id === 'claude');
  if (idx < 0) throw new Error(`job "${JOB}" has no step with id "claude"`);
  return idx;
}

function claudeStep(): Step {
  return steps()[claudeIndex()];
}

function claudeArgs(): string {
  return claudeStep().with?.claude_args ?? '';
}

function jobIf(): string {
  return agentJob().if ?? '';
}

function managed(track: Track): ManagedSettings {
  return JSON.parse(readRepoFile(['.github', 'issue-agent', `managed-settings.${track}.json`])) as ManagedSettings;
}

function allowOf(track: Track): string[] {
  return managed(track).permissions?.allow ?? [];
}

function denyOf(track: Track): string[] {
  return managed(track).permissions?.deny ?? [];
}

function misses(text: string, needles: string[]): string[] {
  return needles.filter((n) => !text.includes(n));
}

function hits(text: string, needles: string[]): string[] {
  return needles.filter((n) => text.includes(n));
}

function sorted(xs: string[]): string[] {
  return [...xs].sort();
}

describe('issue-agent workflow', () => {
  beforeAll(() => {
    raw = readRepoFile(WORKFLOW_PATH);
    wf = yaml.load(raw) as Workflow;
  });

  it('one job named agent', () => {
    expect(Object.keys(wf.jobs ?? {})).toEqual(['agent']);
  });

  it('triggers only on issue labeled and comment created', () => {
    expect(triggers(wf)).toEqual({
      issues: { types: ['labeled'] },
      issue_comment: { types: ['created'] },
    });
  });

  it('gate checks owner, issue author, open, not PR, not agent:off, and a track label', () => {
    expect({ missing: misses(jobIf(), GATE) }).toEqual({ missing: [] });
  });

  it('job-level concurrency only', () => {
    expect(wf.concurrency).toBeUndefined();
    expect(agentJob().concurrency).toEqual({
      group: 'issue-agent-${{ github.event.issue.number }}',
      'cancel-in-progress': false,
    });
  });

  it('TRACK resolves bug first, ISSUE from the event', () => {
    const env = agentJob().env ?? {};
    const track = env.TRACK ?? '';
    expect({
      issue: env.ISSUE,
      hasBugLabel: track.includes("'agent:bug'"),
      hasBugDefault: track.includes("&& 'bug' ||"),
      hasFeatureDefault: track.includes("'feature'"),
      hasFeatureLabel: track.includes("'agent:feature'"),
    }).toEqual({
      issue: '${{ github.event.issue.number }}',
      hasBugLabel: true,
      hasBugDefault: true,
      hasFeatureDefault: true,
      hasFeatureLabel: false,
    });
  });

  it('Haiku with caps', () => {
    const args = claudeArgs();
    expect({
      missing: misses(args, ['--model claude-haiku-5-5', '--max-turns 25', '--permission-mode default']),
      present: hits(args, ['--allowedTools', '--dangerously', 'acceptEdits', 'sonnet', 'opus']),
      timeout: agentJob()['timeout-minutes'],
    }).toEqual({ missing: [], present: [], timeout: 15 });
  });

  it('prompt points at the track file', () => {
    const prompt = claudeStep().with?.prompt ?? '';
    expect({ missing: misses(prompt, ['.github/issue-agent/${{ env.TRACK }}.md']) }).toEqual({ missing: [] });
  });

  it('prompt never interpolates issue title or body', () => {
    const forbidden = ['github.event.issue.title', 'github.event.issue.body', 'github.event.comment.body'];
    const prompt = claudeStep().with?.prompt ?? '';
    expect({ present: hits(prompt, forbidden) }).toEqual({ present: [] });
  });

  it('claude step env passes owner and gh token; no-op inputs removed', () => {
    const step = claudeStep();
    const inputs = step.with ?? {};
    expect({
      owner: step.env?.OWNER,
      ghToken: step.env?.GH_TOKEN,
      hasIncludeComments: 'include_comments_by_actor' in inputs,
      hasBranchPrefix: 'branch_prefix' in inputs,
    }).toEqual({
      owner: '${{ github.repository_owner }}',
      ghToken: GITHUB_TOKEN_EXPR,
      hasIncludeComments: false,
      hasBranchPrefix: false,
    });
  });

  it('action pinned to a full SHA and passes the two secrets', () => {
    const step = claudeStep();
    expect({ pinned: PINNED_ACTION.test(step.uses ?? '') }).toEqual({ pinned: true });
    expect({
      githubToken: step.with?.github_token,
      oauthToken: step.with?.claude_code_oauth_token,
    }).toEqual({
      githubToken: GITHUB_TOKEN_EXPR,
      oauthToken: OAUTH_TOKEN_EXPR,
    });
  });

  it('policy install step picks the track file before Claude runs', () => {
    const before = steps().slice(0, claudeIndex());
    const hasInstall = before.some((s) => {
      const run = s.run ?? '';
      return (
        run.includes('managed-settings.${TRACK}.json') &&
        run.includes('__ISSUE__') &&
        run.includes('/etc/claude-code/managed-settings.json')
      );
    });
    const touchesTrackedSettings = steps().some((s) => (s.run ?? '').includes('.claude/settings.json'));
    expect({ hasInstall, touchesTrackedSettings }).toEqual({ hasInstall: true, touchesTrackedSettings: false });
  });

  it('node is only set up for bugs', () => {
    const setupNode = steps().find((s) => (s.uses ?? '').startsWith('actions/setup-node@'));
    expect({ found: setupNode !== undefined, missing: misses(setupNode?.if ?? '', ["env.TRACK == 'bug'"]) }).toEqual({
      found: true,
      missing: [],
    });
  });

  it('failure notice tells Titus when a run stops', () => {
    const after = steps().slice(claudeIndex() + 1);
    const notice = after.find((s) => (s.run ?? '').includes('gh issue comment "$ISSUE"'));
    expect({
      found: notice !== undefined,
      missingCond: misses(notice?.if ?? '', ['failure()', 'cancelled()']),
      ghToken: notice?.env?.GH_TOKEN,
    }).toEqual({ found: true, missingCond: [], ghToken: GITHUB_TOKEN_EXPR });
  });

  it('only the two allowed secrets', () => {
    const allowed = new Set(ALLOWED_SECRETS);
    const used = [...raw.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]);
    const disallowed = used.filter((n) => !allowed.has(n));
    expect({ disallowed, unique: [...new Set(used)].sort() }).toEqual({
      disallowed: [],
      unique: [...ALLOWED_SECRETS].sort(),
    });
    for (const banned of BANNED_SECRETS) {
      expect({ banned, found: raw.includes(banned) }).toEqual({ banned, found: false });
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

  it('managed policy is the only source of permission rules', () => {
    for (const track of TRACKS) {
      const m = managed(track);
      expect({
        track,
        allowManagedPermissionRulesOnly: m.allowManagedPermissionRulesOnly,
        denyInsteadOfPrompting: m.permissions?.denyInsteadOfPrompting,
        sandboxEnabled: m.sandbox?.enabled,
        ask: m.permissions?.ask ?? [],
        defaultMode: m.permissions?.defaultMode,
      }).toEqual({
        track,
        allowManagedPermissionRulesOnly: true,
        denyInsteadOfPrompting: true,
        sandboxEnabled: false,
        ask: [],
        defaultMode: undefined,
      });
    }
  });

  it('feature policy cannot change the repo', () => {
    expect(sorted(allowOf('feature'))).toEqual(sorted(FEATURE_ALLOW));
  });

  it('bug policy is fixed-form', () => {
    for (const track of TRACKS) {
      expect({ track, offending: allowOf(track).filter((e) => DIRECT_CLI_ALLOW.test(e)) }).toEqual({
        track,
        offending: [],
      });
    }
    expect(sorted(allowOf('bug'))).toEqual(sorted(BUG_ALLOW));
  });

  it('managed policy grants nothing broad', () => {
    for (const track of TRACKS) {
      const allow = allowOf(track);
      const present = allow.filter((e) => BROAD_FORBIDDEN.includes(e));
      const ghApi = allow.filter((e) => e.includes('gh api'));
      expect({ track, present, ghApi }).toEqual({ track, present: [], ghApi: [] });
    }
  });

  it('deny rules kept', () => {
    for (const track of TRACKS) {
      const deny = denyOf(track);
      expect({ track, missing: DENY.filter((d) => !deny.includes(d)) }).toEqual({ track, missing: [] });
    }
  });
});
