/**
 * The git hooks are tracked, installed, and refuse what they say they refuse.
 * ─────────────────────────────────────────────────────────────────────────────
 * mobile/githooks holds three hooks; `prepare` (scripts/install-hooks.cjs)
 * points git at them. Their checks live in scripts/hooks/*.cjs and are held
 * here: the private folder and database dumps refused at a commit, the bases a
 * push is checked from, and CI's check that every pushed commit carries the
 * trailer the hooks add.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const { refusalOf } = require('../../../scripts/hooks/pre-commit.cjs') as { refusalOf: (path: string, bytes: Buffer) => string | null };
const { basesOf, ignored } = require('../../../scripts/hooks/pre-push.cjs') as {
  basesOf: (input: string, git: (...a: string[]) => string) => string[];
  ignored: (mobile: string) => string[];
};
const { faultOf } = require('../../../scripts/hooks-ran.cjs') as {
  faultOf: (c: { author: string; committer: string; message: string }) => string | null;
};

const text = (s: string) => Buffer.from(s, 'utf8');
const DUMP = '--\n-- PostgreSQL database dump\n--\nCREATE TABLE public.t (id int);\n';

describe('before a commit', () => {
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

  it('leaves out the worktrees inside a checkout, never a checkout that is itself a worktree', () => {
    for (const mobile of ['/home/m/reelhouse/mobile', '/home/m/reelhouse/.claude/worktrees/agent-a/mobile']) {
      const left = (path: string) => ignored(mobile).some((p) => new RegExp(p).test(path));
      expect([mobile, left(`${mobile}/src/utils/__tests__/a.test.ts`)]).toEqual([mobile, false]);
      expect([mobile, left(`${mobile}/.claude/worktrees/b/mobile/src/a.test.ts`)]).toEqual([mobile, true]);
      expect([mobile, left(`${mobile}/node_modules/x/a.test.ts`)]).toEqual([mobile, true]);
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
