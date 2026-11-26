#!/usr/bin/env node
/**
 * The whole history's secrets, counted against the register. gitleaks reads
 * every commit with the repo's rules and its baseline (.gitleaksignore); what
 * the baseline does not excuse is a secret still standing in the public
 * history, and their number must be the count register/classes.yaml holds for
 * SEC-secret-committed. A new one anywhere in the history, or one judged into
 * the baseline while the register still counts it, fails the run.
 *
 * Only numbers are printed: never a value (--redact), and never where an
 * unexcused finding stands, since a live key's place is not said in public.
 *
 * Run where gitleaks is installed, in a full clone (the secrets job in god_tier_ci.yml).
 */
const { spawnSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');
const CLASS = 'SEC-secret-committed';
// Read without the yaml package: the secrets job installs nothing. A class's block runs from its
// `- id:` line to the next one, and its count is the `count:` line inside it.
const text = readFileSync(join(ROOT, 'mobile', 'register', 'classes.yaml'), 'utf8').split('\r\n').join('\n');
const start = text.indexOf(`\n  - id: ${CLASS}\n`);
const rest = start === -1 ? '' : text.slice(start + 1);
const next = rest.indexOf('\n  - id: ');
const block = next === -1 ? rest : rest.slice(0, next);
const counted = block.match(/\n {4}count: (?<count>\d+)\n/);
if (!counted?.groups) { console.error(`register/classes.yaml holds no count for ${CLASS}`); process.exit(1); }
const entry = { count: Number(counted.groups.count) };

const report = join(mkdtempSync(join(tmpdir(), 'history-')), 'report.json');
// The history this commit stands on, never another branch a clone happens to hold.
const run = spawnSync('gitleaks', ['git', ROOT, '--log-opts=HEAD', '--config', join(ROOT, '.gitleaks.toml'), '--gitleaks-ignore-path',
  join(ROOT, '.gitleaksignore'), '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report,
  '--log-level', 'error'], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (run.error) { console.error(`gitleaks did not run: ${run.error.message}`); process.exit(1); }
if (!existsSync(report)) { console.error(`gitleaks wrote no report (exit ${run.status}): ${`${run.stderr}${run.stdout}`.trim()}`); process.exit(1); }
const standing = JSON.parse(readFileSync(report, 'utf8')).length;

if (standing !== entry.count) {
  console.error(`The history holds ${standing} secret(s) the baseline does not excuse; the register counts ${entry.count} for ${CLASS}.`);
  console.error(standing > entry.count
    ? 'A secret the register does not know is in the history: rotate it, then judge it into the baseline with its proof.'
    : 'One the register still counts is now judged: lower its count to match.');
  process.exit(1);
}
console.log(`The history holds ${standing} secret(s) the baseline does not excuse, as the register counts for ${CLASS}.`);
