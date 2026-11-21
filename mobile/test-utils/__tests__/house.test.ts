/**
 * The house reader (test-utils/house.js) reads what production will hold: each later statement stands
 * over the one before it, and nothing inside a comment, a quoted string or a function body is read as
 * a statement. Checked on planted text, then on the house itself.
 */
import { read, mask, membersRun, triggersOn } from '../house';

const fn = (name: string, extra: string, body: string) =>
  `CREATE OR REPLACE FUNCTION ${name}(p uuid) RETURNS int\n    LANGUAGE sql${extra}\n    AS $$${body}$$;\n`;

describe('the house reader, on planted text', () => {
  it('reads the last definition of a function, and none a DROP took away', () => {
    const h = read(fn('public.a', '', ' SELECT 1 ') + fn('public.a', ' SECURITY DEFINER', ' SELECT 2 ')
      + fn('private.b', '', ' SELECT 3 ') + 'DROP FUNCTION IF EXISTS private.b(uuid);\n');
    expect([...h.functions.keys()]).toEqual(['public.a']);
    expect(h.functions.get('public.a')?.body).toBe(' SELECT 2 ');
    expect(h.functions.get('public.a')?.definer).toBe(true);
  });

  it('reads no statement written inside a body, a comment or a quoted string', () => {
    const h = read(`${fn('public.a', '', " CREATE POLICY x ON public.t USING (true); ")}-- CREATE TRIGGER y AFTER INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.a();\nCOMMENT ON TABLE public.t IS 'GRANT ALL ON TABLE public.t TO anon;';\n`);
    expect(h.policies.size).toBe(0);
    expect(h.triggers.size).toBe(0);
    expect(h.tables.size).toBe(0);
    expect(mask("a 'b' -- c\n$x$ d $x$").text).toBe(`a ' '     \n${' '.repeat(9)}`);
  });

  it('reads a trigger, replaced and dropped by name and table', () => {
    const t = 'CREATE TRIGGER g BEFORE INSERT OR UPDATE OF a ON public.t FOR EACH ROW EXECUTE FUNCTION public.f();\n';
    expect(triggersOn(read(t), 't').map((x) => [x.name, x.timing, x.events, x.fn])).toEqual([['g', 'BEFORE', ['INSERT', 'UPDATE'], 'public.f']]);
    expect(triggersOn(read(`${t}DROP TRIGGER IF EXISTS g ON public.t;\n`), 't')).toEqual([]);
    expect(triggersOn(read(`${t}CREATE OR REPLACE TRIGGER g AFTER DELETE ON public.t FOR EACH STATEMENT EXECUTE FUNCTION public.h();\n`), 't')
      .map((x) => [x.timing, x.events, x.level, x.fn])).toEqual([['AFTER', ['DELETE'], 'STATEMENT', 'public.h']]);
  });

  it('reads a row rule whole, altered and dropped', () => {
    const p = 'CREATE POLICY "own rows" ON public.t AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));\n';
    expect([...read(p).policies.values()].map((x) => [x.name, x.cmd, x.restrictive, x.roles, x.check]))
      .toEqual([['own rows', 'INSERT', true, ['authenticated'], '(user_id = ( SELECT auth.uid() AS uid))']]);
    expect(read(`${p}ALTER POLICY "own rows" ON public.t WITH CHECK (false);\n`).policies.get('own rows on public.t')?.check).toBe('false');
    expect(read(`${p}DROP POLICY IF EXISTS "own rows" ON public.t;\n`).policies.size).toBe(0);
  });

  it('reads who may run a function and write a table, grant by grant', () => {
    const h = read(`${fn('public.a', '', ' SELECT 1 ')}GRANT ALL ON FUNCTION public.a(p uuid) TO authenticated;\nGRANT SELECT, INSERT ON TABLE public.t TO anon, authenticated;\nREVOKE INSERT ON TABLE public.t FROM anon;\nGRANT SELECT(id) ON TABLE public.u TO anon;\n`);
    expect(membersRun(h, 'public.a')).toBe(true);
    expect(membersRun(read(fn('public.a', '', ' SELECT 1 ')), 'public.a')).toBe(false);
    expect([...(h.tables.get('public.t')?.get('anon') ?? [])]).toEqual(['SELECT']);
    expect([...(h.tables.get('public.t')?.get('authenticated') ?? [])]).toEqual(['SELECT', 'INSERT']);
    expect([...(h.tables.get('public.u')?.get('anon') ?? [])]).toEqual(['SELECT(id)']);
    expect(membersRun(read(`${fn('public.a', '', ' SELECT 1 ')}GRANT EXECUTE ON FUNCTION public.a(uuid) TO anon;\nREVOKE ALL ON FUNCTION public.a(uuid) FROM anon;\n`), 'public.a')).toBe(false);
  });
});

describe('the house as production will hold it', () => {
  const h = read();

  it('reads the snapshot and every pending migration: a pending car\'s trigger, rule, dropped rule and closed function among them', () => {
    expect(h.functions.size).toBeGreaterThan(150);
    expect(triggersOn(h, 'log_comments').some((t) => t.fn === 'public.check_critique_pace' && t.events.includes('INSERT'))).toBe(true);
    expect(h.policies.has('profiles_hide_from_the_blocked on public.profiles')).toBe(true);
    expect(h.policies.has('logs_insert_rate_limit on public.logs')).toBe(false);
    expect(membersRun(h, 'public.check_critique_pace')).toBe(false);
    expect(membersRun(h, 'public.get_lobby')).toBe(true);
  });
});
