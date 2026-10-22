#!/usr/bin/env node
/**
 * The mutants that prove every guard (WORKLIST P0.66, P0.67, P0.69, P0.71).
 *
 * Each mutant in mobile/register/mutants.yaml puts one mistake of a class back
 * into today's code, and the class's own named test must fail on it:
 *   - past:  the class's past fix reversed (`commit`, `files`), each hunk placed
 *            by the code around it, never by its line numbers. When the fix no
 *            longer reverses, the verdict is NOT-APPLIED, and an equivalent
 *            written once by hand (`edits`) is used from then on in its place.
 *   - shape: a new shape of the mistake planted into a real folder (`plant`, a
 *            new file) or written into a real file (`edits`).
 *   - judge: an E2E judge fed a bad log, made from a good log by `edits`; the
 *            judge must take the good log and refuse the bad one.
 *
 * A mutant counts only if (the kill rules, P0.71):
 *   - its files were clean at this commit, and its test passed on them first;
 *   - each file really changed: its hash, and its text with line endings made one;
 *   - it compiles, unless it is declared a type error, which the type checker must then catch;
 *   - the named test itself failed: another test failing, or the file failing to load, does not count;
 *   - every file was put back and read back byte for byte before the next.
 *
 *   node mobile/scripts/mutants.cjs                  every mutant
 *   node mobile/scripts/mutants.cjs --ids a,b        those named
 *   node mobile/scripts/mutants.cjs --results <file> also writes the count-only results (ids and verdicts, P0.39)
 *   node mobile/scripts/mutants.cjs --put-back       puts back what a stopped run left in place, and ends
 *
 * Any other argument, or an option without its value, is refused before anything runs. Every
 * run first puts back what a stopped run left in place (the mutant in place, below).
 *
 * The verdicts: caught, survived, NOT-APPLIED, or invalid (a rule above not met). Only caught passes.
 */
const { createHash } = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { dirname, extname, join, relative } = require('path');

const MOBILE = join(__dirname, '..');
const ROOT = join(MOBILE, '..');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js'));
const REGISTRY = join(MOBILE, 'register', 'mutants.yaml');

const lf = (s) => s.split('\r\n').join('\n');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const CR_LF = (text) => text.includes('\r\n');
/** Text written back in the line endings the file had. */
const asFile = (text, like) => (CR_LF(like) ? lf(text).split('\n').join('\r\n') : text);

/** The hunks of one file in a commit: what each said before the commit and after it, context included. */
const hunksOf = (commit, file) => {
  const fromTop = relative(ROOT, join(MOBILE, file)).split('\\').join('/');
  const diff = execFileSync('git', ['show', '--format=', '--no-color', '-U3', commit, '--', fromTop], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  if (!diff.trim()) throw new Error(`${commit} does not change ${fromTop}`);
  const hunks = [];
  let h = null;
  for (const line of lf(diff).split('\n')) {
    if (line.startsWith('@@')) { h = { before: [], after: [] }; hunks.push(h); continue; }
    if (!h || line.startsWith('\\')) continue;
    const [mark, rest] = [line[0], line.slice(1)];
    if (mark === ' ') { h.before.push(rest); h.after.push(rest); } else if (mark === '-') h.before.push(rest); else if (mark === '+') h.after.push(rest);
  }
  return hunks;
};

/** Each `find` replaced by its `replace`; a find not there exactly once makes the whole change NOT-APPLIED. */
const applyEdits = (text, edits) => {
  let out = lf(text);
  for (const { find, replace } of edits) {
    const at = out.indexOf(lf(find));
    if (at < 0) return { notApplied: `not found: ${lf(find).split('\n')[0].slice(0, 80)}` };
    if (out.indexOf(lf(find), at + 1) >= 0) return { notApplied: `found more than once: ${lf(find).split('\n')[0].slice(0, 80)}` };
    out = out.slice(0, at) + lf(replace) + out.slice(at + lf(find).length);
  }
  return { text: out };
};

/** A past fix's hunks reversed onto today's text: each hunk's after-text, found once, put back as it was before. */
const reverse = (text, hunks) => applyEdits(text, hunks.map((h) => ({ find: h.after.join('\n'), replace: h.before.join('\n') })));

/** What a mutant writes: [{ path, before (null for a new file), after }], or why it cannot. */
const changesOf = (m) => {
  const changes = [];
  for (const p of m.plant ?? []) {
    const path = join(MOBILE, p.path);
    if (existsSync(path)) return { notApplied: `${p.path} is already there` };
    changes.push({ file: p.path, path, before: null, after: p.text });
  }
  const byFile = new Map();
  for (const e of m.edits ?? []) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  if (m.source === 'past' && !m.edits) for (const f of m.files ?? []) byFile.set(f, null);
  for (const [file, edits] of byFile) {
    const path = join(MOBILE, file);
    if (!existsSync(path)) return { notApplied: `${file} is not there` };
    const before = readFileSync(path, 'utf8');
    const made = edits ? applyEdits(before, edits) : reverse(before, hunksOf(m.commit, file));
    if (made.notApplied) return { notApplied: `${file}: ${made.notApplied}` };
    changes.push({ file, path, before, after: asFile(made.text, before) });
  }
  return { changes };
};

/** Whether a change is a change: its bytes differ, and its text with line endings made one differs too. */
const really = (c) => c.before === null || (hash(c.before) !== hash(c.after) && lf(c.before) !== lf(c.after));

/** The named test's status in a jest --json report: passed, failed, or missing when it never ran. */
const statusIn = (report, title) => {
  const found = (report.testResults ?? []).flatMap((r) => r.assertionResults ?? []).filter((a) => a.title === title);
  if (found.some((a) => a.status === 'failed')) return 'failed';
  if (found.some((a) => a.status === 'passed')) return 'passed';
  return 'missing';
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One named test, run alone; its status, and jest's own words when it never ran. */
const runTest = ({ file, test }) => {
  const dir = mkdtempSync(join(tmpdir(), 'mutant-'));
  const out = join(dir, 'report.json');
  try {
    const r = spawnSync(process.execPath, [join(MOBILE, 'node_modules', 'jest', 'bin', 'jest.js'), '--runTestsByPath', file,
      '-t', escapeRe(test), '--json', '--outputFile', out, '--silent'], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9 });
    if (!existsSync(out)) return { status: 'missing', said: `${r.stderr}`.trim().split('\n').slice(-5).join(' / ') };
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const status = statusIn(report, test);
    const said = (report.testResults ?? []).map((t) => t.message).filter(Boolean).join(' ').split('\n').slice(0, 3).join(' / ');
    return { status, said };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

let tsInfo = null;
/** The type checker's errors (`file(line,col): error ...` lines), over the whole project, kept warm between mutants. */
const typeErrors = () => {
  tsInfo ??= join(mkdtempSync(join(tmpdir(), 'mutants-tsc-')), 'tsbuildinfo');
  const r = spawnSync(process.execPath, [join(MOBILE, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--pretty', 'false',
    '-p', 'tsconfig.json', '--incremental', '--tsBuildInfoFile', tsInfo], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9 });
  return lf(`${r.stdout}${r.stderr}`).split('\n').filter((l) => / error TS\d+:/.test(l));
};

/** Whether each changed file still parses or type-checks: [] when it does, else what was said. */
const compileFaults = (changes) => {
  const faults = [];
  if (changes.some((c) => /\.tsx?$/.test(c.file))) faults.push(...typeErrors());
  for (const c of changes) {
    const ext = extname(c.file);
    if (['.js', '.cjs', '.mjs'].includes(ext)) {
      const r = spawnSync(process.execPath, ['--check', c.path], { encoding: 'utf8' });
      if (r.status !== 0) faults.push(`${c.file}: ${lf(r.stderr).trim().split('\n').slice(0, 4).join(' / ')}`);
    } else if (ext === '.json') {
      try { JSON.parse(c.after); } catch (e) { faults.push(`${c.file}: ${e.message}`); }
    } else if (['.yml', '.yaml'].includes(ext)) {
      // Each document must parse: a Maestro flow is two (its config, then its steps).
      const errors = yaml.parseAllDocuments(c.after).flatMap((d) => d.errors ?? []);
      if (errors.length) faults.push(`${c.file}: ${errors[0].message.split('\n')[0]}`);
    }
  }
  return faults;
};

/** Every changed file put back, and read back as it was; a planted file gone. Throws if not: nothing runs on after. */
const restore = (changes) => {
  for (const c of changes) {
    if (c.before === null) { if (existsSync(c.path)) unlinkSync(c.path); } else writeFileSync(c.path, c.before);
  }
  for (const c of changes) {
    const ok = c.before === null ? !existsSync(c.path) : hash(readFileSync(c.path, 'utf8')) === hash(c.before);
    if (!ok) throw new Error(`${c.file} was not put back as it was: stop, and restore it by hand`);
  }
};

/**
 * The mutant in place: written before its files change, removed once they are put back. A run
 * ended from outside (a stopped task, a closed window: no signal reaches it) leaves it behind, so
 * the next run puts those files back before anything else, and the commit and push hooks refuse
 * while it is there. Git-ignored.
 */
const PLACED = join(MOBILE, '.mutant-in-place.json');

/** What a stopped run left in place, put back and read back; the files it names ([] when none). */
const putBackLeftover = (placed = PLACED) => {
  if (!existsSync(placed)) return [];
  const { changes } = JSON.parse(readFileSync(placed, 'utf8'));
  restore(changes);
  unlinkSync(placed);
  return changes.map((c) => c.file);
};

/** The options and whether each takes a value. */
const OPTIONS = { '--ids': true, '--changed': true, '--part': true, '--results': true, '--fresh': false, '--gather': true, '--out': true, '--put-back': false };

/** What is wrong with these arguments, or null: an unknown one, or an option missing its value. */
const argumentsFault = (argv) => {
  for (let k = 0; k < argv.length; k++) {
    const takes = OPTIONS[argv[k]];
    if (takes === undefined) return `unknown argument ${argv[k]} (the options: ${Object.keys(OPTIONS).join(', ')})`;
    if (takes) {
      if (argv[k + 1] === undefined || argv[k + 1] in OPTIONS) return `${argv[k]} wants a value`;
      k++;
    }
  }
  return null;
};

/** Paths git reports changed among these (a mutant runs only on files as committed). */
const dirty = (files) => {
  if (!files.length) return [];
  return execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: MOBILE, encoding: 'utf8' }).split('\n').filter(Boolean);
};

/** A judge's verdict on one folder of logs: its exit, and the first lines it printed. */
const judge = (m, dir) => {
  const args = m.judge.run.map((a) => a.split('{dir}').join(dir));
  const r = spawnSync(args[0] === 'node' ? process.execPath : args[0], args.slice(1),
    { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e8, env: { ...process.env, ...(m.judge.env ?? {}) } });
  return { status: r.status, said: lf(`${r.stdout}${r.stderr}`).trim().split('\n').slice(0, 2).join(' / ') };
};

/** Every file under a folder, by its path inside it (forward slashes): its text. */
const readFolder = (dir, under = '') => {
  const out = {};
  for (const entry of readdirSync(join(dir, under), { withFileTypes: true })) {
    const rel = under ? `${under}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, readFolder(dir, rel));
    else out[rel] = readFileSync(join(dir, rel), 'utf8');
  }
  return out;
};

/** Each of a judge's files written under a folder, at the path `as` gives it (a name the repo ignores, kept under another). */
const writeAll = (dir, files, as = {}) => {
  for (const [name, text] of Object.entries(files)) {
    const at = join(dir, as[name] ?? name);
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, text);
  }
};

/**
 * An E2E judge mutant: its logs (judge.files) made bad by edits, each edit naming its file. The bad
 * logs differ from the good ones; the judge takes the good (exit 0) and refuses the bad with its
 * refusal (judge.refuses, 1 unless said): an exit that means it could not read is not a refusal.
 */
const runJudge = (m) => {
  const good = m.judge.from ? readFolder(join(MOBILE, m.judge.from)) : (m.judge.files ?? {});
  const bad = { ...good };
  for (const e of m.edits ?? []) {
    if (!(e.file in bad)) return { verdict: 'invalid', why: `no log named ${e.file}` };
    const made = applyEdits(bad[e.file], [e]);
    if (made.notApplied) return { verdict: 'NOT-APPLIED', why: `${e.file}: ${made.notApplied}` };
    bad[e.file] = made.text;
  }
  if (Object.keys(good).every((f) => lf(good[f]) === lf(bad[f]))) return { verdict: 'invalid', why: 'the bad logs are the good logs' };
  const dir = mkdtempSync(join(tmpdir(), 'judge-'));
  try {
    writeAll(join(dir, 'good'), good, m.judge.as);
    writeAll(join(dir, 'bad'), bad, m.judge.as);
    const g = judge(m, join(dir, 'good'));
    if (g.status !== 0) return { verdict: 'invalid', why: `the judge refuses the good logs (exit ${g.status}): ${g.said}` };
    const b = judge(m, join(dir, 'bad'));
    if (b.status === 0) return { verdict: 'survived', why: `the judge took the bad logs: ${b.said}` };
    if (b.status !== (m.judge.refuses ?? 1)) return { verdict: 'invalid', why: `the judge could not read the bad logs (exit ${b.status}): ${b.said}` };
    return { verdict: 'caught', why: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** One mutant, by the kill rules: its verdict and why. */
const runOne = (m) => {
  if (m.source === 'judge') return runJudge(m);
  const files = [...new Set([...(m.files ?? []), ...(m.edits ?? []).map((e) => e.file), ...(m.plant ?? []).map((p) => p.path)])];
  const changed = dirty(files);
  if (changed.length) return { verdict: 'invalid', why: `not as committed: ${changed.join(', ')}` };
  const base = runTest(m.proof);
  if (base.status !== 'passed') return { verdict: 'invalid', why: `its test was not green first (${base.status}) ${base.said ?? ''}`.trim() };
  const plan = changesOf(m);
  if (plan.notApplied) return { verdict: 'NOT-APPLIED', why: plan.notApplied };
  const { changes } = plan;
  const same = changes.filter((c) => !really(c));
  if (same.length) return { verdict: 'invalid', why: `no real change to ${same.map((c) => c.file).join(', ')}` };
  writeFileSync(PLACED, JSON.stringify({ mutant: m.id, changes }));
  try {
    for (const c of changes) { mkdirSync(dirname(c.path), { recursive: true }); writeFileSync(c.path, c.after); }
    const faults = compileFaults(changes);
    if (m.expect === 'type-error') {
      const named = faults.filter((f) => changes.some((c) => f.split('\\').join('/').includes(c.file)));
      return named.length ? { verdict: 'caught', why: '' } : { verdict: 'survived', why: 'the type checker took it' };
    }
    if (faults.length) return { verdict: 'invalid', why: `does not compile: ${faults.slice(0, 2).join(' / ')}` };
    const r = runTest(m.proof);
    if (r.status === 'failed') return { verdict: 'caught', why: '' };
    if (r.status === 'passed') return { verdict: 'survived', why: 'its test passed with the mistake in' };
    return { verdict: 'invalid', why: `its test did not run: ${r.said}` };
  } finally {
    restore(changes);
    unlinkSync(PLACED);
  }
};

/** The registry, and the private half where this checkout can read it. */
const readMutants = () => {
  const pub = yaml.parse(readFileSync(REGISTRY, 'utf8')).mutants ?? [];
  let priv = [];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const file = join(common, '..', 'mobile', 'audit', 'final', 'private', 'mutants.private.yaml');
    if (existsSync(file)) priv = yaml.parse(readFileSync(file, 'utf8')).mutants ?? [];
  } catch { /* not a checkout: the public half alone */ }
  return [...pub, ...priv.map((m) => ({ ...m, private: true }))];
};

/** The proof id of a mutant's test: its index among its class's methods, m1 first. */
const proofId = (m, classes) => {
  const c = classes.find((k) => k.id === m.class);
  const i = (c?.methods ?? []).findIndex((x) => x.file === m.proof?.file && x.test === m.proof?.test);
  return i < 0 ? null : `m${i + 1}`;
};

/**
 * The paths a mutant stands on: the files it changes or plants, its test, its judge and the
 * judge's logs. A push that changes one runs it (P0.72); paths are from mobile/, as the registry
 * writes them.
 */
const pathsOf = (m) => [
  ...(m.files ?? []), ...(m.edits ?? []).filter(() => m.source !== 'judge').map((e) => e.file),
  ...(m.plant ?? []).map((p) => p.path), ...(m.proof ? [m.proof.file] : []),
  ...(m.judge ? [m.judge.run[1], `${m.judge.from}/`] : []),
].map((p) => p.split('\\').join('/'));

/** Whether a changed path (from mobile/) is one a mutant stands on: the path itself, or one under its folder. */
const standsOn = (m, changed) => pathsOf(m).some((p) => (p.endsWith('/') ? changed.startsWith(p) : changed === p));

/** The mutants a change from `base` touches: by the paths they stand on, their own entry, or the runner. */
const touchedSince = (base, mutants) => {
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n').filter(Boolean).map((p) => relative(MOBILE, join(ROOT, p)).split('\\').join('/'));
  if (changed.includes('scripts/mutants.cjs')) return mutants;
  let before = [];
  try {
    before = yaml.parse(execFileSync('git', ['show', `${base}:mobile/register/mutants.yaml`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).mutants ?? [];
  } catch { /* the registry is new since then: every mutant is */ }
  const same = (m) => { const was = before.find((b) => b.id === m.id); return !!was && JSON.stringify(was) === JSON.stringify({ ...m, private: undefined }); };
  return mutants.filter((m) => !same(m) || changed.some((c) => standsOn(m, c)));
};

/** Part i of n: every n-th mutant from the i-th, so each part holds every kind. */
const partOf = (mutants, spec) => {
  const [i, n] = spec.split('/').map(Number);
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--part wants i/n, as 2/3 (has ${spec})`);
  return mutants.filter((_, k) => k % n === i - 1);
};

/** Results kept: ids and verdicts only (P0.39), each mutant once, in the registry's order. */
const RESULT_KEYS = ['class', 'mutant', 'proof', 'commit', 'verdict'];
const keep = (r) => Object.fromEntries(RESULT_KEYS.map((k) => [k, r[k]]));

/** One results file from the parts' files: each public mutant exactly once, or what is wrong, in words. */
const gather = (parts, mutants) => {
  const all = parts.flat();
  const ids = mutants.filter((m) => !m.private).map((m) => m.id);
  const faults = [
    ...ids.filter((id) => !all.some((r) => r.mutant === id)).map((id) => `${id}: no part ran it`),
    ...ids.filter((id) => all.filter((r) => r.mutant === id).length > 1).map((id) => `${id}: run by more than one part`),
    ...all.filter((r) => !ids.includes(r.mutant)).map((r) => `${r.mutant}: not in the registry`),
  ];
  const results = ids.map((id) => all.find((r) => r.mutant === id)).filter(Boolean).map(keep);
  return { results, faults };
};

/** The private folder of the main checkout, where the fuller record is kept (P0.54); null when there is none. */
const privateDir = () => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const dir = join(common, '..', 'mobile', 'audit', 'final', 'private');
    return existsSync(dir) ? dir : null;
  } catch { return null; }
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const refused = argumentsFault(argv);
  if (refused) { console.error(refused); process.exit(2); }
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const left = putBackLeftover();
  if (left.length) console.log(`put back what a stopped run left in place: ${left.join(', ')}`);
  if (argv.includes('--put-back')) process.exit(0);
  const all = readMutants();

  if (argv.includes('--gather')) {
    const dir = arg('--gather');
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
    const { results, faults } = gather(files.map((f) => JSON.parse(readFileSync(f, 'utf8'))), all);
    writeFileSync(arg('--out'), `${JSON.stringify(results, null, 2)}\n`);
    const bad = results.filter((r) => r.verdict !== 'caught');
    for (const f of faults) console.log(`✗ ${f}`);
    for (const r of bad) console.log(`✗ ${r.mutant} (${r.class}): ${r.verdict}`);
    console.log(`${files.length} part(s), ${results.length - bad.length} of ${all.filter((m) => !m.private).length} mutants caught`);
    process.exit(faults.length || bad.length ? 1 : 0);
  }

  const ids = arg('--ids')?.split(',');
  let chosen = ids ? all.filter((m) => ids.includes(m.id)) : all;
  if (ids && chosen.length !== ids.length) { console.error(`no such mutant: ${ids.filter((i) => !all.some((m) => m.id === i)).join(', ')}`); process.exit(2); }
  if (arg('--changed')) {
    chosen = touchedSince(arg('--changed'), chosen);
    console.log(`${chosen.length} of ${all.length} mutants stand on what changed since ${arg('--changed').slice(0, 8)}`);
  }
  if (arg('--part')) chosen = partOf(chosen, arg('--part'));
  const register = require('./register.cjs');
  let classes = register.readCommitted().classes;
  try { const joined = register.readPrivate?.(); if (joined?.classes) classes = [...classes, ...joined.classes]; } catch { /* public only */ }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MOBILE, encoding: 'utf8' }).trim();
  const results = [];
  // Ctrl+C ends the run after the mutant in hand is put back, never with it in.
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.error('stopping once this mutant is put back'); });
  for (const m of chosen) {
    if (stopping) break;
    const t0 = Date.now();
    const { verdict, why } = runOne(m);
    console.log(`${verdict.padEnd(11)} ${m.private ? '(private)' : m.id}  ${m.private ? '' : m.class}  ${Math.round((Date.now() - t0) / 1000)}s${why && !m.private ? `  — ${why}` : ''}`);
    results.push({ class: m.class, mutant: m.id, proof: m.source === 'judge' ? 'judge' : proofId(m, classes), commit, verdict, private: !!m.private, why, m });
  }
  // The count-only file: a run of some mutants replaces their entries and keeps the others'.
  const out = arg('--results');
  if (out) {
    const kept = existsSync(out) && !argv.includes('--fresh') ? JSON.parse(readFileSync(out, 'utf8')) : [];
    const ran = results.filter((r) => !r.private).map(keep);
    const merged = all.filter((m) => !m.private).map((m) => ran.find((r) => r.mutant === m.id) ?? kept.find((r) => r.mutant === m.id)).filter(Boolean);
    writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
  }
  // The fuller record, in the private folder: source, the test file and title, and why (P0.72).
  const priv = privateDir();
  if (priv && results.length) {
    const dir = join(priv, 'mutants');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${commit}.json`);
    const had = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    const full = results.map(({ m, ...r }) => ({ ...keep(r), source: m.source, test: m.proof ? `${m.proof.file}: ${m.proof.test}` : m.judge.run.slice(1, 2).join(''), why: r.why }));
    writeFileSync(file, `${JSON.stringify([...had.filter((h) => !full.some((f) => f.mutant === h.mutant)), ...full], null, 2)}\n`);
  }
  const bad = results.filter((r) => r.verdict !== 'caught');
  console.log(`\n${results.length - bad.length} of ${results.length} caught`);
  process.exit(bad.length ? 1 : 0);
}

module.exports = {
  applyEdits, argumentsFault, changesOf, gather, hunksOf, lf, partOf, pathsOf, PLACED, privateDir, proofId, putBackLeftover,
  compileFaults, readMutants, really, reverse, runOne, standsOn, statusIn, touchedSince,
};
