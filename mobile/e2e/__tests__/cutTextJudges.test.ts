/**
 * cutTextJudges.test.ts — the cut-text judge (e2e/cut-text-judges.mjs, WORKLIST P0.86): every cut
 * the app said fails a variant's run unless the judged list names its words and cut for that
 * variant; the run's log is read whole, a cut said twice counted once. And the committed list
 * (e2e/cut-text-judged.json) is never stale: each judgement is for a variant that judges cut text,
 * says why in words, and names words the code or the seeded world still draws.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { files as universe } from '@/test-utils/universe';

const E2E = join(__dirname, '..');
const SCRIPT = join(E2E, 'cut-text-judges.mjs');
const FIXTURES = join(__dirname, 'fixtures', 'judges', 'cut-text-judges');

/** One of the script's own answers, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(${expression}));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const LOG = [
  '10-17 09:00:01.200  4321  4377 W ReactNativeJS: [e2e] text.cut {"words":"FOUNDING MEMBER","cut":"ended early","lines":1,"numberOfLines":1}',
  '10-17 09:00:01.300  4321  4377 W ReactNativeJS: [e2e] text.cut {"words":"FOUNDING MEMBER","cut":"ended early","lines":1,"numberOfLines":1}',
  '10-17 09:00:01.400  4321  4377 W ReactNativeJS: [e2e] text.cut {"words":"A {braced} review","cut":"taller than its box","lines":3,"numberOfLines":null}',
  '10-17 09:00:01.500  4321  4377 W ReactNativeJS: [e2e] text.cut {not json}',
  '10-17 09:00:01.600  4321  4377 W ReactNativeJS: [e2e] screen.ready {"name":"film","ms":900}',
].join('\r\n');

it('reads every cut the log says once, with how often, through Windows line ends and braces in the words', () => {
  expect(ask(`m.readCuts(${JSON.stringify(LOG)})`)).toEqual([
    { words: 'FOUNDING MEMBER', cut: 'ended early', times: 2 },
    { words: 'A {braced} review', cut: 'taller than its box', times: 1 },
  ]);
});

it('passes a cut judged for this variant alone, by its words and its cut', () => {
  const cuts = [{ words: 'A review', cut: 'ended early', times: 1 }];
  const judged = [{ words: 'A review', cut: 'ended early', variants: ['largest-text'], why: 'x' }];
  expect(ask(`m.judge(${JSON.stringify(cuts)}, ${JSON.stringify(judged)}, 'largest-text')`)).toEqual([]);
  expect(ask(`m.judge(${JSON.stringify(cuts)}, ${JSON.stringify(judged)}, 'bold-text')`)).toEqual(['"A review" ended early (said 1 time)']);
  const otherCut = [{ words: 'A review', cut: 'wider than its box', times: 3 }];
  expect(ask(`m.judge(${JSON.stringify(otherCut)}, ${JSON.stringify(judged)}, 'largest-text')`)).toEqual(['"A review" wider than its box (said 3 times)']);
});

it('passes the judged log and fails it for a variant it is not judged in, by exit code', () => {
  const at = (v: string) => run(join(FIXTURES, 'logcat.txt'), '--judged', join(FIXTURES, 'judged.json'), '--variant', v);
  expect(at('largest-text').status).toBe(0);
  const bold = at('bold-text');
  expect(bold.status).toBe(1);
  expect(bold.stdout).toContain('✗ "Spirited Away: the whole of a long review the member wrote" ended early (said 2 times)');
});

it('cannot be run on nothing: no log, no judged list, or no variant is exit 2', () => {
  expect(run().status).toBe(2);
  expect(run(join(FIXTURES, 'logcat.txt'), '--judged', join(FIXTURES, 'judged.json')).status).toBe(2);
  expect(run(join(FIXTURES, 'nothing.txt'), '--judged', join(FIXTURES, 'judged.json'), '--variant', 'bold-text').status).toBe(2);
});

describe('the committed judged list (e2e/cut-text-judged.json)', () => {
  interface Judged { words: string; cut: string; variants: string[]; why: string }
  const judged = (JSON.parse(readFileSync(join(E2E, 'cut-text-judged.json'), 'utf8')) as { cuts: Judged[] }).cuts;
  const variants = (JSON.parse(readFileSync(join(E2E, 'variants.json'), 'utf8')) as { variants: Record<string, { judges?: string[] }> }).variants;
  const judging = Object.keys(variants).filter((n) => variants[n]?.judges?.includes('cut-text'));

  /**
   * Everything the words of a judgement may still be drawn from: the app's code and data (the
   * shared file list), the seed's words, and the recorded TMDB answers, by their own index.
   */
  const drawn = (() => {
    const fixtures = join(E2E, 'supabase', 'functions', 'tmdb-proxy', 'fixtures');
    const recorded = Object.values(JSON.parse(readFileSync(join(fixtures, 'index.json'), 'utf8')) as Record<string, string>);
    const paths = [...universe(['appCode', 'appData']), join(E2E, 'db', 'seed.mjs'), ...recorded.map((f) => join(fixtures, f))];
    return paths.map((p) => readFileSync(p, 'utf8')).join('\n').toLowerCase();
  })();

  it('is judged in the variants that judge cut text, and only those', () => {
    expect(judging).toEqual(['largest-text', 'bold-text']);
    expect(judged.filter((j) => j.variants.length === 0 || j.variants.some((v) => !judging.includes(v)))).toEqual([]);
  });

  it('says why each cut is the design, in words, and names a cut cutOf can say', () => {
    expect(judged.filter((j) => j.why.length < 30)).toEqual([]);
    expect(judged.filter((j) => !['ended early', 'wider than its box', 'taller than its box'].includes(j.cut))).toEqual([]);
  });

  it('names only words the code or the seeded world still draws: no judgement outlives its label', () => {
    expect(drawn.length).toBeGreaterThan(100_000);
    expect(judged.filter((j) => !drawn.includes(j.words.toLowerCase()))).toEqual([]);
  });
});
