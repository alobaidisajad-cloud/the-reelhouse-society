/**
 * aFileEndsWithNoTimerWaiting.test.ts — the test environment
 * (test-utils/timerCheckingEnvironment.js) fails a file that ends with a timer
 * still waiting, and passes one that ends them all.
 *
 * Proved the only way that also proves it is the environment jest runs: jest
 * itself is run, with this project's own config, on three small files in
 * timerFixtures/ that no ordinary run picks up (they are not named .test).
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { MOBILE } from '../readCode';

type FileResult = { name: string; status: 'passed' | 'failed'; message: string };

function runFixtures(): FileResult[] {
  const run = spawnSync(
    process.execPath,
    [require.resolve('jest/bin/jest'), '--ci', '--json', '--coverage=false', '--testMatch', '**/timerFixtures/*.fixture.ts', '--', 'timerFixtures'],
    { cwd: MOBILE, encoding: 'utf8', timeout: 150_000 },
  );
  const json = run.stdout.slice(run.stdout.indexOf('{'));
  const report = JSON.parse(json) as { testResults: { name: string; status: FileResult['status']; message: string }[] };
  return report.testResults.map((r) => ({ ...r, name: r.name.split(/[\\/]/).pop() as string }));
}

describe('a file may not end with a timer still waiting', () => {
  let results: FileResult[];
  const of = (name: string) => results.find((r) => r.name === name) as FileResult;

  beforeAll(() => { results = runFixtures(); }, 160_000);

  it('runs all three files', () => {
    expect(results.map((r) => r.name).sort()).toEqual(
      ['leavesATimer.fixture.ts', 'leavesATimerAfterFakeOnes.fixture.ts', 'leavesNothing.fixture.ts'],
    );
  });

  it('fails a file that leaves one, naming the timer and the test that started it', () => {
    const r = of('leavesATimer.fixture.ts');
    expect(r.status).toBe('failed');
    expect(r.message).toContain('This file ended with 1 timer still waiting');
    expect(r.message).toContain('setTimeout(…, 60000), started in "starts a minute it does not wait out"');
    expect(r.message).toMatch(/at .*leavesATimer\.fixture\.ts:3/);
  });

  it('still counts after fake timers hand the real ones back, and names one started outside any test', () => {
    const r = of('leavesATimerAfterFakeOnes.fixture.ts');
    expect(r.status).toBe('failed');
    expect(r.message).toContain('This file ended with 2 timers still waiting');
    expect(r.message).toContain('setInterval(…, 1000), started in "goes back to real timers and leaves one running"');
    expect(r.message).toContain('setTimeout(…, 30000), started outside any test');
  });

  it('passes a file that ends every timer it starts', () => {
    const r = of('leavesNothing.fixture.ts');
    expect(r.message).toBe('');
    expect(r.status).toBe('passed');
  });

  it('is the environment this project runs every file in', () => {
    expect(require(join(MOBILE, 'jest.config.js')).testEnvironment).toBe('<rootDir>/test-utils/timerCheckingEnvironment.js');
  });
});
