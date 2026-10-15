#!/usr/bin/env node
/**
 * Every commit a push brings was made with the hooks: its message carries the
 * `Hooks-Ran: pre-commit` trailer that mobile/githooks/commit-msg adds after the
 * pre-commit checks pass. Two kinds are made where no hook runs, and pass
 * without it: a commit Dependabot authored, and the merge GitHub makes
 * (committer web-flow) of a pull request Dependabot opened. Every other commit
 * without the trailer fails, so `git commit --no-verify` cannot reach main
 * unseen.
 *
 *   node mobile/scripts/hooks-ran.cjs <base>     (where the push starts)
 */
const { execFileSync } = require('child_process');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');
const TRAILER = /^Hooks-Ran: pre-commit$/m;

/** Why a commit fails, or null. */
const faultOf = ({ author, committer, message }) => {
  if (TRAILER.test(message)) return null;
  if (author === 'dependabot[bot]') return null;
  if (committer === 'web-flow' && /^Merge pull request #\d+ from [^\s]*dependabot\//m.test(message)) return null;
  if (committer === 'web-flow' && author === 'dependabot[bot]') return null;
  return 'made without the hooks (no "Hooks-Ran: pre-commit" trailer)';
};

if (require.main === module) {
  const base = process.argv[2];
  if (!base) { console.error('usage: node mobile/scripts/hooks-ran.cjs <base commit>'); process.exit(2); }
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const hashes = git('rev-list', `${base}..HEAD`).split('\n').filter(Boolean);
  const faults = hashes.flatMap((h) => {
    const [author, committer] = git('log', '-1', '--format=%an%x00%cn', h).trim().split('\0');
    const fault = faultOf({ author, committer, message: git('log', '-1', '--format=%B', h) });
    return fault ? [`${h.slice(0, 8)} ${git('log', '-1', '--format=%s', h).trim()}: ${fault}`] : [];
  });
  if (faults.length) { console.error(`Commits that skipped the hooks:\n  ${faults.join('\n  ')}`); process.exit(1); }
  console.log(`Every commit since the base was made with the hooks (${hashes.length} read).`);
}

module.exports = { faultOf };
