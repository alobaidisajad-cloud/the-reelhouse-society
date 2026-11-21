/**
 * A busy read keeps its index, and asks each rule once: shapes that read a whole table where an index
 * would read a page, or ask a rule once a row where once a read would do.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each function as production will hold it (the snapshot, then every pending migration in name order,
 * the last definition of a name standing), and each row rule a pending migration writes, is held to the
 * rules the load lab (100,000 members) found broken by round 14's cars:
 *   - a count from a reading moment never asks "never read, or since" of a joined row in one test:
 *     the index cannot start at the moment, and every row of the room is read (a salon's unread
 *     count, 291 ms for a member in 200 rooms);
 *   - no function asks a rule by its public name (hidden_authors, is_hidden_by, can_view_user_data):
 *     each asks private.* in its turn, two calls where one is the rule (a salon's faces, 23 ms to
 *     141 ms; the following feed of a member who follows 2,000);
 *   - hidden_authors() is asked as an InitPlan, (SELECT private.hidden_authors()): written plain in a
 *     CTE or a subquery the planner folds into the read, it is asked again for every row (a salon's
 *     last words, a member's counts);
 *   - a function that finds members by the words of a handle or a name runs as the house: profiles
 *     holds a restrictive row rule, and for a caller ILIKE and lower() may not see a row before the
 *     rule has passed it, so they lose their indexes and every member is read (172 ms for a handle);
 *   - a function run as the caller compares a row with the caller as (SELECT auth.uid()): auth.uid()
 *     itself is too dear for the planner to ask before the row rules, so the rules are asked of every
 *     row the read meets, everyone's marks of a log for the one the caller made (the house feed);
 *   - a row rule a pending migration writes asks another table by its key, never EXISTS (the planner
 *     may hash the whole table under its own rules: 40,000 filings for a page of 30 critiques); asks
 *     each test of each column once on any path; and asks no test of a key the row does not hold;
 *   - a member's counts read their records once.
 * The rules are checked on planted text first, so each is seen to say no.
 */
import { SNAPSHOT_SQL, PENDING_SQL, closingOf } from '@/test-utils/schema';

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

/** Each row rule a text writes (CREATE POLICY or ALTER POLICY), as "name on table": its USING clause. */
function rules(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of sql.matchAll(/^(?:CREATE|ALTER) POLICY\s+("[^"]+"|\w+)\s+ON\s+(\S+)[\s\S]*?;\s*$/gm)) {
    const text = m[0];
    const at = text.search(/\bUSING\s*\(/);
    if (at < 0) continue;
    const open = text.indexOf('(', at);
    out.set(`${m[1]} on ${m[2]}`, text.slice(open, closingOf(text, open) + 1));
  }
  return out;
}

/** "Never read, or since", asked of a joined row's column in one test: (r.x IS NULL OR m.y > r.x). */
const EITHER_OR_SINCE = /\(\s*(\w+\.\w+)\s+IS\s+NULL\s+OR\s+\w+\.\w+\s*[<>]=?\s*\1\s*\)/i;
/** A rule asked by its public name (bare, or public.), never private.*. */
const PUBLIC_RULE = /(?:^|[^.\w]|\bpublic\.)(hidden_authors|is_hidden_by|can_view_user_data)\s*\(/;
/** Each call of hidden_authors(), its schema with it. */
const HIDDEN_CALL = /(?<![\w.])(?:\w+\.)?hidden_authors\s*\(\s*\)/gi;
/** Whether some call of hidden_authors() is not the one query of a scalar subquery: (SELECT x.hidden_authors()). */
const hiddenPlain = (body: string) => [...body.matchAll(HIDDEN_CALL)].some((c) => !/\(\s*SELECT\s+$/i.test(body.slice(0, c.index))
  || !/^\s*\)/.test(body.slice((c.index ?? 0) + c[0].length)));
/** Members found by the words of a handle or a name. */
const BY_WORDS = /\b(?:username|display_name)\)?\s+(?:NOT\s+)?(?:I?LIKE|~~\*?)\s|\blower\(\s*(?:\w+\.)?username\s*\)/i;
/** A row compared with the caller by auth.uid() itself. */
const CALLER_PLAIN = /\b\w+\.\w+\s*=\s*auth\.uid\(\)|(?<!\(\s*SELECT\s+)auth\.uid\(\)\s*=\s*\w+\.\w+/i;
const DEFINER = /\bSECURITY\s+DEFINER\b/i;
/** A test of one key a mark may not hold (a mark names a log, a stack or a member, seldom more), of it alone. */
const NULLABLE_KEY = /\bprivate\.\w+\((?:'[^']*'(?:::\w+)?\s*,\s*)?(target_\w+)\)/g;

const each = (fns: Map<string, Definition>, bad: (f: Definition) => boolean) => [...fns.values()].filter(bad).map((f) => f.name);
const slowCounts = (fns: Map<string, Definition>) => each(fns, (f) => EITHER_OR_SINCE.test(f.body));
const WRAPPERS = new Set(['public.hidden_authors', 'public.is_hidden_by', 'public.can_view_user_data']);
const publicRuleAsked = (fns: Map<string, Definition>) => each(fns, (f) => !WRAPPERS.has(f.name) && PUBLIC_RULE.test(f.body));
const hiddenAskedPlain = (fns: Map<string, Definition>) => each(fns, (f) => !WRAPPERS.has(f.name) && hiddenPlain(f.body));
const wordsAsTheCaller = (fns: Map<string, Definition>) => each(fns, (f) => BY_WORDS.test(f.body) && /\bprofiles\b/.test(f.body) && !DEFINER.test(f.header));
const callerAskedPlain = (fns: Map<string, Definition>) => each(fns, (f) => !DEFINER.test(f.header) && CALLER_PLAIN.test(f.body));
const tablesAskedWhole = (rs: Map<string, string>) => [...rs].filter(([, using]) => /\bEXISTS\s*\(/i.test(using)).map(([n]) => n);
const keysAskedUnheld = (rs: Map<string, string>) => [...rs].filter(([, using]) => [...using.matchAll(NULLABLE_KEY)]
  .some((c) => !using.slice(0, c.index).endsWith(`(${c[1]} IS NOT NULL) AND `))).map(([n]) => n);

/**
 * Whether a rule asks one test of one column twice on any one path: two calls of the same text count
 * once when they stand in different branches (THEN, ELSE) of one CASE, as only one of them runs.
 */
function askedTwice(using: string): boolean {
  type Arm = { kase: number; arm: number };
  const calls: { text: string; path: Arm[] }[] = [];
  const stack: Arm[] = [];
  let next = 0;
  const token = /\b(CASE|WHEN|THEN|ELSE|END)\b|\bprivate\.\w+\([^()]*\b[a-z_]+\b[^()]*\)/gi;
  for (const t of using.matchAll(token)) {
    const word = (t[1] ?? '').toUpperCase();
    if (word === 'CASE') stack.push({ kase: next++, arm: -1 });
    else if (word === 'WHEN') { const top = stack[stack.length - 1]; if (top) top.arm = -1; }
    else if ((word === 'THEN' || word === 'ELSE')) { const top = stack[stack.length - 1]; if (top) top.arm = next++; }
    else if (word === 'END') stack.pop();
    else calls.push({ text: t[0].replace(/\s+/g, ''), path: stack.map((a) => ({ ...a })) });
  }
  const apart = (a: Arm[], b: Arm[]) => a.some((x) => b.some((y) => y.kase === x.kase && x.arm >= 0 && y.arm >= 0 && x.arm !== y.arm));
  return calls.some((a, i) => calls.some((b, j) => j > i && a.text === b.text && !apart(a.path, b.path)));
}
const rulesAskingTwice = (rs: Map<string, string>) => [...rs].filter(([, using]) => askedTwice(using)).map(([n]) => n);

/** How many times a function reads a table (FROM or JOIN it). */
const reads = (body: string, table: string) => body.match(new RegExp(`\\b(?:FROM|JOIN)\\s+(?:public\\.)?${table}\\b`, 'gi'))?.length ?? 0;

const fn = (name: string, header: string, body: string) =>
  `CREATE OR REPLACE FUNCTION ${name}(p uuid) RETURNS int\n    LANGUAGE sql STABLE${header}\n    AS $$${body}$$;\n`;
const policy = (using: string) => `ALTER POLICY r ON public.t\n  USING (${using});\n`;

describe('the rules, on planted text', () => {
  it('read the last definition of each name, and none a DROP took away', () => {
    const fns = standing(fn('public.a', '', ' SELECT 1 ') + fn('public.a', ' SECURITY DEFINER', ' SELECT 2 ')
      + fn('private.b', '', ' SELECT 3 ') + 'DROP FUNCTION IF EXISTS private.b(uuid);\n');
    expect([...fns.keys()]).toEqual(['public.a']);
    expect(fns.get('public.a')?.body).toBe(' SELECT 2 ');
    expect(DEFINER.test(fns.get('public.a')?.header ?? '')).toBe(true);
  });

  it('read each rule a text writes, its USING clause whole', () => {
    expect([...rules(`${policy('(a = 1) AND (b(c) OR d)')}CREATE POLICY "x y" ON public.u AS RESTRICTIVE FOR SELECT TO authenticated\n  USING ((e IS NULL));\n`)])
      .toEqual([['r on public.t', '((a = 1) AND (b(c) OR d))'], ['"x y" on public.u', '((e IS NULL))']]);
  });

  it('say no to a count that asks "never read, or since" of a joined row in one test, and yes to two counts', () => {
    expect(slowCounts(standing(fn('public.unread', '',
      ' SELECT count(*) FROM rooms r JOIN msgs m ON m.room = r.id WHERE (r.last_read_at IS NULL OR m.created_at > r.last_read_at) ')))).toEqual(['public.unread']);
    expect(slowCounts(standing(fn('public.unread', '',
      ' SELECT CASE WHEN r.last_read_at IS NULL THEN (SELECT 1) ELSE (SELECT count(*) FROM msgs m WHERE m.created_at > r.last_read_at) END ')))).toEqual([]);
    // A cursor a caller passes is one value for the whole read, planned as it is: not this shape.
    expect(slowCounts(standing(fn('public.page', '', ' SELECT 1 WHERE (p_at IS NULL OR l.created_at < p_at) ')))).toEqual([]);
  });

  it('say no to a rule asked by its public name, and yes to private.* and to the public names\' own bodies', () => {
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT public.is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual(['public.faces']);
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual(['public.faces']);
    expect(publicRuleAsked(standing(fn('public.feed', '', ' SELECT 1 WHERE public.can_view_user_data(i.target_user_id) ')))).toEqual(['public.feed']);
    expect(publicRuleAsked(standing(fn('public.feed', '', ' SELECT 1 WHERE l.user_id = ANY ((SELECT hidden_authors())::uuid[]) ')))).toEqual(['public.feed']);
    expect(publicRuleAsked(standing(fn('public.faces', '', ' SELECT 1 WHERE NOT private.is_hidden_by(auth.uid(), lm.user_id) ')))).toEqual([]);
    expect(publicRuleAsked(standing(fn('public.is_hidden_by', '', ' SELECT private.is_hidden_by(a, b) ')))).toEqual([]);
  });

  it('say no to hidden_authors() asked plain, which a folded CTE asks once a row, and yes to it as an InitPlan', () => {
    expect(hiddenAskedPlain(standing(fn('public.words', '', ' WITH me AS (SELECT auth.uid() AS id, private.hidden_authors() AS hidden) SELECT 1 ')))).toEqual(['public.words']);
    expect(hiddenAskedPlain(standing(fn('public.counts', '', ' SELECT 1 FROM (SELECT public.hidden_authors() AS hidden) me ')))).toEqual(['public.counts']);
    expect(hiddenAskedPlain(standing(fn('public.words', '', ' WITH me AS (SELECT (SELECT private.hidden_authors()) AS hidden) SELECT 1 ')))).toEqual([]);
    expect(hiddenAskedPlain(standing(fn('public.feed', '', ' SELECT 1 WHERE x = ANY (( SELECT private.hidden_authors())::uuid[]) ')))).toEqual([]);
  });

  it('say no to members found by words as the caller, and yes as the house', () => {
    const search = " SELECT p.id FROM public.profiles p WHERE p.username ILIKE p_pattern ESCAPE '\\' ";
    expect(wordsAsTheCaller(standing(fn('public.search_members', '', search)))).toEqual(['public.search_members']);
    expect(wordsAsTheCaller(standing(fn('public.search_members', ' SECURITY DEFINER', search)))).toEqual([]);
    expect(wordsAsTheCaller(standing(fn('public.sign_in', '', ' SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(p_handle) ')))).toEqual(['public.sign_in']);
    expect(wordsAsTheCaller(standing(fn('public.search_members', '', " SELECT format('p.username ILIKE %L', p_pattern) FROM public.profiles p ")))).toEqual(['public.search_members']);
  });

  it('say no to a row compared with auth.uid() itself as the caller, and yes to (SELECT auth.uid()) and to the house', () => {
    const certified = " SELECT EXISTS (SELECT 1 FROM interactions im WHERE im.target_log_id = l.id AND im.user_id = auth.uid()) ";
    expect(callerAskedPlain(standing(fn('public.feed', '', certified)))).toEqual(['public.feed']);
    expect(callerAskedPlain(standing(fn('public.feed', '', ' SELECT 1 FROM profiles p WHERE auth.uid() = p.id ')))).toEqual(['public.feed']);
    expect(callerAskedPlain(standing(fn('public.feed', '', certified.split('auth.uid()').join('(SELECT auth.uid())'))))).toEqual([]);
    expect(callerAskedPlain(standing(fn('public.feed', ' SECURITY DEFINER', certified)))).toEqual([]);
  });

  it('say no to a rule asking EXISTS of another table, and yes to a scalar subquery by its key', () => {
    expect(tablesAskedWhole(rules(policy('(post_id IS NULL) OR (EXISTS ( SELECT 1 FROM public.posts p WHERE (p.id = c.post_id)))')))).toEqual(['r on public.t']);
    expect(tablesAskedWhole(rules(policy('(post_id IS NULL) OR COALESCE(( SELECT true FROM public.posts p WHERE (p.id = c.post_id)), false)')))).toEqual([]);
  });

  it('say no to a rule asking one test of one column twice on a path, and yes to a test in each branch of a CASE', () => {
    expect(rulesAskingTwice(rules(policy('(private.v(user_id) AND private.v(target_user_id)) OR ((private.v(user_id) OR private.v(target_user_id)) AND private.n(user_id, target_user_id))'))))
      .toEqual(['r on public.t']);
    expect(rulesAskingTwice(rules(policy('CASE WHEN private.v(user_id) THEN (private.v(target_user_id) OR private.n(user_id, target_user_id)) ELSE (private.v(target_user_id) AND private.n(user_id, target_user_id)) END'))))
      .toEqual([]);
    expect(rulesAskingTwice(rules(policy('CASE WHEN private.v(user_id) THEN private.v(user_id) ELSE false END')))).toEqual(['r on public.t']);
  });

  it('say no to a rule asking a test of a key the row may not hold, and yes when it asks first that the key is there', () => {
    expect(keysAskedUnheld(rules(policy("(NOT private.h('log'::text, target_log_id))")))).toEqual(['r on public.t']);
    expect(keysAskedUnheld(rules(policy("(NOT ((target_log_id IS NOT NULL) AND private.h('log'::text, target_log_id)))")))).toEqual([]);
  });

  it('count the reads of a table, FROM and JOIN alike', () => {
    expect(reads(' SELECT (SELECT count(*) FROM logs WHERE a), (SELECT count(*) FROM public.logs l JOIN logs x ON true) ', 'logs')).toBe(3);
  });
});

describe('every function as production will hold it, and every rule the pending cars write', () => {
  const house = `${SNAPSHOT_SQL()}\n${PENDING_SQL()}`;
  const fns = standing(house);
  const pendingRules = rules(PENDING_SQL());

  it('reads the functions the house holds, the reads the load lab timed among them', () => {
    expect(fns.size).toBeGreaterThan(150);
    for (const name of ['public.get_lounge_unread_counts', 'public.get_salon_member_faces', 'public.search_members',
      'public.get_salon_last_words', 'public.get_profile_counts', 'public.get_following_feed_auth_cursor', 'public.get_community_feed_auth_cursor']) {
      expect(fns.has(name)).toBe(true);
    }
  });

  it('counts from a reading moment by the index: no count asks "never read, or since" of a joined row in one test', () => {
    expect(slowCounts(fns)).toEqual([]);
  });

  it('asks each rule where it lives: no function asks hidden_authors, is_hidden_by or can_view_user_data by its public name, two calls where one is the rule', () => {
    expect(publicRuleAsked(fns)).toEqual([]);
  });

  it('asks hidden_authors() once a read, as an InitPlan, never plain where the planner folds it into every row', () => {
    expect(hiddenAskedPlain(fns)).toEqual([]);
  });

  it('finds members by the words of a handle or a name only as the house, past the profiles rule that would take their indexes', () => {
    expect(house).toMatch(/CREATE POLICY profiles_hide_from_the_blocked ON public\.profiles AS RESTRICTIVE/);
    expect(wordsAsTheCaller(fns)).toEqual([]);
  });

  it('compares a row with the caller as (SELECT auth.uid()) in every function run as the caller, so the row rules meet only the caller\'s rows', () => {
    expect(callerAskedPlain(fns)).toEqual([]);
  });

  it('writes no rule that asks EXISTS of another table: each asks by its key', () => {
    expect(pendingRules.size + Number(PENDING_SQL() === '')).toBeGreaterThan(0);
    expect(tablesAskedWhole(pendingRules)).toEqual([]);
  });

  it('writes no rule that asks one test of one column twice on a path', () => {
    expect(rulesAskingTwice(pendingRules)).toEqual([]);
  });

  it('writes no rule that asks a test of a key the row may not hold', () => {
    expect(keysAskedUnheld(pendingRules)).toEqual([]);
  });

  it('reads a member\'s records once for their counts', () => {
    expect(reads(fns.get('public.get_profile_counts')?.body ?? '', 'logs')).toBe(1);
  });
});
