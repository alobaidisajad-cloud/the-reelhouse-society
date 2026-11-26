#!/usr/bin/env node
/**
 * commit.cjs — a commit of exactly the paths named, and nothing else.
 *
 *   node mobile/scripts/commit.cjs --message <file> -- <path>...
 *
 * Paths are as git takes them from where it is run. Before anything is staged,
 * it refuses when something else is already staged (it would ride along), when
 * no path or no message is given, or when the message file is empty. It then
 * stages the paths, refuses a named path that brings no change (a mistyped
 * path would otherwise commit the rest without it), prints what is staged
 * (`git diff --cached --name-status`), and commits from the message file. The
 * hooks run as for any commit.
 *
 *   node mobile/scripts/commit.cjs --merge <branch> --message <file>
 *   node mobile/scripts/commit.cjs --merge-continue --message <file> -- <path>...
 *
 * A finished branch brought into HEAD by a merge commit: its history kept, so every mutant verdict
 * recorded at one of its commits stays a verdict of this history (a rebase writes new commits, and every
 * one recorded on the old ones was lost: 2026-11-26, four branches, 500 mutants run again). --merge
 * refuses anything staged or changed, merges with no commit yet, writes the mutant results file from
 * both sides (scripts/mutants.cjs mergeResults: the verdict that still stands on the merged files), and
 * commits from the message file with the hooks. A conflict anywhere else leaves the merge in hand, the
 * files named: resolve them, then --merge-continue names them, stages them (none may hold a conflict
 * mark), writes the results again and commits. Then `mutants.cjs --changed origin/main --results
 * register/mutant-results.json` runs only the mutants the merge changed, as the push gate would.
 */
const { execFileSync, spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });
/** Every staged path, from the top of the repo: a renamed file by both its names, not its new one alone. */
const staged = () => git(['diff', '--cached', '--no-renames', '--name-only', '-z']).split('\0').filter(Boolean);
/** A path as the repo names it, from the top. */
const fromTop = (paths) => git(['ls-files', '--full-name', '--error-unmatch', '--', ...paths], { stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n').filter(Boolean);

function refuse(why) {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
}

function parse(argv) {
  const at = argv.indexOf('--');
  const opts = at < 0 ? argv : argv.slice(0, at);
  const paths = at < 0 ? [] : argv.slice(at + 1);
  const m = opts.indexOf('--message');
  return { message: m < 0 ? null : opts[m + 1] ?? null, paths };
}

/** A conflict mark git writes, at a line's start. */
const CONFLICT_MARK = /^(?:<{7}|>{7})(?: |$)|^={7}$/m;

/** The files a merge in hand still holds unmerged, from the top of the repo. */
const unmerged = () => git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);

/**
 * The mutant results file of a merge in hand, written from both sides and staged (where the repo has
 * one): say how many of its verdicts stand. A registry not yet merged is left for the hand, and said.
 */
function settleResults(root) {
  const file = 'mobile/register/mutant-results.json';
  if (!existsSync(resolve(root, file))) return;
  if (unmerged().includes('mobile/register/mutants.yaml')) { console.log(`${file}: written once register/mutants.yaml is merged (--merge-continue)`); return; }
  const { stand, mutants } = require('./mutants.cjs').resolveMergedResults(root);
  git(['add', '--', file], { cwd: root });
  console.log(`${file}: written from both sides; ${stand} of ${mutants} verdicts stand on the merged files`);
}

/** The merge commit, from the message file, the hooks run; refused while a file is still unmerged. */
function commitMerge(root, message) {
  const left = unmerged();
  if (left.length) {
    console.error(`The merge is in hand. Resolve by hand, then: node mobile/scripts/commit.cjs --merge-continue --message ${message} -- ${left.join(' ')}`);
    console.error(`  unmerged: ${left.join(', ')}`);
    process.exit(1);
  }
  process.stdout.write(git(['diff', '--cached', '--no-renames', '--name-status', 'HEAD']));
  const commit = spawnSync('git', ['commit', '-q', '-F', resolve(message)], { stdio: 'inherit', cwd: root });
  process.exit(commit.status ?? 1);
}

/** --merge and --merge-continue (the header). */
function merge(argv, message, paths) {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const inHand = existsSync(git(['rev-parse', '--git-path', 'MERGE_HEAD']).trim());
  if (argv.includes('--merge-continue')) {
    if (!inHand) refuse('no merge in hand (--merge <branch> starts one)');
    if (!paths.length) refuse('name the files you resolved after --');
    const marked = paths.filter((p) => existsSync(p) && CONFLICT_MARK.test(readFileSync(p, 'utf8')));
    if (marked.length) refuse(`still holds a conflict mark: ${marked.join(', ')}`);
    const add = spawnSync('git', ['add', '--', ...paths], { encoding: 'utf8' });
    if (add.status !== 0) refuse(`git add: ${add.stderr.trim()}`);
    settleResults(root);
    commitMerge(root, message);
    return;
  }
  const branch = argv[argv.indexOf('--merge') + 1];
  if (!branch || branch.startsWith('--')) refuse('--merge wants the branch to bring in');
  if (inHand) refuse('a merge is already in hand: finish it with --merge-continue, or end it with git merge --abort');
  const changed = git(['status', '--porcelain', '--untracked-files=no']).trim();
  if (changed) refuse(`the working files hold changes: commit them first (${changed.split('\n').length} file(s))`);
  const r = spawnSync('git', ['merge', '--no-ff', '--no-commit', branch], { encoding: 'utf8', cwd: root });
  process.stdout.write(r.stdout ?? '');
  if (!existsSync(git(['rev-parse', '--git-path', 'MERGE_HEAD']).trim())) refuse(`git merge: ${`${r.stderr}${r.stdout}`.trim() || 'nothing to merge'}`);
  settleResults(root);
  commitMerge(root, message);
}

function main() {
  const argv = process.argv.slice(2);
  const { message, paths } = parse(argv);
  if (argv.includes('--merge') || argv.includes('--merge-continue')) {
    if (!message) refuse('no --message <file>');
    if (!existsSync(message) || readFileSync(message, 'utf8').trim() === '') refuse(`the message file ${message} is missing or empty`);
    merge(argv, message, paths);
    return;
  }
  if (!message) refuse('no --message <file>');
  if (!existsSync(message) || readFileSync(message, 'utf8').trim() === '') refuse(`the message file ${message} is missing or empty`);
  if (paths.length === 0) refuse('no paths named after --');

  const before = staged();
  if (before.length) refuse(`already staged, and not by this commit: ${before.join(', ')}`);

  // git add stages what it can before it fails on one path (an ignored file): that is unstaged again.
  const add = spawnSync('git', ['add', '--', ...paths], { encoding: 'utf8' });
  if (add.status !== 0) {
    const added = staged();
    if (added.length) spawnSync('git', ['reset', '-q', '--', ...added.map((p) => `:/${p}`)], { encoding: 'utf8' });
    refuse(`git add: ${add.stderr.trim()} (nothing was committed; the index is as it was)`);
  }

  const now = new Set(staged());
  // A deleted file is no longer listed by ls-files: name it by the path as given.
  const named = paths.flatMap((p) => {
    try { return fromTop([p]); } catch { return [git(['rev-parse', '--show-prefix']).trim() + p.replace(/\\/g, '/')]; }
  });
  const unchanged = named.filter((p) => !now.has(p) && ![...now].some((s) => s.startsWith(`${p.replace(/\/$/, '')}/`)));
  if (unchanged.length) {
    git(['reset', '-q', '--', ...paths]);
    refuse(`named but brings no change: ${unchanged.join(', ')} (nothing was committed; the index is as it was)`);
  }

  process.stdout.write(git(['diff', '--cached', '--no-renames', '--name-status']));
  const commit = spawnSync('git', ['commit', '-q', '-F', resolve(message)], { stdio: 'inherit' });
  process.exit(commit.status ?? 1);
}

if (require.main === module) main();
module.exports = { parse };
