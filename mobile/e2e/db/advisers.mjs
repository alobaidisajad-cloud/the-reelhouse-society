#!/usr/bin/env node
/**
 * advisers.mjs — Supabase's advisers, run on the sealed copy and held to a
 * committed allowlist.
 *
 * The advisers are Supabase's database linter: the security and performance
 * checks the dashboard's Security Advisor and Performance Advisor show, run here
 * by the Supabase CLI (`supabase db advisors`). db-integration.yml runs this after
 * up-down-up.mjs has applied every pending migration, so the copy is production
 * as it will be.
 *
 * Every finding must be on advisers-allowlist.json, by its lint and the
 * adviser's own key for the finding (which names the object). An entry is an
 * accepted finding with its reason, or one a register class will fix, naming
 * only that class's id. An entry whose key would describe an open weakness is
 * held by the key's sha256 instead, with the reason "held privately". The run
 * fails on a finding that is not on the list, and on an entry that no longer
 * fires (a stale entry would excuse the next finding of its name). The lints
 * on the list's productionOnly read what a copy built for one run cannot have;
 * they are counted here and judged on production.
 *
 * The repository is public, so the run prints only each lint's name and its
 * counts, and the ids of stale entries (which the list already holds). The
 * findings themselves come from a local run with --details.
 *
 * Several lints ask which schemas the API serves (the pgrst.db_schemas setting
 * PostgREST reads). The copy is given the schemas the local stack's config.toml
 * serves, on the postgres login for that one database, and it is taken off
 * again after the run.
 *
 *   node mobile/e2e/db/advisers.mjs                 the sealed copy, judged
 *   node mobile/e2e/db/advisers.mjs --self-test     a table planted in a scratch
 *                                                   database without row security
 *                                                   must be found and refused
 *   node mobile/e2e/db/advisers.mjs --from <file>   judge a saved answer of the
 *                                                   CLI's (--output-format json)
 *   --details                                       also print each refused
 *                                                   finding's key (local use only)
 *   --allowlist <file>                              another list (the tests' own)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = join(HERE, 'advisers-allowlist.json');
const CONFIG = join(HERE, '..', 'supabase', 'config.toml');
const HOST = process.env.E2E_DB_HOST ?? '127.0.0.1';
const PORT = process.env.E2E_DB_PORT ?? '54322';
const SCRATCH = 'advisers_self_test';
const PLANTED = 'rls_disabled_in_public_public_advisers_planted';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The findings in the CLI's JSON answer, as lint and key; null when there is no list to read. */
export function readFindings(text) {
  let answer;
  try { answer = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(answer) ? answer
    : Array.isArray(answer?.results) ? answer.results
      : Array.isArray(answer?.lints) ? answer.lints : null;
  if (!list) return null;
  const findings = list.map((f) => ({ lint: f?.name, key: f?.cacheKey ?? f?.cache_key }));
  return findings.every((f) => typeof f.lint === 'string' && typeof f.key === 'string') ? findings : null;
}

const CLASS = /^[A-Z]+(-[A-Z]+)*-\d+$/;

/** What is wrong with the allowlist itself; an empty list when nothing is. */
export function checkAllowlist(list) {
  const problems = [];
  if (!Array.isArray(list?.entries) || !Array.isArray(list?.productionOnly)) {
    return ['the allowlist needs an "entries" list and a "productionOnly" list'];
  }
  const productionOnly = new Set();
  for (const p of list.productionOnly) {
    if (typeof p?.lint !== 'string' || typeof p?.reason !== 'string' || !p.reason.trim()) {
      problems.push(`a productionOnly lint needs its name and a reason: ${JSON.stringify(p)}`);
    } else productionOnly.add(p.lint);
  }
  const ids = new Set();
  const objects = new Set();
  for (const e of list.entries) {
    const id = typeof e?.id === 'string' ? e.id : JSON.stringify(e);
    if (!/^ADV-\d{3}$/.test(e?.id ?? '')) problems.push(`${id}: an entry's id is ADV- and three digits`);
    else if (ids.has(e.id)) problems.push(`${id}: listed twice`);
    ids.add(e?.id);
    if (typeof e?.lint !== 'string' || !e.lint) problems.push(`${id}: names no lint`);
    if (productionOnly.has(e?.lint)) problems.push(`${id}: ${e.lint} is judged on production only, so it has no entry here`);
    const keyed = (typeof e?.key === 'string' && e.key ? 1 : 0) + (/^[0-9a-f]{64}$/.test(e?.keySha256 ?? '') ? 1 : 0);
    if (keyed !== 1) problems.push(`${id}: names its object by a key or by a key's sha256, one of the two`);
    const why = (typeof e?.reason === 'string' && e.reason.trim() ? 1 : 0) + (typeof e?.class === 'string' ? 1 : 0);
    if (why !== 1) problems.push(`${id}: gives a reason or a register class, one of the two`);
    if (typeof e?.class === 'string' && !CLASS.test(e.class)) problems.push(`${id}: "${e.class}" is not a register class id`);
    if (e?.keySha256 && e?.reason !== undefined && e.reason !== 'held privately') {
      problems.push(`${id}: an entry held by its key's sha256 says only "held privately"`);
    }
    const object = `${e?.lint} ${e?.key ?? e?.keySha256}`;
    if (objects.has(object)) problems.push(`${id}: another entry already names this finding`);
    objects.add(object);
  }
  return problems;
}

/**
 * The verdict on a run's findings: per lint, how many were found, allowed and
 * refused (or that it is judged on production only); the refused findings; and
 * the ids of entries that matched nothing.
 */
export function judge(findings, list) {
  const productionOnly = new Set(list.productionOnly.map((p) => p.lint));
  const lints = new Map();
  const used = new Set();
  const refused = [];
  for (const f of findings) {
    const row = lints.get(f.lint) ?? { found: 0, allowed: 0, refused: 0, productionOnly: productionOnly.has(f.lint) };
    row.found += 1;
    if (!row.productionOnly) {
      const entry = list.entries.find((e) => e.lint === f.lint && (e.key ? e.key === f.key : e.keySha256 === sha256(f.key)));
      if (entry) { row.allowed += 1; used.add(entry.id); } else { row.refused += 1; refused.push(f); }
    }
    lints.set(f.lint, row);
  }
  const stale = list.entries.filter((e) => !used.has(e.id)).map((e) => e.id);
  return { lints, refused, stale };
}

/** The verdict in words: names and counts only, unless details are asked for. */
export function report({ lints, refused, stale }, { details }) {
  const lines = [...lints.keys()].sort().map((lint) => {
    const r = lints.get(lint);
    return r.productionOnly
      ? `${lint}: ${r.found} found, judged on production only`
      : `${lint}: ${r.found} found, ${r.allowed} on the allowlist, ${r.refused} not`;
  });
  if (!lints.size) lines.push('(the advisers found nothing)');
  const problems = [];
  for (const lint of [...new Set(refused.map((f) => f.lint))].sort()) {
    problems.push(`${lint}: ${refused.filter((f) => f.lint === lint).length} finding(s) not on the allowlist`);
  }
  if (stale.length) problems.push(`${stale.length} allowlist entr${stale.length === 1 ? 'y no longer fires' : 'ies no longer fire'}: ${stale.join(', ')}`);
  if (details) for (const f of refused) lines.push(`  not on the allowlist: ${f.lint} ${f.key}`);
  return { lines, problems };
}

/** The schemas the local stack's API serves, from config.toml's [api] section. */
export function apiSchemas(toml) {
  let inApi = false;
  for (const line of toml.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) inApi = /^\s*\[api\]\s*$/.test(line);
    const list = inApi ? /^\s*schemas\s*=\s*\[([^\]]*)\]/.exec(line) : null;
    if (list) {
      const schemas = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      return schemas.length ? schemas : null;
    }
  }
  return null;
}

const fail = (title, detail) => {
  console.log(`::error title=Supabase's advisers — ${title}::${detail}`);
  console.error(`✗ ${title}: ${detail}`);
  process.exit(1);
};

const url = (user, db) => `postgresql://${user}:postgres@${HOST}:${PORT}/${db}`;

/** One statement as supabase_admin, stopping the run if it fails. */
const admin = (db, sql, step) => {
  const r = spawnSync('psql', [url('supabase_admin', db), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) fail(step, (r.stderr || r.error?.message || '').trim().split('\n')[0]);
};

/** The CLI's answer for one database, the API's schemas set for the run and taken off after. */
function ask(db) {
  const schemas = apiSchemas(readFileSync(CONFIG, 'utf8'));
  if (!schemas) fail('the API schemas', 'config.toml names no [api] schemas');
  admin(db, `ALTER ROLE postgres IN DATABASE "${db}" SET pgrst.db_schemas = '${schemas.join(', ')}'`, 'the API schemas');
  let r;
  try {
    r = spawnSync('supabase', ['db', 'advisors', '--db-url', `${url('postgres', db)}?sslmode=disable`,
      '--type', 'all', '--level', 'info', '--fail-on', 'none', '--output-format', 'json'],
    { encoding: 'utf8', maxBuffer: 1e8, shell: process.platform === 'win32' });
  } finally {
    admin(db, `ALTER ROLE postgres IN DATABASE "${db}" RESET pgrst.db_schemas`, 'the API schemas taken off');
  }
  if (r.status !== 0) fail('the CLI', `supabase db advisors ended ${r.status}: ${(r.stderr || r.error?.message || '').trim().split('\n').pop().slice(0, 200)}`);
  const findings = readFindings(r.stdout);
  if (!findings) fail('the answer', 'supabase db advisors printed no list of findings this script can read');
  return findings;
}

function readList(file) {
  let list;
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail('the allowlist', `${file} cannot be read: ${e.message}`); }
  const problems = checkAllowlist(list);
  if (problems.length) fail('the allowlist', problems.join(' / '));
  return list;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args.splice(at, 2)[1];
  };
  const has = (name) => {
    const at = args.indexOf(name);
    if (at !== -1) args.splice(at, 1);
    return at !== -1;
  };
  const from = flag('--from');
  const listFile = flag('--allowlist') ?? ALLOWLIST;
  const details = has('--details');
  const selfTest = has('--self-test');
  if (args.length || (from && selfTest)) {
    console.error('usage: node mobile/e2e/db/advisers.mjs [--self-test | --from <file>] [--details] [--allowlist <file>]');
    process.exit(2);
  }
  if (!from && !/^(127\.0\.0\.1|localhost)$/.test(HOST)) {
    console.error(`Refusing ${HOST}: this runs only against a local database.`);
    process.exit(2);
  }
  const list = readList(listFile);

  if (selfTest) {
    // A scratch database, so nothing is planted in the copy the other checks read.
    admin('postgres', `DROP DATABASE IF EXISTS ${SCRATCH}`, 'the scratch database');
    admin('postgres', `CREATE DATABASE ${SCRATCH}`, 'the scratch database');
    admin(SCRATCH, 'CREATE TABLE public.advisers_planted (id int); GRANT SELECT ON public.advisers_planted TO anon',
      'the planted table');
    const caught = judge(ask(SCRATCH), list).refused.some((f) => f.key === PLANTED);
    admin('postgres', `DROP DATABASE ${SCRATCH}`, 'the scratch database dropped');
    console.log(caught
      ? '✓ the advisers found the planted table without row security, and the allowlist refused it'
      : '✗ the planted table without row security was not found and refused');
    process.exit(caught ? 0 : 1);
  }

  let findings;
  if (from) {
    findings = readFindings(readFileSync(from, 'utf8'));
    if (!findings) fail('the answer', `${from} holds no list of findings this script can read`);
  } else {
    findings = ask('postgres');
  }
  const { lines, problems } = report(judge(findings, list), { details });
  console.log(lines.join('\n'));
  for (const p of problems) console.log(`✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
}
