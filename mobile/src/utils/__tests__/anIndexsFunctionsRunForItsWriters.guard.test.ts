/**
 * Every function an index works out is one its writers may run (the kinds pass, kind 13: an index made for
 * speed refused the writes it was made beside).
 * ─────────────────────────────────────────────────────────────────────────────
 * An index on an expression works the expression out for every row written, as the member writing it: a
 * function in it, or a function that function calls, that the member may not run refuses the write.
 * 20261122_12 kept the short pieces' functions from members while 20261122_13 and _14 indexed the stacks
 * and the members by them, so a member saving a stack or their own name was refused ("permission denied
 * for function search_grams"). So the house as production will hold it (the snapshot and every pending
 * migration, in order, scripts/write-sites.cjs) is read statement by statement: each index left standing,
 * the house functions its expression and its WHERE call, and the functions those call in turn; and who may
 * run each function when the last migration is done (a function made is run by no one until a GRANT, as
 * Supabase makes it; a GRANT or REVOKE to `authenticated` or PUBLIC decides it). Each such function must be
 * one a signed-in member may run.
 */
const { databaseSql } = require('../../../scripts/write-sites.cjs') as { databaseSql: () => string[] };
const { statements } = require('../../../scripts/add-only.cjs') as {
  statements: (sql: string) => { text: string; masked: string }[];
};

type House = { indexes: Map<string, { table: string; calls: string[] }>; runs: Map<string, boolean>; bodies: Map<string, string> };

/** A function's name as the house knows it: schema and name, in lower case, `public` when none is written. */
const named = (schema: string | undefined, name: string) => `${(schema ?? 'public').replace(/"/g, '').toLowerCase()}.${name.replace(/"/g, '').toLowerCase()}`;

/** The house functions a piece of SQL calls: each `schema.name(` in public or private, and each bare name the house makes. */
export function callsIn(sql: string, known: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of sql.matchAll(/(?:\b("?\w+"?)\s*\.\s*)?\b("?\w+"?)\s*\(/g)) {
    const schema = m[1]?.replace(/"/g, '').toLowerCase();
    if (schema && schema !== 'public' && schema !== 'private') continue;
    const key = named(schema, m[2] ?? '');
    if (known.has(key)) out.add(key);
  }
  return [...out];
}

/** The house read in order: its indexes left standing, each function's body, and whether a member may run it. */
export function readHouse(texts: string[]): House {
  const indexes = new Map<string, { table: string; on: string }>();
  const runs = new Map<string, boolean>();
  const bodies = new Map<string, string>();
  for (const sql of texts) {
    for (const { text } of statements(sql)) {
      // A statement as written, the comments above it set aside.
      const s = { text: text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim() };
      const fn = /^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:("?\w+"?)\.)?("?\w+"?)\s*\(/i.exec(s.text);
      if (fn) {
        const key = named(fn[2], fn[3] ?? '');
        if (!runs.has(key) || !fn[1]) runs.set(key, false);
        const open = /\bAS\s+(\$\w*\$)/i.exec(s.text);
        bodies.set(key, open ? s.text.slice(open.index + open[0].length, s.text.lastIndexOf(open[1] ?? '$$')) : '');
        continue;
      }
      const idx = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)\s+ON\s+(?:ONLY\s+)?([\w."]+)/i.exec(s.text);
      if (idx) {
        indexes.set((idx[1] ?? '').replace(/"/g, '').toLowerCase(), { table: (idx[2] ?? '').replace(/"/g, '').replace(/^public\./i, '').toLowerCase(), on: s.text.slice(idx[0].length) });
        continue;
      }
      const drop = /^DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:\w+\.)?("?\w+"?)/i.exec(s.text);
      if (drop) { indexes.delete((drop[1] ?? '').replace(/"/g, '').toLowerCase()); continue; }
      const acl = /^(GRANT|REVOKE)\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+([\s\S]+?)\s+(?:TO|FROM)\s+([\s\S]+)$/i.exec(s.text.replace(/;\s*$/, ''));
      if (acl) {
        const who = (acl[3] ?? '').toLowerCase();
        if (!/\b(authenticated|public)\b/.test(who)) continue;
        for (const m of (acl[2] ?? '').matchAll(/(?:("?\w+"?)\.)?("?\w+"?)\s*\(/g)) runs.set(named(m[1], m[2] ?? ''), (acl[1] ?? '').toUpperCase() === 'GRANT');
      }
    }
  }
  const known = new Set(runs.keys());
  return { indexes: new Map([...indexes].map(([k, v]) => [k, { table: v.table, calls: callsIn(v.on, known) }])), runs, bodies };
}

/** Each index whose functions, or a function they call, a signed-in member may not run: `index (table): function`. */
export function refusedWrites(house: House): string[] {
  const known = new Set(house.runs.keys());
  const faults: string[] = [];
  for (const [name, { table, calls }] of house.indexes) {
    const seen = new Set<string>();
    const walk = (fn: string) => {
      if (seen.has(fn)) return;
      seen.add(fn);
      if (!house.runs.get(fn)) faults.push(`${name} (${table}): ${fn}`);
      for (const inner of callsIn(house.bodies.get(fn) ?? '', known)) walk(inner);
    };
    calls.forEach(walk);
  }
  return faults.sort();
}

it('lets a member run every function an index of the house works out, and every function those call', () => {
  const house = readHouse(databaseSql());
  expect(house.indexes.get('lists_short_grams')?.calls).toEqual(['private.search_grams']);
  expect(house.indexes.get('logs_seen_again_by_month')?.calls).toEqual(['private.viewing_months']);
  expect(refusedWrites(house)).toEqual([]);
});

it('says no to an index whose function, or a function it calls, no member may run, and yes once it is granted', () => {
  const made = `CREATE FUNCTION private.grams(t text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT private.pieces(t) $$;
CREATE FUNCTION private.pieces(t text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[t] $$;
CREATE INDEX CONCURRENTLY IF NOT EXISTS lists_grams ON public.lists USING gin (private.grams(title));
CREATE INDEX lists_lower ON public.lists (lower(title));`;
  expect(refusedWrites(readHouse([made]))).toEqual(['lists_grams (lists): private.grams', 'lists_grams (lists): private.pieces']);
  const granted = `${made}\nGRANT EXECUTE ON FUNCTION private.grams(text) TO anon, authenticated;`;
  expect(refusedWrites(readHouse([granted]))).toEqual(['lists_grams (lists): private.pieces']);
  const both = `${granted}\nGRANT EXECUTE ON FUNCTION private.pieces(text) TO PUBLIC;`;
  expect(refusedWrites(readHouse([both]))).toEqual([]);
  // A later REVOKE takes it back; a dropped index asks nothing.
  expect(refusedWrites(readHouse([both, 'REVOKE ALL ON FUNCTION private.pieces(text) FROM PUBLIC, anon, authenticated;'])))
    .toEqual(['lists_grams (lists): private.pieces']);
  expect(refusedWrites(readHouse([made, 'DROP INDEX CONCURRENTLY IF EXISTS public.lists_grams;']))).toEqual([]);
  // A function replaced keeps who may run it; one made anew is run by no one.
  expect(refusedWrites(readHouse([both, 'CREATE OR REPLACE FUNCTION private.pieces(t text) RETURNS text[] LANGUAGE sql AS $$ SELECT ARRAY[t] $$;']))).toEqual([]);
});
