/**
 * aMarkIsNeverLeftToTheNextTest.guard.test.ts — no test sees a mark an earlier test left in the marks'
 * ledger.
 *
 * A tap still in flight (a write queued with no signal) is the member's newest word on its mark, and
 * the ledger outlived the test that made it: the next test's read laid no answer over it. Three files
 * met it in the nightly's random order (45829548435, seed -2139178644: the interaction slice and the
 * reader; 45894847027, seed 56285631: the Vault), each fixed alone. Now jest.afterEnv.ts empties the
 * ledger before every test of every file. Proved by running jest on ledgerFixtures/, whose first test
 * leaves a mark in flight: written order (the leak's), and the random orders of several seeds.
 */
import { spawnSync } from 'child_process';
import { MOBILE } from '@/test-utils/readCode';

// Worktrees in this checkout hold copies of the fixtures; the hooks' own pattern leaves them out.
const { ignored } = require('../../scripts/hooks/pre-push.cjs') as { ignored: (mobile: string) => string[] };

/** The fixture run by jest itself, with this project's config: written order, or a seed's. */
function runFixture(seed: number | null): { status: string; passed: number } {
  const run = spawnSync(
    process.execPath,
    [require.resolve('jest/bin/jest'), '--ci', '--json', '--coverage=false', '--testMatch', '**/ledgerFixtures/*.fixture.ts',
      ...(seed === null ? [] : ['--randomize', `--seed=${seed}`]),
      '--testPathIgnorePatterns', ...ignored(MOBILE), '--', 'ledgerFixtures'],
    { cwd: MOBILE, encoding: 'utf8', timeout: 150_000, env: { ...process.env, JEST_BACKWARDS: '' } },
  );
  const report = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))) as {
    testResults: { status: string; assertionResults: { status: string }[] }[];
  };
  const [file] = report.testResults;
  if (!file) throw new Error(`jest ran no fixture: ${run.stderr.slice(-400)}`);
  return { status: file.status, passed: file.assertionResults.filter((a) => a.status === 'passed').length };
}

it('no test sees a mark an earlier test left in flight, in the written order or any seed\'s', () => {
  for (const seed of [null, 1, 2, 56285631]) {
    expect({ seed, ...runFixture(seed) }).toEqual({ seed, status: 'passed', passed: 2 });
  }
}, 320_000);
