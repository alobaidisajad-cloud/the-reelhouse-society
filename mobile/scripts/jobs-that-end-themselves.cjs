/**
 * jobs-that-end-themselves — a scheduled job whose presence is state, not schema.
 *
 * A job the house's own functions put on the schedule or take off it (pg_cron called inside a
 * function's body: the members' lists filled, a closed ballot's voters told, the Lobby's edition
 * drafted, each every second while its work lasts) stands while its work waits and is gone once it is
 * done. Whether it stands at a given moment is how far its work has gone, as a row is. So a reader
 * that compares the schedule as schema (up-down-up.mjs before and after each car, schema-snapshot.mjs
 * against production) leaves such a job out: read in, the moment its work ended between two readings
 * was blamed on whatever ran between them (car 64's undo, for the members' lists finishing).
 *
 * The rule reads the house's own code, so a new job of the kind needs nothing declared: each statement
 * of a function's body that calls pg_cron and names a job in quotes marks that job. The readers' SQL
 * (steady) and the guard's reader (namedJobs) both split a body at its semicolons.
 * aJobThatEndsItselfIsState.test.ts holds that every such call in the house names its job in quotes
 * (else the rule could not see it), that every job a function puts on the schedule a function also
 * takes off (else it would run forever, read by no reader), and that each reader of the schedule takes
 * this rule.
 *
 *   const { steady, namedJobs } = require('./jobs-that-end-themselves.cjs');
 *   `... FROM cron.job j WHERE ${steady('j')}`   the jobs whose presence is schema
 *   namedJobs(body)                              each pg_cron call of a body: { call, name }
 */

/** A call of pg_cron that puts a job on the schedule, takes it off or changes it. */
const CALL = String.raw`cron\.(schedule_in_database|schedule|unschedule|alter_job)\s*\(`;

/**
 * SQL, true when the job (a row of cron.job, by its alias) is no job the house's own functions put on
 * the schedule or take off it: its standing is schema.
 */
const steady = (job) => `NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
       CROSS JOIN LATERAL regexp_split_to_table(p.prosrc, ';') s(statement)
       WHERE p.prosrc ~ '${CALL}' AND s.statement ~ '${CALL}' AND strpos(s.statement, quote_literal(${job}.jobname)) > 0)`;

/**
 * Each statement of a body that calls pg_cron, with the job it names: the first argument of a schedule
 * call, or, for one taking a job off or changing it, the name in quotes it is called with or the one
 * its job is found by (`jobname = '...'`). null where the statement names none.
 */
const namedJobs = (body) => body.split(';').flatMap((statement) => {
  const call = new RegExp(CALL).exec(statement);
  if (!call) return [];
  const after = statement.slice(call.index + call[0].length);
  const quoted = /^\s*'((?:[^']|'')*)'/.exec(after) ?? (call[1].startsWith('schedule') ? null : /\bjobname\s*=\s*'((?:[^']|'')*)'/.exec(after));
  return [{ call: call[1], name: quoted ? quoted[1].replace(/''/g, "'") : null, statement: statement.trim() }];
});

module.exports = { CALL, steady, namedJobs };
