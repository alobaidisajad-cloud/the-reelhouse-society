#!/usr/bin/env node
/**
 * Run before every EAS build, in the fresh worktree the build is made from.
 *
 * It refuses when the tree holds anything not committed (EAS, with
 * requireCommit, refuses too, but later and with less said), when generated
 * native folders are present (a stale `android/` or `ios/` would be built in
 * place of the config), and when HEAD is not on origin/main (only what the
 * checks ran on is built). Then it runs the two checks that keep the upload to
 * what is committed, and prints the hash to record with the build.
 */
const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const MOBILE = join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: MOBILE, encoding: 'utf8' }).trim();
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };

const dirty = git('status', '--porcelain', '-uall');
if (dirty) refuse(`the tree is not the commit:\n${dirty}`);
for (const native of ['android', 'ios']) {
  if (existsSync(join(MOBILE, native))) refuse(`mobile/${native} exists; build from a fresh worktree`);
}
const head = git('rev-parse', 'HEAD');
git('fetch', '--quiet', 'origin', 'main');
try { git('merge-base', '--is-ancestor', head, 'origin/main'); } catch { refuse(`${head} is not on origin/main`); }

execFileSync('npx', ['jest', '--testPathIgnorePatterns', 'worktrees', 'node_modules', '--',
  'src/utils/__tests__/easUpload.guard.test.ts', 'src/utils/__tests__/appConfig.guard.test.ts'],
{ cwd: MOBILE, stdio: 'inherit', shell: process.platform === 'win32' });

const app = require(join(MOBILE, 'app.json')).expo;
console.log(`READY: commit ${head}, iOS build ${app.ios.buildNumber}, Android versionCode ${app.android.versionCode}`);
