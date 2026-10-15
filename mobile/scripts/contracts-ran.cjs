/**
 * contracts-ran.cjs — every contract test ran, and none was skipped.
 *
 *   node scripts/contracts-ran.cjs <the record jest --json --outputFile wrote>
 *
 * A contract suite (src/services/__tests__/*.contract.test.ts) skips itself when
 * it has no address to ask (test-utils/contractEnv.ts), so a run that reached
 * nothing passes green. Where a job hands it one (db-integration.yml: the sealed
 * copy of production, through its API; nightly.yml: production itself), this
 * says no unless every contract file ran, every test in them ran, and none failed.
 * Exits 1 naming what fell short.
 */
const { readFileSync } = require('fs');
const path = require('path');

/** What is wrong with a jest record of the contract run ([] when nothing). */
function faultsOf(record) {
  const faults = [];
  const files = (record.testResults ?? []).map((t) => path.basename(String(t.name)));
  const contracts = files.filter((f) => /\.contract\.test\.tsx?$/.test(f));
  if (contracts.length === 0) faults.push('no contract test file ran');
  const others = files.filter((f) => !contracts.includes(f));
  if (others.length) faults.push(`not contract tests: ${others.join(', ')}`);
  if (!(record.numTotalTests > 0)) faults.push('no test ran');
  if (record.numPendingTests > 0 || record.numTodoTests > 0) faults.push(`${record.numPendingTests + (record.numTodoTests ?? 0)} skipped: a contract with no address passes on nothing`);
  if (record.numFailedTests > 0 || record.numRuntimeErrorTestSuites > 0) faults.push(`${record.numFailedTests} failed, ${record.numRuntimeErrorTestSuites ?? 0} suites could not run`);
  return faults;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/contracts-ran.cjs <jest --json record>'); process.exit(2); }
  let record;
  try { record = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${file} is not a jest record: ${e.message}`); process.exit(1); }
  const faults = faultsOf(record);
  for (const f of faults) console.log(`✗ ${f}`);
  if (!faults.length) console.log(`every contract ran: ${record.numPassedTests} tests in ${record.numPassedTestSuites} files, none skipped`);
  process.exit(faults.length ? 1 : 0);
}

module.exports = { faultsOf };
