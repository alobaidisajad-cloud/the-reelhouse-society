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
 */
const { execFileSync, spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });
/** Every staged path, from the top of the repo. */
const staged = () => git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
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

function main() {
  const { message, paths } = parse(process.argv.slice(2));
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

  process.stdout.write(git(['diff', '--cached', '--name-status']));
  const commit = spawnSync('git', ['commit', '-q', '-F', resolve(message)], { stdio: 'inherit' });
  process.exit(commit.status ?? 1);
}

if (require.main === module) main();
module.exports = { parse };
