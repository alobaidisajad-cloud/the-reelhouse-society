#!/usr/bin/env node
/**
 * bundle-size.js — the app's code as the phones get it, weighed, and a
 * ratchet that only lets it shrink.
 *
 * Builds the production bundles (Hermes bytecode, iOS and Android, with the
 * production build's public env from eas.json) and compares each with
 * .bundle-size.json.
 *
 *   npm run bundle:size                  fail if either grew; record it if it shrank
 *   npm run bundle:size -- --accept "why"   record a larger size, with the reason
 *
 * Growth is allowed only by --accept, so it is a line in a commit, never an
 * accident. The tolerance covers the few bytes a machine's paths can change.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(ROOT, '.bundle-size.json');
const PLATFORMS = ['ios', 'android'];
const TOLERANCE = 0.002;

function build() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-size-'));
  const env = { ...process.env, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')).build.production.env };
  const args = ['expo', 'export', '--output-dir', out, '--clear', ...PLATFORMS.flatMap((p) => ['--platform', p])];
  const r = spawnSync('npx', args, { cwd: ROOT, env, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    throw new Error('expo export failed');
  }
  const sizes = {};
  for (const p of PLATFORMS) {
    const dir = path.join(out, '_expo', 'static', 'js', p);
    const hbc = fs.readdirSync(dir).filter((f) => f.endsWith('.hbc'));
    if (hbc.length !== 1) throw new Error(`${p}: expected one .hbc bundle, found ${hbc.length}`);
    sizes[p] = fs.statSync(path.join(dir, hbc[0])).size;
  }
  fs.rmSync(out, { recursive: true, force: true });
  return sizes;
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function main() {
  const accept = process.argv.indexOf('--accept');
  const reason = accept >= 0 ? process.argv[accept + 1] : null;
  if (accept >= 0 && !reason) throw new Error('--accept needs the reason the app grew');

  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const now = build();
  let grew = false;
  let shrank = false;
  for (const p of PLATFORMS) {
    const was = base[p].bytes;
    const change = now[p] - was;
    const line = `${p.padEnd(8)} ${kb(now[p]).padStart(9)}  (was ${kb(was)}, ${change >= 0 ? '+' : ''}${kb(change)})`;
    if (now[p] > was * (1 + TOLERANCE)) { grew = true; console.log(`GREW    ${line}`); }
    else if (now[p] < was * (1 - TOLERANCE)) { shrank = true; console.log(`SHRANK  ${line}`); }
    else console.log(`same    ${line}`);
  }

  const record = (why) => {
    const next = { ...base };
    for (const p of PLATFORMS) next[p] = { bytes: now[p], why };
    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  };

  if (grew && !reason) {
    console.error('\nThe app grew. If it must, run: npm run bundle:size -- --accept "the reason"');
    process.exit(1);
  }
  if (reason) { record(reason); console.log('\nRecorded, with the reason. Commit .bundle-size.json.'); return; }
  if (shrank) {
    if (process.env.CI) console.log('\nSmaller than the record: run npm run bundle:size locally and commit the new record.');
    else { record('smaller than the last record'); console.log('\nSmaller: the record is lowered. Commit .bundle-size.json.'); }
  }
}

main();
