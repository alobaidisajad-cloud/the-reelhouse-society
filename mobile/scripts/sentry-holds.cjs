#!/usr/bin/env node
/**
 * sentry-holds — asks Sentry whether it holds what makes a release's crashes readable (P4.45),
 * and fails if not: a crash Sentry cannot read back to the app's own file and line is a crash
 * nobody can fix.
 *
 *   node scripts/sentry-holds.cjs update <dist>   an update's source maps (publish-update.cjs, after the upload)
 *   node scripts/sentry-holds.cjs build           a build's source map and native symbols (EAS's
 *                                                 eas-build-on-success, on the builder, after the
 *                                                 build's own uploads)
 *
 * Each file is asked for by its debug id, the one key Sentry reads a crash against: a source map's
 * debugId (Sentry's Metro wrapper writes it), an iOS dSYM's UUID, an Android library's GNU build
 * id, the ProGuard mapping's UUID. A check that finds nothing to ask for fails: it would otherwise
 * pass every build whose files moved. Needs SENTRY_AUTH_TOKEN (project:releases); prints none of it.
 */
const { execFileSync } = require('child_process');
const { Buffer } = require('buffer');
const { readdirSync, readFileSync, statSync } = require('fs');
const { homedir } = require('os');
const { basename, join } = require('path');

const SENTRY = { org: 'the-reelhouse-society', project: 'react-native' };
/** The profiles that reach a phone outside development: production, and internal, which extends it. */
const CHECKED_PROFILES = ['production', 'internal'];

/** Every file under `dir` whose name passes `keep`, directories included when `dirs`. */
function walk(dir, keep, dirs = false, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (dirs && keep(e.name)) { out.push(p); continue; }
      if (e.name !== 'node_modules' && e.name !== '.git') walk(p, keep, dirs, out);
    } else if (!dirs && keep(e.name)) out.push(p);
  }
  return out;
}

const newest = (paths) => paths.map((p) => [p, statSync(p).mtimeMs]).sort((a, b) => b[1] - a[1]).map(([p]) => p);

/** A source map's debug id: `debugId` as the Metro wrapper writes it, `debug_id` as older tools do. */
function mapDebugId(text) {
  let map;
  try { map = JSON.parse(text); } catch { return null; }
  const id = map && (map.debugId || map.debug_id);
  return typeof id === 'string' && id ? id.toLowerCase() : null;
}

/** Each source map under `dir` with its debug id; a map without one is named, to fail. */
const mapsIn = (dir) => walk(dir, (n) => n.endsWith('.map')).map((file) => ({ file, id: mapDebugId(readFileSync(file, 'utf8')) }));

/** `dwarfdump --uuid`'s lines, `UUID: <uuid> (<arch>) <path>`, as debug ids. */
const dsymUuids = (text) => [...text.matchAll(/^UUID: ([0-9A-Fa-f-]{36}) \(([^)]+)\) (.+)$/gm)]
  .map((m) => ({ id: m[1].toLowerCase(), file: `${basename(m[3].trim())} (${m[2]})` }));

/** sentry-debug-meta.properties' ProGuard UUIDs (one or more, `|`-joined). */
const proguardUuids = (text) => (/^io\.sentry\.ProguardUuids=(.+)$/m.exec(text)?.[1] ?? '')
  .split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);

/**
 * An ELF library's debug id as Sentry names it: its GNU build id's first 16 bytes read as a
 * little-endian GUID (the first three fields byte-reversed). null when it carries no build id.
 */
function elfDebugId(buf) {
  if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46 || buf[5] !== 1) return null;
  const wide = buf[4] === 2;
  const shoff = wide ? Number(buf.readBigUInt64LE(0x28)) : buf.readUInt32LE(0x20);
  const shentsize = buf.readUInt16LE(wide ? 0x3a : 0x2e);
  const shnum = buf.readUInt16LE(wide ? 0x3c : 0x30);
  for (let i = 0; i < shnum; i++) {
    const sh = shoff + i * shentsize;
    if (sh + shentsize > buf.length || buf.readUInt32LE(sh + 4) !== 7) continue; // SHT_NOTE
    const off = wide ? Number(buf.readBigUInt64LE(sh + 0x18)) : buf.readUInt32LE(sh + 0x10);
    const size = wide ? Number(buf.readBigUInt64LE(sh + 0x20)) : buf.readUInt32LE(sh + 0x14);
    for (let n = off; n + 12 <= off + size;) {
      const namesz = buf.readUInt32LE(n);
      const descsz = buf.readUInt32LE(n + 4);
      const type = buf.readUInt32LE(n + 8);
      const name = buf.toString('latin1', n + 12, n + 12 + namesz).replace(/\0+$/, '');
      const desc = n + 12 + Math.ceil(namesz / 4) * 4;
      if (type === 3 && name === 'GNU') {
        const id = Buffer.alloc(16);
        buf.copy(id, 0, desc, desc + Math.min(16, descsz));
        const hex = (a, b, rev) => { const s = [...id.subarray(a, b)].map((x) => x.toString(16).padStart(2, '0')); return (rev ? s.reverse() : s).join(''); };
        return `${hex(0, 4, true)}-${hex(4, 6, true)}-${hex(6, 8, true)}-${hex(8, 10)}-${hex(10, 16)}`;
      }
      n = desc + Math.ceil(descsz / 4) * 4;
    }
  }
  return null;
}

/** Where Sentry is asked for each kind: source maps by artifact lookup, native files by debug file. */
const pathFor = (kind, id) => (kind === 'source map'
  ? `/api/0/projects/${SENTRY.org}/${SENTRY.project}/artifact-lookup/?debug_id=${encodeURIComponent(id)}`
  : `/api/0/projects/${SENTRY.org}/${SENTRY.project}/files/dsyms/?debug_id=${encodeURIComponent(id)}`);

/**
 * What Sentry lacks of `wanted` ({ kind, file, id }), asked through `ask(path)` (a list, or a throw
 * when Sentry cannot be read). Refuses when nothing is wanted, when a file has no id, and when
 * Sentry cannot be read: none of those is a release whose crashes are known to be readable. A file
 * not yet held is asked for again, `tries` times in all, `pause` ms apart: Sentry lists an upload
 * only once it has put it together, which an upload that answers at once has not waited for.
 */
async function lacking(wanted, ask, { tries = 1, pause = 0 } = {}) {
  if (!wanted.length) throw new Error('found nothing to ask Sentry for: the build\'s files were not where this looks');
  const idless = wanted.filter((w) => !w.id);
  if (idless.length) throw new Error(`no debug id in ${idless.map((w) => w.file).join(', ')}: Sentry could never read its crashes`);
  let missing = wanted;
  for (let round = 0; round < tries && missing.length; round++) {
    if (round) await new Promise((r) => setTimeout(r, pause));
    const still = [];
    for (const w of missing) {
      let held;
      try { held = await ask(pathFor(w.kind, w.id)); } catch (e) { throw new Error(`Sentry could not be read (${e.message}): what it holds is unknown`); }
      if (!Array.isArray(held)) throw new Error(`Sentry answered ${pathFor(w.kind, w.id)} with no list: what it holds is unknown`);
      if (!held.length) still.push(w);
    }
    missing = still;
  }
  return missing;
}

/** What an update's export holds to ask for: each platform's source map. */
const updateWanted = (dist) => mapsIn(dist).map((m) => ({ kind: 'source map', ...m }));

/** A build's source map to ask for: wanted with no id when it was not found, so the check fails. */
const mapWanted = (map, name) => (map
  ? { kind: 'source map', file: basename(map), id: mapDebugId(readFileSync(map, 'utf8')) }
  : { kind: 'source map', file: `${name} (none found)`, id: null });

/** What a build holds to ask for, found where EAS and Xcode or Gradle leave it. */
function buildWanted(platform, root, home = homedir(), dwarfdump = (p) => execFileSync('dwarfdump', ['--uuid', p], { encoding: 'utf8' })) {
  const wanted = [];
  if (platform === 'ios') {
    const derived = join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');
    const map = newest([root, derived].flatMap((d) => walk(d, (n) => n === 'main.jsbundle.map')))[0];
    wanted.push(mapWanted(map, 'main.jsbundle.map'));
    const archive = newest([root, join(home, 'Library', 'Developer', 'Xcode', 'Archives')].flatMap((d) => walk(d, (n) => n.endsWith('.xcarchive'), true)))[0];
    const dsyms = archive ? walk(join(archive, 'dSYMs'), (n) => n.endsWith('.dSYM'), true) : [];
    for (const d of dsyms) wanted.push(...dsymUuids(dwarfdump(d)).map((u) => ({ kind: 'dSYM', ...u })));
    if (!dsyms.length) wanted.push({ kind: 'dSYM', file: 'the archive\'s dSYMs (none found)', id: null });
  } else {
    const app = join(root, 'android', 'app', 'build');
    const map = newest(walk(app, (n) => n === 'index.android.bundle.map'))[0];
    wanted.push(mapWanted(map, 'index.android.bundle.map'));
    const meta = newest(walk(app, (n) => n === 'sentry-debug-meta.properties'))[0];
    const uuids = meta ? proguardUuids(readFileSync(meta, 'utf8')) : [];
    wanted.push(...(uuids.length ? uuids.map((id) => ({ kind: 'ProGuard mapping', file: 'mapping.txt', id })) : [{ kind: 'ProGuard mapping', file: 'sentry-debug-meta.properties (none found)', id: null }]));
    const merged = join(app, 'intermediates', 'merged_native_libs');
    for (const so of walk(merged, (n) => n.endsWith('.so'))) {
      const id = elfDebugId(readFileSync(so));
      if (id) wanted.push({ kind: 'native library', file: so.slice(merged.length + 1), id });
    }
  }
  return wanted;
}

module.exports = { CHECKED_PROFILES, buildWanted, dsymUuids, elfDebugId, lacking, mapDebugId, pathFor, proguardUuids, updateWanted };

if (require.main === module) {
  const [mode, dist] = process.argv.slice(2);
  const profile = process.env.EAS_BUILD_PROFILE;
  if (mode === 'build' && profile && !CHECKED_PROFILES.includes(profile)) {
    console.log(`sentry-holds: the ${profile} build reaches no member's phone; not asked`);
    process.exit(0);
  }
  const token = (process.env.SENTRY_AUTH_TOKEN || '').trim();
  const ask = async (path) => {
    const r = await fetch(`https://sentry.io${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  (async () => {
    if (!token) throw new Error('no SENTRY_AUTH_TOKEN: it is a build secret (EAS) and an update needs it in the environment');
    const wanted = mode === 'update' ? updateWanted(dist || 'dist')
      : mode === 'build' ? buildWanted(process.env.EAS_BUILD_PLATFORM, join(__dirname, '..'))
        : (() => { throw new Error('update <dist> | build'); })();
    const missing = await lacking(wanted, ask, { tries: 6, pause: 20000 });
    for (const w of wanted) console.log(`${missing.includes(w) ? 'LACKING' : 'held   '}  ${w.kind}  ${w.file}  ${w.id}`);
    if (missing.length) throw new Error(`Sentry lacks ${missing.length} of ${wanted.length}: this release's crashes would not be read`);
    console.log(`sentry-holds: Sentry holds all ${wanted.length}`);
  })().catch((e) => { console.error(`sentry-holds: ${e.message}`); process.exit(1); });
}
