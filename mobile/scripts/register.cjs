#!/usr/bin/env node
/**
 * The register of every kind of mistake the app can make (WORKLIST P0.49–P0.54).
 *
 * `mobile/register/classes.yaml` is the one source, committed. A class still
 * open in production holds only its id, area, seriousness and count there: its
 * description, places and proofs stay in the git-ignored private file, in the
 * main checkout's private audit folder, until its fix is live and probed.
 * `mobile/register/CLASSES.md` is generated from the committed file alone.
 *
 *   node mobile/scripts/register.cjs           writes CLASSES.md
 *   node mobile/scripts/register.cjs --check   fails if CLASSES.md is not what the file makes
 *   node mobile/scripts/register.cjs --joined  the full register, its private half joined (local)
 */
const { execFileSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const REGISTER = join(MOBILE, 'register');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js'));

const STATUSES = ['OPEN', 'GUARDED', 'CLOSED', 'OUT_OF_SCOPE'];
const SERIOUSNESS = ['serious', 'behaviour', 'layout', 'code'];
const CLOSED_REASONS = ['cannot recur', 'agent process only', 'device only', 'owner decision', 'does not apply'];
const PLACES = ['none', 'emulator', 'simulator', 'iphone', 'android-phone'];
/** What a class still open in production may show in the public file. */
const PUBLIC_WHEN_OPEN = ['id', 'area', 'seriousness', 'count', 'open_in_production', 'status'];

const readCommitted = () => yaml.parse(readFileSync(join(REGISTER, 'classes.yaml'), 'utf8'));

/** The private half, through the main checkout (worktrees share it); null when absent. */
const readPrivate = () => {
  let common;
  try { common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8' }).trim(); } catch { return null; }
  const file = join(common, '..', 'mobile', 'audit', 'final', 'private', 'register.private.yaml');
  return existsSync(file) ? yaml.parse(readFileSync(file, 'utf8')) : null;
};

/** What is wrong with a class as its status claims ([] when nothing). */
const faultsOf = (c, testTitles) => {
  const f = [];
  if (!/^[A-Z][A-Z0-9]*(-[a-z0-9]+)+$/.test(c.id ?? '')) f.push('an id like AREA-what-it-is');
  if (!STATUSES.includes(c.status)) f.push(c.status === 'PARTIAL' ? 'PARTIAL is refused: split it' : `a status from ${STATUSES.join(', ')}`);
  if (!SERIOUSNESS.includes(c.seriousness)) f.push(`a seriousness from ${SERIOUSNESS.join(', ')}`);
  if (!c.area) f.push('an area');
  if (!Number.isInteger(c.count) || c.count < 0) f.push('a count');
  if (c.open_in_production) {
    const extra = Object.keys(c).filter((k) => !PUBLIC_WHEN_OPEN.includes(k));
    if (extra.length) f.push(`open in production, so only ${PUBLIC_WHEN_OPEN.join(', ')} may be public (has ${extra.join(', ')})`);
    return f;
  }
  if (!c.title) f.push('a title');
  for (const p of c.places ?? []) if (!PLACES.includes(p)) f.push(`a place from ${PLACES.join(', ')} (has ${p})`);
  if ((c.places ?? []).some((p) => p === 'iphone' || p === 'android-phone')) {
    for (const k of ['step', 'build', 'expected', 'reason']) if (!c.phone?.[k]) f.push(`the phone check's ${k}`);
  }
  if (c.status === 'GUARDED' || c.status === 'CLOSED') {
    if (!Array.isArray(c.standards) || !c.standards.length) f.push('the STANDARDS sections it was checked against');
  }
  if (c.status === 'GUARDED') {
    const methods = c.methods ?? [];
    if (!methods.length) f.push('its methods');
    for (const m of methods) {
      if (!['static', 'running'].includes(m.kind)) f.push(`a method kind, static or running (${m.test})`);
      const titles = testTitles(m.file);
      if (!titles) f.push(`a method file that exists (${m.file})`);
      else if (!titles.includes(m.test)) f.push(`a test titled exactly "${m.test}" in ${m.file}`);
    }
    if (c.seriousness === 'serious' && !(methods.some((m) => m.kind === 'static') && methods.some((m) => m.kind === 'running'))) {
      f.push('a serious class needs a static and a running method');
    }
    for (const k of ['whole_app', 'past_examples', 'new_shapes', 'second_count']) {
      if (!c.proofs?.[k]?.commit || !c.proofs?.[k]?.result) f.push(`its ${k.replace('_', ' ')} proof, with commit and result`);
    }
    if (!(c.mutants ?? []).length || (c.mutants ?? []).some((m) => m.status !== 'caught')) f.push('every mutant caught');
  }
  if (c.status === 'CLOSED') {
    if (!CLOSED_REASONS.includes(c.closed?.reason)) f.push(`a CLOSED reason from ${CLOSED_REASONS.join(', ')}`);
    const r = c.closed?.second_review;
    if (!r?.reviewer || !r?.date || !r?.verdict) f.push('a second review (reviewer, date, verdict)');
    if (c.closed?.reason === 'owner decision' && !(c.closed?.owner_words && /^\d{4}-\d{2}-\d{2}$/.test(c.closed?.date ?? ''))) {
      f.push('the user\'s words and the date');
    }
    if (c.closed?.reason === 'device only' && !(c.places ?? []).some((p) => p === 'iphone' || p === 'android-phone')) {
      f.push('a device-only class must name iphone or android-phone among its places');
    }
  }
  if (c.status === 'OUT_OF_SCOPE' && !(c.decision?.words && /^\d{4}-\d{2}-\d{2}$/.test(c.decision?.date ?? ''))) {
    f.push('the user\'s quoted, dated decision');
  }
  return f;
};

/** CLASSES.md, from the committed file alone. */
const render = (register) => {
  const rows = register.classes.map((c) => `| ${c.id} | ${c.area} | ${c.seriousness} | ${c.status ?? 'OPEN'} | ${c.count} | ${c.open_in_production ? 'open in production' : (c.title ?? '')} |`);
  return [
    '# The register of classes',
    '',
    'Generated from `classes.yaml` by `mobile/scripts/register.cjs`; do not edit by hand. A class still open in',
    'production shows only its id, area, seriousness and count here.',
    '',
    '| Class | Area | Seriousness | Status | Count | What it is |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
};

if (require.main === module) {
  const register = readCommitted();
  const out = join(REGISTER, 'CLASSES.md');
  if (process.argv.includes('--check')) {
    const now = existsSync(out) ? readFileSync(out, 'utf8').split('\r\n').join('\n') : '';
    if (now !== render(register)) { console.error('CLASSES.md is not what classes.yaml makes: run node mobile/scripts/register.cjs'); process.exit(1); }
    console.log('CLASSES.md matches classes.yaml.');
  } else if (process.argv.includes('--joined')) {
    const priv = readPrivate();
    if (!priv) { console.error('The private register is missing.'); process.exit(1); }
    const byId = new Map((priv.classes ?? []).map((c) => [c.id, c]));
    console.log(yaml.stringify(register.classes.map((c) => ({ ...c, ...(byId.get(c.id) ?? {}) }))));
  } else {
    writeFileSync(out, render(register));
    console.log(`CLASSES.md written: ${register.classes.length} classes.`);
  }
}

module.exports = { CLOSED_REASONS, faultsOf, readCommitted, readPrivate, render };
