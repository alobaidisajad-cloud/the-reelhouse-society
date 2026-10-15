/**
 * clientNames.ts — every table, function and bucket the two clients name, and
 * where each exists: in production (its committed snapshot, which `npm run
 * schema:check` compares with the live database), or only in a migration not
 * yet applied there (a file in either migrations tree missing from
 * mobile/supabase/APPLIED.txt).
 *
 * Read by everyNameAClientCallsExists.test.ts, which lets the app, never the
 * website, name what a pending migration makes, and by
 * aBuildNamesOnlyWhatProductionHas.release-test.ts, which the build's
 * pre-flight runs: no build carries a name production does not have.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '@/test-utils/readCode';

export const MOBILE = join(__dirname, '..', '..', '..');
export const REPO = join(MOBILE, '..');
const SCHEMA = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8');
const OUTSIDE = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-outside-public.sql'), 'utf8');

const collect = (re: RegExp, src: string) => new Set([...src.matchAll(re)].map((m) => m[1]));
export const TABLES = collect(/CREATE (?:TABLE|VIEW|MATERIALIZED VIEW) public\.([a-z_0-9]+) /g, SCHEMA);
export const FUNCTIONS = collect(/CREATE FUNCTION public\.([a-z_0-9]+)\(/g, SCHEMA);
export const BUCKETS = collect(/^INSERT INTO storage\.buckets \([^)]*\) VALUES \('([^']+)'/gm, OUTSIDE);

/** The tables and functions a migration's SQL makes in public. */
export const namesMadeIn = (sql: string) => ({
  tables: collect(/CREATE (?:TABLE|VIEW|MATERIALIZED VIEW) (?:IF NOT EXISTS )?(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi, sql),
  functions: collect(/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi, sql),
});

const APPLIED = new Set(readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

/** Each migration production has not had yet, by name. */
export const PENDING = ['supabase/migrations', 'mobile/supabase/migrations'].flatMap((dir) =>
  readdirSync(join(REPO, dir)).filter((f) => f.endsWith('.sql') && !APPLIED.has(f))
    .map((f) => ({ name: f, made: namesMadeIn(readFileSync(join(REPO, dir, f), 'utf8')) })));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', 'test', 'dist'].includes(e.name)) walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
};

export const FILES = [
  ...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src')),
  ...walk(join(REPO, 'src')), ...walk(join(REPO, 'api')),
];

export type Call = { kind: 'table' | 'rpc' | 'bucket'; name: string; at: string };

/** Every name a source asks the database for. */
export const callsIn = (file: string, raw: string): Call[] => {
  const src = stripComments(raw, file);
  const calls: Call[] = [];
  const line = (i: number) => `${file}:${src.slice(0, i).split('\n').length}`;
  for (const m of src.matchAll(/\.from\(\s*['"`]([A-Za-z_0-9-]+)['"`]\s*\)/g)) {
    const before = src.slice(0, m.index).trimEnd().slice(-40);
    calls.push({ kind: /storage\s*$/.test(before) ? 'bucket' : 'table', name: m[1], at: line(m.index!) });
  }
  for (const m of src.matchAll(/\.rpc\(\s*['"`]([A-Za-z_0-9]+)['"`]/g)) {
    calls.push({ kind: 'rpc', name: m[1], at: line(m.index!) });
  }
  return calls;
};

/** Whether production has what this call names. */
export const inProduction = (c: Call) =>
  c.kind === 'table' ? TABLES.has(c.name) : c.kind === 'rpc' ? FUNCTIONS.has(c.name) : BUCKETS.has(c.name);

/** The pending migration that makes what this call names, or null. */
export const pendingMaker = (c: Call, pending = PENDING) => pending.find((m) =>
  c.kind === 'table' ? m.made.tables.has(c.name) : c.kind === 'rpc' ? m.made.functions.has(c.name) : false)?.name ?? null;

/** A call in the app, which reaches members only in a build; the website goes live from main. */
export const fromTheApp = (c: Call) => c.at.startsWith('mobile/');
