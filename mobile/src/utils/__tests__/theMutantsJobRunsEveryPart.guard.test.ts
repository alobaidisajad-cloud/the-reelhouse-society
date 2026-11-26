/**
 * theMutantsJobRunsEveryPart.guard.test.ts — the push's mutants run in parts, and every part runs.
 *
 * One runner ran out of its 45 minutes on a push that changed the mutant runner itself (every
 * mutant stands on it), and no mutant was judged (run 43670385186); six fixed parts did the same
 * with 1,240 (God-Tier 45771212959). The job is split into parts side by side (mutants.cjs --part
 * i/n), as many as scripts/mutants-plan.cjs counts for the push: the matrix must hold every part
 * 1..n of the plan's n, and the step must ask for its own part of that same n, or a part's mutants
 * are never run and the job is green.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const plan = require('../../../scripts/mutants-plan.cjs') as { PER: number; partsFor: (count: number) => number };

// As the runner reads it, whatever the checkout's line ends (a Windows checkout's CRLF found no job).
const CI = readFileSync(join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'god_tier_ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const jobOf = (name: string) => {
  const at = CI.indexOf(`\n  ${name}:\n`);
  return at < 0 ? '' : CI.slice(at + 1, CI.slice(at + 1).search(/\n {2}(# ──|[a-z][\w-]*:\n)/) + at + 1);
};
const job = jobOf('mutants');
const counted = jobOf('mutants-plan');

it('the matrix holds every part from 1 to n, and the step asks for its own part of that n', () => {
  expect(counted).toContain('node scripts/mutants-plan.cjs --changed "$BEFORE" >> "$GITHUB_OUTPUT"');
  expect(counted).toMatch(/n: \$\{\{ steps\.plan\.outputs\.n \}\}/);
  expect(counted).toMatch(/parts: \$\{\{ steps\.plan\.outputs\.parts \}\}/);
  expect(job).toContain('needs: mutants-plan');
  expect(job).toContain('part: ${{ fromJSON(needs.mutants-plan.outputs.parts) }}');
  expect(job).toContain('--part ${{ matrix.part }}/${{ needs.mutants-plan.outputs.n }}');
  expect(job).toContain('of ${{ needs.mutants-plan.outputs.n }})');
});

it('sizes the parts by the mutants the push stands on: one for every 60, at least one', () => {
  expect(plan.PER).toBe(60);
  expect([0, 1, 60, 61, 120, 1240].map(plan.partsFor)).toEqual([1, 1, 1, 2, 2, 21]);
});

it('a part that fails leaves the other parts running', () => {
  expect(job).toMatch(/fail-fast: false/);
});
