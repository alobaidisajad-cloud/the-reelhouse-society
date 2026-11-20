#!/usr/bin/env node
/**
 * contracts-commit.cjs — the commit whose questions production is asked each night (nightly.yml, contracts).
 *
 * Production holds the migrations mobile/supabase/APPLIED.txt names. While the tree holds a migration that
 * list does not name (a train not yet run), the code at HEAD asks for what production does not have
 * yet: a column round 14 adds answers 400, every night until the owner runs the train. HEAD's own
 * questions are asked on every push of production as the train will leave it (db-integration.yml,
 * contracts), so production itself is asked the questions of the commit that last recorded a train:
 * the code its schema matches. A 400 there is drift, and fails as one. Once nothing is pending, HEAD.
 *
 *   node scripts/contracts-commit.cjs     prints commit=, pending= and oldest= lines ($GITHUB_OUTPUT)
 */
const { execFileSync } = require('child_process');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const APPLIED = 'mobile/supabase/APPLIED.txt';

/** The commit to ask: the one that last recorded a train while any migration is pending, else HEAD. */
const choose = ({ pending, recorded, head }) => (pending.length ? recorded : head);

/** The repo's own answer: its pending migrations (the train's own reading), the last record, HEAD. */
function asked(root = join(MOBILE, '..')) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const { pendingIn } = require(join(MOBILE, 'supabase', 'diagnostics', 'train.cjs'));
  const pending = pendingIn(root).map((m) => m.name);
  const recorded = git('log', '-1', '--format=%H', '--', APPLIED);
  const head = git('rev-parse', 'HEAD');
  if (!recorded) throw new Error(`no commit has recorded a train in ${APPLIED}`);
  return { commit: choose({ pending, recorded, head }), pending, recorded, head };
}

if (require.main === module) {
  const { commit, pending } = asked();
  console.log(`commit=${commit}`);
  console.log(`pending=${pending.length}`);
  console.log(`oldest=${pending[0] ?? ''}`);
}

module.exports = { APPLIED, asked, choose };
