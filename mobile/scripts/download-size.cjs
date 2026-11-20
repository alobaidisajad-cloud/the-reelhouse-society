#!/usr/bin/env node
/**
 * download-size.cjs — what a member downloads, part by part, and no byte without a reason.
 *
 *   node scripts/download-size.cjs --apk <app.apk> [--export <dir>] [--json FILE]
 *   node scripts/download-size.cjs --apk <app.apk> [--export <dir>] --check [--tolerance <bytes>]
 *   node scripts/download-size.cjs --apk <app.apk> [--export <dir>] --accept "<why>"
 *   … [--record FILE]                                another record in place of mobile/download-size.json
 *
 * The APK is read as the zip it is (its central directory, PARTS): each entry's bytes as stored,
 * which is what crosses the network, gathered into parts — the code (dex), each native library
 * folder, the JavaScript bundle, the other assets, the resources and the rest — and the file's
 * own size. An export (`expo export`, as scripts/bundle-size.js leaves one with --keep) adds each
 * platform's bytecode and its assets. The record (mobile/download-size.json) holds every part's
 * bytes as last measured on CI's machine, and the ledger of every growth: the part, from and to,
 * the commit it was measured at and why. --check fails on any part larger than its record by more
 * than --tolerance (0 unless an A/A pair of builds of one commit has measured the build's own
 * noise, which is then written beside it); --accept writes the new sizes and a ledger line for
 * each part that grew, at this commit, with the reason. A part that shrank is lowered by either.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MOBILE = path.join(__dirname, '..');
/** The record, unless --record names another (a test's own). */
const RECORD = path.join(MOBILE, 'download-size.json');

/** Each zip entry's name and stored bytes, from the central directory at the file's end. */
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip: no end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`a broken central directory at entry ${n}`);
    const stored = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    out.push({ name: buf.toString('utf8', at + 46, at + 46 + nameLen), stored });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The part of the APK an entry belongs to. */
function partOf(name) {
  if (/^classes\d*\.dex$/.test(name)) return 'apk:dex';
  const lib = /^lib\/([^/]+)\//.exec(name);
  if (lib) return `apk:lib/${lib[1]}`;
  if (name === 'assets/index.android.bundle') return 'apk:bundle';
  if (name.startsWith('assets/')) return 'apk:assets';
  if (name.startsWith('res/') || name === 'resources.arsc') return 'apk:resources';
  return 'apk:other';
}

/** Every part's bytes: the APK's parts and its whole file, and an export's bytecode and assets. */
function measure({ apk, exportDir, list = (d) => fs.readdirSync(d, { recursive: true }) } = {}) {
  const parts = {};
  const add = (k, n) => { parts[k] = (parts[k] ?? 0) + n; };
  if (apk) {
    const buf = fs.readFileSync(apk);
    for (const e of zipEntries(buf)) add(partOf(e.name), e.stored);
    parts['apk:file'] = buf.length;
  }
  if (exportDir) {
    for (const rel of list(exportDir).map(String)) {
      const f = path.join(exportDir, rel);
      if (!fs.statSync(f).isFile()) continue;
      const p = rel.split(path.sep).join('/');
      const hbc = /_expo\/static\/js\/(ios|android)\/.*\.hbc$/.exec(p);
      if (hbc) add(`export:${hbc[1]}:bytecode`, fs.statSync(f).size);
      else if (p.startsWith('assets/')) add('export:assets', fs.statSync(f).size);
    }
  }
  const total = parts['apk:file'] ?? Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total };
}

/** Each part larger than its record by more than the tolerance; each smaller. */
function judge(now, record, tolerance = 0) {
  const grew = [];
  const shrank = [];
  for (const [k, v] of Object.entries(now.parts)) {
    const was = record.parts?.[k];
    if (was == null) grew.push({ part: k, from: 0, to: v });
    else if (v > was + tolerance) grew.push({ part: k, from: was, to: v });
    else if (v < was) shrank.push({ part: k, from: was, to: v });
  }
  return { grew, shrank };
}

const commit = () => { try { return execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: MOBILE, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (!opt('--apk') && !opt('--export')) { console.error('usage: node scripts/download-size.cjs --apk <app.apk> [--export <dir>] [--check | --accept "<why>"] [--json FILE]'); return 2; }
  const now = measure({ apk: opt('--apk'), exportDir: opt('--export') });
  if (opt('--json')) fs.writeFileSync(opt('--json'), `${JSON.stringify({ ...now, from: `${opt('--apk') ?? ''} ${opt('--export') ?? ''}`.trim() }, null, 2)}\n`);
  const recordFile = opt('--record') ?? RECORD;
  const record = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, 'utf8')) : { parts: {}, ledger: [] };
  const tolerance = Number(opt('--tolerance') ?? record.tolerance ?? 0);
  const { grew, shrank } = judge(now, record, tolerance);
  for (const [k, v] of Object.entries(now.parts).sort()) console.log(`${k.padEnd(28)} ${String(v).padStart(12)}  (record ${record.parts?.[k] ?? '—'})`);
  const write = (why) => {
    const ledger = [...(record.ledger ?? []), ...grew.map((g) => ({ ...g, at: commit(), why }))];
    const parts = { ...record.parts, ...Object.fromEntries([...grew, ...shrank].map((g) => [g.part, g.to])) };
    fs.writeFileSync(recordFile, `${JSON.stringify({ ...record, parts, ledger }, null, 2)}\n`);
  };
  if (opt('--accept')) {
    const why = opt('--accept');
    if (!why || why.trim().length < 20) { console.error('--accept needs the reason the download grew, in a sentence'); return 2; }
    write(why);
    console.log(`recorded: ${grew.length} grown, ${shrank.length} smaller, at ${commit()}`);
    return 0;
  }
  if (argv.includes('--check')) {
    if (grew.length) { console.error(`The download grew without a reason:\n  ${grew.map((g) => `${g.part}: ${g.from} → ${g.to} (+${g.to - g.from} bytes)`).join('\n  ')}\nIf it must: --accept "the reason"`); return 1; }
    if (shrank.length) { write('smaller than the record'); console.log(`smaller: ${shrank.map((s) => s.part).join(', ')}: the record is lowered; commit mobile/download-size.json`); }
    console.log('no part of the download grew past its record');
  }
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { zipEntries, partOf, measure, judge, RECORD };
