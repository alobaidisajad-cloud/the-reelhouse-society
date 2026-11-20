/**
 * theExplorerSaysNo.test.ts — the explorer's judges (e2e/explore.mjs) on reads and logs planted
 * here: a control a screen reader can only call "button", two words drawn over each other, words
 * off the side, a crash and a console error each found, and a named control, words apart and a
 * failed read said on a bad network passed; its walk the same for the same seed.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'explore.mjs');
/** One of the script's own values, asked in a Node of its own (jest cannot load an ES module here). */
const ask = (expression: string): unknown => {
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(await (async () => ${expression})()));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
};

/** A node: its own attributes first, so they stand over the defaults after them. */
const n = (attrs: string, inner = '') => `<node ${attrs} index="0" text="" resource-id="" class="android.view.View" content-desc="" clickable="false">${inner}</node>`;
const screen = (inner: string) => `<?xml version='1.0'?><hierarchy rotation="0">${n('bounds="[0,0][1080,2400]"', inner)}</hierarchy>`;
const kinds = (xml: string) => (ask(`m.faultsOf(${JSON.stringify(xml)}).map((f) => f.kind)`) as string[]);

it('finds a nameless control, and passes one named by its words beneath', () => {
  expect(kinds(screen(n('clickable="true" bounds="[0,100][200,200]"')))).toEqual(['NAMELESS']);
  expect(kinds(screen(n('clickable="true" bounds="[0,100][200,200]"', n('text="FILE" bounds="[10,110][190,190]"'))))).toEqual([]);
  expect(kinds(screen(n('clickable="true" content-desc="Close" bounds="[0,100][200,200]"')))).toEqual([]);
});

it('finds words drawn over each other and words off the side, and passes words apart', () => {
  expect(kinds(screen(n('text="TONIGHT" bounds="[0,100][300,150]"') + n('text="AT NINE" bounds="[20,110][320,160]"')))).toEqual(['OVERLAP']);
  expect(kinds(screen(n('text="TONIGHT" bounds="[0,100][300,150]"') + n('text="AT NINE" bounds="[0,160][300,210]"')))).toEqual([]);
  expect(kinds(screen(n('text="A TITLE TOO LONG" bounds="[900,100][1200,150]"')))).toEqual(['OFF']);
});

it('finds a crash and a console error in the log, and passes a failed read said on a bad network', () => {
  const log = [
    '11-20 10:00:00.000  1  2 E AndroidRuntime: FATAL EXCEPTION: main',
    '11-20 10:00:00.000  1  2 E AndroidRuntime: Process: com.reelhouse.society, PID: 1',
    '11-20 10:00:01.000  1  2 E ReactNativeJS: TypeError: undefined is not a function',
  ].join('\n');
  expect(ask(`m.logFaults(${JSON.stringify(log)}).map((f) => f.kind)`)).toEqual(['CRASH', 'ERROR']);
  const said = '11-20 10:00:02.000  1  2 E ReactNativeJS: [e2e] screen.failed {"name":"film"}';
  expect(ask(`m.logFaults(${JSON.stringify(said)}, { slow: true }).length`)).toBe(0);
  expect(ask(`m.logFaults(${JSON.stringify(said)}).length`)).toBe(1);
});

it('walks the same way for the same seed, tapping a control the screen holds', () => {
  const xml = screen(n('clickable="true" resource-id="film-row" bounds="[0,1100][1080,1300]"'));
  const walk = (seed: number) => ask(`(() => { const r = m.prng(${seed}); return Array.from({ length: 12 }, () => m.nextAction(r, ${JSON.stringify(xml)})); })()`) as { kind: string; at?: number[] }[];
  expect(walk(7)).toEqual(walk(7));
  expect(walk(7)).not.toEqual(walk(8));
  expect(walk(7).filter((a) => a.kind === 'tap').every((a) => JSON.stringify(a.at) === '[540,1200]')).toBe(true);
});
