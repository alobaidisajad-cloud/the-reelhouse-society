/**
 * contracts-ran.cjs — every contract test ran, and none was skipped.
 *
 *   node scripts/contracts-ran.cjs <the record jest --json --outputFile wrote> [--sealed]
 *
 * A contract suite (src/services/__tests__/*.contract.test.ts) skips itself when
 * it has no address to ask (test-utils/contractEnv.ts), so a run that reached
 * nothing passes green. Where a job hands it one (db-integration.yml: the sealed
 * copy of production, through its API; nightly.yml: production itself), this
 * says no unless every contract file ran, every test in them ran, and none failed.
 * Exits 1 naming what fell short. With --sealed, the same of a sealed run
 * (*.sealed.test.ts, test-utils/sealedEnv.ts: the app's own stores against the
 * sealed copy, which db-integration.yml alone hands an address).
 */
const { readFileSync } = require('fs');
const path = require('path');

/** The file names of each kind of run. */
const KINDS = { contract: /\.contract\.test\.tsx?$/, sealed: /\.sealed\.test\.tsx?$/ };

/** What is wrong with a jest record of the contract (or sealed) run ([] when nothing). */
function faultsOf(record, kind = 'contract') {
  const faults = [];
  const files = (record.testResults ?? []).map((t) => path.basename(String(t.name)));
  const ofKind = files.filter((f) => KINDS[kind].test(f));
  if (ofKind.length === 0) faults.push(`no ${kind} test file ran`);
  const others = files.filter((f) => !ofKind.includes(f));
  if (others.length) faults.push(`not ${kind} tests: ${others.join(', ')}`);
  if (!(record.numTotalTests > 0)) faults.push('no test ran');
  if (record.numPendingTests > 0 || record.numTodoTests > 0) faults.push(`${record.numPendingTests + (record.numTodoTests ?? 0)} skipped: a ${kind} test with no address passes on nothing`);
  if (record.numFailedTests > 0 || record.numRuntimeErrorTestSuites > 0) faults.push(`${record.numFailedTests} failed, ${record.numRuntimeErrorTestSuites ?? 0} suites could not run`);
  return faults;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/contracts-ran.cjs <jest --json record> [--sealed]'); process.exit(2); }
  const kind = process.argv.includes('--sealed') ? 'sealed' : 'contract';
  let record;
  try { record = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${file} is not a jest record: ${e.message}`); process.exit(1); }
  const faults = faultsOf(record, kind);
  for (const f of faults) console.log(`✗ ${f}`);
  if (!faults.length) console.log(`every ${kind} test ran: ${record.numPassedTests} tests in ${record.numPassedTestSuites} files, none skipped`);
  process.exit(faults.length ? 1 : 0);
}

module.exports = { faultsOf };
