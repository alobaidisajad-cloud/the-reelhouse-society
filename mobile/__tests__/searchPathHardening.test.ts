/**
 * searchPathHardening.test.ts — batch 29.
 * ───────────────────────────────────────
 * `SET search_path = public` is a VACUOUS pin on a SECURITY DEFINER function.
 * PostgreSQL searches pg_temp FIRST — before pg_catalog — for relation names
 * unless pg_temp is named explicitly in search_path, so a temp table shadows the
 * real one. Both `anon` and `authenticated` hold TEMP privilege on this database.
 *
 * Proven on production 2026-08-10 inside a rolled-back transaction: with a decoy
 * `logs` table planted, `get_profile_counts` reported logs_count 0 / ledger_count
 * 0 instead of the true 145 / 93. After pinning `public, pg_temp` the identical
 * attack returned 145 / 93.
 *
 * WHAT THIS TEST CAN AND CANNOT DO. It reads migration FILES, so it is a forward
 * drift guard only — it cannot see a function created straight through the SQL
 * editor, and it cannot see live `proconfig`. The live half is
 * `everyFunctionDemotesPgTemp` in scripts/backend-contract.json, checked by
 * scripts/check-backend-live.mjs. Batch 27 taught this the hard way: a coverage
 * test that read a snapshot inherited the snapshot's blind spot and reported full
 * coverage while 13 columns were uncapped. File-level and live-level are two
 * different guards and both are needed.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations');

/** Batch 29 is where this rule starts. Migrations before it are history. */
const RULE_STARTS_AT = '20260810_05';

/** Strip `--` line comments so documentation and restore scripts are not parsed. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

function migrationsUnderRule(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    // Date-prefixed only. Plain string comparison against the cutoff would let
    // every undated file through ("society_report_system.sql" > "20260810_05"),
    // which is how the first run of this test failed.
    .filter((f) => /^\d{8}_\d{2}/.test(f))
    .filter((f) => f >= RULE_STARTS_AT)
    .sort();
}

/**
 * Every `CREATE [OR REPLACE] FUNCTION` header, up to the body delimiter.
 * The options (LANGUAGE / SECURITY / SET ...) always sit between the closing
 * paren and `AS $`, so that slice is where a search_path pin must appear.
 */
function functionHeaders(sql: string): { name: string; header: string }[] {
  const out: { name: string; header: string }[] = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_."]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const rest = sql.slice(m.index);
    const bodyAt = rest.search(/\bAS\s+\$/i);
    out.push({ name: m[1], header: bodyAt === -1 ? rest : rest.slice(0, bodyAt) });
  }
  return out;
}

describe('search_path hardening (batch 29)', () => {
  const files = migrationsUnderRule();

  it('has migrations to check (guards against the glob silently matching nothing)', () => {
    // A test that scans an empty list passes vacuously. That failure mode has
    // bitten this repo before, so assert the input is non-empty.
    expect(files.length).toBeGreaterThan(0);
  });

  it('every function defined from batch 29 onward demotes pg_temp', () => {
    // Violations are collected rather than asserted one by one: Jest's expect
    // takes no message argument, so the array contents ARE the failure message.
    const violations: string[] = [];
    for (const file of files) {
      const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
      for (const { name, header } of functionHeaders(sql)) {
        const pin = /SET\s+search_path\s*(?:=|TO)\s*([^\n]*)/i.exec(header);
        if (!pin) {
          violations.push(
            `${file}: ${name} has no SET search_path at all — add "SET search_path = public, pg_temp"`,
          );
        } else if (!pin[1].toLowerCase().includes('pg_temp')) {
          violations.push(
            `${file}: ${name} pins search_path to "${pin[1].trim()}", which does NOT demote ` +
              `pg_temp — a temp table can shadow any table it reads by short name. ` +
              `Use "public, pg_temp" (or "pg_catalog, pg_temp").`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not re-create get_following_feed without a privacy gate', () => {
    // It was dropped because it is SECURITY DEFINER with no gate, and anon could
    // read a sealed member's reviews over plain HTTP. If it ever returns it must
    // consult can_view_user_data.
    const violations: string[] = [];
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
      if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.get_following_feed\b/i.test(sql)) continue;
      if (!/can_view_user_data/i.test(sql)) {
        violations.push(
          `${file} re-creates get_following_feed. It is SECURITY DEFINER and bypasses ` +
            `logs_select_authorized, so it MUST call can_view_user_data on every row.`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
