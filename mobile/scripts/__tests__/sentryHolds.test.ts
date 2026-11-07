/**
 * A release's crashes are readable only when Sentry holds its files (P4.45): scripts/sentry-holds.cjs
 * reads each file's debug id as Sentry names it, asks for each, and fails on anything it cannot
 * prove, with Sentry stood in for.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { buildWanted, dsymUuids, elfDebugId, lacking, mapDebugId, pathFor, proguardUuids, updateWanted } = require('../sentry-holds.cjs');

type Wanted = { kind: string; file: string; id: string | null };
const ID = '5f0c2a8e-1b3d-4c5e-9f70-112233445566';
const BUILD_ID = Buffer.from([...Array(20).keys()]); // 00 01 02 … 13
const FROM_BUILD_ID = '03020100-0504-0706-0809-0a0b0c0d0e0f';
const dir = () => mkdtempSync(join(tmpdir(), 'holds-'));
const put = (file: string, body: string | Buffer) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, body); };

/** A GNU build-id note: namesz, descsz, type 3, "GNU\0", the id. */
const note = () => {
  const head = Buffer.alloc(16);
  head.writeUInt32LE(4, 0); head.writeUInt32LE(BUILD_ID.length, 4); head.writeUInt32LE(3, 8); head.write('GNU\0', 12, 'latin1');
  return Buffer.concat([head, BUILD_ID]);
};
/** A minimal little-endian ELF, 64- or 32-bit, with a null section and one note section. */
const elf = (wide: boolean, withNote = true) => {
  const ehsize = wide ? 64 : 52;
  const shentsize = wide ? 64 : 40;
  const body = withNote ? note() : Buffer.alloc(0);
  const shoff = ehsize + 64;
  const buf = Buffer.alloc(shoff + 2 * shentsize);
  buf.writeUInt32BE(0x7f454c46, 0); buf[4] = wide ? 2 : 1; buf[5] = 1;
  body.copy(buf, ehsize);
  if (wide) { buf.writeBigUInt64LE(BigInt(shoff), 0x28); buf.writeUInt16LE(shentsize, 0x3a); buf.writeUInt16LE(2, 0x3c); } else { buf.writeUInt32LE(shoff, 0x20); buf.writeUInt16LE(shentsize, 0x2e); buf.writeUInt16LE(2, 0x30); }
  const sh = shoff + shentsize;
  buf.writeUInt32LE(withNote ? 7 : 1, sh + 4);
  if (wide) { buf.writeBigUInt64LE(BigInt(ehsize), sh + 0x18); buf.writeBigUInt64LE(BigInt(body.length), sh + 0x20); } else { buf.writeUInt32LE(ehsize, sh + 0x10); buf.writeUInt32LE(body.length, sh + 0x14); }
  return buf;
};

describe('each file\'s debug id, as Sentry names it', () => {
  it('reads a source map\'s debugId, or debug_id, and none from a map without one', () => {
    expect(mapDebugId(JSON.stringify({ version: 3, debugId: ID.toUpperCase() }))).toBe(ID);
    expect(mapDebugId(JSON.stringify({ version: 3, debug_id: ID }))).toBe(ID);
    expect(mapDebugId(JSON.stringify({ version: 3 }))).toBeNull();
    expect(mapDebugId('not json')).toBeNull();
  });

  it('reads each architecture\'s UUID from dwarfdump', () => {
    const out = `UUID: ${ID.toUpperCase()} (arm64) /x/ReelHouse.app.dSYM/Contents/Resources/DWARF/ReelHouse\nUUID: 0A0B0C0D-0000-4000-8000-000000000001 (x86_64) /x/hermes.framework.dSYM/Contents/Resources/DWARF/hermes\n`;
    expect(dsymUuids(out)).toEqual([
      { id: ID, file: 'ReelHouse (arm64)' },
      { id: '0a0b0c0d-0000-4000-8000-000000000001', file: 'hermes (x86_64)' },
    ]);
    expect(dsymUuids('dwarfdump: no such file')).toEqual([]);
  });

  it('reads the ProGuard UUIDs Sentry\'s Gradle plugin writes, one or several', () => {
    expect(proguardUuids(`io.sentry.build-tool=gradle\nio.sentry.ProguardUuids=${ID.toUpperCase()}\n`)).toEqual([ID]);
    expect(proguardUuids(`io.sentry.ProguardUuids=${ID}|0a0b0c0d-0000-4000-8000-000000000001`)).toEqual([ID, '0a0b0c0d-0000-4000-8000-000000000001']);
    expect(proguardUuids('io.sentry.build-tool=gradle')).toEqual([]);
  });

  it('reads an Android library\'s GNU build id as a little-endian GUID, 64-bit and 32-bit', () => {
    expect(elfDebugId(elf(true))).toBe(FROM_BUILD_ID);
    expect(elfDebugId(elf(false))).toBe(FROM_BUILD_ID);
  });

  it('finds no id in a library without a build id, nor in what is not ELF', () => {
    expect(elfDebugId(elf(true, false))).toBeNull();
    expect(elfDebugId(Buffer.alloc(128))).toBeNull();
  });
});

describe('what Sentry lacks', () => {
  const map: Wanted = { kind: 'source map', file: 'main.jsbundle.map', id: ID };
  const dsym: Wanted = { kind: 'dSYM', file: 'ReelHouse (arm64)', id: FROM_BUILD_ID };
  const holding = (held: string[]) => async (path: string) => (held.some((id) => path.endsWith(`debug_id=${id}`)) ? [{ id: 'x' }] : []);

  it('asks for a source map by artifact lookup and a native file among the debug files, by its id', () => {
    expect(pathFor('source map', ID)).toBe(`/api/0/projects/the-reelhouse-society/react-native/artifact-lookup/?debug_id=${ID}`);
    expect(pathFor('dSYM', ID)).toBe(`/api/0/projects/the-reelhouse-society/react-native/files/dsyms/?debug_id=${ID}`);
  });

  it('is nothing when Sentry holds every file, and names each one it does not', async () => {
    await expect(lacking([map, dsym], holding([ID, FROM_BUILD_ID]))).resolves.toEqual([]);
    await expect(lacking([map, dsym], holding([ID]))).resolves.toEqual([dsym]);
  });

  it('asks again for a file not yet held, and names it only when every try came back empty', async () => {
    let asked = 0;
    const late = async (path: string) => (path.includes('dsyms') && ++asked < 3 ? [] : [{ id: 'x' }]);
    await expect(lacking([map, dsym], late, { tries: 3, pause: 0 })).resolves.toEqual([]);
    expect(asked).toBe(3);
    asked = 0;
    await expect(lacking([map, dsym], late, { tries: 2, pause: 0 })).resolves.toEqual([dsym]);
  });

  it('refuses when it found nothing to ask for, or a file with no id', async () => {
    await expect(lacking([], holding([]))).rejects.toThrow(/found nothing to ask Sentry for/);
    await expect(lacking([map, { ...dsym, id: null }], holding([ID]))).rejects.toThrow(/no debug id in ReelHouse/);
  });

  it('refuses when Sentry cannot be read, or answers with no list: never a pass', async () => {
    await expect(lacking([map], async () => { throw new Error('HTTP 401'); })).rejects.toThrow(/could not be read \(HTTP 401\)/);
    await expect(lacking([map], async () => ({ detail: 'x' }))).rejects.toThrow(/no list/);
  });
});

describe('what a release holds to ask for', () => {
  it('an update: every platform\'s map in its export', () => {
    const d = dir();
    put(join(d, '_expo', 'static', 'js', 'ios', 'entry-1.hbc.map'), JSON.stringify({ debugId: ID }));
    put(join(d, '_expo', 'static', 'js', 'android', 'entry-2.hbc.map'), JSON.stringify({}));
    put(join(d, '_expo', 'static', 'js', 'ios', 'entry-1.hbc'), 'bytes');
    const wanted = updateWanted(d).sort((a: Wanted, b: Wanted) => (a.file < b.file ? -1 : 1));
    expect(wanted.map((w: Wanted) => [w.kind, w.file.slice(d.length + 1).replace(/\\/g, '/'), w.id])).toEqual([
      ['source map', '_expo/static/js/android/entry-2.hbc.map', null],
      ['source map', '_expo/static/js/ios/entry-1.hbc.map', ID],
    ]);
  });

  it('an Android build: its map, its ProGuard mapping and each library with a build id', () => {
    const root = dir();
    const app = join(root, 'android', 'app', 'build');
    put(join(app, 'generated', 'sourcemaps', 'react', 'release', 'index.android.bundle.map'), JSON.stringify({ debugId: ID }));
    put(join(app, 'intermediates', 'assets', 'release', 'sentry-debug-meta.properties'), `io.sentry.ProguardUuids=${ID}`);
    put(join(app, 'intermediates', 'merged_native_libs', 'release', 'out', 'lib', 'arm64-v8a', 'libhermes.so'), elf(true));
    put(join(app, 'intermediates', 'merged_native_libs', 'release', 'out', 'lib', 'arm64-v8a', 'libbare.so'), elf(true, false));
    expect(buildWanted('android', root).map((w: Wanted) => [w.kind, w.file.replace(/\\/g, '/'), w.id])).toEqual([
      ['source map', 'index.android.bundle.map', ID],
      ['ProGuard mapping', 'mapping.txt', ID],
      ['native library', 'release/out/lib/arm64-v8a/libhermes.so', FROM_BUILD_ID],
    ]);
  });

  it('an iOS build: its map from DerivedData and each dSYM of the newest archive', () => {
    const root = dir();
    const home = dir();
    put(join(home, 'Library', 'Developer', 'Xcode', 'DerivedData', 'ReelHouse-x', 'Build', 'main.jsbundle.map'), JSON.stringify({ debugId: ID }));
    mkdirSync(join(root, 'ios', 'build', 'ReelHouse.xcarchive', 'dSYMs', 'ReelHouse.app.dSYM'), { recursive: true });
    const dwarfdump = (p: string) => `UUID: ${FROM_BUILD_ID.toUpperCase()} (arm64) ${p}/Contents/Resources/DWARF/ReelHouse\n`;
    expect(buildWanted('ios', root, home, dwarfdump)).toEqual([
      { kind: 'source map', file: 'main.jsbundle.map', id: ID },
      { kind: 'dSYM', file: 'ReelHouse (arm64)', id: FROM_BUILD_ID },
    ]);
  });

  it('a build whose files are not where it looks is wanted with no id, so the check fails', async () => {
    const android = buildWanted('android', dir());
    expect(android).toEqual([
      expect.objectContaining({ kind: 'source map', id: null }), expect.objectContaining({ kind: 'ProGuard mapping', id: null }),
    ]);
    await expect(lacking(android, async () => [{}])).rejects.toThrow(/no debug id/);
    const ios = buildWanted('ios', dir(), dir(), () => '');
    expect(ios).toEqual([expect.objectContaining({ kind: 'source map', id: null }), expect.objectContaining({ kind: 'dSYM', id: null })]);
    await expect(lacking(ios, async () => [{}])).rejects.toThrow(/no debug id/);
  });
});
