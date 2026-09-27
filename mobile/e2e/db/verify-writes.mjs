#!/usr/bin/env node
/**
 * verify-writes.mjs — what the flows did on screen, found in the database.
 *
 * A flow that ends on "the form closed" has proved the screen moved, not that
 * anything was kept. After the flows, this reads the local database for the
 * row each flow must have written, as the seeded member, with the exact words
 * it typed. Only the flows that ran are checked (E2E_FLOWS: a folder, or one file).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

const DB = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';
const FLOWS = process.env.E2E_FLOWS ?? 'mobile/.maestro';
const USER = process.env.E2E_MEMBER_USERNAME;
if (!USER) { console.error('E2E_MEMBER_USERNAME is needed.'); process.exit(2); }

const ran = FLOWS.endsWith('.yaml')
  ? [basename(FLOWS)]
  : readdirSync(FLOWS).filter((f) => f.endsWith('.yaml') && f !== 'config.yaml');

/** Per flow: the log it must leave, found by the words it typed. */
const EXPECT = {
  'flow_critical_path.yaml': { what: 'The Godfather, logged with a review', where: "l.review = 'E2E critical path: an offer the archive could not refuse.' AND l.film_title ILIKE 'The Godfather%' AND l.status = 'watched'" },
  'log_film_flow.yaml': { what: 'Blade Runner, logged from the full results', where: "l.review = 'E2E results path: more human than human.' AND l.film_title ILIKE 'Blade Runner%'" },
  'film_log.yaml': { what: 'The Matrix, abandoned as Too Slow', where: "l.status = 'abandoned' AND l.abandoned_reason = 'Too Slow' AND l.film_title ILIKE 'The Matrix%'" },
  'offline_resilience.yaml': { what: 'Casablanca, logged offline and sent on reconnect', where: "l.review = 'E2E offline: we''ll always have the queue.' AND l.film_title ILIKE 'Casablanca%'" },
};

let bad = 0;
for (const flow of ran) {
  const e = EXPECT[flow];
  if (!e) continue;
  const n = Number(execFileSync('psql', [DB, '-X', '-tA', '-c',
    `SELECT count(*) FROM public.logs l JOIN public.profiles p ON p.id = l.user_id WHERE p.username = '${USER}' AND ${e.where}`,
  ], { encoding: 'utf8' }).trim());
  const ok = n === 1;
  console.log(`${ok ? '✓' : '✗'} ${flow}: ${e.what} — ${n} row(s)`);
  if (!ok) { bad++; console.log(`::error title=E2E writes — ${flow}::expected exactly one log (${e.what}); found ${n}`); }
}
if (!ran.some((f) => EXPECT[f])) console.log('(none of the flows that ran writes a log)');
process.exit(bad ? 1 : 0);
