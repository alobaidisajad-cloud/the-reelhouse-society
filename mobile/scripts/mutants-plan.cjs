#!/usr/bin/env node
/**
 * mutants-plan.cjs — the parts CI's mutants job runs in, sized by the mutants the push stands on.
 *
 *   node scripts/mutants-plan.cjs --changed <base>      (from mobile/, as the job runs it)
 *
 * Prints, for $GITHUB_OUTPUT, `n=<parts>` and `parts=[1,…,n]`: one part for every PER mutants that
 * mutants.cjs --changed <base> runs there (none stand on CI, which keeps no private record), at least
 * one. Six fixed parts gave a change to the runner's 1,240 mutants 207 a part, and every part ran out
 * of its 45 minutes unjudged (God-Tier 45771212959); 62 a part took 16 to 22 minutes on GitHub's
 * runners (mutants-on-demand 45753109284). A push that touches a few mutants holds one runner.
 */
const PER = 60;

/** The parts for this many mutants: one for every PER, at least one. */
const partsFor = (count) => Math.max(1, Math.ceil(count / PER));

if (require.main === module) {
  const at = process.argv.indexOf('--changed');
  const base = at < 0 ? null : process.argv[at + 1];
  if (!base) { console.error('usage: mutants-plan.cjs --changed <base>'); process.exit(2); }
  const mutants = require('./mutants.cjs');
  const count = mutants.touchedSince(base, mutants.readMutants()).length;
  const n = partsFor(count);
  console.log(`n=${n}`);
  console.log(`parts=${JSON.stringify(Array.from({ length: n }, (_, i) => i + 1))}`);
  console.error(`${count} mutants stand on what changed since ${base}: ${n} part(s), at most ${PER} each`);
}

module.exports = { PER, partsFor };
