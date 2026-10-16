#!/usr/bin/env node
/**
 * Before a commit: nothing staged that must never be in the public repo.
 *   - nothing under mobile/audit/final/ (the plan's private folder);
 *   - no database dump: a binary one (`PGDMP` header), or a text one anywhere
 *     but the schema snapshot's own files, which may hold no data rows;
 *   - no secret: gitleaks over the staged changes, with the repo's rules and
 *     baseline, values hidden. A machine without gitleaks is refused, never
 *     skipped (scoop install gitleaks);
 *   - no mutant still in the working files, from a mutants run that was stopped.
 * Run by mobile/githooks/pre-commit; its checks are held by hooks.guard.test.ts.
 */
const { execFileSync, spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..', '..', '..');
const SNAPSHOT = new Set(['mobile/supabase/schema/live-schema.sql', 'mobile/supabase/schema/live-extensions.sql',
  'mobile/supabase/schema/live-outside-public.sql']);

/** Why a staged file may not be committed, or null. */
const refusalOf = (path, bytes) => {
  if (path.startsWith('mobile/audit/final/')) return 'the plan\'s private folder (mobile/audit/final/) is never committed';
  if (bytes.subarray(0, 5).toString('latin1') === 'PGDMP') return 'a binary database dump';
  const text = bytes.toString('utf8');
  // pg_dump's own header line, near the top: a file that merely names it is not a dump.
  const head = text.split(/\r?\n/, 20);
  if (head.some((l) => l.trim() === '-- PostgreSQL database dump')) {
    if (!SNAPSHOT.has(path)) return 'a database dump';
    if (/^COPY [^\n]* FROM stdin;$/m.test(text)) return 'the schema snapshot holds data rows';
  }
  return null;
};

/**
 * A mutant still in the working files: a mutants run ended from outside left its record
 * (scripts/mutants.cjs), and what would be committed or pushed may carry the mistake it put in.
 */
const mutantInPlace = (root) => (existsSync(join(root, 'mobile', '.mutant-in-place.json'))
  ? 'a mutant is still in place, from a mutants run that was stopped: node mobile/scripts/mutants.cjs --put-back'
  : null);

const check = () => {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1e9 });
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').toString('utf8').split('\0').filter(Boolean);
  const faults = staged.map((p) => [p, refusalOf(p, git('show', `:${p}`))]).filter(([, why]) => why).map(([p, why]) => `${p}: ${why}`);
  const placed = mutantInPlace(ROOT);
  if (placed) faults.push(placed);
  const scan = spawnSync('gitleaks', ['git', '--pre-commit', '--staged', '--config', '.gitleaks.toml', '--gitleaks-ignore-path',
    '.gitleaksignore', '--redact=100', '--no-banner', '--log-level', 'warn', '.'], { cwd: ROOT, encoding: 'utf8' });
  if (scan.error || scan.status === 127 || /not recognized|not found/i.test(scan.stderr || '')) faults.push('gitleaks is not installed, so the staged changes were not scanned for secrets (scoop install gitleaks)');
  else if (scan.status !== 0) faults.push(`gitleaks found a secret in the staged changes:\n${(scan.stdout || '') + (scan.stderr || '')}`);
  return faults;
};

if (require.main === module) {
  const faults = check();
  if (faults.length) { console.error(`Commit refused:\n  ${faults.join('\n  ')}`); process.exit(1); }
}

module.exports = { mutantInPlace, refusalOf };
