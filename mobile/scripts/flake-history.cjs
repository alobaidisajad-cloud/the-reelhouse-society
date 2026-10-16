/**
 * flake-history.cjs — every test's passes and failures, commit by commit, kept
 * from night to night; a test that both passed and failed at one commit is a
 * flake, and a flake fails the night by name (P0.37: a flake is a defect, with
 * a register entry, and no quarantine).
 *
 *   node scripts/flake-history.cjs --commit <sha> --out <file>
 *        [--previous <file>] [--flows <dir>[,<dir>...]] [--jest <record>[,<record>...]]
 *
 * --previous is the file the newest earlier night uploaded. Given and unreadable,
 * it fails by name; not given, the history starts here and says so. --flows are
 * the E2E rounds' log folders (each holds flow-reports/*.xml, Maestro's JUnit
 * reports); --jest are records `jest --json --outputFile` wrote. A flow is named
 * `flow:<name>`, a jest test `jest:<file> › <its full name>`. The newest KEEP
 * commits are kept. Exits 1 naming each flake.
 */
const { existsSync, readFileSync, readdirSync, writeFileSync } = require('fs');
const path = require('path');

const KEEP = 60;

/** Each flow's outcome in one round's folder: [id, passed]. */
function flowOutcomes(dir) {
  const reports = path.join(dir, 'flow-reports');
  if (!existsSync(reports)) return [];
  return readdirSync(reports).filter((f) => f.endsWith('.xml')).flatMap((f) => {
    const xml = readFileSync(path.join(reports, f), 'utf8');
    return [...xml.matchAll(/<testcase\b[^>]*\bname="([^"]+)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)]
      .map((m) => [`flow:${m[1]}`, !/<(failure|error)\b/.test(m[3] ?? '')]);
  });
}

/** Each jest test's outcome in one record, skipped ones left out: [id, passed]. */
function jestOutcomes(record, root) {
  return (record.testResults ?? []).flatMap((file) => {
    const rel = path.relative(root, String(file.name)).split(path.sep).join('/');
    return (file.assertionResults ?? []).filter((t) => t.status === 'passed' || t.status === 'failed')
      .map((t) => [`jest:${rel} › ${t.fullName}`, t.status === 'passed']);
  });
}

/** The history with one night's outcomes added; and the ids that both passed and failed at this commit. */
function addNight(history, commit, outcomes, at) {
  const tests = { ...(history.tests ?? {}) };
  for (const [id, passed] of outcomes) {
    const byCommit = { ...(tests[id] ?? {}) };
    const seen = byCommit[commit] ?? { passes: 0, failures: 0 };
    byCommit[commit] = passed ? { ...seen, passes: seen.passes + 1 } : { ...seen, failures: seen.failures + 1 };
    tests[id] = byCommit;
  }
  const commits = [...(history.commits ?? []).filter((c) => c !== commit), commit].slice(-KEEP);
  for (const id of Object.keys(tests)) {
    for (const c of Object.keys(tests[id])) if (!commits.includes(c)) delete tests[id][c];
    if (!Object.keys(tests[id]).length) delete tests[id];
  }
  const flakes = Object.keys(tests).filter((id) => tests[id][commit]?.passes > 0 && tests[id][commit]?.failures > 0).sort();
  return { history: { started: history.started ?? at, commits, tests }, flakes };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name) => { const at = args.indexOf(name); return at === -1 ? null : args[at + 1]; };
  const commit = flag('--commit');
  const out = flag('--out');
  if (!commit || !out) {
    console.error('usage: node scripts/flake-history.cjs --commit <sha> --out <file> [--previous <file>] [--flows <dir>,...] [--jest <record>,...]');
    process.exit(2);
  }
  let history = {};
  const previous = flag('--previous');
  if (previous) {
    try { history = JSON.parse(readFileSync(previous, 'utf8')); } catch (e) {
      console.error(`✗ the last night's history (${previous}) cannot be read: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log('No earlier night kept a history: it starts here.');
  }
  const list = (name) => (flag(name) ?? '').split(',').filter(Boolean);
  const outcomes = [
    ...list('--flows').flatMap(flowOutcomes),
    ...list('--jest').flatMap((f) => jestOutcomes(JSON.parse(readFileSync(f, 'utf8')), process.cwd())),
  ];
  if (!outcomes.length) { console.error('✗ no outcome was read: no round or record reported'); process.exit(1); }
  const { history: next, flakes } = addNight(history, commit, outcomes, new Date().toISOString().slice(0, 10));
  writeFileSync(out, `${JSON.stringify(next)}\n`);
  console.log(`${outcomes.length} outcomes at ${commit.slice(0, 8)}; ${Object.keys(next.tests).length} tests over ${next.commits.length} commits kept since ${next.started}.`);
  for (const id of flakes) {
    const { passes, failures } = next.tests[id][commit];
    console.log(`✗ FLAKE ${id}: passed ${passes} and failed ${failures} at ${commit.slice(0, 8)}`);
  }
  process.exit(flakes.length ? 1 : 0);
}

module.exports = { addNight, flowOutcomes, jestOutcomes, KEEP };
