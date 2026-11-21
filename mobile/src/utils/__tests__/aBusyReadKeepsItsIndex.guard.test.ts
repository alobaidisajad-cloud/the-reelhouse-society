/**
 * A busy read keeps its index: three shapes that read a whole table where an index would read a page.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each function as production will hold it (the snapshot, then every pending migration in name order,
 * the last definition of a name standing) is held to three rules the load lab (100,000 members)
 * found broken by round 14's cars:
 *   - a count from a reading moment never asks "never read, or since" of a joined row in one test:
 *     the index cannot start at the moment, and every row of the room is read (a salon's unread
 *     count, 291 ms for a member in 200 rooms);
 *   - no function asks the hiding rule through its public name, is_hidden_by: that name asks
 *     private.is_hidden_by in its turn, two calls a row (a salon's faces, 23 ms to 141 ms);
 *   - a function that finds members by the words of a handle or a name runs as the house: profiles
 *     holds a restrictive row rule, and for a caller ILIKE and lower() may not see a row before the
 *     rule has passed it, so they lose their indexes and every member is read (172 ms for a handle).
 * The rules are checked on planted text first, so each is seen to say no.
 */
import { SNAPSHOT_SQL, PENDING_SQL } from '@/test-utils/schema';

/** One function as written: its header (everything before its body) and its body. */
type Definition = { name: string; header: string; body: string };

/**
 * The functions a text leaves standing, by schema-qualified name, in its order: each CREATE replaces
 * the one before it of that name, and a DROP takes it away.
 */
function standing(sql: string): Map<string, Definition> {
  const out = new Map<string, Definition>();
  const head = /^(CREATE(?: OR REPLACE)? FUNCTION|DROP FUNCTION(?: IF EXISTS)?)\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = head.exec(sql))) {
    const name = `${m[2] ?? 'public'}.${m[3] ?? ''}`;
    if ((m[1] ?? '').startsWith('DROP')) { out.delete(name); continue; }
    const open = /\bAS\s+(\$[A-Za-z_]*\$)/g;
    open.lastIndex = m.index;
    const o = open.exec(sql);
    if (!o) continue;
    const start = o.index + o[0].length;
    const end = sql.indexOf(o[1] ?? '$$', start);
    if (end < 0) continue;
    out.set(name, { name, header: sql.slice(m.index, o.index), body: sql.slice(start, end) });
    head.lastIndex = end;
  }
  return out;
}

/** "Never read, or since", asked of a joined row's column in one test: (r.x IS NULL OR m.y > r.x). */
const EITHER_OR_SINCE = /\(\s*(\w+\.\w+)\s+IS\s+NULL\s+OR\s+\w+\.\w+\s*[<>]=?\s*\1\s*\)/i;
/** The hiding rule asked by its public name (bare, or public.), never private.is_hidden_by. */
const PUBLIC_RULE = /(?:^|[^.\w]|\bpublic\.)is_hidden_by\s*\(/;
/** Members found by the words of a handle or a name. */
const BY_WORDS = /\b(?:username|display_name)\)?\s+(?:NOT\s+)?(?:I?LIKE|~~\*?)\s|\blower\(\s*(?:\w+\.)?username\s*\)/i;
const DEFINER = /\bSECURITY\s+DEFINER\b/i;

const slowCounts = (fns: Map<string, Definition>) => [...fns.values()].filter((f) => EITHER_OR_SINCE.test(f.body)).map((f) => f.name);
const publicRuleAsked = (fns: Map<string, Definition>) => [...fns.values()]
  .filter((f) => f.name !== 'public.is_hidden_by' && PUBLIC_RULE.test(f.body)).map((f) => f.name);
const wordsAsTheCaller = (fns: Map<string, Definition>) => [...fns.values()]
  .filter((f) => BY_WORDS.test(f.body) && /\bprofiles\b/.test(f.body) && !DEFINER.test(f.header)).map((f) => f.name);

const fn = (name: string, header: string, body: string) =>
  `CREATE OR REPLACE FUNCTION ${name}(p uuid) RETURNS int\n    LANGUAGE sql STABLE${header}\n    AS $$${body}$$;\n`;

describe('the rules, on planted text', () => {
  it('read the last definition of each name, and none a DROP took away', () => {
    const fns = standing(fn('public.a', '', ' SELECT 1 ') + fn('public.a', ' SECURITY DEFINER', ' SELECT 2 ')
      + fn('private.b', '', ' SELECT 3 ') + 'DROP FUNCTION IF EXISTS private.b(uuid);\n');
    expect([...fns.keys()]).toEqual(['public.a']);
    expect(fns.get('public.a')?.body).toBe(' SELECT 2 ');
    expect(DEFINER.test(fns.get('public.a')?.header ?? '')).toBe(true);
  });

  it('say no to a count that asks "never read, or since" of a joined row in one test, and yes to two counts', () => {
    expect(slowCounts(standing(fn('public.unread', '',
      ' SELECT count(*) FROM rooms r JOIN msgs m ON m.room = r.id WHERE (r.last_read_at IS NULL OR m.created_at > r.last_read_at) ')))).toEqual(['public.unread']);
    expect(slowCounts(standing(fn('public.unread', '',
      ' SELECT CASE WHEN r.last_read_at IS NULL THEN (SELECT 1) ELSE (SELECT count(*) FROM msgs m WHERE m.created_at > r.last_read_at) END ')))).toEqual([]);
    // A cursor a caller passes is one value for the whole read, planned as it is: not this shape.
    expect(slowCounts(standing(fn('public.page', '', ' SELECT 1 WHERE (p_at IS NULL OR l.created_at < p_at) ')))).toEqual([]);
  });

  it('say no to the hiding rule asked by its public name, and yes to private.* and to its own body', () => {
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT public.is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual(['public.faces']);
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual(['public.faces']);
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT private.is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual([]);
    expect(publicRuleAsked(standing(fn('public.is_hidden_by', '', ' SELECT private.is_hidden_by(a, b) ')))).toEqual([]);
  });

  it('say no to members found by words as the caller, and yes as the house', () => {
    const search = " SELECT p.id FROM public.profiles p WHERE p.username ILIKE p_pattern ESCAPE '\\' ";
    expect(wordsAsTheCaller(standing(fn('public.search_members', '', search)))).toEqual(['public.search_members']);
    expect(wordsAsTheCaller(standing(fn('public.search_members', ' SECURITY DEFINER', search)))).toEqual([]);
    expect(wordsAsTheCaller(standing(fn('public.sign_in', '', ' SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(p_handle) ')))).toEqual(['public.sign_in']);
    expect(wordsAsTheCaller(standing(fn('public.search_members', '', " SELECT format('p.username ILIKE %L', p_pattern) FROM public.profiles p ")))).toEqual(['public.search_members']);
  });
});

describe('every function as production will hold it', () => {
  const house = `${SNAPSHOT_SQL()}\n${PENDING_SQL()}`;
  const fns = standing(house);

  it('reads the functions the house holds, the three reads the load lab timed among them', () => {
    expect(fns.size).toBeGreaterThan(150);
    for (const name of ['public.get_lounge_unread_counts', 'public.get_salon_member_faces', 'public.search_members']) expect(fns.has(name)).toBe(true);
  });

  it('counts from a reading moment by the index: no count asks "never read, or since" of a joined row in one test', () => {
    expect(slowCounts(fns)).toEqual([]);
  });

  it('asks the hiding rule where it lives: no function asks it by its public name, two calls a row', () => {
    expect(publicRuleAsked(fns)).toEqual([]);
  });

  it('finds members by the words of a handle or a name only as the house, past the profiles rule that would take their indexes', () => {
    expect(house).toMatch(/CREATE POLICY profiles_hide_from_the_blocked ON public\.profiles AS RESTRICTIVE/);
    expect(wordsAsTheCaller(fns)).toEqual([]);
  });
});
