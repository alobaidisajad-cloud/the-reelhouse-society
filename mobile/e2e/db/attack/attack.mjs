#!/usr/bin/env node
/**
 * attack.mjs — every table, asked by every kind of member, against its written rules.
 *
 * matrix.json says, for each public table of the snapshot, whose row it is, who
 * may see another's and who may add, change and take away their own or
 * another's. This lays down one row of each table for each owner — seven
 * members of each standing, an open member (V), a private one (P) and two
 * bystanders — as the house, with triggers off: the rows are the setting. Then,
 * with every trigger, rule and grant production has, each kind of member tries
 * each action on their own row, V's and P's, and a visitor tries the same
 * signed out; each try is undone at once. Every answer the rules did not
 * write is a miss, and the run fails naming each.
 *
 * Besides the grid: changes no one may make (a rank, a standing, a row moved to
 * another owner) are tried on every member's own rows, and each probe in the
 * matrix is one attack with its answer.
 *
 * A table the snapshot has and the matrix lacks, or the other way, fails the
 * run by name, so a new table is judged the day it is made.
 *
 *   node mobile/e2e/db/attack/attack.mjs                 against the sealed database (db-integration.yml)
 *   node mobile/e2e/db/attack/attack.mjs --db <url>      against another local database
 *   node mobile/e2e/db/attack/attack.mjs --sql <file>    write the SQL and stop
 *   node mobile/e2e/db/attack/attack.mjs --self-test     the run must name a rule opened on purpose
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..', '..');
const SNAPSHOT = join(MOBILE, 'supabase', 'schema', 'live-schema.sql');
// The local stack's fixed development password — this database exists only on the runner.
const SEALED = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';

/** The kinds of member who try, with the standing each holds. P and V may also try, as probes ask. */
export const ACTORS = {
  visitor: null,
  free: { tier: 'free', role: 'free' },
  lapsed: { tier: 'free', role: 'free', entitlement_source: 'revenuecat' },
  archivist: { tier: 'archivist', role: 'free' },
  auteur: { tier: 'auteur', role: 'free' },
  founding: { tier: 'founding', role: 'free', is_founding: true },
  banned: { tier: 'auteur', role: 'free', is_banned: true },
  admin: { tier: 'free', role: 'admin' },
};
/**
 * Every member who holds rows: the actors, an open member (V), a private one (P), one every
 * actor has blocked (BK), one who has blocked every actor (BY), and two bystanders.
 */
export const OWNERS = {
  ...Object.fromEntries(Object.entries(ACTORS).filter(([, s]) => s)),
  V: { tier: 'free', role: 'free' },
  P: { tier: 'free', role: 'free', is_social_private: true },
  BK: { tier: 'free', role: 'free' },
  BY: { tier: 'free', role: 'free' },
  X1: { tier: 'free', role: 'free' },
  X2: { tier: 'free', role: 'free' },
};
/** Whose rows each actor tries: their own, then the others'. */
const TARGETS = ['self', 'V', 'P', 'BK', 'BY'];
const OTHERS = TARGETS.slice(1);
const RANK = { free: 0, archivist: 1, auteur: 2, founding: 3 };
const ACTIONS = ['select', 'insert', 'update', 'delete'];

/** A fixed id from words, in the made-up shape (-0000-4000-8000-) no generated id has. */
export const uuidOf = (...words) => {
  const h = createHash('md5').update(words.join(':')).digest('hex');
  return `${h.slice(0, 8)}-0000-4000-8000-${h.slice(8, 20)}`;
};
export const uid = (who) => uuidOf('member', who);
export const username = (who) => `at_${who.toLowerCase()}`;

/** The tables and views the snapshot defines in public: every relation a client can name. */
export const snapshotTables = (sql) => [...sql.matchAll(/^CREATE (?:TABLE|VIEW) public\.(\w+) [(W]/gm)].map((m) => m[1]).sort();

/** Each public table's columns, from the snapshot. */
export const columnsOf = (sql) => Object.fromEntries([...sql.matchAll(/^CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/gm)]
  .map(([, table, body]) => [table, body.split('\n').map((l) => l.trim().split(' ')[0]).filter((c) => /^[a-z_]+$/.test(c) && c !== 'CONSTRAINT')]));

/** When the house laid every row: a month ago, so no rule counted over a recent window (a second, a day) sees it. */
const LAID = new Date(Date.now() - 30 * 86400e3).toISOString();
/** A row as the house lays it: dated a month ago where the table keeps a date and the row names none. */
export const dated = (table, row, columns) =>
  (columns[table]?.includes('created_at') && !('created_at' in row) ? { ...row, created_at: LAID } : row);

/** Tables one side has and the other lacks. */
export const coverage = (matrix, tables) => ({
  unjudged: tables.filter((t) => !matrix.tables[t]),
  gone: Object.keys(matrix.tables).filter((t) => !tables.includes(t)),
});

/** May this actor do what a self/others rule says? */
export const allows = (rule, actor) => {
  const s = ACTORS[actor] ?? OWNERS[actor];
  if (!s || !rule || rule === 'none') return false;
  const banned = !!s.is_banned;
  const rank = Math.max(RANK[s.tier] ?? 0, s.is_founding ? 3 : 0);
  switch (rule) {
    case 'all': return true;
    case 'unbanned': return !banned;
    case 'ranked': return rank >= 1;
    case 'rank1': return !banned && rank >= 1;
    case 'rank2': return !banned && rank >= 2;
    case 'admin': return !banned && s.role === 'admin';
    default: throw new Error(`unknown rule ${rule}`);
  }
};

/**
 * May this actor see the target's row, by the table's read rule? target: self, V, P, BK, BY or
 * house. A table that hides the words of a block hides BK's and BY's rows from every member.
 */
export const sees = (read, actor, target, hidesBlocked = false) => {
  const member = actor !== 'visitor';
  const mine = target === 'self';
  if (hidesBlocked && member && (target === 'BK' || target === 'BY')) return false;
  const open = mine || target === 'V' || target === 'BK' || target === 'BY' || target === 'house';
  switch (read) {
    case 'everyone': return true;
    case 'members': return member;
    case 'viewable': return open;
    case 'viewable-members': return member && open;
    case 'owner': return mine;
    case 'owner+admin': return mine || actor === 'admin';
    case 'none': return false;
    default: throw new Error(`unknown read rule ${read}`);
  }
};

/** The answer the matrix writes for one try. */
export const expected = (spec, action, actor, target) => {
  if (action === 'select') return sees(spec.read, actor, target, spec.hidesBlocked) ? 'seen' : 'unseen';
  if (actor === 'visitor') return 'refused';
  // No write reaches across a block, an admin's included: the house's own functions moderate there.
  const rules = target === 'self' || spec.owner === 'house' ? spec.self
    : (target === 'BK' || target === 'BY') && !spec.acrossBlocks ? undefined : spec.others;
  return allows(rules?.[action], actor) ? 'ok' : 'refused';
};

/** A JSON value as an SQL literal of no stated type, which the column's own type takes. */
export const literal = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `'${s.replace(/'/g, "''")}'`;
};

const LATER = new Date(Date.now() + 30 * 86400e3).toISOString();

/** Fill a row's placeholders for one owner. new: the id a new row takes. */
export const fill = (value, ctx) => {
  if (Array.isArray(value)) return value.map((v) => fill(v, ctx));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, ctx)]));
  if (typeof value !== 'string') return value;
  const whole = value.match(/^\{(private)\}$/);
  if (whole) return ctx.owner === 'P';
  return value.replace(/\{([a-z][a-z0-9_]*)(?::([a-z_]+))?(?:@(\w+))?(?:#(\d))?\}/g, (all, word, table, who, nth) => {
    const of = who ?? ctx.owner;
    const peer = ctx.owner === 'X1' ? 'X2' : 'X1';
    const peer2 = ctx.owner === 'X2' ? 'X1' : 'X2';
    switch (word) {
      case 'owner': return uid(ctx.owner);
      case 'uid': return uid(of);
      case 'username': return username(of);
      case 'id': return ctx.newId && !nth ? ctx.newId : uuidOf(ctx.table, of, nth ?? '1');
      case 'ref': return uuidOf(table, of, nth ?? '1');
      case 'new': return ctx.newId ?? uuidOf('new', ctx.table, of);
      case 'peer': return uid(peer);
      case 'peer2': return uid(peer2);
      case 'admin': return uid('admin');
      case 'later': return LATER;
      default: throw new Error(`unknown placeholder ${all} in ${ctx.table}`);
    }
  });
};

const ownersOf = (spec) => (spec.owner === 'house' ? ['house'] : Object.keys(OWNERS));
const ownerCol = (spec) => (typeof spec.owner === 'string' ? spec.owner : null);

/** The house's reading, after an update, of whether the row now holds every value it was sent. */
const heldSql = (table, change, where) =>
  `SELECT ${Object.entries(change).map(([c, v]) => `${c} IS NOT DISTINCT FROM ${literal(v)}`).join(' AND ')} FROM public.${table} WHERE ${where}`;

const insertSql = (table, row) => {
  const cols = Object.keys(row);
  return `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${cols.map((c) => literal(row[c])).join(', ')})`;
};
const whereSql = (spec, row) => spec.key.map((k) => `${k} = ${literal(row[k])}`).join(' AND ');
const setSql = (change) => Object.entries(change).map(([c, v]) => `${c} = ${literal(v)}`).join(', ');

/** The specimen of a table for one owner, filled. */
const specimenOf = (table, spec, owner) => fill(spec.specimen, { table, owner });

/** Every try of the grid, the forbidden changes and the probes, with the answer each must get. */
export const plan = (matrix, columns = {}) => {
  const cases = [];
  for (const [table, spec] of Object.entries(matrix.tables)) {
    const targets = spec.owner === 'house' ? ['house'] : TARGETS;
    for (const actor of Object.keys(ACTORS)) {
      for (const target of targets) {
        if (actor === 'visitor' && target === 'self') continue;
        const owner = target === 'self' ? actor : target;
        const row = specimenOf(table, spec, owner);
        const where = whereSql(spec, row);
        for (const action of ACTIONS) {
          const c = { label: `${table} ${action} ${actor}→${target}`, table, action, actor, target, expect: expected(spec, action, actor, target) };
          if (action === 'select') c.sql = `SELECT count(*) FROM public.${table} WHERE ${where}`;
          if (action === 'update') {
            const touch = fill(spec.touch, { table, owner });
            c.sql = `UPDATE public.${table} SET ${setSql(touch)} WHERE ${where}`;
            c.then = heldSql(table, touch, where);
          }
          if (action === 'delete') {
            c.sql = `DELETE FROM public.${table} WHERE ${where}`;
            // A view's INSTEAD OF trigger counts a row whether or not its table let it go.
            c.then = `SELECT NOT EXISTS (SELECT 1 FROM public.${table} WHERE ${where})`;
          }
          if (action === 'insert') {
            if (spec.variant === 'none') {
              c.before = `DELETE FROM public.${table} WHERE ${where}`;
              c.sql = insertSql(table, row);
            } else {
              const newId = uuidOf('new', table, owner, actor);
              c.sql = insertSql(table, fill({ ...spec.specimen, ...(spec.variant ?? {}) }, { table, owner, newId }));
            }
          }
          cases.push(c);
        }
      }
    }
    // A row of one's own that reaches another's: a critique on their log, a follow of them.
    if (spec.reach) {
      for (const actor of Object.keys(ACTORS)) {
        for (const target of OTHERS) {
          const newId = uuidOf('reach', table, actor, target);
          const row = {
            ...fill({ ...spec.specimen, ...(spec.variant ?? {}) }, { table, owner: actor === 'visitor' ? 'X2' : actor, newId }),
            ...fill(spec.reach.set, { table, owner: target }),
          };
          cases.push({ label: `${table} reach ${actor}→${target}`, table, action: 'insert', actor, target, refusedAs: spec.refusedAs,
            expect: actor !== 'visitor' && allows(spec.reach[target], actor) ? 'ok' : 'refused', sql: insertSql(table, row) });
        }
      }
    }
    // Changes no one may make to their own row: each forbidden one, and the row handed to another.
    if (spec.owner !== 'house') {
      const reown = ownerCol(spec)
        ? { [ownerCol(spec)]: '{peer}' }
        : { [spec.owner.on]: `{ref:${spec.owner.via}@V}` };
      for (const change of [...(spec.forbidden ?? []), reown]) {
        for (const actor of Object.keys(ACTORS).filter((a) => a !== 'visitor')) {
          const row = specimenOf(table, spec, actor);
          const set = fill(change, { table, owner: actor });
          // Refused however it is refused: a rule, a trigger's words, or a check that names the column.
          cases.push({ label: `${table} forbidden ${Object.keys(change).join('+')} ${actor}→self`, table, action: 'update', actor, target: 'self',
            expect: 'refused', anyError: true, sql: `UPDATE public.${table} SET ${setSql(set)} WHERE ${whereSql(spec, row)}`,
            then: heldSql(table, set, whereSql(spec, row)) });
        }
      }
    }
  }
  for (const p of matrix.probes ?? []) {
    for (const actor of p.as) {
      const newId = uuidOf('probe', p.name);
      const ctx = { table: p.table, owner: actor === 'visitor' ? 'X2' : actor, newId };
      const c = { label: `probe: ${p.name} (${actor})`, table: p.table, action: p.kind, actor, target: 'probe', expect: p.expect };
      if (p.kind === 'insert') c.sql = insertSql(p.table, fill(p.row, ctx));
      if (p.kind === 'read') {
        c.lay = insertSql(p.table, dated(p.table, fill(p.lay, ctx), columns));
        c.sql = `SELECT count(*) FROM public.${p.table} WHERE id = ${literal(newId)}`;
      }
      if (p.then) c.then = fill(p.then, ctx);
      cases.push(c);
    }
  }
  // Each function a visitor or member may run, called as each kind of member.
  for (const [fn, spec] of Object.entries(matrix.functions ?? {})) {
    spec.cases.forEach((k, i) => {
      for (const actor of actorsOf(k.as)) {
        const ctx = { table: fn, owner: actor === 'visitor' ? 'X2' : actor, newId: uuidOf('call', fn, i, actor) };
        const c = { label: `${fn} ${k.name ?? `#${i + 1}`} (${actor})`, table: fn, action: 'call', actor, target: 'call',
          expect: typeof k.expect === 'string' ? k.expect : allows(k.expect.ok, actor) ? 'ok' : 'error',
          call: fill(k.call, ctx) };
        if (k.lay) c.lay = Object.entries(k.lay).map(([t, row]) => `${insertSql(t, dated(t, fill(row, ctx), columns))};`).join(' ');
        if (k.result) c.result = fill(k.result, ctx);
        if (k.then) c.then = `SELECT (${fill(k.then, ctx)})`;
        cases.push(c);
      }
    });
  }
  return cases;
};

/** The actors a case names: all of them, the members (every one but the visitor), or a list. */
const actorsOf = (as) => (as === 'all' ? Object.keys(ACTORS)
  : as === 'members' ? Object.keys(ACTORS).filter((a) => a !== 'visitor') : as);

/** The public functions a visitor or member may run, by name: every one granted to anon or authenticated but a trigger's. */
export const callableFunctions = (sql) => {
  const triggers = new Set([...sql.matchAll(/^CREATE FUNCTION public\.(\w+)\([^)]*\) RETURNS (?:trigger|event_trigger)$/gm)].map((m) => m[1]));
  return [...new Set([...sql.matchAll(/^GRANT (?:ALL|EXECUTE) ON FUNCTION public\.(\w+)\(.*\) TO (?:anon|authenticated);$/gm)]
    .map((m) => m[1]).filter((f) => !triggers.has(f)))].sort();
};

/** The setting: the members, every specimen, and the logs that let each member file. */
export const setting = (matrix, columns = {}) => {
  const out = [];
  const members = Object.entries(OWNERS);
  out.push(`INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at) VALUES\n${
    members.map(([w]) => `  (${literal(uid(w))}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${literal(`${username(w)}@attack.test`)}, ${literal({ username: username(w) })}, '{"provider":"email"}', now() - interval '30 days', now() - interval '30 days', now() - interval '30 days')`).join(',\n')
  }\nON CONFLICT (id) DO NOTHING;`);
  out.push(`INSERT INTO public.profiles (id, username, email, role, tier, is_founding, is_banned, banned_at, is_social_private, entitlement_source, preferences, created_at) VALUES\n${
    members.map(([w, s]) => `  (${literal(uid(w))}, ${literal(username(w))}, ${literal(`${username(w)}@attack.test`)}, ${literal(s.role)}, ${literal(s.tier)}, ${!!s.is_founding}, ${!!s.is_banned}, ${s.is_banned ? 'now()' : 'NULL'}, ${!!s.is_social_private}, ${literal(s.entitlement_source ?? null)}, '{}', now() - interval '30 days')`).join(',\n')
  }\nON CONFLICT (id) DO NOTHING;`);
  // Every actor has blocked BK, and BY has blocked every actor.
  const actors = Object.keys(ACTORS).filter((a) => a !== 'visitor');
  out.push(`INSERT INTO public.user_blocks (blocker_id, blocked_id, type) VALUES\n${
    actors.flatMap((a) => [`  (${literal(uid(a))}, ${literal(uid('BK'))}, 'block')`, `  (${literal(uid('BY'))}, ${literal(uid(a))}, 'block')`]).join(',\n')
  };`);
  for (const [table, spec] of Object.entries(matrix.tables)) {
    if (spec.laid === false) continue;
    for (const owner of ownersOf(spec)) {
      out.push(`${insertSql(table, dated(table, specimenOf(table, spec, owner), columns))} ON CONFLICT DO NOTHING;`);
      for (const extra of spec.extra ?? []) out.push(`${insertSql(table, dated(table, fill(extra, { table, owner }), columns))} ON CONFLICT DO NOTHING;`);
    }
  }
  // Five films logged, so may_file() lets a ranked member file.
  for (const [w] of members) {
    for (const film of [990690, 990691, 990692, 990693]) {
      out.push(`${insertSql('logs', dated('logs', { id: uuidOf('filler', w, film), user_id: uid(w), film_id: film, film_title: 'rh filler', watched_date: '2026-01-01' }, columns))} ON CONFLICT DO NOTHING;`);
    }
  }
  return out.join('\n');
};

/** The whole run as one transaction that ends in ROLLBACK and prints every answer as one JSON line. */
export const script = (matrix, cases, { plant = '', columns = {} } = {}) => `\\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL request.jwt.claims = '';
SET LOCAL session_replication_role = replica;
${setting(matrix, columns)}
SET LOCAL session_replication_role = origin;
${plant}
CREATE TEMP TABLE at_cases (n int PRIMARY KEY, before text, lay text, stmt text, is_read boolean, then_sql text, actor uuid,
  call text, result_sql text) ON COMMIT DROP;
CREATE TEMP TABLE at_got (n int PRIMARY KEY, got text) ON COMMIT DROP;
-- One try as one member (or a visitor, with no member), undone at once: the rows it touched or saw,
-- or the SQLSTATE and words it was refused with; with then, the house's reading of what it left.
-- A call: the function's whole answer as JSON, read by its result rule as the caller.
CREATE FUNCTION pg_temp.at_try(c at_cases) RETURNS text LANGUAGE plpgsql AS $at$
DECLARE n bigint; ok boolean; answer text; r jsonb;
BEGIN
  BEGIN
    IF c.before IS NOT NULL THEN
      PERFORM set_config('session_replication_role', 'replica', true);
      EXECUTE c.before;
      PERFORM set_config('session_replication_role', 'origin', true);
    END IF;
    IF c.lay IS NOT NULL THEN EXECUTE c.lay; END IF;
    PERFORM set_config('request.jwt.claims', CASE WHEN c.actor IS NULL THEN '{"role":"anon"}'
      ELSE json_build_object('sub', c.actor, 'role', 'authenticated')::text END, true);
    PERFORM set_config('role', CASE WHEN c.actor IS NULL THEN 'anon' ELSE 'authenticated' END, true);
    IF c.call IS NOT NULL THEN
      EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM ' || c.call || ' AS x' INTO r;
      answer := 'called';
      IF c.result_sql IS NOT NULL THEN
        EXECUTE 'SELECT (' || c.result_sql || ')' INTO ok USING r;
        answer := answer || ' result:' || coalesce(ok::text, 'null');
        IF ok IS NOT TRUE THEN answer := answer || ' ' || left(r::text, 300); END IF;
      END IF;
    ELSIF c.is_read THEN EXECUTE c.stmt INTO n; answer := 'rows:' || n;
    ELSE EXECUTE c.stmt; GET DIAGNOSTICS n = ROW_COUNT; answer := 'rows:' || n;
    END IF;
    IF c.then_sql IS NOT NULL THEN
      PERFORM set_config('role', 'none', true);
      PERFORM set_config('request.jwt.claims', '', true);
      EXECUTE c.then_sql INTO ok;
      answer := answer || ' then:' || coalesce(ok::text, 'null');
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'RH000', MESSAGE = answer;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'RH000' THEN RETURN SQLERRM; END IF;
    RETURN SQLSTATE || ' ' || SQLERRM;
  END;
END $at$;
INSERT INTO at_cases VALUES
${cases.map((c, i) => `  (${i}, ${literal(c.before ?? null)}, ${literal(c.lay ?? null)}, ${literal(c.sql ?? null)}, ${c.action === 'select' || c.action === 'read'}, ${literal(c.then ?? null)}, ${c.actor === 'visitor' ? 'NULL' : literal(uid(c.actor))}, ${literal(c.call ?? null)}, ${literal(c.result ?? null)})`).join(',\n')};
INSERT INTO at_got SELECT n, pg_temp.at_try(c) FROM at_cases c ORDER BY n;
SELECT 'AT-RESULT ' || json_object_agg(n, got ORDER BY n) FROM at_got;
ROLLBACK;
`;

/**
 * An answer in the matrix's words: seen/unseen for a read, ok/refused for a write, or broken.
 * An update is ok only when the row then holds what was sent: a trigger that keeps a column
 * as it was has refused that change, however many rows the statement says it touched.
 */
export const judge = (c, got) => {
  if (c.action === 'call') {
    if (!got.startsWith('called')) return 'error';
    if (/ result:(false|null)/.test(got)) return 'wrong result';
    if (/ then:(false|null)/.test(got)) return 'wrong effect';
    return 'ok';
  }
  const rows = got.match(/^rows:(\d+)(?: then:(\w+))?$/);
  if (c.action === 'select' || c.action === 'read') {
    if (rows) return Number(rows[1]) > 0 ? 'seen' : 'unseen';
    return got.startsWith('42501') ? 'unseen' : 'broken';
  }
  if (rows) {
    if (Number(rows[1]) === 0) return 'refused';
    if (c.action === 'update' || c.action === 'delete') return { true: 'ok', false: 'refused' }[rows[2]] ?? 'broken';
    return rows[2] === undefined ? 'ok' : `ok then:${rows[2]}`;
  }
  // A data error means the rules let the row through and the specimen is wrong: never a refusal,
  // unless the table's own trigger refuses with that code (refusedAs).
  return c.anyError || !/^2[23]/.test(got) || (c.refusedAs ?? []).includes(got.slice(0, 5)) ? 'refused' : 'broken';
};

/** Did the answer meet what the case expects? */
export const met = (expect, answer) => {
  if (expect === 'refused-or-then') return answer === 'refused' || answer === 'ok then:true';
  return expect === answer;
};

/**
 * What the database under attack holds: its public tables and views, and the public functions a
 * visitor or member may run (granted to them or to everyone), trigger functions aside. Production as
 * it will be, the pending migrations applied, which the snapshot is not yet.
 */
const RELATIONS_SQL = `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p', 'm') ORDER BY 1`;
const CALLABLE_SQL = `SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ORDER BY 1`;
const ask = (db, sql) => {
  const r = spawnSync('psql', [db, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`the database could not be read: ${r.stderr.trim()}`);
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
};

export const run = ({ db = SEALED, sqlOut = null, plant = '' } = {}) => {
  const matrix = JSON.parse(readFileSync(join(HERE, 'matrix.json'), 'utf8'));
  const snapshot = readFileSync(SNAPSHOT, 'utf8').replace(/\r/g, '');
  const tables = sqlOut ? snapshotTables(snapshot) : ask(db, RELATIONS_SQL);
  const { unjudged, gone } = coverage(matrix, tables);
  const faults = [
    ...unjudged.map((t) => `${t}: in the snapshot, not in matrix.json — write who may do what with it`),
    ...gone.map((t) => `${t}: in matrix.json, not in the snapshot`),
  ];
  const callable = sqlOut ? callableFunctions(snapshot) : ask(db, CALLABLE_SQL);
  const judged = Object.keys(matrix.functions ?? {});
  faults.push(
    ...callable.filter((f) => !judged.includes(f)).map((f) => `${f}(): a visitor or member may run it, and matrix.json does not say what it must answer`),
    ...judged.filter((f) => !callable.includes(f)).map((f) => `${f}(): in matrix.json, and no visitor or member may run it`),
  );
  const columns = columnsOf(snapshot);
  const cases = plan(matrix, columns);
  const sql = script(matrix, cases, { plant, columns });
  if (sqlOut) { writeFileSync(sqlOut, sql); return { faults, cases, misses: [] }; }
  const r = spawnSync('psql', [db, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1e9 });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('AT-RESULT '));
  if (r.status !== 0 || !line) {
    return { faults: [...faults, `the run did not finish: ${(r.stderr ?? '').split('\n').filter(Boolean).slice(-5).join(' / ')}`], cases, misses: [] };
  }
  const got = JSON.parse(line.slice('AT-RESULT '.length));
  const misses = [];
  cases.forEach((c, i) => {
    const answer = judge(c, got[i]);
    c.got = got[i];
    c.answer = answer;
    if (!met(c.expect, answer)) misses.push(c);
  });
  return { faults, cases, misses };
};

const report = ({ faults, cases, misses }) => {
  for (const f of faults) console.log(`::error title=Attack matrix::${f}`);
  for (const m of misses) console.log(`✗ ${m.label}: expected ${m.expect}, got ${m.answer} (${m.got})`);
  const ok = !faults.length && !misses.length;
  console.log(ok ? `✓ ${cases.length} tries, every answer as matrix.json writes it.`
    : `✗ ${misses.length} of ${cases.length} tries answered otherwise; ${faults.length} fault(s).`);
  return ok;
};

/** A rule opened on purpose must be named, by table and try, and the run must fail. */
const selfTest = (db) => {
  const plant = 'CREATE POLICY at_planted ON public.user_blocks FOR SELECT TO anon, authenticated USING (true);';
  const res = run({ db, plant });
  const named = res.misses.some((m) => m.table === 'user_blocks' && m.action === 'select' && m.actor === 'free' && m.target === 'V');
  const others = res.misses.filter((m) => m.table !== 'user_blocks');
  console.log(`→ a planted open read of user_blocks: ${named ? 'named' : 'NOT named'}; ${others.length} miss(es) elsewhere`);
  if (!named || res.faults.length) { report(res); process.exit(1); }
  console.log('✓ self-test: a rule opened on purpose is named by its table and try.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const db = arg('--db') ?? SEALED;
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(db)) {
    console.error('Refusing: the attack matrix runs only against a local database.');
    process.exit(2);
  }
  if (process.argv.includes('--self-test')) selfTest(db);
  else {
    const res = run({ db, sqlOut: arg('--sql') ?? null });
    if (arg('--sql')) console.log(`wrote ${res.cases.length} tries to ${arg('--sql')}`);
    else if (!report(res)) process.exit(1);
  }
}
