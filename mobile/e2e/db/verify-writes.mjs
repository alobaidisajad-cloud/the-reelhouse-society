#!/usr/bin/env node
/**
 * verify-writes.mjs — what the flows did on screen, found in the database.
 *
 * A flow that ends on "the form closed" has proved the screen moved, not that
 * anything was kept. After the flows, this reads the local database for the
 * row each flow must have written, as the seeded member, with the exact words
 * it typed. Only the flows that ran are checked: on one shard of e2e.yml's
 * flows, those in run-flows.sh's $RUNNER_TEMP/flows-run.txt; otherwise every
 * flow in E2E_FLOWS (a folder, or one file).
 *
 * A run of a shipped client lists, in $RUNNER_TEMP/own-crash-flows.txt, each
 * flow its own crash ended (run-flows.sh): a flow run again after one may have
 * saved in its first attempt too, and a flow not judged may have saved nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DB = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';

/** Per flow: the log it must leave, found by the words it typed. */
const EXPECT = {
  'flow_critical_path.yaml': { what: 'The Godfather, logged with a review', where: "l.review = 'E2E critical path: an offer the archive could not refuse.' AND l.film_title ILIKE 'The Godfather%' AND l.status = 'watched'" },
  'log_film_flow.yaml': { what: 'Blade Runner, logged from the full results', where: "l.review = 'E2E results path: more human than human.' AND l.film_title ILIKE 'Blade Runner%'" },
  'film_log.yaml': { what: 'The Matrix, abandoned as Too Slow', where: "l.status = 'abandoned' AND l.abandoned_reason = 'Too Slow' AND l.film_title ILIKE 'The Matrix%'" },
  'offline_resilience.yaml': { what: 'Casablanca, logged offline and sent on reconnect', where: "l.review = 'E2E offline: we''ll always have the queue.' AND l.film_title ILIKE 'Casablanca%'" },
};

/** run-flows.sh's list: flow name → "retried" or "not-judged". Empty when no file. */
export function readOwnCrashFlows(file) {
  if (!file || !existsSync(file)) return new Map();
  return new Map(readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')));
}

/** The flow files that ran: the shard's list when there is one, else E2E_FLOWS. */
export function flowsRan(flows, runList) {
  if (runList && existsSync(runList)) {
    return readFileSync(runList, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((n) => `${n}.yaml`);
  }
  return flows.endsWith('.yaml')
    ? [basename(flows)]
    : readdirSync(flows).filter((f) => f.endsWith('.yaml') && f !== 'config.yaml');
}

/**
 * The rows a flow's write check accepts: exactly one; one or two when its first
 * attempt was ended by the client's own crash; none checked (null) when the
 * flow was not judged.
 */
export function rowsAccepted(mark) {
  if (mark === 'not-judged') return null;
  return mark === 'retried' ? [1, 2] : [1];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const FLOWS = process.env.E2E_FLOWS ?? 'mobile/.maestro';
  const USER = process.env.E2E_MEMBER_USERNAME;
  if (!USER) { console.error('E2E_MEMBER_USERNAME is needed.'); process.exit(2); }

  const ran = flowsRan(FLOWS, process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP, 'flows-run.txt'));
  const marks = readOwnCrashFlows(process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP, 'own-crash-flows.txt'));

  let bad = 0;
  for (const flow of ran) {
    const e = EXPECT[flow];
    if (!e) continue;
    const accepted = rowsAccepted(marks.get(basename(flow, '.yaml')));
    if (!accepted) {
      console.log(`– ${flow}: not judged (the client's own crash ended it), so its write is not checked`);
      continue;
    }
    const n = Number(execFileSync('psql', [DB, '-X', '-tA', '-c',
      `SELECT count(*) FROM public.logs l JOIN public.profiles p ON p.id = l.user_id WHERE p.username = '${USER}' AND ${e.where}`,
    ], { encoding: 'utf8' }).trim());
    const ok = accepted.includes(n);
    const why = accepted.length > 1 ? " (its first attempt, ended by the client's own crash, may have saved too)" : '';
    console.log(`${ok ? '✓' : '✗'} ${flow}: ${e.what} — ${n} row(s)${why}`);
    const expected = accepted.length > 1 ? 'one or two logs' : 'exactly one log';
    if (!ok) { bad++; console.log(`::error title=E2E writes — ${flow}::expected ${expected} (${e.what}); found ${n}`); }
  }
  if (!ran.some((f) => EXPECT[f])) console.log('(none of the flows that ran writes a log)');
  process.exit(bad ? 1 : 0);
}
