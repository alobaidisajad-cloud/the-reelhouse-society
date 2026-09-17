/**
 * everyNameAClientCallsExists.test.ts — no client asks production for a table it dropped.
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch 31 dropped `vaults`, `tickets` and `programmes`. Their fetchers were
 * removed from the web's boot — and the stores, the UI and the writers were left
 * behind. So an Auteur's web profile told visitors about programmes nobody
 * could make, the film store kept an add-to-vault that could only fail, and a
 * feature-flag loader asked `app_config` (which never existed) on every visit.
 * Nothing noticed, because a missing table is an error PostgREST returns
 * quietly and every caller swallowed it.
 *
 * So both clients are held to the database as it IS: every `.from('table')`,
 * `.rpc('function')` and `storage.from('bucket')` in the mobile app and the web
 * app must name something in the committed snapshot of production —
 * supabase/schema/live-schema.sql and live-state.txt, which `npm run
 * schema:check` compares against the live database.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const REPO = join(MOBILE, '..');
const SCHEMA = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8');
const STATE = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-state.txt'), 'utf8');

const collect = (re: RegExp, src: string) => new Set([...src.matchAll(re)].map(m => m[1]));
const TABLES = collect(/CREATE (?:TABLE|VIEW|MATERIALIZED VIEW) public\.([a-z_0-9]+) /g, SCHEMA);
const FUNCTIONS = collect(/CREATE FUNCTION public\.([a-z_0-9]+)\(/g, SCHEMA);
const BUCKETS = (() => {
  const section = STATE.split('[storage buckets]')[1]?.split('\n[')[0] ?? '';
  return new Set(section.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(Boolean));
})();

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', 'test', 'dist'].includes(e.name)) walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
};

const FILES = [
  ...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src')),
  ...walk(join(REPO, 'src')), ...walk(join(REPO, 'api')),
];

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');

type Call = { kind: 'table' | 'rpc' | 'bucket'; name: string; at: string };

/** Every name a source asks the database for. */
export const callsIn = (file: string, raw: string): Call[] => {
  const src = strip(raw);
  const calls: Call[] = [];
  const line = (i: number) => `${file}:${src.slice(0, i).split('\n').length}`;
  for (const m of src.matchAll(/\.from\(\s*['"`]([A-Za-z_0-9-]+)['"`]\s*\)/g)) {
    const before = src.slice(Math.max(0, m.index! - 40), m.index);
    calls.push({ kind: /storage\s*$/.test(before) ? 'bucket' : 'table', name: m[1], at: line(m.index!) });
  }
  for (const m of src.matchAll(/\.rpc\(\s*['"`]([A-Za-z_0-9]+)['"`]/g)) {
    calls.push({ kind: 'rpc', name: m[1], at: line(m.index!) });
  }
  return calls;
};

const missing = (c: Call) =>
  c.kind === 'table' ? !TABLES.has(c.name) : c.kind === 'rpc' ? !FUNCTIONS.has(c.name) : !BUCKETS.has(c.name);

describe('every table, function and bucket a client names exists in production', () => {
  const calls = FILES.flatMap(f => callsIn(relative(REPO, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')));

  it('none is missing — in the mobile app or the web app', () => {
    expect(calls.filter(missing).map(c => `${c.at}  ${c.kind} ${c.name}`)).toEqual([]);
  });

  it('the scan sees both clients and the snapshot is read — it cannot pass on nothing', () => {
    expect(TABLES.size).toBeGreaterThan(30);
    expect(FUNCTIONS.size).toBeGreaterThan(50);
    expect(BUCKETS.has('avatars')).toBe(true);
    expect(calls.some(c => c.at.startsWith('mobile/') && c.kind === 'rpc')).toBe(true);
    expect(calls.some(c => c.at.startsWith('src/') && c.kind === 'table')).toBe(true);
  });

  it('the detector says NO — and tells a bucket from a table across a line break', () => {
    const planted = callsIn('x.ts', [
      "supabase.from('vaults').select('*')",
      "supabase.rpc('fetch_programmes')",
      "supabase.storage\n  .from('avatars').upload(p, f)",
      "// supabase.from('in_a_comment')",
    ].join('\n'));
    expect(planted.map(c => `${c.kind} ${c.name}`)).toEqual(['table vaults', 'bucket avatars', 'rpc fetch_programmes']);
    expect(planted.filter(missing).map(c => c.name)).toEqual(['vaults', 'fetch_programmes']);
  });
});
