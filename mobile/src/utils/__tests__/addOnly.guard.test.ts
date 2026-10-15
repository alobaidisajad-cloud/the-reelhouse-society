/**
 * The add-only check finds every kind of break, and nothing else.
 * ─────────────────────────────────────────────────────────────────────────────
 * scripts/add-only.cjs runs on every push (god_tier_ci.yml) over the
 * migrations the push brings. Here its reader is held to each kind of break
 * WORKLIST P0.3 names, to the things that are not breaks (a new table's own
 * constraints, a word inside a string or a function body), and to the reasons
 * it accepts. Then it reads every migration in both trees, so a syntax it
 * cannot follow fails here, not on the day a train needs it.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const { breaksIn, existingIn, functionFaults, reasonFault, statements } = require('../../../scripts/add-only.cjs') as {
  breaksIn: (sql: string, existing: ReturnType<typeof existingIn>) => { statement: string; kinds: string[]; reason: string }[];
  existingIn: (snapshot: string) => { tables: Set<string>; functions: Set<string> };
  functionFaults: (touched: string[], messages: string) => string[];
  reasonFault: (comments: string) => string | null;
  statements: (sql: string) => { text: string; masked: string; reason: string }[];
};

const EXISTING = existingIn('CREATE TABLE public.profiles (\n  id uuid\n);\nCREATE FUNCTION public.get_feed(p int) RETURNS int\n');
const kindsOf = (sql: string) => breaksIn(sql, EXISTING).map((b) => b.kinds.join(', '));

describe('each kind of break is found', () => {
  it.each([
    ['DROP POLICY IF EXISTS "own rows" ON public.profiles;', 'DROP'],
    ['ALTER TABLE public.profiles RENAME COLUMN bio TO about;', 'RENAME'],
    ['ALTER TABLE public.profiles ALTER COLUMN bio TYPE varchar(100);', 'ALTER ... TYPE'],
    ['REVOKE INSERT ON public.profiles FROM authenticated;', 'REVOKE'],
    ['ALTER POLICY "own rows" ON public.profiles USING (false);', 'a changed policy'],
    ['CREATE POLICY "only me" ON public.profiles AS RESTRICTIVE FOR SELECT USING (true);', 'a RESTRICTIVE policy'],
    ['ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;', 'row level security on an existing table'],
    ['ALTER TABLE public.profiles ADD CONSTRAINT bio_len CHECK (char_length(bio) <= 300);', 'a new constraint on an existing table'],
    ['ALTER TABLE public.profiles ALTER COLUMN bio SET NOT NULL;', 'a new constraint on an existing table'],
    ["ALTER TABLE public.profiles ADD COLUMN x text NOT NULL DEFAULT '';", 'a new column with a constraint on an existing table'],
    ['CREATE UNIQUE INDEX profiles_name ON public.profiles (username);', 'a unique index on an existing table'],
    ['CREATE TRIGGER t BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION f();', 'a new trigger on an existing table'],
    ['ALTER FUNCTION public.get_feed(int) SET search_path = public;', 'a changed function setting'],
    ['CREATE OR REPLACE FUNCTION public.get_feed(p int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;', 'a new body for an existing function'],
  ])('%s', (sql, kind) => {
    expect(kindsOf(sql)).toEqual([kind]);
  });
});

describe('what is not a break is left alone', () => {
  it.each([
    ['a new table with its own constraints', 'CREATE TABLE public.fresh (id int NOT NULL UNIQUE); ALTER TABLE public.fresh ADD CONSTRAINT c CHECK (id > 0); ALTER TABLE public.fresh ENABLE ROW LEVEL SECURITY;'],
    ['a new nullable column', 'ALTER TABLE public.profiles ADD COLUMN x text;'],
    ['a new function', 'CREATE OR REPLACE FUNCTION public.brand_new() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;'],
    ['a grant', 'GRANT SELECT ON public.profiles TO anon;'],
    ['a word in a string', "COMMENT ON TABLE public.profiles IS 'we DROP and REVOKE nothing';"],
    ['a word in a quoted name', 'CREATE INDEX "drop_rename" ON public.profiles (id);'],
  ])('%s', (_name, sql) => {
    expect(kindsOf(sql)).toEqual([]);
  });

  it('reads a function body as one piece: its semicolons and words are its own', () => {
    const sql = 'CREATE OR REPLACE FUNCTION public.brand_new() RETURNS int LANGUAGE plpgsql AS $fn$ BEGIN DROP TABLE x; REVOKE ALL ON y FROM z; RETURN 1; END $fn$;\nSELECT 1;';
    expect(statements(sql).map((s) => s.masked)).toEqual([
      'CREATE OR REPLACE FUNCTION PUBLIC.BRAND_NEW() RETURNS INT LANGUAGE PLPGSQL AS $BODY$',
      'SELECT 1',
    ]);
    expect(kindsOf(sql)).toEqual([]);
  });
});

describe('a break passes only with its reason right above it', () => {
  const drop = 'DROP POLICY IF EXISTS "own rows" ON public.profiles;';
  const faultOf = (sql: string) => reasonFault(breaksIn(sql, EXISTING)[0].reason);

  it('takes each of the four reasons, said fully', () => {
    expect(faultOf(`-- add-only (1): no shipped client uses it; checked TestFlight build 41 and the website\n${drop}`)).toBeNull();
    expect(faultOf(`-- add-only (2): an equal rewrite, the attack matrix the same before and after\n${drop}`)).toBeNull();
    expect(faultOf(`-- add-only (3): it only widens; replayed every call of\n-- the website and build 41\n${drop}`)).toBeNull();
    expect(faultOf(`-- add-only (4): the user accepted it on 2026-10-15: "moderation in the app only"\n${drop}`)).toBeNull();
  });

  it('says NO — to no reason, a reason too far above, and a reason missing its proof', () => {
    expect(faultOf(drop)).toBe('no reason');
    expect(faultOf(`-- add-only (3): it only widens; replayed every call of the website\n\n\n${drop}`)).toBe('no reason');
    expect(faultOf(`-- add-only (1): nobody uses this, I am fairly sure of it\n${drop}`)).toBe('reason (1) names no client checked');
    expect(faultOf(`-- add-only (2): it is the same as before, trust me on it\n${drop}`)).toBe('reason (2) names no attack-matrix proof');
    expect(faultOf(`-- add-only (4): the user said this is fine at some point\n${drop}`)).toBe('reason (4) quotes no dated decision');
    expect(faultOf(`-- add-only (3): fine\n${drop}`)).toBe('reason (3) says too little');
  });

  it('keeps each statement\'s own reason: one above the first does not cover the second', () => {
    const sql = `-- add-only (3): it only widens; replayed every website call\n${drop}\nREVOKE INSERT ON public.profiles FROM anon;`;
    expect(breaksIn(sql, EXISTING).map((b) => reasonFault(b.reason))).toEqual([null, 'no reason']);
  });
});

it('a changed existing edge function needs its reason in the push\'s commits, by name', () => {
  const said = 'fix(push): x\n\nAdd-only (3): notify-push: it only widens; replayed every call of build 41\n';
  expect(functionFaults(['notify-push'], said)).toEqual([]);
  expect(functionFaults(['notify-push', 'tmdb-proxy'], said)).toEqual([
    'supabase function tmdb-proxy: no "Add-only (N): <function>:" line in the push\'s commits',
  ]);
  expect(functionFaults(['notify-push'], 'Add-only (1): notify-push: nobody calls the old path at all')).toEqual([
    'supabase function notify-push: reason (1) names no client checked',
  ]);
});

const ROOT = join(__dirname, '..', '..', '..', '..');

it('runs on every push, from the push\'s own base', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/god_tier_ci.yml'), 'utf8');
  const job = ci.slice(ci.indexOf('\n  add-only:'), ci.indexOf('\n  native-unit-tests:'));
  expect(job).toContain('fetch-depth: 0');
  expect(job).toContain('node mobile/scripts/add-only.cjs "$BEFORE"');
  expect(job).toContain('github.event.before');
});

it('reads every migration in both trees, and finds breaks in them — it can say NO on real files', () => {
  const existing = existingIn(readFileSync(join(ROOT, 'mobile/supabase/schema/live-schema.sql'), 'utf8'));
  expect(existing.tables.size).toBeGreaterThan(30);
  expect(existing.functions.size).toBeGreaterThan(100);
  let read = 0;
  let found = 0;
  for (const dir of ['supabase/migrations', 'mobile/supabase/migrations']) {
    for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.sql'))) {
      const sql = readFileSync(join(ROOT, dir, f), 'utf8');
      // A file of comments alone (one says "NOT LIVE") has nothing to read.
      const hasCode = sql.split('\n').some((l) => l.trim() && !l.trim().startsWith('--'));
      expect([f, statements(sql).length > 0]).toEqual([f, hasCode]);
      found += breaksIn(sql, existing).length;
      read++;
    }
  }
  expect(read).toBeGreaterThan(150);
  expect(found).toBeGreaterThan(50);
});
