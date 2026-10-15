#!/usr/bin/env node
/**
 * A copy of production, taken before a database change (WORKLIST P0.10).
 *
 *   node mobile/scripts/dump-production.cjs full
 *       the whole database, schema and data: the latest backup until a Supabase
 *       plan with backups is chosen. Older full copies are deleted once this
 *       one is read back whole.
 *   node mobile/scripts/dump-production.cjs data public.push_subscriptions [...]
 *       the named tables' rows, before a change that touches them. Deleted by
 *       hand once the change has soaked.
 *
 * Each copy goes to <private settings folder>/dumps (outside the repo and
 * OneDrive, private-settings.cjs), is read back with pg_restore --list, and
 * only its name, size and entry count are printed. The address never is.
 */
const { execFileSync, spawnSync } = require('child_process');
const { mkdirSync, readdirSync, statSync, unlinkSync } = require('fs');
const { join } = require('path');
const { privateDir, privateFile, readPrivate, refusal } = require('./private-settings.cjs');

const TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/** pg_dump's arguments for a kind of copy, or why not. */
const plan = (kind, tables, stamp) => {
  if (kind === 'full' && !tables.length) return { name: `${stamp}-full.dump`, args: ['--format=custom'] };
  if (kind === 'data' && tables.length && tables.every((t) => TABLE.test(t))) {
    return { name: `${stamp}-data-${tables.map((t) => t.split('.')[1]).join('+')}.dump`,
      args: ['--format=custom', '--data-only', ...tables.flatMap((t) => ['--table', t])] };
  }
  return { refuse: 'usage: dump-production.cjs full | data <schema.table> [<schema.table> ...]' };
};

if (require.main === module) {
  const [kind, ...tables] = process.argv.slice(2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const p = plan(kind, tables, stamp);
  if (p.refuse) { console.error(`REFUSED: ${p.refuse}`); process.exit(1); }
  const dir = join(privateDir(), 'dumps');
  const why = refusal(dir);
  if (why) { console.error(`REFUSED: ${why}`); process.exit(1); }
  const url = readPrivate('SUPABASE_DB_URL');
  if (!url) { console.error(`REFUSED: no SUPABASE_DB_URL in ${privateFile()}`); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  const file = join(dir, p.name);
  const r = spawnSync('pg_dump', [url, ...p.args, '--file', file], { encoding: 'utf8' });
  if (r.status !== 0) { console.error((r.stderr || '').split(url).join('***')); process.exit(1); }
  const entries = execFileSync('pg_restore', ['--list', file], { encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n').filter((l) => l && !l.startsWith(';')).length;
  if (!entries) { console.error(`The copy ${file} reads back empty.`); process.exit(1); }
  console.log(`Copy taken: ${file}\n  ${(statSync(file).size / 1048576).toFixed(1)} MB, ${entries} entries, read back whole.`);
  if (kind === 'full') {
    for (const old of readdirSync(dir).filter((f) => f.endsWith('-full.dump') && f !== p.name)) {
      unlinkSync(join(dir, old));
      console.log(`  older full copy deleted: ${old}`);
    }
  }
}

module.exports = { plan };
