/**
 * contractsRan.test.ts — a contract run that reached nothing is not green.
 */
const { faultsOf } = require('../contracts-ran.cjs') as { faultsOf: (r: object, kind?: string) => string[] };

const record = (over: object = {}) => ({
  numTotalTests: 4, numPassedTests: 4, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0,
  numRuntimeErrorTestSuites: 0, numPassedTestSuites: 2,
  testResults: [{ name: '/w/src/services/__tests__/a.contract.test.ts' }, { name: '/w/src/services/__tests__/b.contract.test.ts' }],
  ...over,
});

it('passes a run in which every contract test ran and passed', () => {
  expect(faultsOf(record())).toEqual([]);
});

it('says no to a run whose contracts skipped themselves, having no address to ask', () => {
  expect(faultsOf(record({ numPassedTests: 0, numPendingTests: 4 }))).toEqual(['4 skipped: a contract test with no address passes on nothing']);
});

it('reads a sealed run by its own files: a contract file is not a sealed test, nor the other way', () => {
  const sealed = { testResults: [{ name: '/w/src/stores/__tests__/a.sealed.test.ts' }] };
  expect(faultsOf(record(sealed), 'sealed')).toEqual([]);
  expect(faultsOf(record(), 'sealed')).toEqual(['no sealed test file ran', 'not sealed tests: a.contract.test.ts, b.contract.test.ts']);
  expect(faultsOf(record(sealed))).toEqual(['no contract test file ran', 'not contract tests: a.sealed.test.ts']);
  expect(faultsOf(record({ ...sealed, numPendingTests: 2 }), 'sealed')).toEqual(['2 skipped: a sealed test with no address passes on nothing']);
});

it('says no to a run of nothing, a failure, and a file that is not a contract', () => {
  expect(faultsOf(record({ testResults: [], numTotalTests: 0 }))).toEqual(['no contract test file ran', 'no test ran']);
  expect(faultsOf(record({ numFailedTests: 1 }))).toEqual(['1 failed, 0 suites could not run']);
  expect(faultsOf(record({ testResults: [...record().testResults, { name: '/w/src/x.test.ts' }] }))).toEqual(['not contract tests: x.test.ts']);
});
