#!/usr/bin/env node
/**
 * Before a push: what CI would refuse is refused here, before it reaches main
 * (Vercel publishes main within seconds, and a push cancels a running E2E).
 * For the commits being pushed:
 *   - the website freeze, the add-only check and the migration lint;
 *   - the app's types, lint on the changed files, and the tests related to them
 *     with the repo's own guards (the comment ledger, the source-reading
 *     ledger, the workflows, the hooks).
 * Run by mobile/githooks/pre-push, which git feeds one line per ref:
 *   <local ref> <local sha> <remote ref> <remote sha>
 */
const { execFileSync, spawnSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const MOBILE = join(ROOT, 'mobile');
const ZERO = /^0+$/;
const GUARDS = ['everyCommentIsTrue', 'everySourceReaderIsLedgered', 'ciWorkflows.guard', 'hooks.guard'];

/** Where each pushed ref starts: the remote's tip, or where a new branch left main. */
const basesOf = (input, git) => input.split('\n').filter(Boolean).flatMap((line) => {
  const [, local, , remote] = line.trim().split(/\s+/);
  if (!local || ZERO.test(local)) return [];
  if (remote && !ZERO.test(remote)) return [remote];
  return [git('merge-base', local, 'origin/main').trim()];
});

const run = (label, cmd, args, cwd) => {
  console.log(`→ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0 ? null : label;
};

if (require.main === module) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const bases = basesOf(readFileSync(0, 'utf8'), git);
  const faults = [];
  for (const base of bases) {
    for (const script of ['website-freeze.cjs', 'add-only.cjs', 'migration-lint.cjs']) {
      const f = run(`${script} from ${base.slice(0, 8)}`, 'node', [join(MOBILE, 'scripts', script), base], ROOT);
      if (f) faults.push(f);
    }
  }
  const changed = [...new Set(bases.flatMap((b) => git('diff', '--name-only', '--diff-filter=ACMR', `${b}...HEAD`).split('\n')))]
    .filter((p) => p.startsWith('mobile/')).map((p) => p.slice('mobile/'.length));
  const code = changed.filter((p) => /\.(?:[cm]?js|tsx?)$/.test(p));
  if (code.length) {
    const t = run('types', 'npx', ['tsc', '--noEmit', '-p', '.'], MOBILE);
    if (t) faults.push(t);
    const l = run('lint on the changed files', 'npx', ['eslint', '--max-warnings=0', '--no-warn-ignored', ...code], MOBILE);
    if (l) faults.push(l);
  }
  const jest = ['jest', '--testPathIgnorePatterns', 'worktrees', 'node_modules'];
  if (code.length) {
    const j = run('the tests related to the changed files', 'npx', [...jest, '--passWithNoTests', '--findRelatedTests', ...code], MOBILE);
    if (j) faults.push(j);
  }
  if (changed.length) {
    const g = run('the repo\'s own guards', 'npx', [...jest, '--', ...GUARDS], MOBILE);
    if (g) faults.push(g);
  }
  if (faults.length) { console.error(`\nPush refused: ${faults.join('; ')}`); process.exit(1); }
}

module.exports = { basesOf };
