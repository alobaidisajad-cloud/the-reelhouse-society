#!/usr/bin/env node
/**
 * The website is frozen for the audit: Vercel publishes every push to main
 * within about 30 seconds, and members use it today. A commit that changes
 * the website's files passes only with the user's dated approval in its
 * message, on a line of its own:
 *   Website-approved: YYYY-MM-DD "<the user's words>"
 * After the app ships the website becomes a landing page, and this freeze ends
 * with that change.
 *
 *   node mobile/scripts/website-freeze.cjs <base>     (where the push starts)
 */
const { execFileSync } = require('child_process');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');

/** The website's files: what Vercel builds and serves. */
const FROZEN = [/^src\//, /^api\//, /^public\//,
  /^(?:index\.html|vite\.config\.js|vercel\.json|tsconfig\.json|package\.json|package-lock\.json)$/];
const frozen = (path) => FROZEN.some((re) => re.test(path));

/** A commit message's approval, or null: a date and the user's words in quotes. */
const approval = (message) => {
  const m = message.match(/^Website-approved: (\d{4}-\d{2}-\d{2}) "([^"]{3,})"\s*$/m);
  return m ? { date: m[1], words: m[2] } : null;
};

/** Each commit that changes the website without an approval: its hash and the files. */
const unapproved = (commits) => commits
  .map((c) => ({ ...c, files: c.files.filter(frozen) }))
  .filter((c) => c.files.length && !approval(c.message))
  .map((c) => `${c.hash.slice(0, 8)} ${c.subject}\n    ${c.files.join('\n    ')}`);

if (require.main === module) {
  const base = process.argv[2];
  if (!base) { console.error('usage: node mobile/scripts/website-freeze.cjs <base commit>'); process.exit(2); }
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  const commits = git('rev-list', '--no-merges', `${base}..HEAD`).split('\n').filter(Boolean).map((hash) => ({
    hash,
    subject: git('log', '-1', '--format=%s', hash).trim(),
    message: git('log', '-1', '--format=%B', hash),
    files: git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', hash).split('\n').filter(Boolean),
  }));
  const bad = unapproved(commits);
  if (bad.length) {
    console.error(`The website is frozen; these change it with no "Website-approved:" line:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`No commit since the base changes the website without the user's approval (${commits.length} read).`);
}

module.exports = { approval, frozen, unapproved };
