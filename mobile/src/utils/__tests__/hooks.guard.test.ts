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
import { basename, join } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const ROOT = join(MOBILE, '..');
const { mutantInPlace, refusalOf } = require('../../../scripts/hooks/pre-commit.cjs') as {
  mutantInPlace: (root: string) => string | null; refusalOf: (path: string, bytes: Buffer) => string | null;
};
type Cost = { cpu: number; mem: number };
type Check = { id: string; label: string; args: string[]; cwd: string; after: string[]; low: boolean; cost?: Cost };
type Ran = Check & { code: number; from: number; to: number };
type Sizes = { parts: number; tests: number; lanes: number; warmEarly: boolean };
const { COST, RUN_FLOWS, basesOf, capOf, checksFor, clearHookGitEnv, dryRunInput, ignored, inBatches, lintTargets, peakOf, plantChecks, pushKind, readers, runAll, sizesFor } = require('../../../scripts/hooks/pre-push.cjs') as {
  COST: Record<string, Cost>;
  RUN_FLOWS: RegExp;
  pushKind: (input: string) => { kind: string; plants: { local: string }[] };
  plantChecks: (plants: { local: string }[], git: (...a: string[]) => string) => Check[];
  checksFor: (o: object) => Check[];
  runAll: (checks: Check[], logDir: string, cap?: Cost, run?: (c: Check) => Promise<Check & { code: number }>) => Promise<Ran[]>;
  basesOf: (input: string, git: (...a: string[]) => string) => string[];
  capOf: (m: { cores: number; freeBytes: number }) => Cost;
  clearHookGitEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  dryRunInput: (git: (...a: string[]) => string, base?: string) => string;
  ignored: (mobile: string) => string[];
  inBatches: (paths: string[], room?: number) => string[][];
  lintTargets: (changed: string[], tracked: string[]) => string[];
  peakOf: (results: Ran[]) => Cost;
  readers: (mobile: string) => string[];
  sizesFor: (cap: Cost, o: { rehearsals: boolean; mutants: number }) => Sizes;
};
const jestRun = require('../../../scripts/hooks/jest-run.cjs') as { titlesPattern: (titles: string[]) => string };
const lanes = require('../../../scripts/hooks/mutant-lanes.cjs') as {
  missingIn: (dir: string, root?: string) => string[];
  modulesOf: (root?: string) => string[];
  reachOrder: (lanes: { ids: string[] }[]) => string[];
  unproven: (mutants: object[], reports: object[], greenIn: (r: object[], p: object) => boolean, rehearsal: RegExp) => { files: string[]; titles: string[] };
};
const GB = 1024 ** 3;
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
    const lists = { readers: 'R', rehearsals: 'H', related: 'C', testReport: 'T.json', rehearsalReport: 'H.json', types: 'Y.jsonl', rehearsalSeconds: 'S.json' };
    const base = 'b'.repeat(40);
    const plan = (over: object = {}) => checksFor({
      bases: [base], touched: ['mobile/src/a.ts'], changed: ['src/a.ts'], files: { code: ['src/a.ts'], linted: ['src/a.ts'] },
      sizes: { tests: 6, lanes: 4, warmEarly: true }, lists, clean: true, mutants: 3, ...over,
    });
    const byId = (checks: Check[], id: string) => checks.find((c) => c.id === id);
    const scripts = [`website-freeze.cjs@${base}`, `add-only.cjs@${base}`, `migration-lint.cjs@${base}`, `frozen-base@${base}`];
    const lanes = [`mutant-rehearsals@${base}`, `mutants@${base}`];

    it('runs every check the serial push ran: the scripts, the counts, the comments, the types, lint, the tests and the mutants', () => {
      // The warm checker checks the commit's types, beside the tests where it fits, after them where not.
      expect(plan().map((c) => c.id)).toEqual(['rehearsals', 'mutant-types', 'tests', ...scripts, 'frozen', 'comments', 'lint-1', ...lanes]);
      expect(plan({ sizes: { tests: 6, lanes: 4, warmEarly: false } }).map((c) => c.id))
        .toEqual(['rehearsals', 'tests', 'mutant-types', ...scripts, 'frozen', 'comments', 'lint-1', ...lanes]);
      // No mutant standing on the change: tsc checks the types, and the lanes ask nothing of a warm checker.
      const none = plan({ mutants: 0 });
      expect(none.map((c) => c.id)).toEqual(['rehearsals', 'tests', ...scripts, 'frozen', 'comments', 'types', 'lint-1', ...lanes]);
      expect(lanes.map((id) => byId(none, id)!.args.includes('--types-from'))).toEqual([false, false]);
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
      // Every lane after the warm checker's answers, so none runs tsc beside it.
      expect([clean.after, clean.args.slice(-8)]).toEqual([['tests', 'mutant-types'], ['--lanes', '4', '--rehearsals', 'none', '--green', 'T.json,H.json', '--types-from', 'Y.jsonl']]);
      const dirty = byId(plan({ clean: false }), `mutants@${base}`)!;
      expect([dirty.after, dirty.args.includes('--green')]).toEqual([['mutant-types'], false]);
      expect(byId(plan({ clean: false, mutants: 0 }), `mutants@${base}`)!.after).toEqual([]);
      // A mutant a rehearsal proves: one lane of its own, only once the rehearsals have ended, clean or not.
      for (const at of [plan(), plan({ clean: false })]) {
        const r = byId(at, `mutant-rehearsals@${base}`)!;
        expect([r.after, r.args.slice(r.args.indexOf('--lanes'), r.args.indexOf('--lanes') + 4)]).toEqual([['rehearsals', 'mutant-types'], ['--lanes', '1', '--rehearsals', 'only']]);
      }
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
        .toEqual(['mutant-types', ...scripts, ...lanes]);
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

  it('caps the push at the processors but one and the memory free when it starts, but a reserve', () => {
    expect(capOf({ cores: 12, freeBytes: 8 * GB })).toEqual({ cpu: 11, mem: 7.5 * GB });
    expect(capOf({ cores: 1, freeBytes: 0 })).toEqual({ cpu: 1, mem: 0 });
  });

  it('sizes the jest workers and the lanes to the cap beside the rehearsals, the warm checker beside the tests only where it fits, each at least one', () => {
    const roomy = sizesFor({ cpu: 11, mem: 24 * GB }, { rehearsals: true, mutants: 10 });
    expect([roomy.tests, roomy.lanes, roomy.warmEarly]).toEqual([9, 10, true]);
    // What runs at once fits the cap: the rehearsals, the warm checker where it runs beside the tests,
    // and the workers; the lanes beside the rehearsals, after the tests.
    for (const cap of [{ cpu: 11, mem: 24 * GB }, { cpu: 11, mem: 9 * GB }, { cpu: 5, mem: 12 * GB }, { cpu: 11, mem: 3.5 * GB }]) {
      const s = sizesFor(cap, { rehearsals: true, mutants: 10 });
      const warm = s.warmEarly ? COST.warm! : { cpu: 0, mem: 0 };
      const r = COST.rehearsal!;
      const beside = { cpu: r.cpu + warm.cpu + s.tests * COST.worker!.cpu, mem: r.mem + warm.mem + s.tests * COST.worker!.mem };
      expect([cap, beside.cpu <= cap.cpu, beside.mem <= cap.mem, r.mem + s.lanes * COST.lane!.mem <= cap.mem, r.cpu + s.lanes <= cap.cpu])
        .toEqual([cap, true, true, true, true]);
    }
    // A small machine: the warm checker after the tests, so the tests keep their workers.
    const small = sizesFor({ cpu: 11, mem: 3.5 * GB }, { rehearsals: true, mutants: 10 });
    expect([small.tests, small.lanes, small.warmEarly]).toEqual([5, 4, false]);
    const tight = sizesFor({ cpu: 11, mem: 0.5 * GB }, { rehearsals: true, mutants: 10 });
    expect([tight.tests, tight.lanes]).toEqual([1, 1]);
    expect(sizesFor({ cpu: 11, mem: 24 * GB }, { rehearsals: false, mutants: 0 })).toEqual({ tests: 11, lanes: 11, warmEarly: false });
  });

  it('never holds more than the cap at once, starts checks in their order, and runs one larger than the cap alone, holding none back', async () => {
    const cost = (cpu: number, gb: number) => ({ cpu, mem: gb * GB });
    const check = (id: string, c: Cost, after: string[] = []): Check => ({ id, label: id, args: [], cwd: '', after, low: true, cost: c });
    const ms = (n: number) => new Promise((r) => setTimeout(r, n));
    const live = new Set<string>();
    let worst = { cpu: 0, mem: 0 };
    const run = async (c: Check) => {
      live.add(c.id);
      const now = [...live].map((id) => checks.find((x) => x.id === id)!.cost!).reduce((a, b) => ({ cpu: a.cpu + b.cpu, mem: a.mem + b.mem }));
      worst = { cpu: Math.max(worst.cpu, now.cpu), mem: Math.max(worst.mem, now.mem) };
      await ms(c.id.length * 5);
      live.delete(c.id);
      return { ...c, code: 0 };
    };
    const checks = [check('big', cost(1, 3)), check('a', cost(2, 1)), check('bb', cost(2, 1)), check('ccc', cost(3, 2), ['a']), check('huge', cost(1, 9)), check('d', cost(1, 0.5))];
    const cap = cost(4, 4);
    const results = await runAll(checks, '', cap, run);
    expect([worst.cpu <= cap.cpu, worst.mem <= 9 * GB]).toEqual([true, true]);
    const order = [...results].sort((x, y) => x.from - y.from).map((r) => r.id);
    // The one larger than the cap held back none that fit: d ran before it, and it ran last.
    expect([order.indexOf('d') < order.indexOf('huge'), order[order.length - 1]]).toEqual([true, 'huge']);
    // ...and with nothing beside it.
    const huge = results.find((r) => r.id === 'huge')!;
    expect(results.filter((r) => r.id !== 'huge' && r.from < huge.to && r.to > huge.from)).toEqual([]);
    // Apart from it, never more than the cap.
    const rest = results.filter((r) => r.id !== 'huge');
    expect(peakOf(rest).cpu <= cap.cpu && peakOf(rest).mem <= cap.mem).toBe(true);
    expect(results.find((r) => r.id === 'ccc')!.from).toBeGreaterThanOrEqual(results.find((r) => r.id === 'a')!.to);
  });

  it('checks, as a dry run, a push of HEAD to main from origin/main or the base named', () => {
    const git = (...a: string[]) => (a[1] === 'HEAD' ? `${'h'.repeat(40)}\n` : `${a[1] === 'origin/main' ? 'o' : 'x'}${'0'.repeat(39)}\n`);
    expect(dryRunInput(git)).toBe(`refs/heads/main ${'h'.repeat(40)} refs/heads/main o${'0'.repeat(39)}\n`);
    expect(dryRunInput(git, 'other')).toBe(`refs/heads/main ${'h'.repeat(40)} refs/heads/main x${'0'.repeat(39)}\n`);
    expect(basesOf(dryRunInput(git), git)).toEqual([`o${'0'.repeat(39)}`]);
  });
});

describe('the mutant lanes (mutant-lanes.cjs)', () => {
  it('runs a mutant\'s proof by its title, alone or after its describe\'s, and no other test', () => {
    const titles = new RegExp(jestRun.titlesPattern(['holds', 'one (x)']), 'i');
    expect(['holds', 'the guard holds', 'one (x)', 'the guard holds not', 'upholds', 'one x'].map((n) => titles.test(n))).toEqual([true, true, true, false, false, false]);
  });

  it('gives each lane every node_modules this checkout holds, the root\'s with Playwright among them, and names one it lacks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lanes-'));
    const checkout = join(dir, 'checkout');
    const whole = join(dir, 'whole');
    const short = join(dir, 'short');
    try {
      for (const at of [checkout, whole]) for (const m of ['node_modules', join('mobile', 'node_modules')]) mkdirSync(join(at, m), { recursive: true });
      mkdirSync(join(short, 'mobile', 'node_modules'), { recursive: true });
      expect(lanes.modulesOf(checkout).map((m) => m.split('\\').join('/'))).toEqual(['node_modules', 'mobile/node_modules']);
      expect([lanes.missingIn(whole, checkout), lanes.missingIn(short, checkout)]).toEqual([[], ['node_modules']]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs once, together, only the proofs no report holds green, never a rehearsal\'s', () => {
    const m = (id: string, file: string, test: string) => ({ id, proof: { file, test } });
    const mutants = [m('a', 'src/a.test.ts', 'one'), m('b', 'src/a.test.ts', 'two'), m('c', 'src/b.test.ts', 'one'), m('d', 'e2e/__tests__/runFlows.rehearsal.test.ts', 'r')];
    const greenIn = (_: object[], p: object) => (p as { test: string }).test === 'two';
    expect(lanes.unproven(mutants, [], greenIn, RUN_FLOWS)).toEqual({ files: ['src/a.test.ts', 'src/b.test.ts'], titles: ['one'] });
  });

  it('has the warm checker answer in the order the lanes reach their mutants', () => {
    expect(lanes.reachOrder([{ ids: ['a', 'b', 'c'] }, { ids: ['d'] }, { ids: ['e', 'f'] }])).toEqual(['a', 'd', 'e', 'b', 'f', 'c']);
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
    // Each argument by its own name: the folder a checkout stands in (a mutant lane's rh-mutant-lanes) is no check it runs.
    expect(checks.filter((c) => /jest|tsc|eslint|mutant|frozen|comment-truth/.test(c.args.map((a) => basename(a)).join(' ')))).toEqual([]);
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
