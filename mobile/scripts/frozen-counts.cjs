#!/usr/bin/env node
/**
 * Frozen counts: a class with a finder is held at an exact count in every file,
 * and a count may only fall (WORKLIST P0.65 and P0.47).
 *
 * Each check below is a finder; register/frozen-counts.json holds its count in
 * every file, by path from the repository root:
 *   floating-promise   typed ESLint's no-floating-promises: a promise nobody awaits or voids
 *   misused-promise    typed ESLint's no-misused-promises: a promise handed where nothing waits
 *                      for it (an async handler, a promise read as a condition)
 *   unchecked-index    tsc over tsconfig.strict-index.json, noUncheckedIndexedAccess on: a value
 *                      read by index or key used as if it is always there
 *   edge-type-error    deno check over every edge function: both trees, and the sealed world's
 *                      stand-in; each `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` counts too
 *   edge-lint          deno lint over the same files; each `deno-lint-ignore` counts too
 *
 * The check fails when a file's count is above its baseline (a file the baseline
 * does not name has a baseline of 0), and when it is below it: a count that fell
 * is lowered in the same commit (`--lower` writes it, and the register's counts
 * with it), or the room it leaves would let a new case in unseen. A finder that
 * errors, or reads nothing, fails: a tool that broke is never a count of zero.
 * Inline `eslint-disable` comments are not read, so none can take a case out.
 *
 *   node mobile/scripts/frozen-counts.cjs                  every check against the baseline
 *   node mobile/scripts/frozen-counts.cjs --only a,b       those checks only
 *   node mobile/scripts/frozen-counts.cjs --lower          writes counts that fell, never a rise
 *   node mobile/scripts/frozen-counts.cjs --base <commit>  no committed count rose since <commit>
 *   node mobile/scripts/frozen-counts.cjs --selftest       each finder counts its planted cases
 */
const { execFileSync, spawnSync } = require('child_process');
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { dirname, join, relative, resolve, sep } = require('path');
const { fileURLToPath } = require('url');

const ROOT = join(__dirname, '..', '..');
const MOBILE = join(ROOT, 'mobile');
const BASELINE = join(MOBILE, 'register', 'frozen-counts.json');
const BASELINE_IN_GIT = 'mobile/register/frozen-counts.json';

const PROMISE_RULES = {
  '@typescript-eslint/no-floating-promises': 'floating-promise',
  '@typescript-eslint/no-misused-promises': 'misused-promise',
};
const CHECKS = ['floating-promise', 'misused-promise', 'unchecked-index', 'edge-type-error', 'edge-lint'];
const EDGE_CHECKS = ['edge-type-error', 'edge-lint'];
const APP_CHECKS = CHECKS.filter((c) => !EDGE_CHECKS.includes(c));

/** The register's class for each finder, held at the sum of its checks. */
const CLASSES = {
  'CODE-promise-not-awaited': ['floating-promise', 'misused-promise'],
  'CODE-index-read-unchecked': ['unchecked-index'],
  'EDGE-function-static-fault': ['edge-type-error', 'edge-lint'],
};

// Deno 2, which the sealed world's config.toml serves them on; one release, CI and here.
const DENO = 'deno@2.1.4';
const EDGE_TREES = ['supabase/functions', 'mobile/supabase/functions', 'mobile/e2e/supabase/functions'];

const fromRoot = (abs) => relative(ROOT, abs).split(sep).join('/');
const bump = (counts, file) => { counts[file] = (counts[file] ?? 0) + 1; };

// ── the finders ──────────────────────────────────────────────────────────────

/** The files a tsconfig holds, as tsc reads them. */
const filesOf = (project) => {
  const ts = require('typescript');
  const fail = (d) => { throw new Error(`${project}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`); };
  const parsed = ts.getParsedCommandLineOfConfigFile(project, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: fail });
  if (parsed.errors.length) fail(parsed.errors[0]);
  return parsed.fileNames.filter((f) => !f.endsWith('.d.ts')).map((f) => resolve(f));
};

/** Typed ESLint, the two promise rules alone, over every file the project holds. */
async function promiseCounts(project = join(MOBILE, 'tsconfig.json')) {
  const { ESLint } = require('eslint');
  const cwd = dirname(project);
  const files = filesOf(project);
  if (!files.length) throw new Error(`${project} holds no files to lint`);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: [{
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: require('@typescript-eslint/parser'), parserOptions: { project, tsconfigRootDir: cwd } },
      plugins: { '@typescript-eslint': require('@typescript-eslint/eslint-plugin') },
      rules: Object.fromEntries(Object.keys(PROMISE_RULES).map((r) => [r, 'error'])),
    }],
  });
  const results = await eslint.lintFiles(files);
  if (results.length !== files.length) throw new Error(`ESLint read ${results.length} of ${files.length} files`);
  const out = { 'floating-promise': {}, 'misused-promise': {} };
  for (const r of results) {
    for (const m of r.messages) {
      const check = PROMISE_RULES[m.ruleId];
      if (!check) throw new Error(`ESLint could not read ${fromRoot(r.filePath)}: ${m.message}`);
      bump(out[check], fromRoot(r.filePath));
    }
  }
  return out;
}

/** tsc's plain output, counted by file; anything but a file's error is a tool failure. */
const tscCounts = (text, status, cwd) => {
  const counts = {};
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue; // a message's further lines are indented
    const m = /^(.+)\(\d+,\d+\): error TS\d+: /.exec(line);
    if (!m) throw new Error(`tsc said something that is not a file's error: ${line}`);
    bump(counts, fromRoot(resolve(cwd, m[1])));
    n += 1;
  }
  if (status !== 0 && n === 0) throw new Error(`tsc failed (exit ${status}) and named no file`);
  return counts;
};

function indexCounts(project = join(MOBILE, 'tsconfig.strict-index.json')) {
  const r = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--pretty', 'false', '-p', project], {
    cwd: dirname(project), encoding: 'utf8', maxBuffer: 1e9,
  });
  if (r.error) throw r.error;
  return { 'unchecked-index': tscCounts(`${r.stdout}${r.stderr}`, r.status, dirname(project)) };
}

/** Deno, fetched by npx at its pinned release; the path of its own binary. */
let denoPath;
const deno = () => {
  if (denoPath) return denoPath;
  const args = ['-y', DENO, 'eval', 'console.log(Deno.execPath())'];
  const options = { cwd: ROOT, encoding: 'utf8', env: denoEnv() };
  // Windows starts npx through its shell, and so takes one quoted command line.
  const r = process.platform === 'win32'
    ? spawnSync(['npx', ...args.map((a) => JSON.stringify(a))].join(' '), { ...options, shell: true })
    : spawnSync('npx', args, options);
  const path = r.stdout?.trim().split(/\r?\n/).pop();
  if (r.status !== 0 || !path || !existsSync(path)) throw new Error(`could not fetch ${DENO}: ${r.stderr || r.error}`);
  denoPath = path;
  return path;
};
// No colour; no package.json read as a project; no notice that a newer Deno exists.
const denoEnv = () => ({ ...process.env, NO_COLOR: '1', DENO_NO_PACKAGE_JSON: '1', DENO_NO_UPDATE_CHECK: '1' });

/** Every code file of the edge functions, by path from the repository root. */
const edgeFiles = () => {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js)$/.test(n) && !n.endsWith('.d.ts')) out.push(fromRoot(p));
    }
  };
  for (const t of EDGE_TREES) if (existsSync(join(ROOT, t))) walk(join(ROOT, t));
  return out.sort();
};

const located = (where) => fromRoot(where.startsWith('file:') ? fileURLToPath(where) : where);

/**
 * deno check's output: each error's own place is the first `at` after its
 * header. A file Deno checked clean before, unchanged, is not checked again
 * and prints nothing (it keeps no record of a failure), so silence with exit 0
 * is clean; the planted case, at a new path each run, is always checked.
 */
const denoCheckCounts = (text, status) => {
  const lines = text.split(/\r?\n/);
  const counts = {};
  let n = 0;
  let open = false;
  for (const line of lines) {
    if (/^(error: )?TS\d+ \[ERROR\]/.test(line)) { open = true; n += 1; continue; }
    const at = /^\s+at (\S+):\d+:\d+$/.exec(line);
    if (open && at) { bump(counts, located(at[1])); open = false; }
  }
  const found = /^Found (\d+) errors?\.$/m.exec(text);
  if (open || (found && Number(found[1]) !== n)) throw new Error(`deno check's errors could not each be placed:\n${text}`);
  if (status !== 0 && n === 0) throw new Error(`deno check failed (exit ${status}) and named no error:\n${text}`);
  return counts;
};

const denoLintCounts = (json) => {
  const report = JSON.parse(json);
  if (!Array.isArray(report.diagnostics) || report.errors?.length) {
    throw new Error(`deno lint could not read every file: ${JSON.stringify(report.errors ?? report)}`);
  }
  const counts = {};
  for (const d of report.diagnostics) bump(counts, located(d.filename));
  return counts;
};

function edgeCounts(files = edgeFiles(), cwd = ROOT) {
  if (!files.length) throw new Error('no edge function files found');
  const bin = deno();
  const run = (args) => spawnSync(bin, args, { cwd, encoding: 'utf8', env: denoEnv(), maxBuffer: 1e8 });
  const check = run(['check', '--no-config', ...files.filter((f) => f.endsWith('.ts'))]);
  const lint = run(['lint', '--no-config', '--json', ...files]);
  if (lint.status !== 0 && !lint.stdout.trim()) throw new Error(`deno lint failed (exit ${lint.status}): ${lint.stderr}`);
  const out = {
    'edge-type-error': denoCheckCounts(`${check.stdout}${check.stderr}`, check.status),
    'edge-lint': denoLintCounts(lint.stdout),
  };
  // A comment that silences a finding hides a case; it is counted in its place.
  for (const f of files) {
    const text = readFileSync(join(cwd, f), 'utf8');
    const file = fromRoot(join(cwd, f));
    const silenced = (re) => (text.match(re) ?? []).length;
    for (let i = silenced(/@ts-(ignore|expect-error|nocheck)\b/g); i > 0; i -= 1) bump(out['edge-type-error'], file);
    for (let i = silenced(/deno-lint-ignore(-file)?\b/g); i > 0; i -= 1) bump(out['edge-lint'], file);
  }
  return out;
}

/** Each finder run once, for the checks asked. */
async function measure(checks) {
  const out = {};
  if (checks.some((c) => c.endsWith('-promise'))) Object.assign(out, await promiseCounts());
  if (checks.includes('unchecked-index')) Object.assign(out, indexCounts());
  if (checks.some((c) => EDGE_CHECKS.includes(c))) Object.assign(out, edgeCounts());
  return Object.fromEntries(checks.map((c) => [c, out[c]]));
}

// ── the rules ────────────────────────────────────────────────────────────────

/** What is wrong with a baseline as data ([] when nothing). */
const shapeFaults = (baseline) => {
  const f = [];
  for (const c of CHECKS) if (!baseline[c] || typeof baseline[c] !== 'object') f.push(`no ${c} section`);
  for (const [c, files] of Object.entries(baseline)) {
    if (!CHECKS.includes(c)) { f.push(`a check this script does not know: ${c}`); continue; }
    for (const [file, n] of Object.entries(files ?? {})) if (!Number.isInteger(n) || n < 1) f.push(`${c} ${file}: ${n} is not a count above 0`);
  }
  return f;
};

/** Each file whose count is not its baseline: rose (a new case) or fell (a stale baseline). */
const compare = (baseline, measured) => {
  const rose = [];
  const fell = [];
  for (const [check, now] of Object.entries(measured)) {
    const was = baseline[check] ?? {};
    for (const file of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const a = was[file] ?? 0;
      const b = now[file] ?? 0;
      if (b > a) rose.push({ check, file, was: a, now: b });
      if (b < a) fell.push({ check, file, was: a, now: b });
    }
  }
  return { rose, fell };
};

/**
 * Every file whose committed count is above what the base commit allowed it. A
 * renamed file keeps its old name's allowance; a check the base did not have is
 * being frozen, so all of it is allowed.
 */
const baseFaults = (then, now, renamedFrom) => {
  const f = [];
  for (const [check, files] of Object.entries(now)) {
    if (!then[check]) continue;
    for (const [file, n] of Object.entries(files)) {
      const allowed = then[check][file] ?? then[check][renamedFrom[file]] ?? 0;
      if (n > allowed) f.push({ check, file, was: allowed, now: n });
    }
  }
  return f;
};

/** The checks a change to these paths (from the repository root) can move. */
const checksTouchedBy = (paths) => {
  const touched = new Set();
  for (const p of paths) {
    if (p === BASELINE_IN_GIT || p === 'mobile/scripts/frozen-counts.cjs') CHECKS.forEach((c) => touched.add(c));
    else if (EDGE_TREES.some((t) => p.startsWith(`${t}/`))) EDGE_CHECKS.forEach((c) => touched.add(c));
    else if (/^mobile\/(.*\.(tsx?|[cm]?js)|tsconfig[^/]*\.json|package(-lock)?\.json)$/.test(p)) APP_CHECKS.forEach((c) => touched.add(c));
  }
  return CHECKS.filter((c) => touched.has(c));
};

const total = (files) => Object.values(files ?? {}).reduce((a, b) => a + b, 0);
const classTotals = (baseline) => Object.fromEntries(Object.entries(CLASSES).map(([id, checks]) => [id, checks.reduce((s, c) => s + total(baseline[c]), 0)]));

const readBaseline = () => JSON.parse(readFileSync(BASELINE, 'utf8'));
const sorted = (files) => Object.fromEntries(Object.entries(files).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1)));

/** The new baseline, and the register's counts and CLASSES.md made from it. */
const writeLowered = (baseline) => {
  const next = Object.fromEntries(CHECKS.map((c) => [c, sorted(baseline[c] ?? {})]));
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  const yamlPath = join(MOBILE, 'register', 'classes.yaml');
  let text = readFileSync(yamlPath, 'utf8');
  for (const [id, n] of Object.entries(classTotals(next))) {
    const block = new RegExp(`(- id: ${id}\\r?\\n(?:(?!  - id: )[\\s\\S])*?count: )\\d+`);
    if (!block.test(text)) throw new Error(`classes.yaml has no class ${id} with a count`);
    text = text.replace(block, `$1${n}`);
  }
  writeFileSync(yamlPath, text);
  const { readCommitted, render } = require('./register.cjs');
  writeFileSync(join(MOBILE, 'register', 'CLASSES.md'), render(readCommitted()));
};

// ── the cases planted for each finder ─────────────────────────────────────────

const PLANTED_TS = [
  'const later = (): Promise<number> => Promise.resolve(1);',
  'later();', // floating-promise
  '// eslint-disable-next-line @typescript-eslint/no-floating-promises',
  'later();', // floating-promise, still counted
  '[1].forEach(async () => { await later(); });', // misused-promise
  'const xs: number[] = [1];',
  'export const first: number = xs[0];', // unchecked-index
  '',
].join('\n');
const PLANTED_EDGE = [
  'export const n: number = "one";', // edge-type-error
  '// @ts-ignore',
  'export const m: number = "two";', // edge-type-error, by its comment; edge-lint, a bare one
  'export const loose: any = 1;', // edge-lint
  '// deno-lint-ignore no-explicit-any',
  'export const looser: any = 2;', // edge-lint, as the comment above it
  '',
].join('\n');
const PLANTED = { 'floating-promise': 2, 'misused-promise': 1, 'unchecked-index': 1, 'edge-type-error': 2, 'edge-lint': 3 };

async function selftest(checks) {
  const dir = mkdtempSync(join(tmpdir(), 'frozen-counts-'));
  try {
    writeFileSync(join(dir, 'planted.ts'), PLANTED_TS);
    const project = join(dir, 'tsconfig.json');
    writeFileSync(project, JSON.stringify({ extends: join(MOBILE, 'tsconfig.strict-index.json'), include: ['planted.ts'], exclude: [], compilerOptions: { paths: {}, types: [] } }));
    const out = {};
    if (checks.some((c) => c.endsWith('-promise'))) Object.assign(out, await promiseCounts(project));
    if (checks.includes('unchecked-index')) Object.assign(out, indexCounts(project));
    if (checks.some((c) => EDGE_CHECKS.includes(c))) {
      mkdirSync(join(dir, 'edge'));
      writeFileSync(join(dir, 'edge', 'planted.ts'), PLANTED_EDGE);
      Object.assign(out, edgeCounts(['edge/planted.ts'], dir));
    }
    return checks.filter((c) => total(out[c]) !== PLANTED[c]).map((c) => `${c} counted ${total(out[c])} of the ${PLANTED[c]} planted`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── the command ──────────────────────────────────────────────────────────────

const say = (list) => list.map((x) => `  ${x.check}  ${x.file}: ${x.was} → ${x.now}`).join('\n');

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  const only = arg('--only') ? arg('--only').split(',') : CHECKS;
  const unknown = only.filter((c) => !CHECKS.includes(c));
  if (unknown.length) { console.error(`Unknown checks: ${unknown.join(', ')} (known: ${CHECKS.join(', ')})`); return 2; }

  if (argv.includes('--selftest')) {
    const faults = await selftest(only);
    if (faults.length) { console.error(`A finder did not count what was planted for it:\n  ${faults.join('\n  ')}`); return 1; }
    console.log(`Each finder counted the cases planted for it: ${only.join(', ')}.`);
    return 0;
  }

  if (argv.includes('--base')) {
    const base = arg('--base');
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
    let then;
    try { then = JSON.parse(git('show', `${base}:${BASELINE_IN_GIT}`)); } catch {
      console.log(`No frozen counts at ${base.slice(0, 8)}: every count here is being frozen.`);
      return 0;
    }
    const now = JSON.parse(git('show', `HEAD:${BASELINE_IN_GIT}`));
    const renamedFrom = {};
    for (const line of git('diff', '-M', '--name-status', '--diff-filter=R', base, 'HEAD').split('\n')) {
      const [, from, to] = line.split('\t');
      if (to) renamedFrom[to] = from;
    }
    const faults = baseFaults(then, now, renamedFrom);
    if (faults.length) {
      console.error(`A frozen count was raised since ${base.slice(0, 8)}; a count may only fall:\n${say(faults)}`);
      return 1;
    }
    console.log(`No frozen count rose since ${base.slice(0, 8)}.`);
    return 0;
  }

  const baseline = readBaseline();
  const shape = shapeFaults(baseline);
  if (shape.length) { console.error(`${BASELINE_IN_GIT} is not whole:\n  ${shape.join('\n  ')}`); return 1; }
  const t0 = Date.now();
  const measured = await measure(only);
  const { rose, fell } = compare(baseline, measured);
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);

  if (argv.includes('--lower')) {
    if (rose.length) { console.error(`Not written: these rose, and a count may only fall:\n${say(rose)}`); return 1; }
    writeLowered({ ...baseline, ...measured });
    console.log(fell.length ? `Lowered:\n${say(fell)}` : 'Nothing fell; the baseline is as it was.');
    return 0;
  }

  for (const c of only) console.log(`${c}: ${total(measured[c])} in ${Object.keys(measured[c]).length} files`);
  if (rose.length) {
    console.error(`\nA new case, in a file whose count is frozen (await it, void it with the reason beside it, or check the value):\n${say(rose)}`);
  }
  if (fell.length) {
    console.error(`\nThese fell; lower the baseline in this commit (node mobile/scripts/frozen-counts.cjs --lower):\n${say(fell)}`);
  }
  if (rose.length || fell.length) return 1;
  console.log(`Every count is its baseline (${seconds}s).`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.stack ?? e); process.exit(1); });
}

module.exports = {
  CHECKS, CLASSES, DENO, EDGE_TREES,
  baseFaults, checksTouchedBy, classTotals, compare, denoCheckCounts, denoLintCounts, measure, readBaseline, shapeFaults, tscCounts,
};
