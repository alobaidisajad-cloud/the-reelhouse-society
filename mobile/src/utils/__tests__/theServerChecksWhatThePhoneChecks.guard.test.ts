/**
 * theServerChecksWhatThePhoneChecks.guard.test.ts — the house refuses what the phone never offers.
 * ─────────────────────────────────────────────────────────────────────────────
 * A gate drawn only on the phone is no gate: a script signed in as any member writes past it. Each rule
 * here is one the phone keeps, asked of the house as production will hold it (test-utils/house.js: the
 * snapshot, then every pending car), and each is shown to catch the house that lacked it (its rules as
 * they stood before 20261126_10 and _11, planted):
 *   1. A member out of standing (banned or suspended) writes nothing the house keeps for them: every
 *      table a member writes as themselves takes the standing rule on insert, a restrictive policy
 *      asking is_user_not_banned() or the enforce_not_restricted trigger, but those named below with why.
 *   2. A seeking's answer is one of its own critiques, and a vote one of its ballot's options: the phone
 *      offers no other, and the house reads each by its key before it is written.
 *   3. A request the house sends out names no address of its own: every call through pg_net reads where
 *      to call from production's Vault, so no copy of the house can call production (a name under
 *      .invalid, which no host answers, is where a copy's request goes).
 */
import { read, type House } from '@/test-utils/house';

/** Tables a member writes as themselves that keep no standing rule, each with why. */
const NO_STANDING: Record<string, string> = {
  'public.analytics_events': 'the app\'s own measures of itself, not a member\'s act',
  'public.error_logs': 'the app\'s own failure reports, not a member\'s act',
  'public.log_private_notes': 'the Vault: words read by their writer alone, kept as their own record',
  'public.member_drafts': 'a member\'s own unsent draft, read by them alone',
  'public.push_subscriptions': 'where the house reaches the member, not a word written to anyone',
  'public.user_blocks': 'a safety act every member keeps, whatever their standing (as a report is)',
  'public.mod_actions': 'the Tribunal\'s own record, written by an admin',
  'public.warnings': 'the Tribunal\'s own record, written by an admin',
};

const MEMBERS = ['authenticated', 'anon', 'PUBLIC', 'public'];

/** Every table a member may insert into as themselves, and whether the house asks their standing there. */
function standing(house: House): { table: string; asked: boolean }[] {
  const byTable = new Map<string, { permissive: boolean; banned: boolean }>();
  for (const p of house.policies.values()) {
    if (!['INSERT', 'ALL'].includes(p.cmd) || !p.roles.some((r: string) => MEMBERS.includes(r))) continue;
    const t = byTable.get(p.table) ?? { permissive: false, banned: false };
    if (!p.restrictive && p.check && !/^\s*false\s*$/i.test(p.check)) t.permissive = true;
    if (p.restrictive && /\bis_user_not_banned\s*\(\s*\)/.test(p.check ?? '')) t.banned = true;
    byTable.set(p.table, t);
  }
  const restricted = new Set([...house.triggers.values()]
    .filter((t) => t.timing === 'BEFORE' && t.events.includes('INSERT') && t.fn === 'public.enforce_not_restricted')
    .map((t) => t.table));
  return [...byTable].filter(([, t]) => t.permissive)
    .map(([table, t]) => ({ table, asked: t.banned || restricted.has(table) }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/** The body of the function a BEFORE trigger on a table runs for an event, each one's text joined. */
const beforeBodies = (house: House, table: string, event: string) => [...house.triggers.values()]
  .filter((t) => t.table === table && t.timing === 'BEFORE' && t.events.includes(event))
  .map((t) => house.functions.get(t.fn)?.body ?? '').join('\n');

/** The phone's rules over a seeking's answer and a ballot's vote, as the house holds them. */
function marks(house: House): string[] {
  const missed: string[] = [];
  const answer = beforeBodies(house, 'public.dispatch_posts', 'UPDATE');
  if (!/dispatch_comments[\s\S]{0,200}post_id\s*=\s*(OLD|NEW)\.id/i.test(answer) || !/'seeking'/.test(answer)) {
    missed.push('a seeking\'s answer is one of its own critiques');
  }
  const vote = beforeBodies(house, 'public.dispatch_votes', 'INSERT');
  if (!/option_index\s*<\s*jsonb_array_length\s*\(\s*\w+\.options\s*\)/i.test(vote) || !/kind\s*=\s*'ballot'/.test(vote)) {
    missed.push('a vote is one of its ballot\'s options');
  }
  return missed;
}

/** Each function that calls out through pg_net with an address written into it. */
const addressed = (house: House) => [...house.functions.values()]
  .filter((f) => /\bnet\.http_(post|get|delete)\s*\(/.test(f.body) && [...f.body.matchAll(/https?:\/\/(?<host>[A-Za-z0-9.-]+\.[a-z]{2,})/g)].some((m) => !(m.groups?.host ?? '').endsWith('.invalid')))
  .map((f) => f.name).sort();

const now = read();
// The house as it stood before 20261126_10 and _11, as each rule met it: the rules a member's keep, a
// seeking's answer, a ballot's vote and the push trigger had, and nothing more.
const before = read(`
CREATE POLICY saves_own ON public.dispatch_saves TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY watchlists_own ON public.watchlists FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY ban_block_watchlists_insert ON public.watchlists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_user_not_banned());
CREATE FUNCTION public.dispatch_posts_pin_columns() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.kind := OLD.kind; RETURN NEW; END $$;
CREATE TRIGGER pin_columns BEFORE UPDATE ON public.dispatch_posts FOR EACH ROW EXECUTE FUNCTION public.dispatch_posts_pin_columns();
CREATE FUNCTION public.check_write_pace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER zz_a_write_is_paced BEFORE INSERT ON public.dispatch_votes FOR EACH ROW EXECUTE FUNCTION public.check_write_pace();
CREATE FUNCTION public.tg_notify_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(url := 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/notify-push', body := to_jsonb(NEW));
  RETURN NEW;
END $$;
`);


describe('a member out of standing writes nothing the house keeps for them', () => {
  it('every table a member writes as themselves asks their standing, but those named with why', () => {
    const unasked = standing(now).filter((t) => !t.asked && !(t.table in NO_STANDING)).map((t) => t.table);
    expect(unasked).toEqual([]);
  });

  it('each table named with why is still one a member writes, and still asks no standing', () => {
    const written = new Map(standing(now).map((t) => [t.table, t.asked]));
    expect(Object.keys(NO_STANDING).filter((t) => written.get(t) !== false)).toEqual([]);
  });

  it('finds the house that let a member out of standing keep a filing (as it stood before 20261126_10)', () => {
    expect(standing(before).filter((t) => !t.asked && !(t.table in NO_STANDING)).map((t) => t.table))
      .toEqual(['public.dispatch_saves']);
  });
});

describe('a filing\'s marks are its own', () => {
  it('the house holds a seeking\'s answer to its critiques and a vote to its ballot\'s options', () => {
    expect(marks(now)).toEqual([]);
  });

  it('finds the house that held neither (as it stood before 20261126_10)', () => {
    expect(marks(before)).toEqual(['a seeking\'s answer is one of its own critiques', 'a vote is one of its ballot\'s options']);
  });
});

describe('a copy of the house calls no one', () => {
  it('no request the house sends out names an address of its own', () => {
    expect(addressed(now)).toEqual([]);
  });

  it('finds the push trigger that named production (as it stood before 20261126_11)', () => {
    expect(addressed(before)).toEqual(['public.tg_notify_push']);
  });
});
