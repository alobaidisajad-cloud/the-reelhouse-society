// Runs ONE rehearsal against production: a *_rehearsal.sql file, which always ends in ROLLBACK, so
// nothing it does is kept. It prints each case and the verdict; any miss exits non-zero.
//
//   node mobile/supabase/diagnostics/rehearse.cjs <name>_rehearsal.sql
//   node mobile/supabase/diagnostics/rehearse.cjs train_0_rehearsal.sql --with-train
//     the pending train's files applied first, inside the same rolled-back transaction
//
// Every session runs under the time limits apply.cjs uses. The address comes from the private
// settings file (scripts/private-settings.cjs) and is never printed.
const { spawnSync } = require('child_process');
const { basename, join } = require('path');

const { privateFile, readPrivate } = require(join(__dirname, '..', '..', 'scripts', 'private-settings.cjs'));

const LIMITS = '-c lock_timeout=2s -c statement_timeout=30s';

/** psql's arguments for these, or why not. */
const plan = (args) => {
  const files = args.filter((a) => !a.startsWith('--'));
  const flags = args.filter((a) => a.startsWith('--'));
  if (files.length !== 1 || flags.some((f) => f !== '--with-train')) return { refuse: 'usage: rehearse.cjs <name>_rehearsal.sql [--with-train]' };
  const name = basename(files[0]);
  if (!/^[a-z0-9_]+_rehearsal\.sql$/.test(name)) return { refuse: `${name} is not a rehearsal (a *_rehearsal.sql file in this folder)` };
  const withTrain = flags.includes('--with-train') ? ['-v', 'with_train=1'] : [];
  return { psqlArgs: ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...withTrain, '-f', join(__dirname, name)], pgoptions: LIMITS };
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
