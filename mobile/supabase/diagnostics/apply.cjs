// Applies ONE migration file to production, after the migration lint passes on it.
//
//   node mobile/supabase/diagnostics/apply.cjs <file>
//     one transaction (-1): an error undoes all of it
//   node mobile/supabase/diagnostics/apply.cjs --no-transaction <file>
//     a CONCURRENTLY file, alone: it cannot run inside a transaction
//
// Every session starts under the time limits (a 2 s lock wait, a 30 s
// statement), so a file that forgot its own still cannot hold a lock members
// wait on; a CONCURRENTLY file's own plain SET raises its statement limit.
// The address comes from the private settings file
// (scripts/private-settings.cjs) and is never printed.
const { spawnSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const { lint } = require(join(__dirname, '..', '..', 'scripts', 'migration-lint.cjs'));
const { privateFile, readPrivate } = require(join(__dirname, '..', '..', 'scripts', 'private-settings.cjs'));

const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';

/** What to run for these arguments, or why not. */
const plan = (args, sql) => {
  const noTransaction = args.includes('--no-transaction');
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--no-transaction');
  const files = args.filter((a) => !a.startsWith('--'));
  if (unknown.length || files.length !== 1) return { refuse: 'usage: apply.cjs [--no-transaction] <one migration file>' };
  const { kind, faults } = lint(sql);
  if (faults.length) return { refuse: `the migration lint refuses ${files[0]}:\n  ${faults.join('\n  ')}` };
  if (noTransaction && kind !== 'concurrently') return { refuse: '--no-transaction is only for a CONCURRENTLY file; this one runs as one transaction' };
  if (!noTransaction && kind === 'concurrently') return { refuse: 'a CONCURRENTLY file cannot run in a transaction: add --no-transaction' };
  return { file: files[0], psqlArgs: ['-X', ...(noTransaction ? [] : ['-1']), '-v', 'ON_ERROR_STOP=1', '-f', files[0]], pgoptions: LIMITS };
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  let sql = '';
  try { sql = file ? readFileSync(file, 'utf8') : ''; } catch { console.error(`cannot read ${file}`); process.exit(1); }
  const p = plan(args, sql);
  if (p.refuse) { console.error(`REFUSED: ${p.refuse}`); process.exit(1); }
  const url = readPrivate('SUPABASE_DB_URL');
  if (!url) { console.error(`REFUSED: no SUPABASE_DB_URL in ${privateFile()}`); process.exit(1); }
  const r = spawnSync('psql', [url, ...p.psqlArgs], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: p.pgoptions } });
  process.stdout.write((r.stdout || '').replace(/\r/g, ''));
  process.stderr.write((r.stderr || '').split(url).join('***'));
  console.log(`\nexit ${r.status}`);
  process.exit(r.status ?? 1);
}

module.exports = { plan };
