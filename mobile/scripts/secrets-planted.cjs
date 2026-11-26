#!/usr/bin/env node
/**
 * The secrets scan's rules, proven to fire. Each sample is a secret in a shape
 * this repository has leaked, made up here, written to a scratch folder, and
 * scanned with the repo's rules AND its baseline: every one must be reported,
 * so no rule is blind and the baseline excuses nothing new. The samples are
 * assembled from pieces so that this file itself is not a finding.
 *
 * Run where gitleaks is installed (the secrets job in god_tier_ci.yml).
 */
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const { existsSync, mkdtempSync, readFileSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..');
const made = (label, length, alphabet) => {
  let out = '';
  for (let i = 0; out.length < length; i++) {
    for (const byte of createHash('sha256').update(`${label}${i}`).digest()) out += alphabet[byte % alphabet.length];
  }
  return out.slice(0, length);
};
const HEX = '0123456789abcdef';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const Q = "'";

// [file, its text, the rule that must report it]
const PLANTED = [
  ['token.ps1', `$env:SUPABASE_ACCESS_TOKEN = "${'sb' + 'p_'}${made('token', 40, HEX)}"`, 'supabase-personal-token'],
  ['url.env', `DB_URL=${'postgres' + 'ql://'}postgres.abcd:${made('url', 24, B64URL.slice(0, 62))}@db.example.com:5432/postgres`,
    'postgres-url-password'],
  // The split shape: the password on its own line, the address built from it.
  ['split.js', [`const ${'pass' + 'word'} = ${Q}${made('split', 18, B64URL.slice(0, 62))}${Q};`,
    `const url = \`${'postgres' + 'ql://'}postgres:\${password}@db.example.com:5432/postgres\`;`].join('\n'), 'password-in-code'],
  ['vapid.env', `# (${'Private' + ' Key'} manually stored in Vercel for the Edge Function: ${made('vapid', 43, B64URL)})`,
    'vapid-private-key'],
  // A key of TMDB's shape in each place gitleaks' own rules read past.
  ['fallback.ts', `const KEY = import.meta.env.VITE_SOME_KEY || ${Q}${made('fallback', 32, HEX)}${Q}`, 'hex-key-32'],
  ['note.md', `The key: \`${made('note', 32, HEX)}\``, 'hex-key-32'],
  ['query.md', `curl "https://api.example.org/3/search/movie?query=x&${'api' + '_key'}=${made('query', 32, HEX)}&page=2"`, 'hex-key-32'],
  ['bundle.js', `const u="/3/movie/"+i+"?${'api' + '_key'}="+"${made('bundle', 32, HEX)}";`, 'hex-key-32'],
];
// Never a finding: the local stack's published default password; a Sentry DSN's public key (public by
// design); a commit's 40 hex characters; a dashed id.
const CLEAN_FILES = [
  ['local.env', `DB_URL=${'postgres' + 'ql://'}postgres:postgres@127.0.0.1:54322/postgres`],
  ['dsn.ts', `const dsn = 'https://${made('dsn', 32, HEX)}@o1.ingest.sentry.io/2';`],
  ['commit.md', `fixed in ${made('commit', 40, HEX)}; row ${made('id', 8, HEX)}-${made('id2', 4, HEX)}-4${made('id3', 3, HEX)}-8${made('id4', 3, HEX)}-${made('id5', 12, HEX)}`],
];
const CLEAN = new Set(CLEAN_FILES.map(([file]) => file));

const dir = mkdtempSync(join(tmpdir(), 'planted-'));
for (const [file, text] of [...PLANTED, ...CLEAN_FILES]) writeFileSync(join(dir, file), `${text}\n`);
const report = join(dir, 'report.json');
const run = spawnSync('gitleaks', ['dir', dir, '--config', join(ROOT, '.gitleaks.toml'), '--gitleaks-ignore-path',
  join(ROOT, '.gitleaksignore'), '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report,
  '--log-level', 'error'], { encoding: 'utf8' });
if (run.error) { console.error(`gitleaks did not run: ${run.error.message}`); process.exit(1); }
// It ends 1 on finding a secret, as here it must; its report is the sign it scanned at all.
if (!existsSync(report)) { console.error(`gitleaks wrote no report (exit ${run.status}): ${`${run.stderr}${run.stdout}`.trim()}`); process.exit(1); }
const found = JSON.parse(readFileSync(report, 'utf8')).map((f) => `${f.File.split(/[\\/]/).pop()} ${f.RuleID}`);

const missed = PLANTED.filter(([file, , rule]) => !found.includes(`${file} ${rule}`)).map(([file, , rule]) => `${file}: ${rule}`);
const wrong = found.filter((f) => CLEAN.has(f.slice(0, f.indexOf(' '))) || f.startsWith('split.js postgres-url-password'));
if (missed.length || wrong.length) {
  if (missed.length) console.error(`Not reported:\n  ${missed.join('\n  ')}`);
  if (wrong.length) console.error(`Reported, but not a secret:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
console.log(`Every rule fired on its planted secret (${PLANTED.length}), and the ${CLEAN.size} values never secrets were left alone.`);
