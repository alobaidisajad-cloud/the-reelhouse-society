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
      try { yaml.parse(c.after); } catch (e) { faults.push(`${c.file}: ${e.message.split('\n')[0]}`); }
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

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const ids = arg('--ids')?.split(',');
  const all = readMutants();
  const chosen = ids ? all.filter((m) => ids.includes(m.id)) : all;
  if (ids && chosen.length !== ids.length) { console.error(`no such mutant: ${ids.filter((i) => !all.some((m) => m.id === i)).join(', ')}`); process.exit(2); }
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
    results.push({ class: m.class, mutant: m.id, proof: m.source === 'judge' ? 'judge' : proofId(m, classes), commit, verdict, private: !!m.private, why });
  }
  const out = arg('--results');
  if (out) writeFileSync(out, `${JSON.stringify(results.filter((r) => !r.private).map(({ class: c, mutant, proof, commit: at, verdict }) => ({ class: c, mutant, proof, commit: at, verdict })), null, 2)}\n`);
  const bad = results.filter((r) => r.verdict !== 'caught');
  console.log(`\n${results.length - bad.length} of ${results.length} caught`);
  process.exit(bad.length ? 1 : 0);
}

module.exports = { applyEdits, changesOf, hunksOf, lf, proofId, readMutants, really, reverse, runOne, statusIn };
