/**
 * The one way the house publishes an over-the-air update (Decision 6, P4.30).
 *
 *   node scripts/publish-update.cjs publish --message "<what it changes>"
 *   node scripts/publish-update.cjs widen --group <update group id>
 *   node scripts/publish-update.cjs rollback --group <update group id>
 *
 * publish: from a clean main, the update goes to a branch of its own, its source maps to Sentry
 * (and it stops there if that fails: an update whose crashes cannot be read is not sent), then the
 * production channel takes it for a small share of phones. widen: after a soak with no new Sentry
 * issue, the next share, until all. rollback: the channel goes back to what it ran before. Every
 * step is written to updates-published.json. Every installed build follows `production` (internal
 * extends it), and an update reaches only a build with its native code (runtimeVersion fingerprint).
 *
 * Needs EXPO_TOKEN (EAS) and SENTRY_AUTH_TOKEN in the environment; prints neither.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MOBILE = path.join(__dirname, '..');
const LEDGER = path.join(MOBILE, 'updates-published.json');
const CHANNEL = 'production';
/** The shares of phones, in turn: never all at once. */
const STEPS = [5, 25, 50, 100];
/** Hours a share runs with no new Sentry issue before the next. */
const SOAK_HOURS = 24;
const SENTRY = { org: 'the-reelhouse-society', project: 'react-native' };

const readLedger = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
const writeLedger = (file, rows) => fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);

/** The update's group id from `eas update --json` (one group across platforms). */
function groupOf(stdout) {
  const rows = JSON.parse(stdout);
  const groups = [...new Set((Array.isArray(rows) ? rows : [rows]).map((r) => r.group).filter(Boolean))];
  if (groups.length !== 1) throw new Error(`eas update returned ${groups.length} update groups, not one`);
  return groups[0];
}

/** Publishes, uploads the maps, starts the rollout at STEPS[0]; returns the ledger row. */
function publish({ message, run, now, ledgerFile = LEDGER, sha }) {
  if (!message) throw new Error('publish needs --message: what this update changes');
  if (!(STEPS[0] < 100)) throw new Error('the first share must be a small one');
  const branch = `production-${now().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${sha}`;
  const update = run('eas', ['update', '--branch', branch, '--message', message, '--platform', 'all', '--non-interactive', '--json']);
  if (update.code !== 0) throw new Error('eas update failed: nothing was published');
  const row = { group: groupOf(update.stdout), branch, message, sha, at: now().toISOString(), upload: 'pending', steps: [] };
  const rows = readLedger(ledgerFile);
  const upload = run('npx', ['sentry-expo-upload-sourcemaps', 'dist']);
  row.upload = upload.code === 0 ? 'ok' : 'failed';
  if (upload.code !== 0) {
    writeLedger(ledgerFile, [...rows, row]);
    throw new Error(`the source maps did not reach Sentry: update ${row.group} is on branch ${branch} and goes to no phone`);
  }
  const start = run('eas', ['channel:rollout', CHANNEL, '--action', 'create', '--branch', branch, '--percent', String(STEPS[0]), '--non-interactive']);
  if (start.code !== 0) {
    writeLedger(ledgerFile, [...rows, row]);
    throw new Error('the rollout did not start: the update goes to no phone');
  }
  row.steps.push({ percent: STEPS[0], at: now().toISOString() });
  writeLedger(ledgerFile, [...rows, row]);
  return row;
}

/** The next share, after a soak with no new Sentry issue since the last. */
function widen({ group, run, now, newIssuesSince, ledgerFile = LEDGER }) {
  const rows = readLedger(ledgerFile);
  const row = rows.find((r) => r.group === group);
  if (!row || !row.steps.length) throw new Error(`no rollout of ${group} in the ledger`);
  const last = row.steps[row.steps.length - 1];
  if (last.percent >= 100 || last.ended) throw new Error(`${group} is already on every phone, or ended`);
  const hours = (now() - new Date(last.at)) / 3600000;
  if (hours < SOAK_HOURS) throw new Error(`${group} has soaked ${hours.toFixed(1)} of ${SOAK_HOURS} hours at ${last.percent}%`);
  const fresh = newIssuesSince(last.at);
  if (fresh > 0) throw new Error(`${fresh} new Sentry issue(s) since ${last.at}: read them, or roll ${group} back`);
  const next = STEPS[STEPS.indexOf(last.percent) + 1];
  const done = next === 100;
  const step = done
    ? run('eas', ['channel:rollout', CHANNEL, '--action', 'end', '--outcome', 'republish-and-revert', '--non-interactive'])
    : run('eas', ['channel:rollout', CHANNEL, '--action', 'edit', '--percent', String(next), '--non-interactive']);
  if (step.code !== 0) throw new Error(`the rollout did not move to ${next}%`);
  row.steps.push({ percent: next, at: now().toISOString() });
  writeLedger(ledgerFile, rows);
  return row;
}

/** The channel back to what it ran before the update. */
function rollback({ group, run, now, ledgerFile = LEDGER }) {
  const rows = readLedger(ledgerFile);
  const row = rows.find((r) => r.group === group);
  if (!row) throw new Error(`no update ${group} in the ledger`);
  const end = run('eas', ['channel:rollout', CHANNEL, '--action', 'end', '--outcome', 'revert', '--non-interactive']);
  if (end.code !== 0) throw new Error('the rollback did not take: check the channel by hand');
  row.steps.push({ percent: 0, at: now().toISOString(), ended: 'rolled back' });
  writeLedger(ledgerFile, rows);
  return row;
}

module.exports = { publish, widen, rollback, groupOf, STEPS, SOAK_HOURS, CHANNEL };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const sh = (c, a) => spawnSync(c, a, { cwd: MOBILE, encoding: 'utf8', shell: process.platform === 'win32' });
  const run = (c, a) => {
    const r = sh(c === 'eas' ? 'npx' : c, c === 'eas' ? ['--yes', 'eas-cli', ...a] : a);
    if (r.stderr) process.stderr.write(r.stderr);
    return { code: r.status ?? 1, stdout: r.stdout ?? '' };
  };
  const git = (...a) => (sh('git', a).stdout || '').trim();
  const newIssuesSince = (iso) => {
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) throw new Error('widen needs SENTRY_AUTH_TOKEN, to read the soak');
    const q = encodeURIComponent(`is:unresolved firstSeen:>${iso}`);
    const r = spawnSync('curl', ['-sf', '-H', `Authorization: Bearer ${token}`,
      `https://sentry.io/api/0/projects/${SENTRY.org}/${SENTRY.project}/issues/?query=${q}`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('Sentry could not be read: the soak is unknown, so nothing widens');
    return JSON.parse(r.stdout).length;
  };
  const now = () => new Date();
  try {
    if (cmd === 'publish') {
      if (git('status', '--porcelain')) throw new Error('the tree is not clean: an update is published from what is committed');
      if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) throw new Error('HEAD is not origin/main: an update is published from main');
      console.log(JSON.stringify(publish({ message: opt('message'), run, now, sha: git('rev-parse', '--short', 'HEAD') }), null, 2));
    } else if (cmd === 'widen') {
      console.log(JSON.stringify(widen({ group: opt('group'), run, now, newIssuesSince }), null, 2));
    } else if (cmd === 'rollback') {
      console.log(JSON.stringify(rollback({ group: opt('group'), run, now }), null, 2));
    } else {
      throw new Error('publish --message "<what>" | widen --group <id> | rollback --group <id>');
    }
  } catch (e) {
    console.error(`publish-update: ${e.message}`);
    process.exit(1);
  }
}
