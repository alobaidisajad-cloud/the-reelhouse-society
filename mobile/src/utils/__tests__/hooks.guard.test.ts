/**
 * The git hooks are tracked, installed, and refuse what they say they refuse.
 * ─────────────────────────────────────────────────────────────────────────────
 * mobile/githooks holds three hooks; `prepare` (scripts/install-hooks.cjs)
 * points git at them. Their checks live in scripts/hooks/*.cjs and are held
 * here: the private folder and database dumps refused at a commit, the bases a
 * push is checked from, and CI's check that every pushed commit carries the
 * trailer the hooks add.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const { mutantInPlace, refusalOf } = require('../../../scripts/hooks/pre-commit.cjs') as {
  mutantInPlace: (root: string) => string | null; refusalOf: (path: string, bytes: Buffer) => string | null;
};
const { basesOf, clearHookGitEnv, ignored, inBatches, readers, workersFor } = require('../../../scripts/hooks/pre-push.cjs') as {
  basesOf: (input: string, git: (...a: string[]) => string) => string[];
  clearHookGitEnv: (env: Record<string, string | undefined>) => Record<string, string | undefined>;
  ignored: (mobile: string) => string[];
  inBatches: (paths: string[], room?: number) => string[][];
  readers: (mobile: string) => string[];
  workersFor: (freeBytes: number, cores: number) => number;
};
const { faultOf } = require('../../../scripts/hooks-ran.cjs') as {
  faultOf: (c: { author: string; committer: string; message: string }) => string | null;
};

const text = (s: string) => Buffer.from(s, 'utf8');
const DUMP = '--\n-- PostgreSQL database dump\n--\nCREATE TABLE public.t (id int);\n';

describe('before a commit', () => {
  it('refuses while a stopped mutants run left a mutant in place, and pushes refuse it too', () => {
    const root = mkdtempSync(join(tmpdir(), 'placed-'));
    try {
      mkdirSync(join(root, 'mobile'));
      expect(mutantInPlace(root)).toBeNull();
      writeFileSync(join(root, 'mobile', '.mutant-in-place.json'), '{"mutant":"x","changes":[]}');
      expect(mutantInPlace(root)).toBe('a mutant is still in place, from a mutants run that was stopped: node mobile/scripts/mutants.cjs --put-back');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(readFileSync(join(ROOT, 'mobile', 'scripts', 'hooks', 'pre-push.cjs'), 'utf8')).toMatch(/const placed = mutantInPlace\(ROOT\);\r?\n\s+if \(placed\) faults\.push\(placed\);/);
  });

  it('refuses the plan\'s private folder', () => {
    expect(refusalOf('mobile/audit/final/PLAN.md', text('# plan'))).toBe('the plan\'s private folder (mobile/audit/final/) is never committed');
  });

  it('refuses a database dump, binary or text, anywhere but the snapshot', () => {
    expect(refusalOf('backup.dump', Buffer.concat([Buffer.from('PGDMP', 'latin1'), Buffer.from([1, 14, 0])]))).toBe('a binary database dump');
    expect(refusalOf('mobile/scratch/prod.sql', text(DUMP))).toBe('a database dump');
    expect(refusalOf('mobile/supabase/schema/live-schema.sql', text(DUMP))).toBeNull();
    expect(refusalOf('mobile/supabase/schema/live-schema.sql', text(`${DUMP}COPY public.t (id) FROM stdin;\n1\n\\.\n`)))
      .toBe('the schema snapshot holds data rows');
  });

  it('passes an ordinary file, one that only names a dump (this test, the hook), and the snapshot as committed', () => {
    expect(refusalOf('mobile/src/App.tsx', text('export {};'))).toBeNull();
    for (const own of ['mobile/scripts/hooks/pre-commit.cjs', 'mobile/src/utils/__tests__/hooks.guard.test.ts']) {
      expect([own, refusalOf(own, readFileSync(join(ROOT, own)))]).toEqual([own, null]);
    }
    const snapshot = 'mobile/supabase/schema/live-schema.sql';
    expect(refusalOf(snapshot, readFileSync(join(ROOT, snapshot)))).toBeNull();
  });
});

describe('before a push', () => {
  const git = (...args: string[]) => (args[0] === 'merge-base' ? 'f'.repeat(40) : '');

  it('checks from what the remote had, or from where a new branch left main', () => {
    const input = [
      `refs/heads/main ${'a'.repeat(40)} refs/heads/main ${'b'.repeat(40)}`,
      `refs/heads/new ${'c'.repeat(40)} refs/heads/new ${'0'.repeat(40)}`,
      `(delete) ${'0'.repeat(40)} refs/heads/old ${'d'.repeat(40)}`,
    ].join('\n');
    expect(basesOf(input, git)).toEqual(['b'.repeat(40), 'f'.repeat(40)]);
  });

  it('leaves out the worktrees and Stryker\'s sandbox inside a checkout, never a checkout that is itself a worktree', () => {
    for (const mobile of ['/home/m/reelhouse/mobile', '/home/m/reelhouse/.claude/worktrees/agent-a/mobile']) {
      const left = (path: string) => ignored(mobile).some((p) => new RegExp(p).test(path));
      expect([mobile, left(`${mobile}/src/utils/__tests__/a.test.ts`)]).toEqual([mobile, false]);
      expect([mobile, left(`${mobile}/.claude/worktrees/b/mobile/src/a.test.ts`)]).toEqual([mobile, true]);
      expect([mobile, left(`${mobile}/.stryker-tmp/sandbox-x/src/a.test.ts`)]).toEqual([mobile, true]);
      expect([mobile, left(`${mobile}/node_modules/x/a.test.ts`)]).toEqual([mobile, true]);
    }
  });

  it('runs every test the source-reading ledger names, each there, the guards among them', () => {
    const list = readers(join(__dirname, '..', '..', '..'));
    expect(list.length).toBeGreaterThan(200);
    expect(list).toEqual(expect.arrayContaining([
      'test-utils/__tests__/everyCommentIsTrue.test.ts', 'src/utils/__tests__/ciWorkflows.guard.test.ts',
      'src/utils/__tests__/hooks.guard.test.ts', 'test-utils/__tests__/aSweepAsksTheUniverse.test.ts',
    ]));
    expect(list.filter((p) => !existsSync(join(__dirname, '..', '..', '..', p)))).toEqual([]);
  });

  it('hands jest its paths in batches that fit on one Windows command line, every path once, in order', () => {
    expect(inBatches(['a', 'bb', 'ccc', 'dd'], 6)).toEqual([['a', 'bb'], ['ccc'], ['dd']]);
    expect(inBatches(['a-path-longer-than-the-room'], 6)).toEqual([['a-path-longer-than-the-room']]);
    expect(inBatches([], 6)).toEqual([]);
    const list = readers(join(__dirname, '..', '..', '..'));
    const batches = inBatches(list);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(list);
    expect(batches.filter((b) => b.join(' ').length > 6000)).toEqual([]);
    const hook = readFileSync(join(ROOT, 'mobile', 'scripts', 'hooks', 'pre-push.cjs'), 'utf8');
    expect(hook).toContain("for (const batch of inBatches(readers(MOBILE)))");
    expect(hook).toContain("for (const batch of inBatches(code))");
  });

  it('runs as many jest workers as the free memory holds, at least one, never every core', () => {
    const GB = 1024 ** 3;
    expect(workersFor(4 * GB, 16)).toBe(5);
    expect(workersFor(64 * GB, 16)).toBe(15);
    expect(workersFor(1 * GB, 16)).toBe(1);
    expect(workersFor(0, 16)).toBe(1);
  });
});

describe('a push from a linked worktree', () => {
  it('reads each file as git holds it once the hook\'s GIT_DIR is cleared, and reads it wrong under it', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const base = mkdtempSync(join(tmpdir(), 'hook-env-'));
    const main = join(base, 'main');
    const tree = join(base, 'tree');
    const git = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
      execFileSync('git', args, { cwd, env, encoding: 'utf8' });
    const clean = clearHookGitEnv({ ...process.env });
    try {
      mkdirSync(join(main, 'mobile'), { recursive: true });
      git(main, clean, 'init', '-q');
      writeFileSync(join(main, 'mobile', 'app.json'), '{}\n');
      git(main, clean, 'add', '-A');
      git(main, clean, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'one');
      git(main, clean, 'worktree', 'add', '-q', tree);
      // As git sets it for a hook in that worktree: its own git folder.
      const gitDir = git(tree, clean, 'rev-parse', '--absolute-git-dir').trim();
      const hooked = { ...clean, GIT_DIR: gitDir };
      // From mobile/, under the hook's GIT_DIR: mobile/ taken for the whole tree, its file untracked.
      expect(git(join(tree, 'mobile'), hooked, 'status', '--porcelain', '--', 'app.json')).not.toBe('');
      // Cleared, the same call finds the worktree and sees the file as committed.
      expect(git(join(tree, 'mobile'), clearHookGitEnv({ ...hooked }), 'status', '--porcelain', '--', 'app.json')).toBe('');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('jest itself', () => {
  it('leaves out the worktrees inside a checkout, never a checkout that is itself a worktree', () => {
    const { testPathIgnorePatterns } = require(join(MOBILE, 'jest.config.js')) as { testPathIgnorePatterns: string[] };
    for (const mobile of ['/home/m/reelhouse/mobile', '/home/m/reelhouse/.claude/worktrees/agent-a/mobile']) {
      const left = (path: string) => testPathIgnorePatterns.some((p) => new RegExp(p.replace('<rootDir>', mobile)).test(path));
      expect([mobile, left(`${mobile}/src/utils/__tests__/a.test.ts`)]).toEqual([mobile, false]);
      expect([mobile, left(`${mobile}/.claude/worktrees/b/mobile/src/a.test.ts`)]).toEqual([mobile, true]);
    }
  });
});

describe('every pushed commit was made with the hooks', () => {
  const made = 'fix: x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nHooks-Ran: pre-commit\n';

  it('passes a commit with the trailer, and Dependabot\'s own', () => {
    expect(faultOf({ author: 'Sajad', committer: 'Sajad', message: made })).toBeNull();
    expect(faultOf({ author: 'dependabot[bot]', committer: 'GitHub', message: 'chore(deps): bump x' })).toBeNull();
    expect(faultOf({ author: 'Sajad', committer: 'web-flow', message: 'Merge pull request #12 from me/dependabot/npm_and_yarn/x\n' })).toBeNull();
  });

  it('says NO to any other commit without it', () => {
    const no = 'made without the hooks (no "Hooks-Ran: pre-commit" trailer)';
    expect(faultOf({ author: 'Sajad', committer: 'Sajad', message: 'fix: x\n' })).toBe(no);
    expect(faultOf({ author: 'Sajad', committer: 'web-flow', message: 'Merge pull request #13 from me/feature\n' })).toBe(no);
    expect(faultOf({ author: 'Sajad', committer: 'Sajad', message: 'fix: x\n\nthe body says Hooks-Ran: pre-commit in passing\n' })).toBe(no);
  });
});

it('is installed by prepare, from tracked files, and the dead husky hooks are gone', () => {
  const pkg = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
  expect(pkg.scripts.prepare).toBe('node ./scripts/install-hooks.cjs');
  expect(readFileSync(join(MOBILE, 'scripts/install-hooks.cjs'), 'utf8')).toContain("'core.hooksPath', 'mobile/githooks'");
  for (const [hook, script] of [['pre-commit', 'pre-commit.cjs'], ['commit-msg', 'commit-msg.cjs'], ['pre-push', 'pre-push.cjs']]) {
    expect(readFileSync(join(MOBILE, 'githooks', hook), 'utf8')).toContain(`exec node mobile/scripts/hooks/${script}`);
  }
  expect(existsSync(join(MOBILE, '.husky'))).toBe(false);
  const ci = readFileSync(join(ROOT, '.github/workflows/god_tier_ci.yml'), 'utf8');
  expect(ci).toContain('node mobile/scripts/hooks-ran.cjs "$BEFORE"');
});
