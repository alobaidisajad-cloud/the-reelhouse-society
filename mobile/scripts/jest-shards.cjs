#!/usr/bin/env node
/**
 * jest-shards.cjs — what no one part of a split jest run can judge alone.
 *
 *   node scripts/jest-shards.cjs <parts dir> --shards <N> --name <folder, {i} for the part>
 *        --tests <the output of jest --listTests --json> --runs <record>[,<record>...]
 *        [--require <file> --sites <file>]
 *
 * god_tier_ci.yml runs jest in N parts (`--shard=i/N`), one machine each, and
 * each part keeps its records in its own folder under <parts dir>: for each
 * run it made, the record `jest --json --outputFile=<record>` writes. Read
 * together here:
 *   - every part kept its folder, and a readable record of every run;
 *   - in each run, every test file jest lists ran in exactly one part, and no
 *     part ran a file jest does not list;
 *   - with --require, every source file that list names had a control measured
 *     beside a neighbour on some part's screens (each part's --sites file, as
 *     mockups/tools/layout.cjs writes it). That promise is the whole run's: one
 *     part measures only its own screens.
 * A test file is compared by its path under the folder this runs in, which is
 * where each part ran jest. Exits 1 with each problem in words, 2 when it has
 * nothing to judge or is called wrongly.
 */
const fs = require('fs');
const path = require('path');
const { lostFiles } = require('../mockups/tools/required.cjs');

/** A test file as every machine names it: its path under the folder jest ran in. */
const under = (root, file) => path.relative(root, file).split(path.sep).join('/');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** One part's kept records: each run's test files and its measured sites, null for each not written. */
function readPart(folder, { runs, sites, root }) {
  if (!fs.existsSync(folder)) return { kept: false, runs: {}, sites: null };
  const files = {};
  for (const run of runs) {
    const record = readJson(path.join(folder, run));
    files[run] = Array.isArray(record?.testResults) ? record.testResults.map((t) => under(root, String(t.name))) : null;
  }
  const list = sites ? path.join(folder, sites) : null;
  return {
    kept: true,
    runs: files,
    sites: list && fs.existsSync(list) ? fs.readFileSync(list, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : null,
  };
}

/**
 * The verdict on N parts' records: lines to print, and each problem in words.
 * `runsIn(run, file)`, when given, says which listed files a run is meant to run
 * (a zone outside UTC leaves the tooling's tests out: scripts/test-timezones.js).
 */
function judge(parts, { runs, tests, required = null, runsIn = () => true }) {
  const total = parts.length;
  const problems = [];
  const lines = [];
  parts.forEach((p, i) => {
    const name = `part ${i + 1}/${total}`;
    if (!p.kept) { problems.push(`${name} kept nothing: it never ran, or ended before it kept its records`); return; }
    for (const run of runs) if (!p.runs[run]) problems.push(`${name} wrote no record of ${run}: its jest did not finish`);
    if (required !== null && !p.sites) problems.push(`${name} wrote no list of the controls it measured`);
    const said = runs.map((run) => (p.runs[run] ? `${p.runs[run].length} test files in ${run}` : `no record of ${run}`));
    if (required !== null) said.push(p.sites ? `${p.sites.length} controls measured` : 'no list of controls');
    lines.push(`${name}: ${said.join(', ')}`);
  });

  const listed = new Set(tests);
  for (const run of runs) {
    const where = new Map();
    parts.forEach((p, i) => { for (const f of p.runs[run] ?? []) where.set(f, [...(where.get(f) ?? []), i + 1]); });
    // A part with no record is named above; its files are not named one by one.
    const everyRecord = parts.every((p) => p.runs[run]);
    for (const f of tests.filter((t) => runsIn(run, t))) {
      const at = where.get(f) ?? [];
      if (at.length > 1) problems.push(`${f} ran in parts ${at.join(', ')} of ${run}: a file runs in one`);
      if (at.length === 0 && everyRecord) problems.push(`${f} ran in no part of ${run}`);
    }
    for (const [f, at] of where) {
      if (!listed.has(f)) problems.push(`${f} ran in part ${at.join(', ')} of ${run}, but jest does not list it: the parts ran another tree`);
      else if (!runsIn(run, f)) problems.push(`${f} ran in part ${at.join(', ')} of ${run}, which leaves it out`);
    }
  }

  if (required !== null) {
    if (parts.every((p) => p.sites)) {
      for (const f of lostFiles(required, parts.flatMap((p) => p.sites))) {
        problems.push(`LOST  ${f} — no control of it was measured beside a neighbour, on any part's screens`);
      }
    } else {
      lines.push('(the required controls are not judged: a part wrote no list of what it measured)');
    }
  }
  return { lines, problems };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args.splice(at, 2)[1];
  };
  const total = Number(flag('--shards'));
  const template = flag('--name');
  const testsFile = flag('--tests');
  const runs = (flag('--runs') ?? '').split(',').filter(Boolean);
  const requireFile = flag('--require');
  const sites = flag('--sites');
  const dir = args[0];
  const usage = () => {
    console.error('usage: node scripts/jest-shards.cjs <parts dir> --shards <N> --name <folder with {i}>'
      + ' --tests <jest --listTests --json> --runs <record>[,<record>...] [--require <file> --sites <file>]');
    process.exit(2);
  };
  if (!dir || !Number.isInteger(total) || total < 1 || !template?.includes('{i}') || !testsFile || !runs.length
    || !requireFile !== !sites) usage();

  const root = process.cwd();
  const listed = readJson(testsFile);
  // A list that holds nothing would pass every part that ran nothing.
  if (!Array.isArray(listed) || !listed.length) {
    console.error(`✗ ${testsFile} is not jest's list of its test files, or lists none`);
    process.exit(2);
  }
  const tests = listed.map((f) => under(root, String(f))).sort();
  const parts = Array.from({ length: total }, (_, i) => readPart(path.join(dir, template.replace('{i}', String(i + 1))), { runs, sites, root }));
  const required = requireFile ? fs.readFileSync(requireFile, 'utf8') : null;
  // A zone's record runs that zone's files; a record no zone writes, all of them.
  const zones = require('./test-timezones');
  const runsIn = (run, f) => { const tz = zones.zoneOfRecord(run); return tz === null || zones.runsIn(tz, f); };
  const { lines, problems } = judge(parts, { runs, tests, required, runsIn });
  console.log(`jest lists ${tests.length} test files`);
  console.log(lines.join('\n'));
  for (const p of problems) console.log(`✗ ${p}`);
  if (!problems.length) console.log(`every test file ran in exactly one of ${total} parts${required !== null ? ', and every required control was measured' : ''}`);
  process.exit(problems.length ? 1 : 0);
}

module.exports = { judge, readPart };
