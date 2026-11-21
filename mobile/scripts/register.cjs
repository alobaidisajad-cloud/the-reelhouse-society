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

/** The sixteen kinds of mistake the review rounds fell into, and R (the register's own work) for a class no kind holds. */
const KINDS = ['FIX', 'TOLD', 'LATE', 'COPY', 'PROT', 'UNKN', 'EXIT', 'LIB', 'ABUSE', 'MOD', 'EDGE', 'A11Y', 'SPEED', 'SIDE', 'SESS', 'DATE', 'R'];

/**
 * Whether a test's source, or a local module it loads, reads a whole universe of the app's files
 * (test-utils/universe) or production's schema: what makes a static method a finder rather than
 * a test of one screen.
 */
const READS_THE_UNIVERSE = /\bfiles\(\s*\[?\s*'/;
const READS_THE_SCHEMA = /\b(SNAPSHOT_SQL|PENDING_SQL|houseFunctions|live-schema\.sql)\b/;
const readsTheWholeApp = (source) => (/universe/.test(source) && READS_THE_UNIVERSE.test(source)) || READS_THE_SCHEMA.test(source);

/**
 * A class found twice is a kind, not an accident: it carries a static method that is a finder
 * over the whole app, and a sweep record (what it read, what it found, and the commit it ran at).
 * `isFinder(file)` says whether a method file reads the whole app; `owed` names the classes not
 * yet holding it, each with the kind that owes its finder.
 */
const finderFaultsOf = (c, isFinder, owed) => {
  if (c.open_in_production || !Number.isInteger(c.count) || c.count < 2) return [];
  const f = [];
  const statics = (c.methods ?? []).filter((m) => m.kind === 'static');
  if (!statics.some((m) => isFinder(m.file))) f.push('a static method that is a finder over the whole app (it reads the universe or the schema)');
  const s = c.sweep;
  if (!s) f.push('a sweep record');
  else {
    if (!Array.isArray(s.read) || !s.read.length) f.push('the sweep\'s read: the universes or the schema it read');
    for (const k of ['found', 'fixed', 'judged']) if (!Number.isInteger(s[k]) || s[k] < 0) f.push(`the sweep's ${k}`);
    if (Number.isInteger(s.found) && Number.isInteger(s.fixed) && Number.isInteger(s.judged) && s.fixed + s.judged !== s.found) {
      f.push('a sweep whose hits are each fixed or judged (fixed + judged = found)');
    }
    if (!/^[0-9a-f]{8,40}$/.test(s.commit ?? '')) f.push('the commit the sweep ran at');
  }
  if (!f.length) return owed.has(c.id) ? ['holds its finder and sweep, so it comes off finders-owed.yaml'] : [];
  return owed.has(c.id) ? [] : f;
};

/** finders-owed.yaml: each kind, and the classes found twice whose finder it still owes. */
const readOwed = () => {
  const file = join(REGISTER, 'finders-owed.yaml');
  return existsSync(file) ? yaml.parse(readFileSync(file, 'utf8')) ?? {} : {};
};

/** What is wrong with the owed list itself: a kind it does not know, a class not there, not found twice, or named twice. */
const owedFaultsOf = (classes, owed) => {
  const f = [];
  const byId = new Map(classes.map((c) => [c.id, c]));
  const seen = new Set();
  for (const [kind, ids] of Object.entries(owed)) {
    if (!KINDS.includes(kind)) f.push(`${kind}: a kind from ${KINDS.join(', ')}`);
    for (const id of ids ?? []) {
      const c = byId.get(id);
      if (!c) f.push(`${kind}: ${id} is no class in the register`);
      else if (c.open_in_production || !(c.count >= 2)) f.push(`${kind}: ${id} is not a class found twice, so it owes no finder`);
      if (seen.has(id)) f.push(`${kind}: ${id} is named twice`);
      seen.add(id);
    }
  }
  return f;
};

/** Every class id finders-owed.yaml names. */
const owedIds = (owed) => new Set(Object.values(owed).flatMap((ids) => ids ?? []));

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

module.exports = { CLOSED_REASONS, KINDS, faultsOf, finderFaultsOf, owedFaultsOf, owedIds, readCommitted, readOwed, readPrivate, readsTheWholeApp, render };
