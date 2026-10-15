#!/usr/bin/env node
/**
 * Points git at the tracked hooks (mobile/githooks), for this checkout and
 * every worktree of it: `npm ci` and `npm install` in mobile/ run it (the
 * `prepare` script). A worktree's own setting (an old one named the removed
 * mobile/.husky) is cleared, so the repo's setting reaches it. Where there is
 * no git checkout (an EAS build) it does nothing, and it never fails an
 * install.
 */
const { execFileSync } = require('child_process');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  git('rev-parse', '--is-inside-work-tree');
} catch {
  process.exit(0);
}
try {
  git('config', 'core.hooksPath', 'mobile/githooks');
  const worktrees = git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  for (const dir of worktrees) {
    try {
      execFileSync('git', ['-C', dir, 'config', '--worktree', '--unset', 'core.hooksPath'], { stdio: 'ignore' });
    } catch { /* none set */ }
  }
  console.log('git hooks: mobile/githooks');
} catch (e) {
  console.warn(`git hooks not installed: ${e.message}`);
}
