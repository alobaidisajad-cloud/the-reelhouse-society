/**
 * theListsAndTheWeights.test.ts — the tools that list what a member sees and weigh what they
 * download, each shown what it must catch: every sentence with its state
 * (mockups/tools/sentences.cjs), every repeated part, button look and toast
 * (mockups/tools/repeated-elements.cjs), every part of the download and a byte grown without a
 * reason (download-size.cjs), every picture shipped and size asked (mockups/tools/image-weight.cjs).
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { crc32 } from 'zlib';

const source = require('../../mockups/tools/source.cjs');
const sentences = require('../../mockups/tools/sentences.cjs');
const repeated = require('../../mockups/tools/repeated-elements.cjs');
const download = require('../download-size.cjs');
const images = require('../../mockups/tools/image-weight.cjs');

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lists-weights-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const planted = (name: string, text: string) => source.parse(join(dir, name), text);

describe('sentences.cjs', () => {
  // Parsed from text alone: the file is never written, so it needs no folder of its own.
  const screen = source.parse(join(tmpdir(), 'Films.tsx'), [
    "import { Alert } from 'react-native';",
    'export function Films({ isError, busy }) {',
    "  if (isError) return <Text>The archive could not be read.</Text>;",
    '  const onLeave = () => Alert.alert(\'Depart?\', \'Your words stay.\', [{ text: \'DEPART\' }]);',
    "  reelToast.error('The house did not answer.');",
    '  return (',
    '    <View testID="films-root" style={s.root}>',
    "      <Text accessibilityLabel=\"The programme\">{busy ? 'FILING…' : 'FILE'}</Text>",
    "      <Icon name=\"moveUp\" d=\"M12 4l8 8\" />",
    '    </View>',
    '  );',
    '}',
    "const copy = { title: 'Tonight at the house', key: 'film-row' };",
  ].join('\n'));
  const got = sentences.sentencesOf(screen).map((s: { words: string; kind: string; state: string }) => [s.words, s.kind, s.state]);

  it('lists words between tags, a child\'s strings, shown props, alerts, toasts and shown keys', () => {
    expect(got).toEqual(expect.arrayContaining([
      ['The archive could not be read.', 'text', 'failed'],
      ['Depart?', 'call:Alert.alert', 'shown'],
      ['Your words stay.', 'call:Alert.alert', 'shown'],
      ['DEPART', 'call:Alert.alert', 'shown'],
      ['The house did not answer.', 'call:reelToast.error', 'shown'],
      ['The programme', 'prop:accessibilityLabel', 'shown'],
      ['FILING…', 'child', 'shown'],
      ['FILE', 'child', 'shown'],
      ['Tonight at the house', 'key:title', 'shown'],
    ]));
  });

  it('leaves out what steers the code: ids, styles, a drawing\'s path, an identifier, a key', () => {
    const words = got.map(([w]: string[]) => w);
    for (const never of ['films-root', 'moveUp', 'M12 4l8 8', 'film-row']) expect(words).not.toContain(never);
  });

  it('says one word by its look: words count, code does not', () => {
    expect(sentences.isWords('Sci-Fi')).toBe(true);
    expect(sentences.isWords('SIGN OUT')).toBe(true);
    expect(sentences.isWords('memory-disk')).toBe(false);
    expect(sentences.isWords('wayOut')).toBe(false);
    expect(sentences.isWords('#B8891A')).toBe(false);
  });
});

describe('repeated-elements.cjs', () => {
  it('lists a part drawn from two files, groups buttons by their look, and finds each toast', () => {
    writeFileSync(join(dir, 'EmptyState.tsx'), 'export const EmptyState = () => null;');
    const a = planted('A.tsx', [
      "import { EmptyState } from './EmptyState';",
      'const s = StyleSheet.create({ label: { fontSize: 11, letterSpacing: 3 }, btn: { borderWidth: 1, minHeight: 48 } });',
      'export const A = () => (<>',
      '  <EmptyState title="Nothing here" />',
      '  <PressableScale style={s.btn}><Text style={s.label}>LOG A FILM</Text></PressableScale>',
      '</>);',
      "reelToast.error('The house did not answer.');",
    ].join('\n'));
    const b = planted('B.tsx', [
      "import { EmptyState } from './EmptyState';",
      'const s = StyleSheet.create({ label: { fontSize: 11, letterSpacing: 3 }, btn: { borderWidth: 1, minHeight: 48 } });',
      'export const B = () => (<>',
      '  <EmptyState title="No stacks yet" />',
      '  <PressableScale style={s.btn}><Text style={s.label}>CLEAR FILTERS</Text></PressableScale>',
      '  <PressableScale><Text style={{ fontSize: 10 }}>CLOSE</Text></PressableScale>',
      '</>);',
    ].join('\n'));
    const t = repeated.table([a, b]);
    expect(t.parts).toEqual([expect.objectContaining({ kind: 'empty', files: 2, uses: [expect.objectContaining({ props: 'title="Nothing here"' }), expect.objectContaining({ props: 'title="No stacks yet"' })] })]);
    expect(t.buttons.map((g: { uses: { words: string }[] }) => g.uses.map((u) => u.words))).toEqual([['LOG A FILM', 'CLEAR FILTERS'], ['CLOSE']]);
    expect(t.toasts).toEqual([expect.objectContaining({ kind: 'error', said: 'The house did not answer.' })]);
  });

  it('gathers a page\'s elements of one part into the places it is drawn', () => {
    const r = (left: number, top: number, w = 40, h = 20) => ({ left, top, right: left + w, bottom: top + h });
    expect(repeated.placesOf([r(10, 10), r(52, 12), r(10, 300)])).toEqual([r(10, 10, 82, 22), r(10, 300)]);
  });
});

/** A zip of stored entries, as an APK's central directory lays them out. */
function zipOf(entries: [string, number][]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, size] of entries) {
    const data = Buffer.alloc(size, 7);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + size;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe('download-size.cjs', () => {
  const APK = (dex = 100) => zipOf([['classes.dex', dex], ['classes2.dex', 50], ['lib/x86_64/libhermes.so', 400], ['assets/index.android.bundle', 300], ['assets/fonts/rye.ttf', 20], ['res/a.xml', 10], ['resources.arsc', 5], ['AndroidManifest.xml', 3]]);
  it('reads the APK as a zip, part by part', () => {
    writeFileSync(join(dir, 'app.apk'), APK());
    const m = download.measure({ apk: join(dir, 'app.apk') });
    expect(m.parts).toMatchObject({ 'apk:dex': 150, 'apk:lib/x86_64': 400, 'apk:bundle': 300, 'apk:assets': 20, 'apk:resources': 15, 'apk:other': 3 });
    expect(m.total).toBe(readFileSync(join(dir, 'app.apk')).length);
  });

  it('fails a part one byte larger than its record, and records it only with a reason, in the ledger', () => {
    const record = join(dir, 'record.json');
    const run = (apk: Buffer, ...args: string[]) => {
      writeFileSync(join(dir, 'app.apk'), apk);
      return spawnSync(process.execPath, [join(__dirname, '..', 'download-size.cjs'), '--apk', join(dir, 'app.apk'), '--record', record, ...args], { encoding: 'utf8' });
    };
    writeFileSync(record, JSON.stringify({ parts: {}, ledger: [] }));
    expect(run(APK(), '--check').status).toBe(1);
    expect(run(APK(), '--accept', 'short').status).toBe(2);
    expect(run(APK(), '--accept', 'the first record of the release APK, measured on CI').status).toBe(0);
    expect(run(APK(), '--check').status).toBe(0);
    const grown = run(APK(101), '--check');
    expect(grown.status).toBe(1);
    expect(grown.stderr).toMatch(/apk:dex: 150 → 151 \(\+1 bytes\)/);
    expect(run(APK(101), '--accept', 'a planted byte, accepted with its reason').status).toBe(0);
    const ledger = JSON.parse(readFileSync(record, 'utf8')).ledger as { part: string; at: string }[];
    const dex = ledger.filter((l) => l.part === 'apk:dex').at(-1);
    expect(dex).toMatchObject({ part: 'apk:dex', from: 150, to: 151, why: 'a planted byte, accepted with its reason' });
    expect(typeof dex?.at).toBe('string');
  });
});

describe('image-weight.cjs', () => {
  it('weighs every picture the code requires and counts every catalogue size it asks for', () => {
    writeFileSync(join(dir, 'mark.png'), Buffer.alloc(1234));
    const m = images.measure([planted('Poster.tsx', [
      "const mark = require('./mark.png');",
      "const POSTER = 'https://image.tmdb.org/t/p/w185';",
      "const big = tmdb.poster(path, 'w780');",
      "const label = 'w185 is a size';",
    ].join('\n'))]);
    expect(m.shipped.bytes).toBe(1234);
    expect(m.asked.bySize).toEqual({ w185: 1, w780: 1 });
  });
});
