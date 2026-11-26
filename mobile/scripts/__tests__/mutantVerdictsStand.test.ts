/**
 * mutantVerdictsStand.test.ts — scripts/mutants.cjs keeps a recorded verdict where it still stands, and
 * only there: a branch merged (history kept) brings its verdicts with it, and the mutants run again are
 * only those whose files the merge changed. A private mutant runs only where its own work is; a run
 * that died keeps its own error's words.
 */
type R = { class: string; mutant: string; proof: string | null; commit: string; verdict: string };
type M = { id: string; class: string; source: string; edits?: { file: string; find: string; replace: string }[]; proof?: { file: string; test: string }; since?: string };
type Ctx = { inHistory: (c: string) => boolean; changedSince: (c: string) => string[]; entryAt: (c: string, id: string) => M | undefined; recordAt: (c: string) => { mutant: string; verdict: string }[] | null; proofNow?: (m: M) => string | null | undefined };
const mutants = require('../mutants.cjs') as {
  whyNotStanding: (m: M, r: R | undefined, ctx: Ctx) => string | null;
  mergeResults: (ours: R[], theirs: R[], all: M[], whyNot: (m: M, r: R) => string | null, later?: (a: R, b: R) => boolean) => R[];
  privateHalf: (entries: M[], inHistory: (c: string) => boolean) => { kept: M[]; aside: M[]; bare: M[] };
  bareRefusal: (bare: M[]) => string | null;
  errorWords: (text: string, head?: string) => string;
};

const m: M = { id: 'shape-x', class: 'X-y', source: 'shape', edits: [{ file: 'src/a.ts', find: 'a', replace: 'b' }], proof: { file: 'src/__tests__/a.test.ts', test: 't' } };
const r = (commit: string, verdict = 'caught'): R => ({ class: 'X-y', mutant: 'shape-x', proof: 'm1', commit, verdict });
/** The history of a merged branch: its run at b1 is in it, src/b.ts changed since, the runner not. */
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  inHistory: (c) => c === 'b1',
  changedSince: () => ['src/b.ts', 'register/mutant-results.json'],
  entryAt: () => ({ ...m }),
  recordAt: () => [{ mutant: 'shape-x', verdict: 'caught' }],
  ...over,
});

it('a recorded verdict stands only where its run is in this history and nothing it stands on, nor the runner, changed since', () => {
  expect(mutants.whyNotStanding(m, r('b1'), ctx())).toBeNull();
  expect([
    mutants.whyNotStanding(m, undefined, ctx()),
    mutants.whyNotStanding(m, r('b1', 'survived'), ctx()),
    // A rebase writes new commits: the one it ran at is no longer in the history.
    mutants.whyNotStanding(m, r('a9'), ctx()),
    mutants.whyNotStanding(m, r('b1'), ctx({ changedSince: () => ['src/a.ts'] })),
    mutants.whyNotStanding(m, r('b1'), ctx({ changedSince: () => ['src/__tests__/a.test.ts'] })),
    mutants.whyNotStanding(m, r('b1'), ctx({ changedSince: () => ['scripts/mutants.cjs'] })),
    mutants.whyNotStanding(m, r('b1'), ctx({ entryAt: () => ({ ...m, edits: [{ file: 'src/a.ts', find: 'a', replace: 'c' }] }) })),
    // A verdict written into the results by hand stands on no run.
    mutants.whyNotStanding(m, r('b1'), ctx({ recordAt: () => null })),
    // Its proof is another test now (its title changed in its class): recorded as m1, it is m2 now.
    mutants.whyNotStanding(m, r('b1'), ctx({ proofNow: () => 'm2' })),
  ]).toEqual([
    'no verdict recorded', 'recorded survived', 'run at a9, which is not in this history', 'src/a.ts changed since its run',
    'src/__tests__/a.test.ts changed since its run', 'the runner changed since its run', 'its entry changed since its run',
    'no private record of its run on this machine', 'its proof is m2 now, recorded as m1',
  ]);
  expect(mutants.whyNotStanding(m, r('b1'), ctx({ proofNow: () => 'm1' }))).toBeNull();
});

it('a proof is known by its test, not its place: a method inserted before it keeps every recorded verdict its own', () => {
  const ids = require('../mutants.cjs') as { proofId: (x: M, classes: { id: string; methods: { file: string; test: string }[] }[]) => string | null };
  const own = { file: 'src/__tests__/a.test.ts', test: 't' };
  const other = { file: 'src/__tests__/b.test.ts', test: 'u' };
  const before = ids.proofId(m, [{ id: 'X-y', methods: [own] }]);
  // Inserted mid-list (nightly 45829548435: shape-picker-lets-the-first-tap-go's recorded proof id became another place's).
  expect(ids.proofId(m, [{ id: 'X-y', methods: [other, own] }])).toBe(before);
  expect(before).toMatch(/^p[0-9a-f]{12}$/);
  // Its test, and its class's: another test is another id, and a test its class does not hold has none.
  expect(ids.proofId({ ...m, proof: other }, [{ id: 'X-y', methods: [other, own] }])).not.toBe(before);
  expect(ids.proofId(m, [{ id: 'X-y', methods: [other] }])).toBeNull();
  expect(ids.proofId(m, [{ id: 'Z-z', methods: [own] }])).toBeNull();
  // Ids only: the test's words never leave in it.
  expect(before).not.toContain('a.test');
});

it('a merge keeps the verdict that stands on the merged files, else the later run, and leaves out a mutant neither side ran', () => {
  const all: M[] = [m, { ...m, id: 'shape-z' }, { ...m, id: 'shape-new' }];
  const z = (commit: string): R => ({ ...r(commit), mutant: 'shape-z' });
  const stands = (only: string) => (_: M, x: R) => (x.commit === only ? null : 'moved');
  expect(mutants.mergeResults([r('main1'), z('main1')], [r('b1'), z('b1')], all, stands('b1'))).toEqual([r('b1'), z('b1')]);
  expect(mutants.mergeResults([r('main1')], [r('b1')], all, stands('main1')).map((x) => x.commit)).toEqual(['main1']);
  // Neither stands: the later run of the two (the one whose history holds the other's), else ours.
  const later = (a: R, b: R) => a.commit === 'b1' && b.commit === 'main1';
  expect(mutants.mergeResults([r('main1')], [r('b1')], all, stands('none'), later).map((x) => x.commit)).toEqual(['b1']);
  expect(mutants.mergeResults([r('main1')], [r('b1')], all, stands('none')).map((x) => x.commit)).toEqual(['main1']);
});

it('runs a private mutant only where the commit it names is in HEAD\'s history, and refuses one that names none', () => {
  const p = (id: string, since?: string): M => ({ ...m, id, since });
  const half = mutants.privateHalf([p('shape-here', 'aaaaaaa1'), p('shape-unpushed', 'bbbbbbb2'), p('shape-bare')], (c) => c === 'aaaaaaa1');
  expect([half.kept.map((x) => x.id), half.aside.map((x) => x.id), half.bare.map((x) => x.id)]).toEqual([['shape-here'], ['shape-unpushed'], ['shape-bare']]);
  expect(mutants.bareRefusal(half.bare)).toMatch(/^a mutants run refused: mutants\.private\.yaml's shape-bare names no since: <commit>/);
  expect(mutants.bareRefusal([])).toBeNull();
});

it('keeps a dead run\'s own error, not the tail of its stack', () => {
  const stack = Array.from({ length: 60 }, (_, i) => `    at frame${i} (node:internal/x:${i})`);
  const died = ['Determining test suites to run...', '<--- Last few GCs --->', 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', ...stack].join('\n');
  const said = mutants.errorWords(died, 'exit 134: ');
  expect(said.startsWith('exit 134: FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory')).toBe(true);
  expect(said).toContain('frame59');
  expect(said.length).toBeLessThanOrEqual(4002);
  // No line names an error: its last fifteen lines.
  expect(mutants.errorWords(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')).split(' / ')).toEqual(Array.from({ length: 15 }, (_, i) => `line ${i + 15}`));
});
