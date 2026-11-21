/**
 * finishTools.test.ts — the finish rubric's tools say NO to what they exist to catch, and nothing
 * to a clean page: a space off the house rhythm (rhythm.cjs), an icon off its ladder (icons.cjs), a
 * move whose motion nobody chose (transitions.cjs), a 2pt shift of an edge or a baseline (align.cjs,
 * nearMisses), a state drawn with no picture (inventory.cjs), each count held by its record
 * (source.cjs, ratchet). Then the app's own counts against the record, so none can rise.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const source = require('../source.cjs');
const rhythm = require('../rhythm.cjs');
const icons = require('../icons.cjs');
const transitions = require('../transitions.cjs');
const align = require('../align.cjs');
const inventory = require('../inventory.cjs');

const TOOLS = join(__dirname, '..');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'finish-tools-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
/** A file of planted code, parsed as the tools parse the app's. */
const planted = (name: string, text: string) => source.parse(join(dir, name), text);
const THEME = () => planted('theme.ts', 'export const spacing = { xs: 4, sm: 8, md: 16 } as const;');

describe('rhythm.cjs', () => {
  it('reads the rhythm from the spacing tokens, and catches a space off it', () => {
    const r = rhythm.rhythmOf(THEME());
    expect(r.step).toBe(4);
    const m = rhythm.measure([planted('Card.tsx', [
      'const s = StyleSheet.create({',
      '  card: { padding: 16, marginTop: -8, gap: spacing.sm, paddingLeft: x * 2 },',
      '  label: { marginBottom: 6 },',
      '});',
    ].join('\n'))], r);
    expect(m.totals).toMatchObject({ on: 2, token: 1, computed: 1, off: 1, half: 1 });
    expect(Object.values(m.files)).toEqual([expect.objectContaining({ off: 1, offs: ['3 marginBottom: 6'] })]);
  });

  it('refuses a theme with no spacing tokens: no rhythm, no measure', () => {
    expect(() => rhythm.rhythmOf(planted('theme.ts', 'export const colors = { ink: 1 };'))).toThrow(/no spacing tokens/);
  });
});

describe('icons.cjs', () => {
  const ladder = { sizes: [12, 16, 24], line: { min: 1, max: 1.5 } };
  it('catches an icon off the ladder by its size or by the line it draws, and passes one on it', () => {
    const m = icons.measure([planted('Row.tsx', [
      "import { Mail, X } from 'lucide-react-native';",
      'export const Row = ({ Icon }) => (<>',
      '  <Mail size={16} strokeWidth={1.5} />',
      '  <X size={13} strokeWidth={2} />',
      '  <Mail size={12} strokeWidth={1.5} />',
      '  <Icon size={24} />',
      '</>);',
    ].join('\n'))], ladder);
    const [file] = Object.values(m.files) as { icons: number; off: number; offs: string[] }[];
    expect(file?.icons).toBe(4);
    expect(file?.offs).toEqual([
      '4 <X>: size 13 is not on the ladder (12, 16, 24)',
      '5 <Mail>: its line draws 0.75pt, outside 1–1.5pt',
      '6 <Icon>: its line draws 2pt, outside 1–1.5pt',
    ]);
  });
});

describe('transitions.cjs', () => {
  it('names a navigator and a sheet whose motion nobody chose, and passes the ones that chose', () => {
    const layout = planted('_layout.tsx', [
      "<Stack screenOptions={{ animation: 'none' }}>",
      "  <Stack.Screen name=\"film/[id]\" options={{ animation: 'fade' }} />",
      '</Stack>',
    ].join('\n'));
    const bare = planted('bare_layout.tsx', '<Tabs screenOptions={{ headerShown: false }}><Tabs.Screen name="a" /></Tabs>');
    expect(transitions.navigatorsOf(layout)).toEqual([{ kind: 'Stack', line: 1, motion: 'none', screens: { 'film/[id]': { motion: 'fade', line: 2 } } }]);
    expect(transitions.navigatorsOf(bare)[0].motion).toBeUndefined();
    const sheet = planted('Sheet.tsx', '<><Modal visible animationType="fade" /><Modal visible /></>');
    const m = transitions.measure([], [sheet]);
    expect(m.sheets.map((s: { motion: string | null }) => s.motion)).toEqual(['fade', null]);
    expect(Object.values(m.files)).toEqual([{ off: 1, offs: [expect.stringMatching(/^1 <Modal>: no animationType/)] }]);
  });

  it('names each route by the navigator above it', () => {
    expect(transitions.routeNames(['app/_layout.tsx', 'app/film/[id].tsx', 'app/(tabs)/_layout.tsx', 'app/(tabs)/darkroom.tsx'])).toEqual([
      { route: 'app/film/[id].tsx', layout: 'app/_layout.tsx', name: 'film/[id]' },
      { route: 'app/(tabs)/darkroom.tsx', layout: 'app/(tabs)/_layout.tsx', name: 'darkroom' },
      { route: 'app/(tabs)/_layout.tsx', layout: 'app/_layout.tsx', name: '(tabs)' },
    ]);
  });
});

describe('align.cjs', () => {
  it('loads where no browser is installed, as in CI\'s jest job: the harness is opened by its run alone', () => {
    // In a node of its own, where playwright cannot be found (jest's registry already holds this file's own load).
    const loadsWithoutABrowser = (tool: string) => spawnSync(process.execPath, ['-e', [
      "const M = require('module'); const r = M._resolveFilename;",
      "M._resolveFilename = function (q, ...a) { if (/[\\\\/]node_modules[\\\\/]playwright$|^playwright$/.test(q)) throw new Error('no playwright here'); return r.call(this, q, ...a); };",
      `require(${JSON.stringify(join(TOOLS, tool))}); console.log('LOADED');`,
    ].join('\n')], { encoding: 'utf8' }).stdout.trim();
    expect(loadsWithoutABrowser('align.cjs')).toBe('LOADED');
    expect(loadsWithoutABrowser('harness.cjs')).toBe('');
  });
  const text =(left: number, top: number, extra: Partial<{ right: number; baseline: number; align: string }> = {}) =>
    ({ left, right: extra.right ?? left + 80, top, bottom: top + 18, baseline: extra.baseline ?? top + 14, align: extra.align ?? 'left', site: 'src/x/Card.tsx:3', said: 'words' });
  it('catches two stacked edges 2pt apart, and a row\'s baselines 2pt apart', () => {
    expect(align.nearMisses([text(20, 100), text(22, 120)]).map((f: { kind: string; by: string }) => [f.kind, f.by])).toEqual([['EDGE', 'left edges 2.0pt apart']]);
    expect(align.nearMisses([text(20, 100), text(120, 102, { baseline: 116 })]).map((f: { kind: string }) => f.kind)).toEqual(['BASELINE']);
  });
  it('passes edges that line up, edges set clearly apart, and what the phone\'s own snapping moves', () => {
    expect(align.nearMisses([text(20, 100), text(20, 120)])).toEqual([]);
    expect(align.nearMisses([text(20, 100), text(32, 120)])).toEqual([]);
    expect(align.nearMisses([text(20, 100), text(20.3, 120)])).toEqual([]);
    expect(align.nearMisses([text(20, 100), text(22, 300)])).toEqual([]);
  });
});

describe('inventory.cjs', () => {
  it('reads a route\'s states from its code, and gives each state every size, platform and mode', () => {
    const route = planted('films.tsx', [
      "import { TryAgain } from './TryAgain';",
      'export default function Films() {',
      "  const ready = useScreenReady('films', state);",
      '  if (isError) return <TryAgain />;',
      '  return <TextInput />;',
      '}',
    ].join('\n'));
    const states = inventory.statesOf(route, () => { throw new Error('no import should be read: none resolves'); });
    expect(Object.keys(states)).toEqual(['shown', 'loading', 'failed', 'keyboard']);
    const cells = inventory.cellsOf([{ route: 'app/films.tsx', states }], [320, 390]);
    expect(cells).toHaveLength(4 * 2 * inventory.PLATFORMS.length * inventory.MODES.length);
    expect(cells[0]).toMatchObject({ id: 'app/films.tsx|shown|320|android|normal', picture: 'mockups/out/inventory/android/normal/320/films--shown.png' });
  });

  it('refuses a blank cell: no result, no picture, a picture that is not there, no score', () => {
    const cell = { id: 'a' };
    const there = (p: string) => p === 'there.png';
    expect(inventory.blankWhy(cell, undefined, there)).toBe('no result');
    expect(inventory.blankWhy(cell, { rubric: { passed: true } }, there)).toBe('no picture');
    expect(inventory.blankWhy(cell, { picture: 'gone.png', rubric: { passed: true } }, there)).toMatch(/is not there/);
    expect(inventory.blankWhy(cell, { picture: 'there.png' }, there)).toBe('no finish score');
    expect(inventory.blankWhy(cell, { moved: 'too short' }, there)).toBe('no picture');
    expect(inventory.blankWhy(cell, { picture: 'there.png', rubric: { passed: false } }, there)).toBeNull();
    expect(inventory.blankWhy(cell, { moved: 'iPhone table row 4: open the film page at the largest text, read the title' }, there)).toBeNull();
  });

  it('fails the check, naming the blanks, until every cell is filled', () => {
    const r = spawnSync(process.execPath, [join(TOOLS, 'inventory.cjs'), '--check', '--results', join(dir, 'none.json')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^Blank cells \(\d+\), by route and state:/);
    expect(r.stdout).toMatch(/36 routes|\d+ routes, \d+ route states/);
  });
});

describe('the record (source.cjs, ratchet)', () => {
  const files = { 'a.tsx': { off: 2, offs: ['1 x', '2 y'] }, 'b.tsx': { off: 1, offs: ['3 z'] } };
  it('names a file over its count, a file the record lacks, and a file under it', () => {
    expect(source.judgeAgainst(files, { 'a.tsx': 1, 'b.tsx': 1 }).rose).toEqual([expect.stringMatching(/^a\.tsx: 2 faults, the record allows 1/)]);
    expect(source.judgeAgainst(files, { 'a.tsx': 2 }).rose).toEqual([expect.stringMatching(/^b\.tsx: 1 faults, the record allows 0/)]);
    expect(source.judgeAgainst(files, { 'a.tsx': 3, 'b.tsx': 1 }).fell).toEqual(['a.tsx']);
  });
  it('fails --check on a rise and on a fall, and --lower never raises a count', () => {
    const record = join(dir, 'record.json');
    writeFileSync(record, JSON.stringify({ t: { 'a.tsx': 1 } }));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const said = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(source.ratchet('t', files, ['--check'], 'faults', record)).toBe(1);
    expect(source.ratchet('t', files, ['--lower'], 'faults', record)).toBe(0);
    expect(JSON.parse(readFileSync(record, 'utf8')).t).toEqual({ 'a.tsx': 1, 'b.tsx': 1 });
    expect(source.ratchet('t', { 'a.tsx': { off: 0, offs: [] } }, ['--check'], 'faults', record)).toBe(1);
    quiet.mockRestore();
    said.mockRestore();
  });
});

describe("the app's own counts, held by mockups/finish-record.json", () => {
  for (const tool of ['rhythm.cjs', 'icons.cjs', 'transitions.cjs']) {
    it(`${tool}: no file holds more than its record, and none fewer`, () => {
      const r = spawnSync(process.execPath, [join(TOOLS, tool), '--check'], { encoding: 'utf8' });
      expect(`${r.stderr}`.trim()).toBe('');
      expect(r.status).toBe(0);
    });
  }
});
