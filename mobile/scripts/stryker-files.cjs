#!/usr/bin/env node
/**
 * Stryker on each logic file the register lists (register/stryker.yaml, WORKLIST P0.70), one file
 * at a time against its own tests, and each file's score judged against the floor.
 *
 *   node mobile/scripts/stryker-files.cjs                      every file
 *   node mobile/scripts/stryker-files.cjs --only <file>,…      those named
 *   node mobile/scripts/stryker-files.cjs --part <i/n>         every n-th file from the i-th (the nightly's machines)
 *   node mobile/scripts/stryker-files.cjs --judge              the last reports, without running
 *   node mobile/scripts/stryker-files.cjs --results <json>     also writes each file's score (count-only, P0.39)
 *
 * Any other argument, or an option without its value, is refused (exit 2) before anything runs: a
 * mistyped option must never start the hour-long run of every file.
 *
 * A file's score is Stryker's: the mutants its tests killed or timed out, out of those they could
 * have (a mutant that does not compile or cannot run counts neither way). A survivor written in
 * register/stryker-equivalents.yaml (its file, its line's code and column in it, mutator and replacement,
 * with why no test can tell it apart) counts neither way too; an entry that matches no survivor is stale,
 * and fails.
 * Exit 1 when a file is under the floor, an entry is stale, or a file's run did not finish.
 */
const { spawnSync } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js'));
const LIST = yaml.parse(readFileSync(join(MOBILE, 'register', 'stryker.yaml'), 'utf8'));
const EQUIVALENTS = join(MOBILE, 'register', 'stryker-equivalents.yaml');

const slugOf = (file) => file.replace(/[/.]/g, '_');
const reportOf = (file) => join(MOBILE, 'reports', 'stryker', `${slugOf(file)}.json`);
const DETECTED = ['Killed', 'Timeout'];
const UNDETECTED = ['Survived', 'NoCoverage'];

/**
 * Where a mutant stands, as an equivalent names it: its line's code, read from the source Stryker
 * mutated (indentation and line end aside), and its column in that code. Never the line's number:
 * three lines written above timeAgo's left eight entries naming no survivor (nightly 40473942587).
 */
const placeOf = (lines, m) => {
  const raw = lines[m.location.start.line - 1] ?? '';
  return { code: raw.trim(), at: m.location.start.column - (raw.length - raw.trimStart().length) };
};

/** Whether an equivalents entry names this mutant: its file, its code and column there, mutator and replacement. */
const names = (e, file, place, m) => e.file === file && e.code === place.code && e.at === place.at && e.mutator === m.mutatorName && e.replacement === m.replacement;

/**
 * A file's verdict from its report: its score, its counts, the survivors no equivalent names (to
 * kill), and the equivalents that name no survivor (stale).
 */
const judge = (file, report, equivalents, floor) => {
  const mutants = report.files?.[file]?.mutants;
  if (!mutants) return { file, score: null, fault: 'no report for it' };
  const mine = equivalents.filter((e) => e.file === file);
  const lines = String(report.files[file].source ?? '').split('\n');
  const undetected = mutants.filter((m) => UNDETECTED.includes(m.status));
  const named = (e, m) => names(e, file, placeOf(lines, m), m);
  const equivalent = undetected.filter((m) => mine.some((e) => named(e, m)));
  const left = undetected.filter((m) => !equivalent.includes(m));
  const detected = mutants.filter((m) => DETECTED.includes(m.status)).length;
  // Stale only when its mutant was killed: a timeout says the runner was slow, not that a test
  // kills it (text.ts's conjunct rule timed out on a slow night, 39 of its mutants with it).
  const stale = mine.filter((e) => !mutants.some((m) => (UNDETECTED.includes(m.status) || m.status === 'Timeout') && named(e, m)));
  const score = detected + left.length ? Math.floor((detected / (detected + left.length)) * 10000) / 100 : 100;
  return {
    file, score, killed: detected, survived: left.length, equivalent: equivalent.length, stale,
    left: left.map((m) => `${file}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName} → ${String(m.replacement).split('\n')[0].slice(0, 80)} (${m.status})`),
    fault: score < floor ? `${score}% is under ${floor}%` : stale.length ? `${stale.length} equivalent(s) name no survivor` : null,
  };
};

/**
 * The zone every run's tests keep time in: behind UTC, where a calendar date read as an
 * instant (UTC midnight) falls on the day before. In UTC (the nightly's machines) or ahead
 * of it, a mutant that makes that mistake survives every test.
 */
const STRYKER_ZONE = 'America/Los_Angeles';

/**
 * One file's Stryker run, writing to the console as it goes (its progress every ten seconds,
 * so a run of two hours can be read while it runs, here or in the nightly's log); whether it
 * finished.
 */
const run = (file) => {
  mkdirSync(join(MOBILE, 'reports', 'stryker'), { recursive: true });
  console.log(`\n── Stryker: ${file} ──`);
  const r = spawnSync(process.execPath, [join(MOBILE, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js'), 'run'],
    { cwd: MOBILE, stdio: 'inherit', env: { ...process.env, STRYKER_FILE: file, TZ: STRYKER_ZONE } });
  if (r.status === 0) return null;
  return `Stryker did not finish (${r.error ? r.error.message : `exit ${r.status ?? r.signal}`}): its output above says why`;
};

/** The options and whether each takes a value. */
const OPTIONS = { '--only': true, '--part': true, '--results': true, '--judge': false };

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

if (require.main === module) {
  const argv = process.argv.slice(2);
  const refused = argumentsFault(argv);
  if (refused) { console.error(refused); process.exit(2); }
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const only = arg('--only')?.split(',');
  let files = LIST.files.map((f) => f.file).filter((f) => !only || only.includes(f));
  // Part i of n: every n-th file from the i-th, so each machine holds a share of the large ones.
  if (arg('--part')) {
    const [i, n] = arg('--part').split('/').map(Number);
    if (!(n >= 1 && i >= 1 && i <= n)) { console.error(`--part wants i/n, as 2/3 (has ${arg('--part')})`); process.exit(2); }
    files = files.filter((_, k) => k % n === i - 1);
  }
  if (only && files.length !== only.length) { console.error(`not in register/stryker.yaml: ${only.filter((f) => !files.includes(f)).join(', ')}`); process.exit(2); }
  const equivalents = existsSync(EQUIVALENTS) ? yaml.parse(readFileSync(EQUIVALENTS, 'utf8')).equivalents ?? [] : [];
  const verdicts = files.map((file) => {
    const failed = argv.includes('--judge') ? null : run(file);
    if (failed) return { file, score: null, fault: failed };
    if (!existsSync(reportOf(file))) return { file, score: null, fault: 'no report written' };
    return judge(file, JSON.parse(readFileSync(reportOf(file), 'utf8')), equivalents, LIST.floor);
  });
  for (const v of verdicts) {
    console.log(`${v.fault ? '✗' : '✓'} ${String(v.score ?? '—').padStart(6)}%  ${v.file}${v.fault ? `  — ${v.fault}` : ''}`);
    for (const l of v.left ?? []) console.log(`      survives: ${l}`);
    for (const s of v.stale ?? []) console.log(`      stale equivalent: ${s.file} ${s.mutator} at ${s.at} of: ${s.code}`);
  }
  const out = arg('--results');
  if (out) writeFileSync(out, `${JSON.stringify(verdicts.map(({ file, score, killed, survived, equivalent }) => ({ file, score, killed, survived, equivalent })), null, 2)}\n`);
  const bad = verdicts.filter((v) => v.fault);
  console.log(`\n${verdicts.length - bad.length} of ${verdicts.length} files at or over ${LIST.floor}%`);
  process.exit(bad.length ? 1 : 0);
}

module.exports = { argumentsFault, judge, names, slugOf, STRYKER_ZONE };
