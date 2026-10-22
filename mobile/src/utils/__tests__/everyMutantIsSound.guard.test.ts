/**
 * The mutants that prove every guard (register/mutants.yaml, run by scripts/mutants.cjs), held to
 * their rules (WORKLIST P0.66, P0.67, P0.69, P0.71).
 * ─────────────────────────────────────────────────────────────────────────────
 * Each mutant names a class of the register and the test of that class that must fail on it (a
 * judge mutant, the judge that must refuse its bad log). A past mutant reverses a commit that
 * really changed its files, never a test; a new shape is planted where nothing stands yet. Every
 * class with a test has a mutant, every past fix the register names is put back, and every E2E
 * judge is fed a bad log or named as no judge. The runner's own rules are asked directly.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import ts from 'typescript';
import { files as universe } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');
type Result = { class: string; mutant: string; proof: string | null; commit: string; verdict: string };
const mutantsCjs = require('../../../scripts/mutants.cjs') as {
  applyEdits: (text: string, edits: { find: string; replace: string }[]) => { text?: string; notApplied?: string };
  changesOf: (m: Mutant) => { notApplied?: string; changes?: unknown[] };
  gather: (parts: Result[][], mutants: Mutant[]) => { results: Result[]; faults: string[] };
  hunksOf: (commit: string, file: string) => { before: string[]; after: string[] }[];
  partOf: (mutants: Mutant[], spec: string) => Mutant[];
  privateDir: () => string | null;
  argumentsFault: (argv: string[]) => string | null;
  compileFaults: (changes: { file: string; path: string; after: string }[]) => string[];
  putBackLeftover: (placed?: string) => string[];
  proofId: (m: Mutant, classes: Klass[]) => string | null;
  really: (c: { before: string | null; after: string }) => boolean;
  reverse: (text: string, hunks: { before: string[]; after: string[] }[]) => { text?: string; notApplied?: string };
  standsOn: (m: Mutant, changed: string) => boolean;
  statusIn: (report: unknown, title: string) => string;
};
const RESULTS = JSON.parse(readFileSync(join(MOBILE, 'register', 'mutant-results.json'), 'utf8')) as Result[];

type Edit = { file: string; find: string; replace: string };
type Mutant = {
  id: string; class: string; source: 'past' | 'shape' | 'judge'; commit?: string; files?: string[]; edits?: Edit[];
  plant?: { path: string; text: string }[]; proof?: { file: string; test: string };
  judge?: { from?: string; run: string[]; refuses?: number; env?: Record<string, string> }; expect?: string;
};
type Method = { kind: string; file: string; test: string };
type Klass = { id: string; open_in_production?: boolean; methods?: Method[]; source?: { kind: string; ref: string } };

const MUTANTS = (yaml.parse(readFileSync(join(MOBILE, 'register', 'mutants.yaml'), 'utf8')) as { mutants: Mutant[] }).mutants;
const CLASSES = (yaml.parse(readFileSync(join(MOBILE, 'register', 'classes.yaml'), 'utf8')) as { classes: Klass[] }).classes;
const classOf = (id: string) => CLASSES.find((c) => c.id === id);
const isTestFile = (p: string) => /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
const filesOf = (m: Mutant) => [...new Set([...(m.files ?? []), ...(m.edits ?? []).map((e) => e.file)])];

/** A test file's `it`/`test` titles, from its syntax tree; null when the file is not there. */
const titlesIn = (file: string): string[] | null => {
  const path = join(MOBILE, file);
  if (!existsSync(path)) return null;
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const titles: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['it', 'test'].includes(n.expression.text)) {
      const [title] = n.arguments;
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) titles.push(title.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return titles;
};

/** The E2E scripts that judge no run's logs, each with why. Every other one is fed a bad log. */
const NOT_JUDGES: Record<string, string> = {
  'advisories.mjs': 'it judges the packages a build holds, not a run; its own tests plant known-vulnerable ones',
  'annotate.mjs': 'it prints a file as an annotation',
  'fault-proxy.mjs': 'it is the network between the app and the house, not a verdict; its own tests set every fault against a real house',
  'anon-key.mjs': 'it prints the local stack\'s key',
  'flow-history.mjs': 'it records each part\'s time from a finished run',
  'flow-screens.mjs': 'it draws each failed flow\'s screens for a reader',
  'ios-crash.mjs': 'it summarises a crash report the launch judge has already failed on',
  'old-client-tree.mjs': 'it builds a shipped client\'s tree to run',
  'old-clients.cjs': 'it reads which shipped clients are checked, and their own crashes, for the crash judge',
  'screen.mjs': 'it prints what was on the screen, as words',
  'scrub.mjs': 'it takes secrets out of kept logs',
  'shards.mjs': 'it splits the flows between machines',
  'walk-routes.mjs': 'it plans the route walk and writes its flow; route-judges.mjs judges what it captured',
  'png.mjs': "it reads a capture's pixels for the judges that look at one",
  'grounds-judges.mjs': 'its walks are pictures, which a judge\'s text fixtures cannot carry: a shape mutant edits the judge itself (shape-icons-unread)',
  'variants.mjs':'it gives the commands that set the phone as a variant has it and put it back; run-flows.sh runs them (shape-variant-refusal-sent)',
  'route-judges.mjs': 'its captures are pictures, which a judge\'s text fixtures cannot carry: a shape mutant edits the judge itself (shape-route-capture-unchecked)',
};

it('reads the registry: every mutant once, by an id that says its source', () => {
  expect(MUTANTS.length).toBeGreaterThan(30);
  const ids = MUTANTS.map((m) => m.id);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  expect(MUTANTS.filter((m) => !['past', 'shape', 'judge'].includes(m.source) || !m.id.startsWith(`${m.source}-`) || !/^[a-z]+(-[a-z0-9]+)+$/.test(m.id))
    .map((m) => m.id)).toEqual([]);
});

it('names a class of the register for each, never one still open in production (its mutants are private)', () => {
  expect(MUTANTS.filter((m) => !classOf(m.class)).map((m) => `${m.id}: ${m.class}`)).toEqual([]);
  expect(MUTANTS.filter((m) => classOf(m.class)?.open_in_production).map((m) => m.id)).toEqual([]);
});

it('proves each by a test of its own class, there by its exact title; a judge mutant by its judge', () => {
  const wrong = MUTANTS.filter((m) => m.source !== 'judge').flatMap((m) => {
    const methods = classOf(m.class)?.methods ?? [];
    const own = methods.some((x) => x.file === m.proof?.file && x.test === m.proof?.test);
    const there = (titlesIn(m.proof?.file ?? '') ?? []).includes(m.proof?.test ?? '');
    return own && there ? [] : [`${m.id}: ${own ? 'no test titled so' : 'not one of its class\'s methods'}`];
  });
  expect(wrong).toEqual([]);
  expect(MUTANTS.filter((m) => m.source === 'judge' && m.proof).map((m) => m.id)).toEqual([]);
});

it('gives every method of a class with mutants a test that exists, by its exact title', () => {
  const classes = [...new Set(MUTANTS.map((m) => m.class))].map((id) => classOf(id)).filter((c): c is Klass => !!c);
  const missing = classes.flatMap((c) => (c.methods ?? []).filter((x) => !(titlesIn(x.file) ?? []).includes(x.test)).map((x) => `${c.id}: ${x.file}: ${x.test}`));
  expect(missing).toEqual([]);
});

it('reverses, for a past mutant, a commit that changed each of its files; and changes no test', () => {
  const past = MUTANTS.filter((m) => m.source === 'past');
  expect(past.length).toBeGreaterThan(4);
  for (const m of past) {
    expect([m.id, /^[0-9a-f]{7,40}$/.test(m.commit ?? '')]).toEqual([m.id, true]);
    for (const f of m.files ?? []) expect([m.id, f, mutantsCjs.hunksOf(m.commit ?? '', f).length > 0]).toEqual([m.id, f, true]);
    // Its hand-written stand-in changes the same files the fix did.
    for (const e of m.edits ?? []) expect([m.id, (m.files ?? []).includes(e.file)]).toEqual([m.id, true]);
  }
  expect(past.flatMap((m) => filesOf(m).filter(isTestFile).map((f) => `${m.id}: ${f}`))).toEqual([]);
});

it('changes files that exist, and plants a new shape where nothing stands yet, in a real folder', () => {
  // A judge's edits name its own logs, read below.
  const missing = MUTANTS.filter((m) => m.source !== 'judge')
    .flatMap((m) => filesOf(m).filter((f) => !existsSync(join(MOBILE, f))).map((f) => `${m.id}: ${f}`));
  expect(missing).toEqual([]);
  const plants = MUTANTS.flatMap((m) => (m.plant ?? []).map((p) => ({ id: m.id, path: p.path })));
  expect(plants.length).toBeGreaterThan(3);
  const badPlants = plants.filter(({ path }) => existsSync(join(MOBILE, path)) || !existsSync(join(MOBILE, path, '..'))
    || !statSync(join(MOBILE, path, '..')).isDirectory());
  expect(badPlants).toEqual([]);
  // Today's code holds every find of a hand-written change once, and every past fix still reverses
  // where it has no stand-in: a change that stops one says so here, not first in the nightly.
  const notApplied = MUTANTS.filter((m) => m.source !== 'judge' && (m.edits || m.source === 'past')).flatMap((m) => {
    const made = mutantsCjs.changesOf({ ...m, plant: [] });
    return made.notApplied ? [`${m.id}: ${made.notApplied}`] : [];
  });
  expect(notApplied).toEqual([]);
});

it('feeds every E2E judge a bad log made from a good one, or names the script as no judge', () => {
  const judges = MUTANTS.filter((m) => m.source === 'judge');
  for (const m of judges) {
    const from = join(MOBILE, m.judge?.from ?? '');
    expect([m.id, !!m.judge?.from && existsSync(from)]).toEqual([m.id, true]);
    expect([m.id, existsSync(join(MOBILE, m.judge?.run[1] ?? ''))]).toEqual([m.id, true]);
    for (const e of m.edits ?? []) expect([m.id, e.file, existsSync(join(from, e.file))]).toEqual([m.id, e.file, true]);
  }
  // A log under a name the repo ignores would be missing from every other checkout: kept under another (judge.as).
  const logs = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'e2e/__tests__/fixtures/judges'], { cwd: MOBILE, encoding: 'utf8' });
  expect(logs.split('\n').filter(Boolean)).toEqual([]);
  const scripts = universe('scripts').map((p) => relative(MOBILE, p).split('\\').join('/'))
    .filter((p) => /^e2e\/[^/]+\.(mjs|cjs)$/.test(p)).map((p) => p.slice('e2e/'.length));
  expect(scripts.length).toBeGreaterThan(15);
  const judged = new Set(judges.map((m) => (m.judge?.run[1] ?? '').replace(/^e2e\//, '')));
  expect(scripts.filter((s) => !judged.has(s) && !(s in NOT_JUDGES))).toEqual([]);
  expect(Object.keys(NOT_JUDGES).filter((s) => !scripts.includes(s) || judged.has(s))).toEqual([]);
});

it('proves every class that has a test with a mutant, and puts back every past fix the register names', () => {
  const withTests = CLASSES.filter((c) => !c.open_in_production && (c.methods ?? []).length);
  const proven = new Set(MUTANTS.map((m) => m.class));
  expect(withTests.filter((c) => !proven.has(c.id)).map((c) => c.id)).toEqual([]);
  const pastFixes = withTests.flatMap((c) => {
    const commits = c.source?.kind === 'history' ? (c.source.ref.match(/\b[0-9a-f]{8}\b/g) ?? []) : [];
    return commits.map((commit) => ({ id: c.id, commit }));
  });
  expect(pastFixes.length).toBeGreaterThan(1);
  const reversed = pastFixes.filter(({ id, commit }) => !MUTANTS.some((m) => m.source === 'past' && m.class === id && m.commit === commit));
  expect(reversed).toEqual([]);
});

describe('the verdicts kept (register/mutant-results.json): ids and verdicts only', () => {
  it('holds every mutant once, in the registry\'s order, each caught, by its own proof', () => {
    expect(RESULTS.map((r) => r.mutant)).toEqual(MUTANTS.map((m) => m.id));
    expect(RESULTS.filter((r) => Object.keys(r).join() !== 'class,mutant,proof,commit,verdict')).toEqual([]);
    expect(RESULTS.filter((r) => r.verdict !== 'caught').map((r) => `${r.mutant}: ${r.verdict}`)).toEqual([]);
    const wrong = RESULTS.filter((r) => {
      const m = MUTANTS.find((x) => x.id === r.mutant);
      return !m || r.class !== m.class || r.proof !== (m.source === 'judge' ? 'judge' : mutantsCjs.proofId(m, CLASSES));
    });
    expect(wrong.map((r) => r.mutant)).toEqual([]);
  });

  it('ran each at a commit this branch holds', () => {
    const commits = [...new Set(RESULTS.map((r) => r.commit))];
    const foreign = commits.filter((c) => {
      try { execFileSync('git', ['merge-base', '--is-ancestor', c, 'HEAD'], { cwd: MOBILE, stdio: 'ignore' }); return false; } catch { return true; }
    });
    expect(foreign).toEqual([]);
  });

  it('agrees with the private record of the same run, where this checkout holds it', () => {
    const dir = mutantsCjs.privateDir();
    const differ = [...new Set(RESULTS.map((r) => r.commit))].flatMap((commit) => {
      const file = dir && join(dir, 'mutants', `${commit}.json`);
      if (!file || !existsSync(file)) return [];
      const full = JSON.parse(readFileSync(file, 'utf8')) as Result[];
      return RESULTS.filter((r) => r.commit === commit).filter((r) => {
        const f = full.find((x) => x.mutant === r.mutant);
        return f && (f.verdict !== r.verdict || f.proof !== r.proof);
      }).map((r) => r.mutant);
    });
    expect(differ).toEqual([]);
  });
});

describe('the runner\'s own rules say NO', () => {
  it('runs a mutant on a push that changes what it stands on, and on no other', () => {
    const m = { id: 'shape-x', class: 'X-y', source: 'shape', edits: [{ file: 'src/a.ts', find: 'a', replace: 'b' }],
      proof: { file: 'src/__tests__/a.test.ts', test: 't' } } as Mutant;
    expect(['src/a.ts', 'src/__tests__/a.test.ts'].map((p) => mutantsCjs.standsOn(m, p))).toEqual([true, true]);
    expect(mutantsCjs.standsOn(m, 'src/b.ts')).toBe(false);
    const j = { id: 'judge-x', class: 'X-y', source: 'judge', judge: { from: 'e2e/fx/x', run: ['node', 'e2e/x.mjs'] }, edits: [{ file: 'log.txt', find: 'a', replace: 'b' }] } as Mutant;
    expect(['e2e/x.mjs', 'e2e/fx/x/log.txt', 'log.txt'].map((p) => mutantsCjs.standsOn(j, p))).toEqual([true, true, false]);
  });

  it('splits the mutants between parts so each runs in exactly one', () => {
    const parts = ['1/3', '2/3', '3/3'].map((s) => mutantsCjs.partOf(MUTANTS, s).map((m) => m.id));
    expect(parts.flat().sort()).toEqual(MUTANTS.map((m) => m.id).sort());
    expect(() => mutantsCjs.partOf(MUTANTS, '4/3')).toThrow();
  });

  it('reads the parts together, saying no to a mutant no part ran, one run twice, and one not registered', () => {
    const r = (mutant: string): Result => ({ class: 'X-y', mutant, proof: 'm1', commit: 'c', verdict: 'caught' });
    const two = [{ id: 'shape-a' }, { id: 'shape-b' }, { id: 'shape-c' }] as Mutant[];
    expect(mutantsCjs.gather([[r('shape-a'), r('shape-b')], [r('shape-c')]], two).faults).toEqual([]);
    expect(mutantsCjs.gather([[r('shape-a'), r('shape-b')], [r('shape-b'), r('shape-x')]], two).faults).toEqual([
      'shape-c: no part ran it', 'shape-b: run by more than one part', 'shape-x: not in the registry',
    ]);
  });

  it('a change whose find is not there, or there twice, is NOT-APPLIED; once, it is made', () => {
    expect(mutantsCjs.applyEdits('a\nb\n', [{ find: 'c', replace: 'd' }]).notApplied).toMatch(/^not found/);
    expect(mutantsCjs.applyEdits('a\na\n', [{ find: 'a', replace: 'd' }]).notApplied).toMatch(/^found more than once/);
    expect(mutantsCjs.applyEdits('a\r\nb\r\n', [{ find: 'a\nb', replace: 'c' }])).toEqual({ text: 'c\n' });
  });

  it('a past fix is put back by the code around it, wherever its lines now stand', () => {
    const hunks = [{ before: ['x', 'old', 'y'], after: ['x', 'new', 'y'] }];
    expect(mutantsCjs.reverse('top\nmoved\nx\nnew\ny\n', hunks)).toEqual({ text: 'top\nmoved\nx\nold\ny\n' });
    expect(mutantsCjs.reverse('x\nnewer\ny\n', hunks).notApplied).toMatch(/^not found/);
  });

  it('a flow of two YAML documents parses as one change, and a broken document of it does not', () => {
    // The runner read a flow as one document, and called every mutant in .maestro/ invalid unrun.
    const flow = (steps: string) => ({ file: '.maestro/x.yaml', path: '.maestro/x.yaml', after: `appId: a\n---\n${steps}` });
    expect(mutantsCjs.compileFaults([flow('- back\n')])).toEqual([]);
    expect(mutantsCjs.compileFaults([flow('- tapOn: [\n')])).toHaveLength(1);
  });

  it('a change of line endings alone is no change', () => {
    expect(mutantsCjs.really({ before: 'a\nb\n', after: 'a\r\nb\r\n' })).toBe(false);
    expect(mutantsCjs.really({ before: 'a\nb\n', after: 'a\nc\n' })).toBe(true);
    expect(mutantsCjs.really({ before: null, after: 'planted' })).toBe(true);
  });

  it('only the named test failing counts: another failing, or none run, does not', () => {
    const report = (results: { title: string; status: string }[]) => ({ testResults: [{ assertionResults: results }] });
    expect(mutantsCjs.statusIn(report([{ title: 'the guard', status: 'failed' }]), 'the guard')).toBe('failed');
    expect(mutantsCjs.statusIn(report([{ title: 'the guard', status: 'passed' }, { title: 'another', status: 'failed' }]), 'the guard')).toBe('passed');
    expect(mutantsCjs.statusIn(report([]), 'the guard')).toBe('missing');
    expect(mutantsCjs.statusIn({ testResults: [{ message: 'Cannot find module' }] }, 'the guard')).toBe('missing');
  });

  it('a new shape is never planted over a file that stands', () => {
    const at = relative(MOBILE, join(MOBILE, 'package.json')).split('\\').join('/');
    expect(mutantsCjs.changesOf({ id: 'shape-x', class: 'X-y', source: 'shape', plant: [{ path: at, text: '' }] }).notApplied).toMatch(/already there/);
  });

  it('a mistyped option, or one without its value, never starts the run of every mutant', () => {
    expect([[], ['--ids', 'a,b'], ['--changed', 'abc123', '--results', 'r.json', '--fresh'], ['--put-back']].map(mutantsCjs.argumentsFault))
      .toEqual([null, null, null, null]);
    expect(mutantsCjs.argumentsFault(['--help'])).toMatch(/^unknown argument --help \(the options: --ids, /);
    expect([['--ids'], ['--part', '--fresh']].map(mutantsCjs.argumentsFault)).toEqual(['--ids wants a value', '--part wants a value']);
  });

  it('puts back what a stopped run left in place, a changed file and a planted one, before anything else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'left-'));
    try {
      const changed = join(dir, 'useArrival.ts');
      const planted = join(dir, 'mutantSettle.ts');
      writeFileSync(changed, 'the mistake\n');
      writeFileSync(planted, 'planted\n');
      const placed = join(dir, '.mutant-in-place.json');
      writeFileSync(placed, JSON.stringify({ mutant: 'past-x', changes: [
        { file: 'src/hooks/useArrival.ts', path: changed, before: 'as committed\n' },
        { file: 'src/hooks/mutantSettle.ts', path: planted, before: null },
      ] }));
      expect(mutantsCjs.putBackLeftover(placed)).toEqual(['src/hooks/useArrival.ts', 'src/hooks/mutantSettle.ts']);
      expect([readFileSync(changed, 'utf8'), existsSync(planted), existsSync(placed)]).toEqual(['as committed\n', false, false]);
      expect(mutantsCjs.putBackLeftover(placed)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records each mutant in place before its files change, and removes the record only once they are put back', () => {
    const runner = readFileSync(join(MOBILE, 'scripts', 'mutants.cjs'), 'utf8');
    const write = runner.indexOf('writeFileSync(PLACED');
    expect([write > 0, write < runner.indexOf('writeFileSync(c.path, c.after)')]).toEqual([true, true]);
    expect(runner).toMatch(/restore\(changes\);\r?\n\s+unlinkSync\(PLACED\);/);
  });
});
