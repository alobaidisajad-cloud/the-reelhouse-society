#!/usr/bin/env node
/**
 * mutants-remote.cjs — a builder's mutants run on GitHub's runners, never on the machine every builder
 * and the push gate share, and recorded here exactly as a run here records them.
 *
 *   node mobile/scripts/mutants-remote.cjs run --ids <a,b | @file | all> [--parts <n>]
 *   node mobile/scripts/mutants-remote.cjs run --changed <base> [--parts <n>]
 *       --changed: the mutants mutants.cjs --changed <base> would run (touched since base, no verdict
 *       that still stands): after an integrator's merges, only those whose files the merges changed.
 *       Its private ones are named, to run on this machine.
 *       HEAD, committed and clean, pushed to a plant branch of its own (plant/mutants-<commit>-<stamp>:
 *       a plant push runs only what keeps it safe to publish), and .github/workflows/mutants-on-demand.yml
 *       started there on those ids at that commit, in n parts side by side (4 unless said). Prints the run.
 *   node mobile/scripts/mutants-remote.cjs status --run <id>
 *       exits 0 once the run has ended (its conclusion said), 1 while it runs: a Monitor until-loop's test.
 *   node mobile/scripts/mutants-remote.cjs record --run <id> [--results <file>]
 *       the run's verdicts downloaded and recorded as mutants.cjs --results records a run here: the ids
 *       and verdicts, each at the commit it ran at, in register/mutant-results.json (or <file>), and the
 *       fuller record (source, test, why) in the private folder under that commit; each verdict printed
 *       as mutants.cjs prints it. Refused unless every part's verdicts name the one commit, and that commit
 *       is in this checkout's history. Exits 1 when any mutant was not caught, or not run. The plant
 *       branch is deleted once the verdicts are recorded.
 *
 * The private half of the registry is never sent: its ids are refused here, and run on the machine.
 * Needs the GitHub CLI (gh), signed in, as the push and the waits already do.
 */
const { execFileSync, spawnSync } = require('child_process');
const { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const WORKFLOW = 'mutants-on-demand.yml';
const PLANT = /^plant\/mutants-[0-9a-f]{12}-[0-9a-z]+$/;

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9, ...opts });
const refuse = (why, code = 2) => { console.error(why); process.exit(code); };

/** The options and whether each takes a value. */
const OPTIONS = { '--ids': true, '--changed': true, '--parts': true, '--run': true, '--results': true };

/** What is wrong with these arguments (after the command), or null. */
const argumentsFault = (command, argv) => {
  if (!['run', 'status', 'record'].includes(command)) return `unknown command ${command ?? '(none)'}: run, status or record`;
  for (let k = 0; k < argv.length; k++) {
    if (!(argv[k] in OPTIONS)) return `unknown argument ${argv[k]} (the options: ${Object.keys(OPTIONS).join(', ')})`;
    if (argv[k + 1] === undefined || argv[k + 1] in OPTIONS) return `${argv[k]} wants a value`;
    k++;
  }
  const has = (o) => argv.includes(o);
  if (command === 'run' && has('--ids') === has('--changed')) return 'run wants --ids or --changed, one of them';
  if (command !== 'run' && !has('--run')) return `${command} wants --run <id>`;
  return null;
};

/** The ids asked for: by commas, one a line from @file, or all; each a public mutant of the registry, else why not. */
const idsOf = (spec, mutants) => {
  if (spec === 'all') return { ids: 'all' };
  const ids = (spec.startsWith('@') ? readFileSync(spec.slice(1), 'utf8').split(/\r?\n/) : spec.split(',')).map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !mutants.some((m) => m.id === id));
  const hidden = ids.filter((id) => mutants.some((m) => m.id === id && m.private));
  if (!ids.length) return { fault: 'no ids' };
  if (unknown.length) return { fault: `no such mutant: ${unknown.join(', ')}` };
  if (hidden.length) return { fault: `private mutants run on this machine, never on GitHub: ${hidden.length} of the ids` };
  return { ids: ids.join(',') };
};

/**
 * Every part's verdicts read together: each entry `keep`'s shape, each id once, all at one commit; or
 * what is wrong, in words. `records` are the parts' fuller records, matched to the results by id.
 */
const readParts = (parts) => {
  const results = parts.flatMap((p) => p.results);
  const records = parts.flatMap((p) => p.records);
  const commits = [...new Set(results.map((r) => r.commit))];
  const ids = results.map((r) => r.mutant);
  const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const faults = [
    ...(commits.length > 1 ? [`the parts ran at ${commits.length} commits: ${commits.join(', ')}`] : []),
    ...twice.map((id) => `${id}: in more than one part`),
    ...results.filter((r) => !records.some((x) => x.mutant === r.mutant && x.verdict === r.verdict)).map((r) => `${r.mutant}: no record of its verdict`),
  ];
  return { results, records, commit: commits[0] ?? null, faults };
};

/** One downloaded part: its results and its record, each [] where the part wrote none. */
const readPart = (dir) => {
  const read = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : []);
  return { results: read('mutant-results.json'), records: read('mutant-record.json') };
};

/** A run as GitHub tells it: { status, conclusion, headBranch, url }. */
const runOf = (id) => JSON.parse(sh('gh', ['run', 'view', id, '--json', 'status,conclusion,headBranch,url,displayTitle']));

function start(argv, arg) {
  const mutants = require('./mutants.cjs');
  const all = mutants.readMutants();
  let spec = arg('--ids');
  if (arg('--changed')) {
    const touched = mutants.touchedSince(arg('--changed'), all);
    const here = touched.filter((m) => m.private).map((m) => m.id);
    console.log(`${touched.length} mutants touched since ${arg('--changed').slice(0, 8)} have no verdict that still stands (${touched.stood} stand)`);
    if (here.length) console.log(`private, to run on this machine: node mobile/scripts/mutants.cjs --ids ${here.join(',')} --results register/mutant-results.json`);
    spec = touched.filter((m) => !m.private).map((m) => m.id).join(',');
    if (!spec) { console.log('none to run on GitHub'); return 0; }
  }
  const chosen = idsOf(spec, all);
  if (chosen.fault) refuse(chosen.fault);
  const parts = arg('--parts') ?? '4';
  if (!/^([1-9]|1[0-9]|20)$/.test(parts)) refuse(`--parts takes 1 to 20 (has ${parts})`);
  if (sh('git', ['status', '--porcelain', '--untracked-files=no']).trim()) refuse('the working files hold changes: mutants run on a commit, so commit first');
  const commit = sh('git', ['rev-parse', 'HEAD']).trim();
  const stamp = Date.now().toString(36);
  const branch = `plant/mutants-${commit.slice(0, 12)}-${stamp}`;
  const push = spawnSync('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { cwd: MOBILE, stdio: 'inherit' });
  if (push.status !== 0) refuse(`the push of ${branch} failed`, 1);
  sh('gh', ['workflow', 'run', WORKFLOW, '--ref', branch, '-f', `commit=${commit}`, '-f', `ids=${chosen.ids}`, '-f', `parts=${parts}`, '-f', `token=${stamp}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  // GitHub lists the run a moment after it is asked for: its branch is this run's alone.
  for (let tries = 0; tries < 30; tries++) {
    const runs = JSON.parse(sh('gh', ['run', 'list', '--workflow', WORKFLOW, '--branch', branch, '--json', 'databaseId,url', '-L', '1']));
    if (runs.length) {
      console.log(`run ${runs[0].databaseId} (${runs[0].url}): ${chosen.ids === 'all' ? 'every public mutant' : `${chosen.ids.split(',').length} mutants`} at ${commit.slice(0, 8)}, in ${parts} parts`);
      console.log(`wait: until node mobile/scripts/mutants-remote.cjs status --run ${runs[0].databaseId}; do sleep 60; done`);
      console.log(`then: node mobile/scripts/mutants-remote.cjs record --run ${runs[0].databaseId}`);
      return 0;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  refuse(`started on ${branch}, but GitHub listed no run of it within a minute: gh run list --workflow ${WORKFLOW} --branch ${branch}`, 1);
  return 1;
}

function status(arg) {
  const run = runOf(arg('--run'));
  if (run.status !== 'completed') { console.log(`run ${arg('--run')}: ${run.status}`); return 1; }
  console.log(`run ${arg('--run')}: ended, ${run.conclusion}`);
  return 0;
}

function record(arg) {
  const id = arg('--run');
  const run = runOf(id);
  if (run.status !== 'completed') refuse(`run ${id} has not ended (${run.status})`, 1);
  if (!PLANT.test(run.headBranch ?? '')) refuse(`run ${id} is not a mutants-remote run (branch ${run.headBranch})`);
  const dir = mkdtempSync(join(tmpdir(), 'mutants-remote-'));
  try {
    sh('gh', ['run', 'download', id, '--pattern', 'mutants-on-demand-*', '--dir', dir], { stdio: ['ignore', 'pipe', 'inherit'] });
    const parts = readdirSync(dir).map((p) => readPart(join(dir, p)));
    const read = readParts(parts);
    if (read.faults.length) refuse(`run ${id}'s verdicts were not recorded:\n  ${read.faults.join('\n  ')}`, 1);
    if (!read.commit) refuse(`run ${id} holds no verdict`, 1);
    const mutants = require('./mutants.cjs');
    if (!mutants.ancestor(read.commit)) refuse(`run ${id} ran at ${read.commit.slice(0, 8)}, which is not in this checkout's history: its verdicts are not this branch's`, 1);
    const all = mutants.readMutants();
    const out = arg('--results') ?? join(MOBILE, 'register', 'mutant-results.json');
    mutants.writeResults(out, read.results, all);
    mutants.writePrivate(read.records, read.commit);
    for (const r of read.records) console.log(`${r.verdict.padEnd(11)} ${r.mutant}  ${r.class}${r.why ? `  — ${r.why}` : ''}`);
    const bad = read.results.filter((r) => r.verdict !== 'caught');
    console.log(`\n${parts.length} part(s) of run ${id} (${run.url}), at ${read.commit.slice(0, 8)}: ${read.results.length - bad.length} of ${read.results.length} caught; recorded in ${out}`);
    const gone = spawnSync('git', ['push', 'origin', '--delete', run.headBranch], { cwd: MOBILE, encoding: 'utf8' });
    console.log(gone.status === 0 ? `${run.headBranch} deleted` : `${run.headBranch} not deleted: ${gone.stderr.trim()}`);
    return bad.length ? 1 : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const [command, ...argv] = process.argv.slice(2);
  const fault = argumentsFault(command, argv);
  if (fault) refuse(fault);
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  process.exit(command === 'run' ? start(argv, arg) : command === 'status' ? status(arg) : record(arg));
}

module.exports = { PLANT, argumentsFault, idsOf, readPart, readParts };
