/**
 * weightedSequencer.test.ts — CI's split run divides the files by their measured time, the same way on
 * every machine, each file in exactly one part (test-utils/weightedSequencer.js), and the weights come
 * from the runs' own records (scripts/test-weights.cjs).
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
type Item = { key: string; weight: number };
type Part = { load: number; items: Item[] };
const Sequencer = require('../weightedSequencer') as {
  new (): { shard: (tests: unknown[], o: { shardIndex: number; shardCount: number }) => { path: string }[] };
  split: (items: Item[], count: number) => Part[];
  weighed: (tests: unknown[], table: Record<string, number>) => Item[];
  median: (table: Record<string, number>) => number;
  kindOf: (env: Record<string, string | undefined>) => string;
};
const weights = require('../../scripts/test-weights.cjs') as {
  weigh: (records: object[], root: string) => Record<string, number>;
  outOfBalance: (loads: number[]) => boolean;
  withKind: (table: object, kind: string, w: Record<string, number>) => string;
};

/** Four heavy files and forty light ones: the heavy ones are what jest's equal counts leave together. */
const ITEMS: Item[] = [
  ...['a', 'b', 'c', 'd'].map((k) => ({ key: `gen/zz-${k}.gen.test.tsx`, weight: 300 })),
  ...Array.from({ length: 40 }, (_, i) => ({ key: `src/t${String(i).padStart(2, '0')}.test.ts`, weight: 10 + (i % 7) })),
];
const loads = (parts: Part[]) => parts.map((p) => p.load);

describe('the split', () => {
  const parts = Sequencer.split(ITEMS, 4);

  it('puts every file in exactly one part', () => {
    const placed = parts.flatMap((p) => p.items.map((i) => i.key)).sort();
    expect(placed).toEqual(ITEMS.map((i) => i.key).sort());
  });

  it('gives each part one heavy file, and the parts within a light file of each other', () => {
    expect(parts.map((p) => p.items.filter((i) => i.weight === 300).length)).toEqual([1, 1, 1, 1]);
    expect(Math.max(...loads(parts)) - Math.min(...loads(parts))).toBeLessThanOrEqual(16);
  });

  it('is the same split whatever order the files come in', () => {
    const again = Sequencer.split([...ITEMS].reverse(), 4);
    expect(again.map((p) => p.items.map((i) => i.key))).toEqual(parts.map((p) => p.items.map((i) => i.key)));
  });

  it("balances where jest's own split by equal counts does not", () => {
    // Equal counts in path order, as a hash order can fall: two heavy files in one part.
    const byCount = [0, 1, 2, 3].map((k) => [ITEMS[k * 2], ITEMS[k * 2 + 1], ...ITEMS.slice(8 + k * 9, 17 + k * 9)].filter((x): x is Item => !!x)
      .reduce((s, i) => s + i.weight, 0));
    expect(weights.outOfBalance(byCount)).toBe(true);
    expect(weights.outOfBalance(loads(parts))).toBe(false);
  });
});

describe('the sequencer, as jest calls it', () => {
  const tests = ITEMS.map((i) => ({ path: join(MOBILE, i.key), context: { config: { rootDir: MOBILE } } }));

  it('hands each part its own files, every file once over the parts', () => {
    const sequencer = new Sequencer();
    const got = [1, 2, 3, 4].flatMap((shardIndex) => sequencer.shard(tests, { shardIndex, shardCount: 4 }).map((t) => t.path));
    expect(got.sort()).toEqual(tests.map((t) => t.path).sort());
  });

  it('reads the captures table when every screen is drawn, the plain one otherwise', () => {
    expect([Sequencer.kindOf({ MOCKUPS_CAPTURE: '1' }), Sequencer.kindOf({}), Sequencer.kindOf({ MOCKUPS_CAPTURE: '0' })]).toEqual(['captures', 'plain', 'plain']);
  });

  it("weighs each file as its table says, by its path under jest's root, and one the table does not hold as the table's median", () => {
    expect([Sequencer.median({ a: 1, b: 5, c: 9 }), Sequencer.median({})]).toEqual([5, 1]);
    const table = { 'gen/zz-a.gen.test.tsx': 300, 'src/t00.test.ts': 10, 'src/t01.test.ts': 12 };
    expect(Sequencer.weighed(tests.slice(0, 6), table).map((w) => [w.key, w.weight]))
      .toEqual([['gen/zz-a.gen.test.tsx', 300], ['gen/zz-b.gen.test.tsx', 12], ['gen/zz-c.gen.test.tsx', 12], ['gen/zz-d.gen.test.tsx', 12], ['src/t00.test.ts', 10], ['src/t01.test.ts', 12]]);
  });

  it('is the sequencer jest runs, with a table of each kind beside it', () => {
    expect(require(join(MOBILE, 'jest.config.js')).testSequencer).toBe('<rootDir>/test-utils/weightedSequencer.js');
    const table = JSON.parse(readFileSync(join(MOBILE, 'test-utils', 'test-weights.json'), 'utf8'));
    expect([typeof table.captures, typeof table.plain]).toEqual(['object', 'object']);
  });
});

describe('the weights, from the runs\' records', () => {
  const record = (files: [string, number][]) => ({ testResults: files.map(([f, s]) => ({ name: join(MOBILE, f), startTime: 1000, endTime: 1000 + s * 1000 })) });

  it("sums a file's seconds over every record that ran it, to a tenth", () => {
    expect(weights.weigh([record([['a.test.ts', 1.234], ['b.test.ts', 2]]), record([['a.test.ts', 1]])], MOBILE)).toEqual({ 'a.test.ts': 2.2, 'b.test.ts': 2 });
  });

  it("replaces its own kind's table and keeps the other", () => {
    const out = JSON.parse(weights.withKind({ captures: { x: 1 }, plain: { y: 2 } }, 'plain', { z: 3 }));
    expect([out.captures, out.plain]).toEqual([{ x: 1 }, { z: 3 }]);
  });

  it('as the together-job runs it: each part\'s seconds, a warning out of balance, and the table written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weights-'));
    try {
      const parts: [string, number][][] = [[['p1.test.ts', 100]], [['p2.test.ts', 400]]];
      parts.forEach((files, i) => {
        mkdirSync(join(dir, `captures-part-${i + 1}`), { recursive: true });
        writeFileSync(join(dir, `captures-part-${i + 1}`, 'capture-run.json'), JSON.stringify(record(files)));
      });
      const out = join(dir, 'test-weights.json');
      const r = spawnSync(process.execPath, [join(MOBILE, 'scripts', 'test-weights.cjs'), '--kind', 'captures', '--parts-dir', dir,
        '--name', 'captures-part-{i}', '--shards', '2', '--runs', 'capture-run.json', '--out', out], { cwd: MOBILE, encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('| 1 | 100 | 400 |\n| 2 | 400 | 100 |');
      expect(r.stdout).toMatch(/::warning title=The captures parts are out of balance::/);
      expect(JSON.parse(readFileSync(out, 'utf8')).captures).toEqual({ 'p1.test.ts': 100, 'p2.test.ts': 400 });
      const missing = spawnSync(process.execPath, [join(MOBILE, 'scripts', 'test-weights.cjs'), '--kind', 'captures', '--parts-dir', dir,
        '--name', 'captures-part-{i}', '--shards', '3', '--runs', 'capture-run.json'], { cwd: MOBILE, encoding: 'utf8' });
      expect([missing.status, missing.stderr]).toEqual([2, expect.stringContaining('part 3 kept no record')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
