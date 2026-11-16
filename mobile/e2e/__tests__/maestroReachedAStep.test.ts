/**
 * maestroReachedAStep.test.ts — the iPad job's line between the harness failing and the app
 * failing (e2e/maestro-reached-a-step.cjs), read on the four outputs Maestro wrote on the iPad in
 * iPhone launch 43776770824, and the job that asks it.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const { reachedAStep } = require('../maestro-reached-a-step.cjs') as { reachedAStep: (output: string) => boolean };

const SCRIPT = join(__dirname, '..', 'maestro-reached-a-step.cjs');
const RUN = join(__dirname, 'fixtures', 'maestro-ipad-43776770824');
const output = (name: string) => readFileSync(join(RUN, `${name}.txt`), 'utf8');
const exitOf = (file: string) => {
  try { execFileSync(process.execPath, [SCRIPT, file], { stdio: 'ignore' }); return 0; } catch (e) { return (e as { status: number }).status; }
};

it('a driver that never started, and a launch never answered, reached no step: the harness failed', () => {
  expect(reachedAStep(output('driver-never-ready'))).toBe(false);
  expect(reachedAStep(output('launch-never-answered'))).toBe(false);
});

it('a step that ran and failed reached the app: its verdict stands', () => {
  expect(reachedAStep(output('a-step-failed'))).toBe(true);
});

it('a step answered on the next line, past the simulator\'s own warning, is still an answer', () => {
  // "Wait for animation to end within 5000 ms...WARNING: GL pipe ..." then " COMPLETED".
  expect(output('every-step-ran')).toMatch(/\.\.\.WARNING[^\n]*\r?\n COMPLETED/);
  expect(reachedAStep(output('every-step-ran'))).toBe(true);
});

it('says so in its exit, and reads no output at all as no step reached', () => {
  expect(exitOf(join(RUN, 'a-step-failed.txt'))).toBe(0);
  expect(exitOf(join(RUN, 'driver-never-ready.txt'))).toBe(1);
  expect(exitOf(join(RUN, 'no-such-output.txt'))).toBe(1);
});

it('the iPad job gives a stage that reached no step once more, and never one whose step failed', () => {
  const wf = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8').replace(/\r\n/g, '\n');
  const step = wf.slice(wf.indexOf('The app on an iPad, upright and on its side'), wf.indexOf("Keep the iPad's records"));
  expect(step).toMatch(/if ! stage "\$1" "\$2"; then\n\s+if ! node e2e\/maestro-reached-a-step\.cjs "\$S\/\$1\.txt"; then\n[\s\S]*?stage "\$1" "\$2" && continue\n\s+fi\n/);
});
