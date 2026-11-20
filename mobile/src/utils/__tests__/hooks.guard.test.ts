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
type Check = { id: string; label: string; args: string[]; cwd: string; after: string[]; low: boolean };
const { RUN_FLOWS, basesOf, checksFor, clearHookGitEnv, ignored, inBatches, lintTargets, plantChecks, pushKind, readers, runAll, workersFor } = require('../../../scripts/hooks/pre-push.cjs') as {
  RUN_FLOWS: RegExp;
  pushKind: (input: string) => { kind: string; plants: { local: string }[] };
  plantChecks: (plants: { local: string }[], git: (...a: string[]) => string) => Check[];
  checksFor: (o: object) => Check[];
  runAll: (checks: Check[], logDir: string) => Promise<(Check & { code: number })[]>;
  basesOf: (input: string, git: (...a: string[]) => string) => string[];
  clearHookGitEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  ignored: (mobile: string) => string[];
  inBatches: (paths: string[], room?: number) => string[][];
  lintTargets: (changed: string[], tracked: string[]) => string[];
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
  });

  describe('the checks it runs, side by side', () => {
    const lists = { readers: 'R', rehearsals: 'H', related: 'C', testReport: 'T.json', rehearsalReport: 'H.json' };
    const base = 'b'.repeat(40);
    const plan = (over: object = {}) => checksFor({
      bases: [base], touched: ['mobile/src/a.ts'], changed: ['src/a.ts'], files: { code: ['src/a.ts'], linted: ['src/a.ts'] },
      workers: { tests: 6, rehearsals: 3 }, lanes: 4, lists, clean: true, ...over,
    });
    const byId = (checks: Check[], id: string) => checks.find((c) => c.id === id);

    it('runs every check the serial push ran: the scripts, the counts, the comments, the types, lint, the tests and the mutants', () => {
      expect(plan().map((c) => c.id)).toEqual([
        `website-freeze.cjs@${base}`, `add-only.cjs@${base}`, `migration-lint.cjs@${base}`, `frozen-base@${base}`, 'frozen',
        'comments', 'types', 'lint-1', 'rehearsals', 'tests', `mutants@${base}`]);
    });

    it('runs the readers and the related tests as one jest run, the rehearsals as a second, and every rehearsal there', () => {
      const tests = byId(plan(), 'tests')!.args;
      expect(tests.slice(tests.indexOf('--paths'))).toEqual(['--paths', 'R', '--related', 'C', '--leave', RUN_FLOWS.source]);
      expect(byId(plan(), 'rehearsals')!.args.slice(-2)).toEqual(['--paths', 'H']);
      expect(byId(plan({ files: { code: [], linted: [] }, changed: ['register/a.yaml'] }), 'tests')!.args).not.toContain('--related');
      const there = readers(join(__dirname, '..', '..', '..')).filter((p) => /runFlows/.test(p));
      expect(there.length).toBeGreaterThan(0);
      expect(there.filter((p) => !RUN_FLOWS.test(p))).toEqual([]);
      expect([RUN_FLOWS.test('e2e/__tests__/runFlows.rehearsal.test.ts'), RUN_FLOWS.test('e2e/__tests__/runFlows.variants.rehearsal.test.ts'), RUN_FLOWS.test('e2e/__tests__/flowHistory.test.ts')])
        .toEqual([true, true, false]);
    });

    it('takes a mutant\'s first run from the tests only on a clean tree, after them, and in lanes of their own', () => {
      const clean = byId(plan(), `mutants@${base}`)!;
      expect([clean.after, clean.args.slice(-4)]).toEqual([['tests', 'rehearsals'], ['--lanes', '4', '--green', 'T.json,H.json']]);
      const dirty = byId(plan({ clean: false }), `mutants@${base}`)!;
      expect([dirty.after, dirty.args.includes('--green')]).toEqual([[], false]);
    });

    it('counts a mutant\'s test green only where that test, in its own file, passed', () => {
      const { greenIn } = require('../../../scripts/mutants.cjs') as { greenIn: (r: object[], p: { file: string; test: string }) => boolean };
      const report = { testResults: [
        { name: '/x/mobile/src/a.test.ts', assertionResults: [{ title: 'holds', status: 'passed' }, { title: 'breaks', status: 'failed' }] },
        { name: 'C:\\x\\mobile\\src\\b.test.ts', assertionResults: [{ title: 'other', status: 'passed' }] },
      ] };
      expect([
        greenIn([report], { file: 'src/a.test.ts', test: 'holds' }), greenIn([report], { file: 'src/b.test.ts', test: 'other' }),
        greenIn([report], { file: 'src/a.test.ts', test: 'breaks' }), greenIn([report], { file: 'src/b.test.ts', test: 'holds' }),
        greenIn([], { file: 'src/a.test.ts', test: 'holds' }),
      ]).toEqual([true, true, false, false, false]);
    });

    it('runs nothing of the app for a push that changes nothing in mobile/, but its scripts and mutants', () => {
      expect(plan({ changed: [], files: { code: [], linted: [] }, touched: ['.github/workflows/x.yml'] }).map((c) => c.id))
        .toEqual([`website-freeze.cjs@${base}`, `add-only.cjs@${base}`, `migration-lint.cjs@${base}`, `frozen-base@${base}`, `mutants@${base}`]);
    });

    it('starts each check once those it waits for have ended, and runs every check whatever another said', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'push-'));
      try {
        const node = (id: string, code: number, after: string[] = []) => ({ id, label: id, args: ['-e', `setTimeout(() => process.exit(${code}), 50)`], cwd: dir, after, low: false });
        const order: string[] = [];
        const log = jest.spyOn(console, 'log').mockImplementation((s: string) => { order.push(String(s)); });
        const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const results = await runAll([node('a', 1), node('b', 0, ['a']), node('c', 0)], dir);
        log.mockRestore(); write.mockRestore();
        expect(results.map((r: { id: string; code: number }) => [r.id, r.code])).toEqual([['a', 1], ['b', 0], ['c', 0]]);
        expect(order.findIndex((l) => l.startsWith('→ a'))).toBeLessThan(order.findIndex((l) => l.startsWith('→ b')));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('lints the changed code, and every file once lint\'s own rules change', () => {
    const tracked = ['src/a.ts', 'test-utils/old.ts', 'eslint.config.js', 'package.json', 'README.md'];
    expect(lintTargets(['src/a.ts', 'README.md'], tracked)).toEqual(['src/a.ts']);
    for (const rules of ['eslint.config.js', 'package.json', 'package-lock.json']) {
      expect(lintTargets([rules], tracked)).toEqual(['src/a.ts', 'test-utils/old.ts', 'eslint.config.js']);
    }
    expect(lintTargets(['docs/package.json.md'], tracked)).toEqual([]);
  });

  it('runs as many jest workers as the free memory holds, at least one, never every core', () => {
    const GB = 1024 ** 3;
    expect(workersFor(4 * GB, 16)).toBe(5);
    expect(workersFor(64 * GB, 16)).toBe(15);
    expect(workersFor(1 * GB, 16)).toBe(1);
    expect(workersFor(0, 16)).toBe(1);
  });
});

describe('a push of planted-mistakes branches (plant/*)', () => {
  const sha = (c: string) => c.repeat(40);
  const line = (ref: string, local = sha('a'), remote = sha('0')) => `refs/heads/${ref} ${local} refs/heads/${ref} ${remote}`;

  it('runs only what keeps it safe to publish: the secrets scan, the website freeze and the disclosure scan, never the code gate', () => {
    const push = pushKind([line('plant/p1'), line('plant/p2', sha('c'))].join('\n'));
    expect([push.kind, push.plants.map((p) => p.local)]).toEqual(['plant', [sha('a'), sha('c')]]);
    const checks = plantChecks(push.plants, () => `${sha('f')}\n`);
    expect(checks.map((c) => c.id.split('@')[0])).toEqual(['secrets', 'website-freeze.cjs', 'disclosure', 'secrets', 'website-freeze.cjs', 'disclosure']);
    expect(checks.filter((c) => /jest|tsc|eslint|mutant|frozen|comment-truth/.test(c.args.join(' ')))).toEqual([]);
    expect(checks[0]!.args.slice(0, 3)).toEqual(['git', '--log-opts', `${sha('f')}..${sha('a')}`]);
  });

  it('refuses plant branches pushed with any other ref, and leaves every other push to the code gate', () => {
    expect(pushKind([line('plant/p1'), line('main', sha('b'), sha('d'))].join('\n')).kind).toBe('mixed');
    expect(pushKind(line('main', sha('b'), sha('d'))).kind).toBe('code');
    expect(pushKind(line('plants/p1')).kind).toBe('code');
    // A plant branch deleted after its round is a plant push with nothing to scan.
    expect(pushKind(`(delete) ${sha('0')} refs/heads/plant/p1 ${sha('e')}`)).toEqual({ kind: 'plant', plants: [] });
  });

  it('the disclosure scan names a hole\'s words and the private register\'s, and passes plain words', () => {
    const { findings, titlesAdded } = require('../../../scripts/hooks/disclosure.cjs') as {
      findings: (t: { where: string; text: string }[], priv: string, pub: string) => string[];
      titlesAdded: (diff: string) => { where: string; text: string }[];
    };
    const priv = 'the salon join reads every member list unasked';
    const pub = 'every member list is drawn';
    const said = findings([
      { where: 'a', text: 'plant: a bypass of the gate' }, { where: 'b', text: 'plant: the salon join reads every member list' },
      { where: 'c', text: 'plant: every member list is drawn again' }, { where: 'd', text: 'plant 7 of 22, round 15' },
    ], priv, pub);
    expect(said).toEqual(['a names a hole: "bypass"', 'b says four words of the private register: "the salon join reads"']);
    expect(titlesAdded("+++ b/src/x.test.ts\n+it('leaks the password to a guest', () => {\n+const y = 1;\n+++ b/src/y.ts\n+it('not a test file')\n"))
      .toEqual([{ where: 'src/x.test.ts: a test title', text: 'leaks the password to a guest' }]);
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
