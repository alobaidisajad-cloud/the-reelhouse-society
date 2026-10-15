// Runs ONE read-only check against production: a *_check.sql file, inside a transaction that
// cannot write (default_transaction_read_only), under the time limits apply.cjs uses.
//
//   node mobile/supabase/diagnostics/read-only.cjs <name>_check.sql
//
// The address comes from the private settings file (scripts/private-settings.cjs) and is never printed.
const { spawnSync } = require('child_process');
const { basename, join } = require('path');

const { privateFile, readPrivate } = require(join(__dirname, '..', '..', 'scripts', 'private-settings.cjs'));

const LIMITS = '-c default_transaction_read_only=on -c lock_timeout=2s -c statement_timeout=30s';

/** psql's arguments for these, or why not. */
const plan = (args) => {
  if (args.length !== 1) return { refuse: 'usage: read-only.cjs <name>_check.sql' };
  const name = basename(args[0]);
  if (!/^[a-z0-9_]+_check\.sql$/.test(name)) return { refuse: `${name} is not a check (a *_check.sql file in this folder)` };
  return { psqlArgs: ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', join(__dirname, name)], pgoptions: LIMITS };
};

if (require.main === module) {
  const p = plan(process.argv.slice(2));
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
