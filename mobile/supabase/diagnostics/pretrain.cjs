// The train's dress rehearsal: every pending car rehearsed, applied and probed, in train order, on a
// copy of production's data on PostgreSQL 17, production's major, before the train may run.
//
//   node mobile/supabase/diagnostics/pretrain.cjs
//
//   1. a local PostgreSQL 17 of its own answers on PRETRAIN_PORT (55417), as its superuser
//      PRETRAIN_SUPERUSER (pretrain), with its programs in PRETRAIN_PG_BIN (scoop's postgresql17);
//   2. a fresh full copy of production is taken by dump-production.cjs, with 17's pg_dump;
//   3. production's roles (their powers, memberships and settings) are read, read-only, and made on
//      the local server; Supabase's three extensions that a plain PostgreSQL lacks (pg_cron, pg_net,
//      supabase_vault) are installed as stand-ins of the same names, tables and calls, which keep
//      their rows and never run a job, send a request or open a secret;
//   4. the copy is restored into a new database as supabase_admin, a superuser as on production;
//      the extensions' own grants are made production's, and every table is analyzed;
//   5. the train's own plan (train.cjs) runs car by car as production's postgres, with the train's
//      time limits: each index built alone, every other car rehearsed, applied as one transaction
//      and probed, stopping at the first that fails;
//   6. on success the stamp (train.cjs PRETRAIN_STAMP, in the private settings folder) names HEAD's
//      full sha and the pending cars, which the train refuses to run without; on failure the car,
//      its cases and the rehearsal's last words are printed.
// The database is dropped at the end either way (PRETRAIN_KEEP=1 keeps it). The address is never
// printed; the whole run is kept in <private>/pretrain/.
const { spawnSync } = require('child_process');
const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { homedir } = require('os');
const { delimiter, join } = require('path');

const MOBILE = join(__dirname, '..', '..');
const ROOT = join(MOBILE, '..');
const train = require('./train.cjs');
const { privateDir, privateFile, readPrivate } = require(join(MOBILE, 'scripts', 'private-settings.cjs'));

const PG_BIN = process.env.PRETRAIN_PG_BIN || join(homedir(), 'scoop', 'apps', 'postgresql17', 'current', 'bin');
const PORT = process.env.PRETRAIN_PORT || '55417';
const SUPER = process.env.PRETRAIN_SUPERUSER || 'pretrain';
const exe = (name) => join(PG_BIN, process.platform === 'win32' ? `${name}.exe` : name);
const local = (db, user) => `postgresql://${user}@localhost:${PORT}/${db}`;

/** Settings whose value is a list psql must not quote as one word (as pg_dumpall writes them). */
const LISTS = new Set(['search_path', 'session_preload_libraries', 'shared_preload_libraries',
  'local_preload_libraries', 'temp_tablespaces', 'unix_socket_directories']);
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** One `name=value` of rolconfig or setconfig, as SQL after SET. */
const setting = (item) => {
  const at = item.indexOf('=');
  const name = item.slice(0, at);
  const value = item.slice(at + 1);
  return `${name} = ${LISTS.has(name) ? value : literal(value)}`;
};

/**
 * The SQL that makes production's roles on the local server, as two lists: `must`, which has to
 * succeed (each role and its powers), and `may`, each statement alone (memberships and settings,
 * some naming what only Supabase's build has). `facts` is production's answer to ROLES_SQL; the
 * local superuser is left as it is.
 */
const rolesSql = (facts, db, superuser = SUPER) => {
  const roles = (facts.roles || []).filter((r) => r.name !== superuser);
  const flag = (on, word) => (on ? word : `NO${word}`);
  const must = roles.map((r) => `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${literal(r.name)}) THEN CREATE ROLE ${ident(r.name)}; END IF; END $$;\n`
    + `ALTER ROLE ${ident(r.name)} WITH ${flag(r.super, 'SUPERUSER')} ${flag(r.inherit, 'INHERIT')} ${flag(r.createrole, 'CREATEROLE')} `
    + `${flag(r.createdb, 'CREATEDB')} ${flag(r.login, 'LOGIN')} ${flag(r.replication, 'REPLICATION')} ${flag(r.bypassrls, 'BYPASSRLS')};`);
  const seen = new Set();
  const may = [];
  for (const m of facts.members || []) {
    if (m.member === superuser || seen.has(`${m.role}\u0000${m.member}`)) continue;
    seen.add(`${m.role}\u0000${m.member}`);
    may.push(`GRANT ${ident(m.role)} TO ${ident(m.member)} WITH ADMIN ${m.admin ? 'TRUE' : 'FALSE'}, INHERIT ${m.inherit ? 'TRUE' : 'FALSE'}, SET ${m.set ? 'TRUE' : 'FALSE'};`);
  }
  for (const r of roles) {
    may.push(`ALTER ROLE ${ident(r.name)} RESET ALL;`);
    for (const item of r.config || []) may.push(`ALTER ROLE ${ident(r.name)} SET ${setting(item)};`);
  }
  for (const s of facts.settings || []) {
    for (const item of s.config || []) {
      may.push(s.role ? `ALTER ROLE ${ident(s.role)} IN DATABASE ${ident(db)} SET ${setting(item)};` : `ALTER DATABASE ${ident(db)} SET ${setting(item)};`);
    }
  }
  return { must, may };
};

/** Production's roles, memberships, this database's settings, and the grants on the stand-ins' objects. */
const ROLES_SQL = `SELECT json_build_object(
  'roles', (SELECT json_agg(json_build_object('name', rolname, 'super', rolsuper, 'inherit', rolinherit,
     'createrole', rolcreaterole, 'createdb', rolcreatedb, 'login', rolcanlogin, 'replication', rolreplication,
     'bypassrls', rolbypassrls, 'config', rolconfig) ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_'),
  'members', (SELECT json_agg(json_build_object('role', r.rolname, 'member', m.rolname, 'admin', a.admin_option,
     'inherit', a.inherit_option, 'set', a.set_option) ORDER BY r.rolname, m.rolname)
     FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member),
  'settings', (SELECT json_agg(json_build_object('role', r.rolname, 'config', s.setconfig))
     FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid = s.setrole
     WHERE s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())),
  'acl', (SELECT json_agg(x) FROM (
     SELECT 'rel' AS kind, format('%I.%I', n.nspname, c.relname) AS name, c.relacl::text AS acl
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('cron', 'net', 'vault') AND c.relkind IN ('r', 'v', 'S', 'p')
     UNION ALL
     SELECT 'fn', p.oid::regprocedure::text, p.proacl::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('cron', 'net', 'vault')) x))`;

/** The SQL that gives each stand-in object production's grants; what production lacks is named. */
const aclSql = (acl) => (acl || []).map((a) => (a.kind === 'rel'
  ? `UPDATE pg_class SET relacl = ${a.acl === null ? 'NULL' : `${literal(a.acl)}::aclitem[]`} WHERE oid = to_regclass(${literal(a.name)});`
  : `UPDATE pg_proc SET proacl = ${a.acl === null ? 'NULL' : `${literal(a.acl)}::aclitem[]`} WHERE oid = to_regprocedure(${literal(a.name)});`));

/**
 * pg_restore's errors, each either one the stand-in server cannot help (an event trigger kept by its
 * superuser, as only Supabase lets postgres own one) or a fault. Returns the faults.
 */
const KNOWN = [/permission denied to change owner of event trigger/];
const restoreFaults = (stderr) => String(stderr).split(/\r?\n/)
  .filter((l) => /^pg_restore: error:/.test(l) && !KNOWN.some((k) => k.test(l)));

/** The lines of a failed step that say which case failed, and its last words. */
const lastWords = (out, n = 25) => {
  const lines = String(out).replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const cases = lines.filter((l) => /FAILED|MISSED|CANNOT RUN|ERROR|refused|✗/.test(l)).slice(0, 8);
  return { cases, tail: lines.slice(-n) };
};

/** What pretrain.cjs writes when every car passed: train.cjs's uncopied() reads it. */
const stampOf = (sha, pending, server, at = new Date().toISOString()) => ({ passed: true, sha, pending, server, at });

// Stand-ins for the three extensions production has and a plain PostgreSQL 17 lacks: the same
// names, versions, tables and calls, so the copy restores whole and every car that schedules a
// job, sends a request or reads a secret runs as on production; nothing is ever run, sent or opened.
const STAND_INS = {
  pg_cron: { version: '1.6.4', control: "schema = 'pg_catalog'\nrelocatable = false\nsuperuser = true\n", sql: `
CREATE SCHEMA cron;
CREATE SEQUENCE cron.jobid_seq;
CREATE TABLE cron.job (jobid bigint PRIMARY KEY DEFAULT nextval('cron.jobid_seq'), schedule text NOT NULL, command text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost', nodeport integer NOT NULL DEFAULT 5432, database text NOT NULL DEFAULT current_database(),
  username text NOT NULL DEFAULT current_user, active boolean NOT NULL DEFAULT true, jobname text);
CREATE UNIQUE INDEX jobname_username_uniq ON cron.job (jobname, username);
CREATE SEQUENCE cron.runid_seq;
CREATE TABLE cron.job_run_details (jobid bigint, runid bigint PRIMARY KEY DEFAULT nextval('cron.runid_seq'), job_pid integer,
  database text, username text, command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
SELECT pg_catalog.pg_extension_config_dump('cron.job', '');
SELECT pg_catalog.pg_extension_config_dump('cron.jobid_seq', '');
ALTER TABLE cron.job ENABLE ROW LEVEL SECURITY;
CREATE POLICY cron_job_policy ON cron.job USING (username = CURRENT_USER);
ALTER TABLE cron.job_run_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY cron_job_run_details_policy ON cron.job_run_details USING (username = CURRENT_USER);
CREATE FUNCTION cron._valid(schedule text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF schedule ~ '^\\s*([1-9]|[1-5][0-9]) seconds?\\s*$' OR schedule ~ '^\\s*@(yearly|annually|monthly|weekly|daily|hourly|reboot)\\s*$'
     OR schedule ~ '^\\s*[0-9A-Za-z*,/$-]+(\\s+[0-9A-Za-z*,/$-]+){4}\\s*$' THEN RETURN; END IF;
  RAISE EXCEPTION 'invalid schedule: %', schedule;
END $f$;
CREATE FUNCTION cron._put(p_name text, p_schedule text, p_command text, p_user text, p_database text, p_active boolean) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $f$
DECLARE id bigint;
BEGIN
  PERFORM cron._valid(p_schedule);
  IF p_name IS NOT NULL THEN
    UPDATE cron.job SET schedule = p_schedule, command = p_command, database = p_database, active = p_active
     WHERE jobname = p_name AND username = p_user RETURNING jobid INTO id;
    IF id IS NOT NULL THEN RETURN id; END IF;
  END IF;
  INSERT INTO cron.job (schedule, command, jobname, username, database, active) VALUES (p_schedule, p_command, p_name, p_user, p_database, p_active)
  RETURNING jobid INTO id;
  RETURN id;
END $f$;
CREATE FUNCTION cron._drop(p_id bigint, p_name text, p_user text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $f$
BEGIN
  DELETE FROM cron.job WHERE (jobid = p_id OR jobname = p_name) AND username = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job ''%''', coalesce(p_name, p_id::text); END IF;
  RETURN true;
END $f$;
GRANT EXECUTE ON FUNCTION cron._valid(text), cron._put(text, text, text, text, text, boolean), cron._drop(bigint, text, text) TO PUBLIC;
CREATE FUNCTION cron.schedule(schedule text, command text) RETURNS bigint LANGUAGE sql
  AS $f$ SELECT cron._put(NULL, schedule, command, current_user::text, current_database()::text, true) $f$;
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql
  AS $f$ SELECT cron._put(job_name, schedule, command, current_user::text, current_database()::text, true) $f$;
CREATE FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text DEFAULT NULL, active boolean DEFAULT true)
  RETURNS bigint LANGUAGE sql AS $f$ SELECT cron._put(job_name, schedule, command, coalesce(username, current_user::text), database, active) $f$;
CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $f$ SELECT cron._drop(job_id, NULL, current_user::text) $f$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS $f$ SELECT cron._drop(NULL, job_name, current_user::text) $f$;
CREATE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL, command text DEFAULT NULL, database text DEFAULT NULL, username text DEFAULT NULL, active boolean DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $f$
BEGIN
  IF schedule IS NOT NULL THEN PERFORM cron._valid(schedule); END IF;
  UPDATE cron.job j SET schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command),
    database = coalesce(alter_job.database, j.database), username = coalesce(alter_job.username, j.username), active = coalesce(alter_job.active, j.active)
   WHERE j.jobid = job_id AND j.username = session_user::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job %', job_id; END IF;
END $f$;
CREATE FUNCTION cron.job_cache_invalidate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END $f$;
` },
  pg_net: { version: '0.20.0', control: 'relocatable = false\nsuperuser = true\n', sql: `
CREATE SCHEMA net;
CREATE UNLOGGED TABLE net.http_request_queue (id bigserial NOT NULL, method text NOT NULL, url text NOT NULL, headers jsonb NOT NULL,
  body bytea, timeout_milliseconds integer NOT NULL);
CREATE UNLOGGED TABLE net._http_response (id bigint, status_code integer, content_type text, headers jsonb, content text,
  timed_out boolean, error_msg text, created timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = net
  AS $f$ INSERT INTO net.http_request_queue (method, url, headers, timeout_milliseconds) VALUES ('GET', url, headers, timeout_milliseconds) RETURNING id $f$;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = net
  AS $f$ INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
         VALUES ('POST', url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds) RETURNING id $f$;
CREATE FUNCTION net.http_delete(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000, body jsonb DEFAULT NULL)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = net
  AS $f$ INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
         VALUES ('DELETE', url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds) RETURNING id $f$;
` },
  supabase_vault: { version: '0.3.1', control: "schema = 'vault'\nrelocatable = false\nsuperuser = true\n", sql: `
CREATE FUNCTION vault._crypto_aead_det_noncegen() RETURNS bytea LANGUAGE sql AS $f$ SELECT decode(md5(random()::text), 'hex') $f$;
CREATE FUNCTION vault._crypto_aead_det_encrypt(message bytea, additional bytea, key_id bigint, context bytea DEFAULT convert_to('pgsodium', 'UTF8'), nonce bytea DEFAULT NULL)
  RETURNS bytea LANGUAGE sql AS $f$ SELECT message $f$;
CREATE FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea DEFAULT convert_to('pgsodium', 'UTF8'), nonce bytea DEFAULT NULL)
  RETURNS bytea LANGUAGE sql AS $f$ SELECT message $f$;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, description text NOT NULL DEFAULT '',
  secret text NOT NULL, key_id uuid, nonce bytea DEFAULT vault._crypto_aead_det_noncegen(),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX secrets_name_idx ON vault.secrets (name) WHERE name IS NOT NULL;
SELECT pg_catalog.pg_extension_config_dump('vault.secrets', '');
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, description, secret, 'pretrain-stand-in-not-a-secret'::text AS decrypted_secret,
  key_id, nonce, created_at, updated_at FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL)
  RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = ''
  AS $f$ INSERT INTO vault.secrets (secret, name, description) VALUES (new_secret, new_name, new_description) RETURNING id $f$;
CREATE FUNCTION vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL, new_name text DEFAULT NULL, new_description text DEFAULT NULL, new_key_id uuid DEFAULT NULL)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
  AS $f$ UPDATE vault.secrets SET secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
         description = coalesce(new_description, description), updated_at = now() WHERE id = secret_id $f$;
` },
};

if (require.main === module) {
  const started = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = join(privateDir(), 'pretrain');
  mkdirSync(logDir, { recursive: true });
  const log = join(logDir, `${started}.log`);
  const say = (line) => { console.log(line); appendFileSync(log, `${line}\n`); };
  const stop = (why) => { say(`PRETRAIN REFUSED: ${why}`); process.exit(1); };
  const url = readPrivate('SUPABASE_DB_URL');
  if (!url) stop(`no SUPABASE_DB_URL in ${privateFile()}`);
  const hide = (s) => String(s || '').split(url).join('***').replace(/\r/g, '');
  const sh = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9, ...opts });
    const out = hide(`${r.stdout || ''}${r.stderr || ''}`);
    appendFileSync(log, `$ ${hide([cmd, ...args].join(' ')).slice(0, 300)}\n${out}\n`);
    return { status: r.status, out, stdout: hide(r.stdout), stderr: hide(r.stderr) };
  };
  const as = (user, db, args, env = {}) => sh(exe('psql'), [local(db, user), ...args], { env: { ...process.env, ...env } });
  const one = (user, db, sqlText) => as(user, db, ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sqlText]);

  if (!existsSync(exe('psql'))) stop(`no PostgreSQL 17 programs in ${PG_BIN} (scoop install versions/postgresql17, or set PRETRAIN_PG_BIN)`);
  const server = one(SUPER, 'postgres', 'SHOW server_version');
  if (server.status !== 0) stop(`no local PostgreSQL answers on port ${PORT} as ${SUPER}: ${server.out.trim()}`);
  const version = server.stdout.trim();
  if (!/^17\./.test(version)) stop(`the server on port ${PORT} is PostgreSQL ${version}; production is 17`);

  const head = sh('git', ['rev-parse', 'HEAD']).stdout.trim();
  const p = train.plan(train.pendingIn(), train.rehearsalsIn());
  if (p.refuse) stop(p.refuse);
  const cars = p.steps.filter((s) => s.car && (s.kind === 'apply' || s.kind === 'build')).map((s) => s.car.name);
  say(`Pretrain at ${head}, PostgreSQL ${version} on port ${PORT}: ${cars.length} cars (${cars.join(', ')})`);

  // 2. A fresh full copy, with the pg_dump of production's major.
  say('→ a full copy of production (dump-production.cjs full, pg_dump 17)');
  const dump = sh('node', [join(MOBILE, 'scripts', 'dump-production.cjs'), 'full'],
    { env: { ...process.env, PATH: `${PG_BIN}${delimiter}${process.env.PATH}` } });
  const file = /Copy taken: (.+)$/m.exec(dump.stdout)?.[1]?.trim();
  if (dump.status !== 0 || !file) stop(`the copy was not taken:\n${dump.out.trim()}`);
  say(`  ✓ ${file}`);

  // 3. Production's roles, read only; the stand-in extensions.
  const facts = sh(exe('psql'), [url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', ROLES_SQL],
    { env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' } });
  if (facts.status !== 0) stop(`production's roles could not be read:\n${facts.out.trim()}`);
  const known = JSON.parse(facts.stdout.trim());
  const db = `pretrain_${started.replace(/-/g, '_').toLowerCase()}`;
  const roles = rolesSql(known, db);
  const made = as(SUPER, 'postgres', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', roles.must.join('\n')]);
  if (made.status !== 0) stop(`production's roles could not be made:\n${made.out.trim()}`);
  const extDir = join(PG_BIN, '..', 'share', 'extension');
  for (const [name, x] of Object.entries(STAND_INS)) {
    writeFileSync(join(extDir, `${name}.control`), `# A stand-in made by pretrain.cjs: production's names, nothing run or sent.\ncomment = 'pretrain stand-in for ${name}'\ndefault_version = '${x.version}'\n${x.control}`);
    writeFileSync(join(extDir, `${name}--${x.version}.sql`), x.sql);
  }

  // 4. Restore as supabase_admin, a superuser as on production.
  say(`→ restore the copy into ${db}`);
  const created = one(SUPER, 'postgres', `CREATE DATABASE ${ident(db)} OWNER postgres TEMPLATE template0 ENCODING 'UTF8'`);
  if (created.status !== 0) stop(`the database could not be made:\n${created.out.trim()}`);
  const drop = () => {
    if (process.env.PRETRAIN_KEEP === '1') { say(`(kept: ${db})`); return; }
    const d = one(SUPER, 'postgres', `DROP DATABASE IF EXISTS ${ident(db)} WITH (FORCE)`);
    say(d.status === 0 ? `Dropped ${db}.` : `${db} could not be dropped: ${d.out.trim()}`);
  };
  const notes = [];
  for (const stmt of roles.may) {
    const r = as(SUPER, db, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', stmt]);
    if (r.status !== 0) notes.push(`${stmt.slice(0, 90)}: ${r.out.trim().split('\n').pop()}`);
  }
  if (notes.length) say(`  (${notes.length} role settings or memberships only Supabase's build has were left out; the log names them)`);
  appendFileSync(log, `left out:\n${notes.join('\n')}\n`);
  const restored = sh(exe('pg_restore'), ['--dbname', local(db, 'supabase_admin'), '--no-password', file]);
  const faults = restoreFaults(restored.stderr);
  if (faults.length) { say(`The copy did not restore whole:\n  ${faults.slice(0, 30).join('\n  ')}`); drop(); process.exit(1); }
  const granted = as(SUPER, db, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', aclSql(known.acl).join('\n') || 'SELECT 1']);
  if (granted.status !== 0) { say(`The stand-ins' grants could not be made production's:\n${granted.out.trim()}`); drop(); process.exit(1); }
  const analyzed = one(SUPER, db, 'ANALYZE');
  if (analyzed.status !== 0) { say(`ANALYZE failed:\n${analyzed.out.trim()}`); drop(); process.exit(1); }
  say(`  ✓ restored, ${one(SUPER, db, 'SELECT count(*) FROM auth.users').stdout.trim()} members, analyzed`);

  // 5. The train's own plan, car by car, as production's postgres under the train's limits.
  const limits = { PGOPTIONS: train.LIMITS };
  const exec = (step) => {
    if (!['rehearse', 'apply', 'probe', 'build'].includes(step.kind)) return { ok: true, out: '' };
    if (step.kind === 'build') {
      const run = (args) => as('postgres', db, args, limits);
      const ask = (sql) => run(['-X', '-q', '-t', '-A', '-c', sql]).stdout.trim();
      return train.buildIndex(step, run, ask);
    }
    const r = as('postgres', db, train.psqlArgs(step), limits);
    return { ok: r.status === 0, out: r.out };
  };
  const carSteps = p.steps.filter((s) => s.car);
  const result = train.run(carSteps, exec, say);
  drop();
  if (result.failed) {
    const { cases, tail } = lastWords(result.failed.out);
    say(`PRETRAIN FAILED at: ${result.failed.step.what}`);
    say(`The car: ${result.failed.step.car.name}`);
    if (cases.length) { say('Its cases:'); for (const l of cases) say(`  ${l}`); }
    say('Its last words:');
    for (const l of tail) say(`  ${l}`);
    say(`The whole run is kept in ${log}. No stamp was written: the train refuses until this passes.`);
    process.exit(1);
  }
  writeFileSync(join(privateDir(), train.PRETRAIN_STAMP), `${JSON.stringify(stampOf(head, cars, version), null, 2)}\n`);
  say(`PRETRAIN PASSED: ${cars.length} cars rehearsed, applied and probed in train order on a copy of production (PostgreSQL ${version}).`);
  say(`Stamp: ${head} with ${cars.join(', ')}. The whole run is kept in ${log}.`);
}

module.exports = { ROLES_SQL, STAND_INS, aclSql, lastWords, restoreFaults, rolesSql, setting, stampOf };
