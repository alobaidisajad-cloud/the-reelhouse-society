/**
 * A write a member can repeat at will has its pace (the kinds pass, kind 9: volume and caller-written
 * identity trusted).
 * ─────────────────────────────────────────────────────────────────────────────
 * The attack matrix asks who may write, never how often, nor whether a value the caller writes is
 * believed. So each review found one more unpaced write (handle sign-in guesses, critiques, salon
 * messages, events, the rank funnel). Here the whole house, as production will hold it
 * (test-utils/house.js), is asked once:
 *   - every table a member may insert into is paced by a trigger or a restrictive rule that refuses
 *     a write past its pace, or is judged below with why no script can repeat it without end;
 *   - every such pace is exercised by a rehearsal, so it is seen to refuse;
 *   - every function a member may run that writes (in any schema, through any function it calls, or
 *     a request sent out through pg_net), writes only where a pace stands, paces itself, or is judged;
 *   - every trigger that adds rows when a member changes or takes away a row they may write (or writes
 *     a relation no pace of its own counts, a view among them) is judged;
 *   - every deployed edge function answers a pace of its own (a 429 it sends back), or is a door only
 *     the house or the store opens, judged;
 *   - no edge function, in either tree, reads an address the caller writes (X-Forwarded-For and its
 *     like) but through the vouched-address helper;
 *   - every column of a member-written row that names a member is the writer themselves (bound to
 *     auth.uid() in the insert's rule), set by the house's own trigger, a reach the matrix judges, or
 *     judged below: a row never speaks for another member on the caller's word;
 *   - every function a member may run that reads blocks is judged to answer only of the caller's own.
 * Each rule is checked on planted text first, so it is seen to say no.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { read, houseText, membersRun, triggersOn, type House } from '@/test-utils/house';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/readCode';

const MEMBER = ['authenticated', 'anon', 'PUBLIC'];
/** A body that refuses a write past a pace: the house's pace code, its ceilings, its counting helper. */
const PACES = /\bRH429\b|'RATE_LIMITED'|rate_limit_check|Rate limit exceeded|Too many requests/i;
/** A rule only the house's staff passes. */
const STAFF_ONLY = /\bis_admin\s*\(|\bis_moderator\s*\(|role\s*=\s*'admin'|has_role\s*\(/i;

/** Tables a member (or a visitor) may insert into: the grant, and a permissive rule that lets some row in. */
export function insertable(h: House): string[] {
  return [...h.tables].filter(([t, byRole]) => MEMBER.some((r) => byRole.get(r)?.has('INSERT'))
    && [...h.policies.values()].some((p) => p.table === t && ['INSERT', 'ALL'].includes(p.cmd) && !p.restrictive
      && p.roles.some((r) => MEMBER.includes(r)) && !/^\s*false\s*$/i.test(p.check ?? p.using ?? 'false')
      && !STAFF_ONLY.test(p.check ?? p.using ?? '')))
    .map(([t]) => t).sort();
}

/** What paces a table's inserts: an insert trigger whose function refuses past a pace, or a restrictive rule that counts. */
export function pacedBy(h: House, table: string): string[] {
  const triggers = triggersOn(h, table).filter((t) => t.events.includes('INSERT') && PACES.test(h.functions.get(t.fn)?.body ?? '')).map((t) => t.name);
  const rules = [...h.policies.values()].filter((p) => p.table === table && p.restrictive && ['INSERT', 'ALL'].includes(p.cmd) && PACES.test(p.check ?? '')).map((p) => p.name);
  return [...triggers, ...rules];
}

/** pg_net's queue: a request the house sends out (net.http_post) is a row there until it is sent. */
export const NET_QUEUE = 'net.http_request_queue';

/**
 * The tables a function's own body adds rows to (INSERT), in any schema but its temporary one, and
 * pg_net's queue for a request it sends: what grows when a script calls it in a loop. Changing or
 * taking away rows already there grows nothing.
 */
export function insertsOf(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\bINSERT\s+INTO\s+(?:"?(?<schema>\w+)"?\.)?"?(?<table>\w+)"?(?:\s+AS\s+\w+)?\s*(?:\(|VALUES\b|SELECT\b|DEFAULT\b)/gi)) {
    const schema = m.groups?.schema ?? 'public';
    if (schema !== 'pg_temp') out.add(`${schema}.${m.groups?.table ?? ''}`);
  }
  if (/\bnet\s*\.\s*http_(?:post|get|delete)\s*\(/i.test(body)) out.add(NET_QUEUE);
  return [...out].sort();
}

/** The house's functions a body calls, by schema and name (a bare name is public's, as search_path reads it). */
export function callsOf(h: House, body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\b(?:(?<schema>\w+)\s*\.\s*)?(?<name>\w+)\s*\(/g)) {
    const name = `${m.groups?.schema ?? 'public'}.${m.groups?.name ?? ''}`;
    if (h.functions.has(name)) out.add(name);
  }
  return [...out].sort();
}

/** What a function adds rows to, its own body's and every function's of the house it calls, however deep. */
export function reachOf(h: House, name: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const body = h.functions.get(name)?.body ?? '';
  return [...new Set([...insertsOf(body), ...callsOf(h, body).flatMap((c) => reachOf(h, c, seen))])].sort();
}

/** Every table a pace stands on, and those `bounded` names (their rows another paced table bounds). */
const pacedTables = (h: House, bounded: readonly string[]): Set<string> =>
  new Set([...h.tables.keys(), ...[...h.triggers.values()].map((t) => t.table)].filter((t) => pacedBy(h, t).length || bounded.includes(t)));

/**
 * Member-run functions (no trigger's) that add rows where no pace stands, through their own body or
 * any function they call, pace none themselves, and are not the staff's alone; `bounded` names tables
 * whose rows another paced table bounds.
 */
export function unpacedWriters(h: House, bounded: readonly string[] = []): string[] {
  const paced = pacedTables(h, bounded);
  return [...h.functions.values()].filter((f) => f.name.startsWith('public.') && !f.returnsTrigger && membersRun(h, f.name)
    && !PACES.test(f.body) && !STAFF_ONLY.test(f.body) && reachOf(h, f.name).some((t) => !paced.has(t))).map((f) => f.name).sort();
}

/** The relations row level security guards, read from the house's text: on any other, a grant alone lets a member write. */
export const guarded = (text: string): Set<string> =>
  new Set([...text.matchAll(/ALTER TABLE (?:ONLY )?(?<table>public\.\w+) ENABLE ROW LEVEL SECURITY/g)].map((m) => m.groups?.table ?? ''));

/** Whether a member may do `event` (INSERT, UPDATE or DELETE) to a relation: the grant, and where rules guard it, a rule letting some row through. */
export function mayWrite(h: House, rls: Set<string>, relation: string, event: string): boolean {
  const granted = MEMBER.some((r) => [...(h.tables.get(relation)?.get(r) ?? [])].some((p) => p === event || p.startsWith(`${event}(`)));
  if (!granted || !rls.has(relation)) return granted;
  return [...h.policies.values()].some((p) => p.table === relation && [event, 'ALL'].includes(p.cmd) && !p.restrictive
    && p.roles.some((r) => MEMBER.includes(r)) && !/^\s*false\s*$/i.test(p.check ?? p.using ?? 'false') && !STAFF_ONLY.test(`${p.using ?? ''} ${p.check ?? ''}`));
}

/**
 * The triggers that add rows where no pace stands when a member writes a relation they may write, as
 * `table:trigger`: a change, a removal, or an insert into a relation with no pace of its own (a paced
 * insert's pace bounds what its triggers add).
 */
export function unpacedTriggers(h: House, rls: Set<string>, bounded: readonly string[] = []): string[] {
  const paced = pacedTables(h, bounded);
  const out = new Set<string>();
  for (const t of h.triggers.values()) {
    const events = t.events.filter((e) => ['INSERT', 'UPDATE', 'DELETE'].includes(e) && !(e === 'INSERT' && paced.has(t.table)) && mayWrite(h, rls, t.table, e));
    if (events.length && reachOf(h, t.fn).some((x) => !paced.has(x))) out.add(`${t.table}:${t.name}`);
  }
  return [...out].sort();
}

/** Whether an edge function's code answers a pace of its own: a 429 it sends back, never one it was given. */
export const answersAPace = (code: string): boolean => /\bstatus:\s*429\b|,\s*429\s*[,)]/.test(code);

/** An edge function's code: its entry and every file of its own or the shared folder it imports, however deep. */
export function functionCode(entry: string): string {
  const seen = new Set<string>();
  const read = (file: string): string => {
    if (seen.has(file)) return '';
    seen.add(file);
    const text = stripComments(readFileSync(file, 'utf8'), file);
    const near = [...text.matchAll(/\bfrom\s+['"](?<path>\.{1,2}\/[^'"]+)['"]/g)].map((m) => join(file, '..', m.groups?.path ?? ''));
    return [text, ...near.map(read)].join('\n');
  };
  return read(entry);
}

/** Each column of a member-insertable table that names a member: from its foreign keys, and any *username* or author* column. */
export function memberColumns(sql: string): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  const add = (t: string, c: string) => out.set(`public.${t}`, new Set([...(out.get(`public.${t}`) ?? []), c]));
  for (const m of sql.matchAll(/ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT \w+ FOREIGN KEY \((\w+)\) REFERENCES (?:public\.profiles|auth\.users)\(id\)/g)) add(m[1]!, m[2]!);
  for (const m of sql.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    for (const c of m[2]!.matchAll(/^\s+(\w+) uuid[^,\n]*REFERENCES (?:public\.profiles|auth\.users)\(id\)/gm)) add(m[1]!, c[1]!);
    for (const c of m[2]!.matchAll(/^\s+(\w*(?:username|author)\w*) /gm)) add(m[1]!, c[1]!);
  }
  return new Map([...out].map(([t, s]) => [t, [...s].sort()]));
}

/** Whether a column is the writer themselves in an insert rule, or set by a BEFORE INSERT trigger of the house. */
export function columnHeld(h: House, table: string, column: string): 'bound' | 'set' | null {
  const checks = [...h.policies.values()].filter((p) => p.table === table && ['INSERT', 'ALL'].includes(p.cmd) && !p.restrictive)
    .map((p) => p.check ?? p.using ?? '');
  const uid = String.raw`\(?\s*(?:SELECT\s+)?auth\.uid\(\)(?:\s+AS\s+uid)?\s*\)?`;
  const bound = new RegExp(String.raw`(?:${uid}\s*=\s*\(?${column}\b|\b${column}\s*\)?\s*=\s*${uid})`, 'i');
  if (checks.length && checks.every((c) => bound.test(c))) return 'bound';
  const setters = triggersOn(h, table).filter((t) => t.timing === 'BEFORE' && t.events.includes('INSERT')).map((t) => h.functions.get(t.fn)?.body ?? '');
  if (setters.some((b) => new RegExp(String.raw`\bNEW\.${column}\s*:=`, 'i').test(b))) return 'set';
  return null;
}

/**
 * How the house dates a member's new row of a table: 'now' (the moment it lands, whatever the member
 * wrote), 'not_after' (a past date kept, none after now), or null (the member's own word). Read from the
 * table's BEFORE INSERT triggers: a_new_row_is_dated and its mode, or a body that sets created_at to now().
 */
export function datedBy(h: House, table: string): 'now' | 'not_after' | null {
  const before = triggersOn(h, table).filter((t) => t.timing === 'BEFORE' && t.events.includes('INSERT'));
  const modes = before.map((t) => {
    const body = h.functions.get(t.fn)?.body ?? '';
    if (/\bNEW\.created_at\s*:=\s*now\(\)/i.test(body)) return 'now';
    if (/jsonb_build_object\('created_at'/.test(body)) return /'not_after'/.test(t.fnArgs) ? 'not_after' : /'now'/.test(t.fnArgs) ? 'now' : null;
    return null;
  });
  return modes.includes('now') ? 'now' : modes.includes('not_after') ? 'not_after' : null;
}

/** Whether a pace's text counts a table's rows by their created_at within a window (now() less an interval). */
export const countsByDate = (text: string): boolean => /\bcreated_at\s*>\s*(?:now\(\)|v_now|clock_timestamp\(\))\s*-/i.test(text)
  || /rate_limit_check\s*\(/i.test(text);

/** Tables a member inserts into whose created_at the house leaves to the member, each with why it orders and counts nothing anyone else reads. */
const OWN_DATE: Record<string, string> = {};

/** The address headers a caller writes, which only the vouched-address helper may read. */
const CALLER_HEADERS = /x-forwarded-for|cf-connecting-ip|x-real-ip|true-client-ip|x-client-ip|forwarded['"]/i;

/** Tables a member may insert into with no pace, each with why no script can repeat it without end. */
const UNPACED: Record<string, string> = {
  'public.log_private_notes': 'one note a viewing (its key is the viewing), and viewings come only with records, which logs_insert_rate_limit paces',
};

/** Tables no member inserts into directly whose rows another paced table bounds, each with what bounds it. */
const BOUNDED: Record<string, string> = {
  'public.log_private_notes': 'one a viewing, and viewings come only with records (logs_insert_rate_limit)',
  'public.viewing_notes_removed': 'one a viewing whose note was taken away, and viewings come only with records (logs_insert_rate_limit)',
};

/** Member-run functions that add rows where no pace stands, each with why a script repeating it adds nothing without end. */
const WRITERS: Record<string, string> = {
  'public.accept_follow_request': 'admits a request made to the caller: one notice for each request others made, and requests are interactions, which check_interaction_rate_limit paces',
  'public.approve_lounge_member': 'admits a seat requested in the caller\'s own salon: one notice for each request, and requests take a seat, which check_write_pace paces',
  'public.register_push_token': 'one row a device token, and the caller keeps only their ten newest: a loop of new tokens leaves ten',
  'public.send_salon_typing': 'one row a member and salon (salon_typing_sent), written at most once in two seconds: the throttle is its own',
  'public.record_gate_event': 'counts each member once a day for each event (gate_counted): a repeat adds nothing',
  'public.request_lounge_membership': 'one notice to the host for each seat requested, and taking a seat is paced (check_write_pace on lounge_members)',
  'public.set_lounge_member_status': 'the host\'s own salon: one sanction row a seat, written over (ON CONFLICT), so a loop leaves one',
  'public.relinquish_rank': 'gives up the caller\'s own rank from the store: one grant a member and source (rank_grants, written over or taken away), and the day\'s count of ranks given up moves only when a rank is (grant_entitlement counts a change alone)',
};

/** Columns naming a member that the rule neither binds to the writer nor the house sets, each judged. */
const NAMING: Record<string, string> = {
  'public.user_blocks.blocked_id': 'the member blocked or muted: the blocker\'s own choice of whom not to hear, which speaks for no one and reaches them with nothing',
};

/** Member-run functions that read blocks, each judged to answer only of the caller\'s own. */
const BLOCK_READERS: Record<string, string> = {
  'public.get_user_blocks': 'the caller\'s own blocks and mutes, for their settings: rows where they are the blocker, never who blocked them',
};

/**
 * Triggers that add rows where no pace stands when a member changes or takes away a row (or writes one
 * a relation of no pace of its own lets in), each with why a script repeating it adds nothing without end.
 */
const TRIGGERS: Record<string, string> = {
  'public.dispatch_posts:notify_answer': 'the answer a filing\'s author takes: the notice of the answer before is taken away as the next is written, so a filing keeps one at most, and its critic\'s phone is told once for each critique (answer: in certifications_pushed)',
  'public.dispatch_posts:notify_ballot_closed': 'only the house freezes a ballot\'s totals (a member\'s change to them is put back, dispatch_posts_pin_columns), once, and the voters are told at a pace (closed_ballots_told)',
  'public.interactions:log_counts_certify_delete': 'one count a record (log_counts, written over): a certification taken away moves it, it adds no row',
  'public.interactions:log_counts_certify_update': 'one count a record (log_counts, written over)',
  'public.log_comments:log_counts_critique_delete': 'one count a record (log_counts, written over): a critique taken away moves it, it adds no row',
  'public.log_comments:log_counts_critique_update': 'one count a record (log_counts, written over)',
  'public.logs:a_register_viewings_update': 'a record\'s viewings are the ones its history names, those it no longer names taken away: as many as its history holds (logs_viewing_history_len), and one record a film a member',
  'public.logs:trg_verdict_film_logs_delete': 'one tally a film (film_tallies, films), moved in place',
  'public.logs:trg_verdict_film_logs_update': 'one tally a film (film_tallies, films), moved in place',
  'public.profiles:a_members_pieces_are_queued': 'the pieces of the member\'s own name, waiting only until the change settles in the same transaction (member_grams_settle takes them away)',
  'public.profiles:a_members_pieces_are_settled': 'the pieces of the member\'s own name, the old ones taken away as the new are kept: as many as one name and one display name make',
  'public.profiles:tr_handle_privacy_switch': 'a file made open admits the follow requests waiting, one notice each, and requests are marks check_interaction_rate_limit paces; admitted, they wait no more, so opening the file again admits none',
};

/** Deployed edge functions that answer no pace of their own, each with why no member's script repeats them without end. */
const DOORS: Record<string, string> = {
  'notify-push': 'only the house calls it, with the shared secret it holds (x-function-secret), for a notice a paced write made',
  'revenuecat-webhook': 'only the store calls it, with the webhook\'s own secret',
  'sync-films': 'it drains: it reads only the films outstanding, twenty at most a call, and asks TMDB nothing when none is; the films outstanding are the ones members keep, which their own paces bound',
};

const tbl = (name: string, insertPolicy = "CREATE POLICY own ON public.t FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));\n") =>
  `CREATE TABLE public.${name} (\n    id uuid,\n    user_id uuid REFERENCES auth.users(id),\n    other_id uuid REFERENCES public.profiles(id)\n);\nGRANT SELECT, INSERT ON TABLE public.${name} TO authenticated;\n${insertPolicy.split('public.t').join(`public.${name}`)}`;
const paceFn = "CREATE FUNCTION public.pace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429'; END $$;\n";

describe('the rules, on planted text', () => {
  it('find a table a member may write with no pace, and none once a pace trigger or a counting rule stands', () => {
    const bare = read(tbl('t'));
    expect(insertable(bare)).toEqual(['public.t']);
    expect(pacedBy(bare, 'public.t')).toEqual([]);
    const trig = read(tbl('t') + paceFn + 'CREATE TRIGGER zz BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.pace();\n');
    expect(pacedBy(trig, 'public.t')).toEqual(['zz']);
    const rule = read(`${tbl('t')}CREATE POLICY rl ON public.t AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.rate_limit_check('t', 'user_id', 10, 60));\n`);
    expect(pacedBy(rule, 'public.t')).toEqual(['rl']);
    // A trigger on the table that paces nothing, and a pace on updates only, are no pace.
    expect(pacedBy(read(tbl('t') + paceFn.split('RAISE').join('PERFORM 1; --') + 'CREATE TRIGGER zz BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.pace();\n'), 'public.t')).toEqual([]);
    expect(pacedBy(read(tbl('t') + paceFn + 'CREATE TRIGGER zz BEFORE UPDATE ON public.t FOR EACH ROW EXECUTE FUNCTION public.pace();\n'), 'public.t')).toEqual([]);
  });

  it('leave out a table only the staff may write, and one no rule lets a row into', () => {
    expect(insertable(read(tbl('t', 'CREATE POLICY own ON public.t FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));\n')))).toEqual([]);
    expect(insertable(read(tbl('t', 'CREATE POLICY own ON public.t FOR INSERT TO authenticated WITH CHECK (false);\n')))).toEqual([]);
    expect(insertable(read(`${tbl('t')}REVOKE INSERT ON TABLE public.t FROM authenticated;\n`))).toEqual([]);
  });

  it('find a member-run function that writes where no pace stands, and none once it paces itself or the table is paced', () => {
    const fn = (body: string) => `CREATE FUNCTION public.w() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN ${body} END $$;\nGRANT ALL ON FUNCTION public.w() TO authenticated;\n`;
    expect(unpacedWriters(read(tbl('t') + fn('INSERT INTO public.t (id) VALUES (gen_random_uuid());')))).toEqual(['public.w']);
    expect(unpacedWriters(read(tbl('t') + fn("IF n > 9 THEN RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429'; END IF; INSERT INTO public.t (id) VALUES (1);")))).toEqual([]);
    expect(unpacedWriters(read(tbl('t') + paceFn + 'CREATE TRIGGER zz BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.pace();\n' + fn('INSERT INTO public.t (id) VALUES (1);')))).toEqual([]);
    // Rows changed or taken away grow nothing; the staff's own acts, and a table another pace bounds, are not a script's.
    expect(unpacedWriters(read(tbl('t') + fn('INSERT INTO pg_temp.x (id) VALUES (1); UPDATE public.t SET id = 2 WHERE id = 1;')))).toEqual([]);
    expect(unpacedWriters(read(tbl('t') + fn("IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'no'; END IF; INSERT INTO public.t (id) VALUES (1);")))).toEqual([]);
    expect(unpacedWriters(read(tbl('t') + fn('INSERT INTO public.t (id) VALUES (1);')), ['public.t'])).toEqual([]);
    expect(insertsOf('INSERT INTO pg_temp.x (id) VALUES (1); DELETE FROM public.a WHERE x; INSERT INTO b SELECT 1; INSERT INTO public.c AS c (x) VALUES (1)')).toEqual(['public.b', 'public.c']);
  });

  it('find a member-run function that writes through another, into any schema, or sends a request out, with no pace', () => {
    const fn = (name: string, body: string, granted = true) => `CREATE FUNCTION ${name}() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN ${body} END $$;\n${granted ? `GRANT ALL ON FUNCTION ${name}() TO authenticated;\n` : ''}`;
    const helper = fn('private.keep', 'INSERT INTO private.kept (id) VALUES (1);', false);
    expect(unpacedWriters(read(helper + fn('public.w', 'PERFORM private.keep();')))).toEqual(['public.w']);
    expect(unpacedWriters(read(fn('public.w', "PERFORM net.http_post(url := 'https://x.test');")))).toEqual(['public.w']);
    expect(reachOf(read(helper + fn('public.w', 'PERFORM private.keep();')), 'public.w')).toEqual(['private.kept']);
    // A function that paces itself before it calls the writer is no unpaced writer.
    expect(unpacedWriters(read(helper + fn('public.w', "IF n > 9 THEN RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'RH429'; END IF; PERFORM private.keep();")))).toEqual([]);
  });

  it('find a trigger that adds rows with no pace when a member changes or takes away a row they may write, or writes a view', () => {
    const grows = "CREATE FUNCTION public.g() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.notifications (id) VALUES (1); RETURN NEW; END $$;\n";
    const rules = `ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;\nCREATE POLICY up ON public.t FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));\nGRANT UPDATE ON TABLE public.t TO authenticated;\n`;
    const sql = tbl('t') + rules + grows + 'CREATE TRIGGER g AFTER UPDATE ON public.t FOR EACH ROW EXECUTE FUNCTION public.g();\n';
    expect(unpacedTriggers(read(sql), guarded(sql))).toEqual(['public.t:g']);
    // No rule lets a member change a row: the trigger is the house's alone.
    const shut = sql.split('CREATE POLICY up').join('CREATE POLICY up_staff').split('USING ((user_id').join('USING (public.is_admin(auth.uid()) AND (user_id');
    expect(unpacedTriggers(read(shut), guarded(shut))).toEqual([]);
    // An insert the table's own pace counts bounds what its trigger adds.
    const paced = `${tbl('t')}${grows}${paceFn}CREATE TRIGGER zz BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.pace();\nCREATE TRIGGER g AFTER INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.g();\n`;
    expect(unpacedTriggers(read(paced), guarded(paced))).toEqual([]);
    // A view no rule guards, written through its trigger: the grant alone lets the member in.
    const view = `GRANT INSERT ON TABLE public.v TO authenticated;\n${grows}CREATE TRIGGER g INSTEAD OF INSERT ON public.v FOR EACH ROW EXECUTE FUNCTION public.g();\n`;
    expect(unpacedTriggers(read(view), guarded(view))).toEqual(['public.v:g']);
  });

  it('find an edge function that answers no pace of its own, and read what it imports', () => {
    expect(answersAPace("return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '30' })")).toBe(true);
    expect(answersAPace("return new Response(body, { status: 429 })")).toBe(true);
    // A 429 the function was given by another service is no pace of its own.
    expect(answersAPace('if (res.status === 429) { release(); }')).toBe(false);
    const entry = join(__dirname, '..', '..', '..', 'supabase', 'functions', 'sync-entitlement', 'index.ts');
    expect(functionCode(entry)).toContain('export async function applyStoreRecord');
  });

  it('find a column naming another member that the rule does not bind and the house does not set', () => {
    const sql = tbl('t');
    const h = read(sql);
    expect(memberColumns(sql).get('public.t')).toEqual(['other_id', 'user_id']);
    expect(columnHeld(h, 'public.t', 'user_id')).toBe('bound');
    expect(columnHeld(h, 'public.t', 'other_id')).toBe(null);
    const setter = "CREATE FUNCTION public.s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.other_id := (SELECT x FROM y); RETURN NEW; END $$;\nCREATE TRIGGER s BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.s();\n";
    expect(columnHeld(read(sql + setter), 'public.t', 'other_id')).toBe('set');
    // Bound in one permissive rule but not another: a row can come in through the other, unbound.
    expect(columnHeld(read(`${sql}CREATE POLICY loose ON public.t FOR INSERT TO authenticated WITH CHECK (true);\n`), 'public.t', 'user_id')).toBe(null);
  });

  it('find a row the member dates, and none once the house dates it; and a pace counting by a date the member writes', () => {
    const dated = (trigger = '') => read(`CREATE TABLE public.d (\n    id uuid,\n    created_at timestamp with time zone DEFAULT now()\n);\n${trigger}`);
    const fn = "CREATE FUNCTION public.a_new_row_is_dated() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW := jsonb_populate_record(NEW, jsonb_build_object('created_at', now())); RETURN NEW; END $$;\n";
    expect(datedBy(dated(), 'public.d')).toBe(null);
    expect(datedBy(dated(`${fn}CREATE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.d FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');\n`), 'public.d')).toBe('now');
    expect(datedBy(dated(`${fn}CREATE TRIGGER a_new_row_is_dated BEFORE INSERT ON public.d FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('not_after');\n`), 'public.d')).toBe('not_after');
    // On updates only, it dates no new row.
    expect(datedBy(dated(`${fn}CREATE TRIGGER a_new_row_is_dated BEFORE UPDATE ON public.d FOR EACH ROW EXECUTE FUNCTION public.a_new_row_is_dated('now');\n`), 'public.d')).toBe(null);
    expect(datedBy(dated("CREATE FUNCTION public.s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.created_at := now(); RETURN NEW; END $$;\nCREATE TRIGGER s BEFORE INSERT ON public.d FOR EACH ROW EXECUTE FUNCTION public.s();\n"), 'public.d')).toBe('now');
    expect(countsByDate("SELECT count(*) FROM public.logs WHERE user_id = auth.uid() AND created_at > now() - interval '1440 minutes'")).toBe(true);
    expect(countsByDate("public.rate_limit_check('logs'::text, 'user_id'::text, 20000, 1440)")).toBe(true);
    expect(countsByDate('INSERT INTO public.write_budget AS b (user_id, kind) VALUES (v_member, v_kind)')).toBe(false);
  });

  it('find a caller-written address read outside the helper', () => {
    expect(CALLER_HEADERS.test("const ip = req.headers.get('x-forwarded-for')?.split(',')[0]")).toBe(true);
    expect(CALLER_HEADERS.test("req.headers.get('X-Real-IP')")).toBe(true);
    expect(CALLER_HEADERS.test('const caller = callerAddress(req.headers)')).toBe(false);
  });
});

describe('every write a member can repeat, in the house as production will hold it', () => {
  const h = read();
  const tables = insertable(h);

  it('reads the tables members write, the ones the reviews paced among them', () => {
    for (const t of ['public.logs', 'public.interactions', 'public.log_comments', 'public.lounge_messages', 'public.analytics_events', 'public.lists']) {
      expect(tables).toContain(t);
    }
  });

  it('paces every table a member may insert into, or judges why no script can repeat it without end', () => {
    const unpaced = tables.filter((t) => !pacedBy(h, t).length && !(t in UNPACED));
    const stale = Object.keys(UNPACED).filter((t) => !tables.includes(t) || pacedBy(h, t).length);
    expect({ unpaced, stale }).toEqual({ unpaced: [], stale: [] });
  });

  it('has every pace seen to refuse: a rehearsal runs each pace\'s function', () => {
    const rehearsals = files('rehearsals').map((f) => readFileSync(f, 'utf8')).join('\n');
    const matrix = readFileSync(join(__dirname, '..', '..', '..', 'e2e', 'db', 'attack', 'matrix.json'), 'utf8');
    const unseen = tables.flatMap((t) => triggersOn(h, t).filter((x) => pacedBy(h, t).includes(x.name))
      .map((x) => x.fn.replace(/^public\./, '')).filter((fn) => !rehearsals.includes(fn) && !matrix.includes(fn)).map((fn) => `${t}: ${fn}`));
    expect(unseen).toEqual([]);
  });

  it('has every pace written past by an attack probe, as a member, and refused by the pace itself', () => {
    const matrix = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'e2e', 'db', 'attack', 'matrix.json'), 'utf8')) as
      { probes: { table: string; expect: string; why: string; refusedWith?: string; as: string[] }[] };
    const unprobed = tables.flatMap((t) => triggersOn(h, t).filter((x) => pacedBy(h, t).includes(x.name)).map((x) => x.fn.replace(/^public\./, ''))
      .filter((fn) => !matrix.probes.some((p) => `public.${p.table}` === t && p.expect === 'refused' && p.why.includes(fn) && p.as.some((a) => a !== 'visitor')
        && (fn !== 'check_write_pace' || p.refusedWith === 'RH429')))
      .map((fn) => `${t}: ${fn}`));
    expect(unprobed).toEqual([]);
  });

  it('dates every member\'s new row by the house, or judges why the member\'s own date orders and counts nothing another reads', () => {
    const { text } = houseText();
    const withDate = tables.filter((t) => new RegExp(String.raw`CREATE TABLE ${t.replace('.', String.raw`\.`)} \([^;]*?\n\s+created_at timestamp`).test(text));
    expect(withDate).toEqual(expect.arrayContaining(['public.log_comments', 'public.logs', 'public.lounge_messages']));
    const undated = withDate.filter((t) => !datedBy(h, t) && !(t in OWN_DATE));
    const stale = Object.keys(OWN_DATE).filter((t) => !withDate.includes(t) || datedBy(h, t));
    expect({ undated, stale }).toEqual({ undated: [], stale: [] });
  });

  it('counts no pace by a date the member may write', () => {
    const fooled = tables.flatMap((t) => [
      ...triggersOn(h, t).filter((x) => pacedBy(h, t).includes(x.name)).map((x) => ({ name: x.fn, text: h.functions.get(x.fn)?.body ?? '' })),
      ...[...h.policies.values()].filter((p) => p.table === t && pacedBy(h, t).includes(p.name)).map((p) => ({ name: p.name, text: p.check ?? '' })),
    ].filter((p) => countsByDate(p.text) && datedBy(h, t) !== 'now').map((p) => `${t}: ${p.name}`));
    expect(fooled).toEqual([]);
  });

  it('runs no member-run function that writes where no pace stands, unless it paces itself or is judged', () => {
    const found = unpacedWriters(h, Object.keys(BOUNDED));
    expect({ unjudged: found.filter((f) => !(f in WRITERS)), stale: Object.keys(WRITERS).filter((f) => !found.includes(f)) }).toEqual({ unjudged: [], stale: [] });
  });

  it('adds no row past a pace when a member changes, takes away or writes through a trigger, unless it is judged', () => {
    const found = unpacedTriggers(h, guarded(houseText().text), Object.keys(BOUNDED));
    expect(found.length).toBeGreaterThan(0);
    expect({ unjudged: found.filter((t) => !(t in TRIGGERS)), stale: Object.keys(TRIGGERS).filter((t) => !found.includes(t)) }).toEqual({ unjudged: [], stale: [] });
  });

  it('lets no member call a deployed edge function without end: each answers a pace of its own, or is a door only the house or the store opens', () => {
    const { DEPLOYED, WEB, MOBILE: MOBILE_TREE } = require(join(__dirname, '..', '..', '..', 'scripts', 'edge-functions.cjs')) as
      { DEPLOYED: Record<string, { dir: string }>; WEB: string; MOBILE: string };
    const root = join(__dirname, '..', '..', '..', '..');
    expect([WEB, MOBILE_TREE].every((d) => Object.values(DEPLOYED).some((f) => f.dir === d))).toBe(true);
    const entries = files('functions', { ext: ['.ts'] }).filter((f) => /[\\/]index\.ts$/.test(f));
    const unpaced = Object.entries(DEPLOYED).filter(([name, { dir }]) => {
      const entry = entries.find((f) => rel(f).split('\\').join('/').endsWith(`${name}/index.ts`) && join(root, dir, name, 'index.ts') === f);
      if (!entry) throw new Error(`no code found for the deployed function ${name}`);
      return !answersAPace(functionCode(entry));
    }).map(([name]) => name).sort();
    expect({ unjudged: unpaced.filter((n) => !(n in DOORS)), stale: Object.keys(DOORS).filter((n) => !unpaced.includes(n)) }).toEqual({ unjudged: [], stale: [] });
  });

  it('lets no member-written row name another member on the caller\'s word', () => {
    const matrix = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'e2e', 'db', 'attack', 'matrix.json'), 'utf8')) as { tables: Record<string, { reach?: unknown; owner?: unknown }> };
    const columns = memberColumns(`${readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8')}`.replace(/\r/g, ''));
    const loose: string[] = [];
    for (const t of tables) {
      const reach = JSON.stringify(matrix.tables[t.replace(/^public\./, '')]?.reach ?? null);
      for (const c of columns.get(t) ?? []) {
        if (columnHeld(h, t, c) || reach.includes(`"${c}"`) || `${t}.${c}` in NAMING) continue;
        loose.push(`${t}.${c}`);
      }
    }
    expect(loose).toEqual([]);
  });

  it('answers of blocks only through functions judged to answer of the caller\'s own', () => {
    const found = [...h.functions.values()].filter((f) => f.name.startsWith('public.') && !f.returnsTrigger && membersRun(h, f.name) && /\buser_blocks\b/.test(f.body)).map((f) => f.name).sort();
    expect({ unjudged: found.filter((f) => !(f in BLOCK_READERS)), stale: Object.keys(BLOCK_READERS).filter((f) => !found.includes(f)) }).toEqual({ unjudged: [], stale: [] });
  });

  it('reads no caller-written address in any edge function but through the vouched-address helper', () => {
    const fns = files('functions', { ext: ['.ts', '.js'] }).filter((f) => !/_shared\/callerAddress\.js$/.test(rel(f).split('\\').join('/')));
    expect(fns.length).toBeGreaterThan(10);
    expect(fns.filter((f) => CALLER_HEADERS.test(stripComments(readFileSync(f, 'utf8'), f))).map((f) => rel(f))).toEqual([]);
  });
});
