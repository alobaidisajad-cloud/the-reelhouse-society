/**
 * aNoticeOpensWhatItIsAbout.guard.test.ts — every notice the house writes opens the room it is about.
 * ─────────────────────────────────────────────────────────────────────────────
 * Five notices opened a room other than their own (UI-notice-opens-elsewhere): a critique of a log or
 * a stack opened its critic's file, a salon's request to enter opened the asker's file, an admission
 * only the notices sheet. Each was fixed where it was found; nothing asked it of the next writer.
 *
 * So every notice the house writes, as production will hold its functions (houseFunctions: the
 * snapshot with the pending cars laid over it), is read: each INSERT INTO notifications and each call
 * of dispatch_notify, with the columns noticeRoute reads (the group key, the film, the salon, the
 * verdict named in its metadata, the sender). A notice is built from them and given to noticeRoute
 * itself, and the room it opens must be the room ABOUT names for that writer. A writer named nowhere
 * fails, so a new notice is judged the day it is written; a name whose writer has gone fails too.
 */
import { codeOf, houseFunctions } from '@/test-utils/houseFunctions';
import { PENDING_SQL, SNAPSHOT_SQL } from '@/test-utils/schema';
import { noticeRoute } from '@/src/utils/noticeRoute';

/** The room a notice may open. */
type Room = 'log' | 'stack' | 'filing' | 'piece' | 'salon' | 'verdict' | 'member' | 'nothing';

/** Each room by the route that opens it. */
const OPENS: Record<Room, RegExp> = {
  log: /^\/log\/[0-9a-f-]{36}$/,
  stack: /^\/stacks\/[0-9a-f-]{36}$/,
  filing: /^\/(dispatch|dossier)\/[0-9a-f-]{36}$/,
  piece: /^\/(log|stacks|dispatch)\/[0-9a-f-]{36}$/,
  salon: /^\/lounge\/[0-9a-f-]{36}\?door=1$/,
  verdict: /^\/notifications-modal\?verdict=[0-9a-f-]{36}$/,
  member: /^\/user\/[^/?]+\?id=[0-9a-f-]{36}$/,
  nothing: /^$/,
};

/**
 * What each notice is about, by its writer and its type (`#2` for a writer's second notice of one
 * type). Judged by reading the writer: the room a member who opens it means to reach.
 */
const ABOUT: Record<string, Room> = {
  'accept_follow_request:follow_accept': 'member',
  'approve_lounge_member:salon': 'salon',
  'bulk_dismiss_reports:moderation': 'nothing',
  'dispatch_notify_answer:comment': 'filing',
  'dispatch_notify_certify:endorse': 'filing',
  'dispatch_notify_certify:endorse#2': 'filing',
  'dispatch_notify_critique:comment': 'filing',
  'handle_privacy_switch:follow_accept': 'member',
  'judge_appeal:moderation': 'verdict',
  'lift_sanction:moderation': 'verdict',
  'notify_on_dossier_certify:endorse': 'filing',
  'notify_on_dossier_comment:comment': 'filing',
  'notify_on_interaction:follow': 'member',
  'notify_on_interaction:follow_request': 'member',
  'notify_on_interaction:endorse': 'log',
  'notify_on_interaction:endorse#2': 'stack',
  'notify_on_list_comment:comment': 'stack',
  'notify_on_log_comment:comment': 'log',
  'private.closed_ballots_told:ballot': 'filing',
  'private.lobby_edition_step:featured': 'piece',
  'request_lounge_membership:salon': 'salon',
  'resolve_moderation_report_v2:moderation': 'nothing',
  'resolve_moderation_report_v2:moderation#2': 'verdict',
};

/**
 * A notice found opening another room than its own, with why it stands: each a judged exception
 * under the rulebook, still found (an entry no longer found fails).
 */
const STANDS: Record<string, string> = {
  'notify_on_dossier_comment:comment': 'the legacy table it hears is written by no member: they were only ever granted SELECT on it, taken away in 20261120_31; a critique of a filing is written through dossier_comments, dispatch_comments\' view, and told by dispatch_notify_critique, which opens the filing',
};

/** The top-level parts of the parenthesised list opening at `open`, and where it closes. */
function listAt(text: string, open: number): { parts: string[]; end: number } {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { cur += c; if (c === "'") { if (text[i + 1] === "'") { cur += "'"; i++; } else quoted = false; } continue; }
    if (c === "'") { quoted = true; cur += c; continue; }
    if (c === '(' && ++depth === 1) continue;
    if (c === ')' && --depth === 0) { parts.push(cur.trim()); return { parts, end: i }; }
    if (c === ',' && depth === 1) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return { parts, end: text.length };
}

/** The top-level items of a SELECT list, up to its FROM, WHERE or end. */
function selectItems(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { cur += c; if (c === "'") { if (text[i + 1] === "'") { cur += "'"; i++; } else quoted = false; } continue; }
    if (c === "'") { quoted = true; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && (c === ';' || /^\s(FROM|WHERE|ON CONFLICT|RETURNING)\b/i.test(text.slice(i, i + 14)))) break;
    if (c === ',' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  items.push(cur.trim());
  return items;
}

/** One notice a function writes: its columns' expressions, by name. */
type Written = { writer: string; type: string; cols: Record<string, string> };

/** Every notice a function writes: its inserts into notifications, and its calls of dispatch_notify. */
export function noticesIn(name: string, rawBody: string): Written[] {
  const body = codeOf(rawBody);
  const out: Written[] = [];
  // dispatch_notify is the Dispatch's door: what its notices open is read at each call of it, below.
  if (name === 'dispatch_notify') return out;
  for (const m of body.matchAll(/INSERT INTO (?:public\.)?notifications\s*\(/gi)) {
    const cols = listAt(body, (m.index ?? 0) + m[0].length - 1);
    const rest = body.slice(cols.end + 1);
    const kind = /^\s*(VALUES|SELECT)\b/i.exec(rest);
    const items = !kind ? [] : kind[1]!.toUpperCase() === 'VALUES' ? listAt(rest, rest.indexOf('(')).parts : selectItems(rest.slice(kind[0].length));
    const row: Record<string, string> = {};
    cols.parts.forEach((c, i) => { row[c] = items[i] ?? '?unread'; });
    out.push({ writer: name, type: (row.type ?? '?').replace(/^'|'$/g, ''), cols: row });
  }
  // dispatch_notify(p_to, p_from, p_type, p_message, p_meta, p_group): the sender's name is read by the door.
  for (const m of body.matchAll(/dispatch_notify\s*\(/g)) {
    const p = listAt(body, (m.index ?? 0) + m[0].length - 1).parts;
    out.push({ writer: name, type: (p[2] ?? '?').replace(/^'|'$/g, ''),
      cols: { from_user_id: p[1] ?? '', from_username: 'pr.username', metadata: p[4] ?? '', group_key: p[5] ?? '' } });
  }
  return out;
}

const UUID = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b';
const KINDS = ['log', 'list', 'post'];
const given = (e: string | undefined) => !!e && !/^(NULL|'?\?unread'?|''|NULL::\w+)$/i.test(e.trim());

/**
 * The group keys a key's expression can be: each quoted part as written, the last other part an id,
 * and each other part (a slot read from a row) every kind a key names.
 */
function keysOf(expr: string | undefined): (string | undefined)[] {
  if (!given(expr)) return [undefined];
  const parts = expr!.split('||').map((s) => s.trim());
  let keys = [''];
  parts.forEach((p, i) => {
    const lit = /^'([^']*)'$/.exec(p);
    if (lit) keys = keys.map((k) => k + lit[1]);
    else if (i === parts.length - 1) keys = keys.map((k) => k + UUID);
    else keys = keys.flatMap((k) => KINDS.map((kind) => k + kind));
  });
  return keys;
}

/** The routes a written notice opens, by noticeRoute itself, one for each key it can carry. */
export function routesOf(w: Written): string[] {
  const c = w.cols;
  return keysOf(c.group_key).map((group_key) => noticeRoute({
    group_key,
    film_id: given(c.film_id) ? 603 : undefined,
    related_lounge_id: given(c.related_lounge_id) ? UUID : undefined,
    verdict_id: /'mod_action_id'/.test(c.metadata ?? '') ? UUID : undefined,
    from_username: given(c.from_username) ? 'a_member' : undefined,
    from_user_id: given(c.from_user_id) ? UUID : undefined,
  }) ?? '');
}

/** Each writer's notices, named `writer:type`, `#n` for a writer's later notices of one type. */
export function named(ws: Written[]): Map<string, Written> {
  const out = new Map<string, Written>();
  const seen = new Map<string, number>();
  for (const w of ws) {
    const k = `${w.writer}:${w.type}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    out.set(n === 1 ? k : `${k}#${n}`, w);
  }
  return out;
}

/** Each fault: a notice opening another room than ABOUT names, one named nowhere, a name gone. */
export function noticeFaults(ws: Written[], about: Record<string, Room>): string[] {
  const all = named(ws);
  const faults: string[] = [];
  for (const [k, w] of all) {
    const room = about[k];
    if (!room) { faults.push(`${k}: a notice no one has said what it is about`); continue; }
    const wrong = routesOf(w).filter((r) => !OPENS[room].test(r));
    if (wrong.length) faults.push(`${k}: about a ${room}, opens ${wrong.map((r) => r || 'nothing').join(', ')}`);
  }
  for (const k of Object.keys(about)) if (!all.has(k)) faults.push(`${k}: named, but the house writes no such notice`);
  return faults;
}

const HOUSE = houseFunctions().flatMap((f) => noticesIn(f.name, f.body));

describe('the rule says no to its planted shapes', () => {
  it('to a critique of a log keyed by nothing, a writer named nowhere, and a name gone', () => {
    const ws = [
      ...noticesIn('notify_on_log_comment', "BEGIN INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message) VALUES (l.user_id, 'comment', sender_user, NEW.user_id, m); END"),
      ...noticesIn('a_new_writer', "BEGIN PERFORM public.dispatch_notify(a, b, 'endorse', m, '{}', 'endorse:post:' || p.id); END"),
    ];
    expect(noticeFaults(ws, { 'notify_on_log_comment:comment': 'log', 'gone_writer:salon': 'salon' })).toEqual([
      `notify_on_log_comment:comment: about a log, opens /user/a_member?id=${UUID}`,
      'a_new_writer:endorse: a notice no one has said what it is about',
      'gone_writer:salon: named, but the house writes no such notice',
    ]);
  });

  it('to a salon\'s request to enter that names no salon, and a verdict\'s notice that names no verdict', () => {
    const ws = [
      ...noticesIn('request_lounge_membership', "BEGIN INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message) VALUES (h, 'salon', v_uname, auth.uid(), m); END"),
      ...noticesIn('judge_appeal', "BEGIN INSERT INTO public.notifications (user_id, type, title, body, metadata) VALUES (u, 'moderation', 't', b, jsonb_build_object('action', 'appeal')); END"),
    ];
    expect(noticeFaults(ws, { 'request_lounge_membership:salon': 'salon', 'judge_appeal:moderation': 'verdict' })).toEqual([
      `request_lounge_membership:salon: about a salon, opens /user/a_member?id=${UUID}`,
      'judge_appeal:moderation: about a verdict, opens nothing',
    ]);
  });

  it('and passes each, keyed to what it is about, a slot read from a row tried as every kind', () => {
    const ws = [
      ...noticesIn('notify_on_log_comment', "BEGIN INSERT INTO public.notifications (user_id, type, from_username, from_user_id, message, group_key) VALUES (l.user_id, 'comment', s, NEW.user_id, m, 'endorse:log:' || NEW.log_id); END"),
      ...noticesIn('lobby_choose_edition', "BEGIN INSERT INTO public.notifications (user_id, type, message, group_key) SELECT o, 'featured', m, 'lobby:' || e.slot || ':' || e.target_id FROM e; END"),
    ];
    expect(routesOf(ws[1]!)).toEqual([`/log/${UUID}`, `/stacks/${UUID}`, `/dispatch/${UUID}`]);
    expect(noticeFaults(ws, { 'notify_on_log_comment:comment': 'log', 'lobby_choose_edition:featured': 'piece' })).toEqual([]);
  });
});

describe('every notice the house writes', () => {
  it('is read: the inserts and the Dispatch\'s door both', () => {
    expect(HOUSE.length).toBeGreaterThan(20);
    expect(HOUSE.some((w) => w.writer === 'dispatch_notify_critique')).toBe(true);
    expect(HOUSE.some((w) => w.writer === 'request_lounge_membership')).toBe(true);
  });

  it('opens the room it is about', () => {
    const faults = noticeFaults(HOUSE, ABOUT);
    expect(faults.filter((f) => !(f.replace(/: .*$/, '') in STANDS))).toEqual([]);
    for (const k of Object.keys(STANDS)) expect([k, faults.some((f) => f.startsWith(`${k}:`))]).toEqual([k, true]);
  });

  it('the judged one stands as said: no member may write the legacy critiques', () => {
    const grants = `${SNAPSHOT_SQL()}\n${PENDING_SQL()}`.match(/GRANT [^;]*ON TABLE public\.dossier_comments_legacy TO [^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.filter((g) => /\b(ALL|INSERT)\b[^;]*TO [^;]*\b(anon|authenticated)\b/.test(g))).toEqual([]);
  });
});
