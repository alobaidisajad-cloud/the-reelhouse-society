/**
 * A rehearsal checks a plan on a sealed copy alone, never on production.
 *
 * A rehearsal runs in CI on a sealed copy whose data is the house's own, and in the train and pretrain on
 * production's rows. Production's planner chooses by its statistics, which a copy of production does not
 * carry: car 21's plan case (the train of 2026-11-23) held on pretrain's copy and missed on production,
 * on a read that was bounded all along. So a plan is proven where the data is controlled (the sealed
 * rehearsals here, the Load's plan guards at size), and every plan case sits inside a psql block that only
 * e2e/db/rehearsals.mjs opens (plan_checks), which the train and pretrain never set.
 *
 * This finder reads every rehearsal and refuses, outside such a block: an EXPLAIN, a pg_temp.rh_reads_by
 * call, a read of the planner's per-transaction counters (pg_stat_get_xact_*), and a call of a pg_temp
 * function made inside one (a plan reader the train never defines).
 */
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { files } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..');

/** Each line of a rehearsal outside a plan_checks block that reads a plan, with why. */
export const plansOutsideTheGuard = (sql: string): string[] => {
  const lines = sql.split('\n');
  const branches: boolean[] = [];
  const inside: boolean[] = lines.map((raw) => {
    const line = raw.trim();
    if (/^\\if\s/.test(line)) branches.push(/^\\if\s+:\{\?plan_checks\}$/.test(line));
    else if (/^\\(?:else|elif)\b/.test(line)) branches[branches.length - 1] = false;
    else if (/^\\endif\b/.test(line)) branches.pop();
    return branches.includes(true);
  });
  const code = lines.map((raw) => raw.replace(/--.*$/, ''));
  const guarded = new Set(code.flatMap((l, k) =>
    inside[k] ? [...l.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+pg_temp\.(?<name>[a-z0-9_]+)\s*\(/gi)].flatMap((m) => m.groups?.name ?? []) : []));
  return code.flatMap((l, k) => {
    if (inside[k]) return [];
    const why = [
      /\bEXPLAIN\b/i.test(l) && 'an EXPLAIN',
      /\brh_reads_by\s*\(/.test(l) && 'rh_reads_by',
      /\bpg_stat_get_xact_/.test(l) && "the planner's counters",
      ...[...guarded].filter((f) => new RegExp(`pg_temp\\.${f}\\s*\\(`).test(l)).map((f) => `pg_temp.${f}, made in the guard`),
    ].filter((w): w is string => typeof w === 'string');
    return why.length ? [`line ${k + 1}: ${why.join(', ')}`] : [];
  });
};

describe('a rehearsal checks a plan on a sealed copy alone', () => {
  const GUARD = '\\if :{?plan_checks}';

  it('refuses a plan read outside the guard, and passes one inside it', () => {
    const plan = [
      'CREATE FUNCTION pg_temp.x_plan() RETURNS text LANGUAGE plpgsql AS $$',
      "BEGIN RETURN (SELECT string_agg(r, ' ') FROM (EXPLAIN SELECT 1) r); END $$;",
      "SELECT pg_temp.rh_case('read by it', 'true', pg_temp.rh_reads_by(pg_temp.x_plan(), 't', 'id')::text) AS done \\gset rh_",
    ];
    expect(plansOutsideTheGuard(plan.join('\n'))).toEqual(['line 2: an EXPLAIN', 'line 3: rh_reads_by']);
    expect(plansOutsideTheGuard([GUARD, ...plan, '\\endif'].join('\n'))).toEqual([]);
    expect(plansOutsideTheGuard([GUARD, ...plan.slice(0, 2), '\\endif', plan[2]].join('\n')))
      .toEqual(['line 5: rh_reads_by, pg_temp.x_plan, made in the guard']);
    expect(plansOutsideTheGuard(['\\if :{?with_train}', 'SELECT 1;', '\\else', 'SELECT pg_stat_get_xact_tuples_returned(1);', '\\endif'].join('\n')))
      .toEqual(["line 4: the planner's counters"]);
    expect(plansOutsideTheGuard([GUARD, 'SELECT 1;', '\\else', 'EXPLAIN SELECT 1;', '\\endif'].join('\n'))).toEqual(['line 4: an EXPLAIN']);
    expect(plansOutsideTheGuard('-- an EXPLAIN named in a comment\nSELECT 1;')).toEqual([]);
  });

  it('only the sealed runner opens the guard: the train and pretrain never set plan_checks', () => {
    expect(readFileSync(join(MOBILE, 'e2e', 'db', 'rehearsals.mjs'), 'utf8')).toContain("'-v', 'plan_checks=1'");
    for (const f of ['train.cjs', 'pretrain.cjs', 'rehearse.cjs']) {
      expect(readFileSync(join(MOBILE, 'supabase', 'diagnostics', f), 'utf8')).not.toContain('plan_checks');
    }
  });

  it('every rehearsal reads its plans inside the guard alone', () => {
    const rehearsals = files(['rehearsals']);
    expect(rehearsals.filter((f) => readFileSync(f, 'utf8').includes(GUARD)).length).toBeGreaterThan(20);
    const outside = rehearsals.flatMap((f) => plansOutsideTheGuard(readFileSync(f, 'utf8')).map((w) => `${basename(f)} ${w}`));
    expect(outside).toEqual([]);
  });
});
