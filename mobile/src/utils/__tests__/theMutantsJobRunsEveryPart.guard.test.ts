/**
 * theMutantsJobRunsEveryPart.guard.test.ts — the push's mutants run in parts, and every part runs.
 *
 * One runner ran out of its 45 minutes on a push that changed the mutant runner itself (every
 * mutant stands on it), and no mutant was judged (run 43670385186). The job is split into parts
 * side by side (mutants.cjs --part i/n): the matrix must hold every part 1..n, and the step must ask
 * for its own part of that same n, or a part's mutants are never run and the job is green.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// As the runner reads it, whatever the checkout's line ends (a Windows checkout's CRLF found no job).
const CI = readFileSync(join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'god_tier_ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const job = CI.slice(CI.indexOf('\n  mutants:\n'), CI.indexOf('\n  # ──', CI.indexOf('\n  mutants:\n')));

it('the matrix holds every part from 1 to n, and the step asks for its own part of that n', () => {
  const parts = /part: \[([\d, ]+)\]/.exec(job)?.[1]?.split(',').map((s) => Number(s.trim())) ?? [];
  const asked = /--part \$\{\{ matrix\.part \}\}\/(\d+)/.exec(job)?.[1];
  expect(parts.length).toBeGreaterThan(1);
  expect(parts).toEqual(Array.from({ length: parts.length }, (_, i) => i + 1));
  expect(Number(asked)).toBe(parts.length);
  expect(job).toContain(`of ${parts.length})`);
});

it('a part that fails leaves the other parts running', () => {
  expect(job).toMatch(/fail-fast: false/);
});
