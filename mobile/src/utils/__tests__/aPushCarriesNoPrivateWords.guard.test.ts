/**
 * A push message never carries private words (P4.5).
 *
 * A notice's `message` is the push's body (notify-push: `@name` and the message, under a title
 * per type), and a push is read on a lock screen, by whoever holds the phone. Every SQL function
 * in the schema snapshot that writes `notifications.message` is read here: each insert's message,
 * and each call of the shared `dispatch_notify` (its fourth argument), with the locals they are
 * built from followed to their assignment. Every value that goes into the words is listed below
 * with why it may be there. The rule: a message names only the house's own words, the film
 * catalogue's, a public title, or the recipient's own work; never what another member wrote in
 * private. A value not listed fails, and so does a writer not listed, so a new notice is judged
 * before it ships. (The sealed E2E's half reads each type back from the push stand-in: P5.)
 */
import { SNAPSHOT_SQL } from '@/test-utils/schema';

/** Each writer, and each value in its message with the reason it may be read on a lock screen. */
const VALUES: Record<string, Record<string, string>> = {
  accept_follow_request: {},
  approve_lounge_member: {
    v_lname: "the salon's name, told to the member just admitted to it: theirs to know, a private salon's included",
  },
  dispatch_notify: {
    p_message: 'the shared writer: each caller\'s message is read at its own call, below',
  },
  dispatch_notify_answer: {},
  dispatch_notify_ballot_closed: {
    'NEW.title': "the ballot's question, to the members who voted in it: a filing, public in the Dispatch",
  },
  dispatch_notify_certify: {
    'p.kind': "the filing's kind, a word of the house's (dispatch_names)",
    'p.title': "the recipient's own filing's title, public in the Dispatch",
  },
  dispatch_notify_critique: {
    'p.kind': "the filing's kind, a word of the house's (dispatch_names)",
    'p.title': "the recipient's own filing's title, public in the Dispatch",
  },
  handle_privacy_switch: {},
  lobby_choose_edition: {
    'e.slot': 'compared only: which of three fixed sentences',
  },
  notify_on_dossier_certify: { v_title: "the recipient's own dossier's title" },
  notify_on_dossier_comment: { v_title: "the recipient's own dossier's title" },
  notify_on_interaction: {
    v_title: "the film's title from the catalogue (a log), or the recipient's own stack's title, certified only by a member able to see it (can_endorse_content)",
  },
  notify_on_list_comment: { v_title: "the recipient's own stack's title" },
  notify_on_log_comment: { target_film_title: "the film's title, from the catalogue" },
  request_lounge_membership: {
    v_uname: 'compared only: whether the asker has a handle (the handle itself is the push\'s @name)',
    v_lname: "the recipient's own salon's name: it goes to the salon's creator",
  },
  resolve_moderation_report_v2: {
    p_action: 'compared only: which of the house\'s fixed sentences',
    p_duration_hours: 'a number of hours, the house\'s',
    p_reason: "the house's reason, written by its moderator to the member about their own account",
  },
};

/** SQL that is grammar or a function of the house's, never a value. */
const GRAMMAR = new Set(['CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IS', 'NOT', 'NULL', 'AND', 'OR', 'COALESCE', 'coalesce', 'btrim', 'text', 'public.dispatch_names']);

type Body = { name: string; body: string };

/** Every function body in a schema dump. */
export function functionsIn(sql: string): Body[] {
  const out: Body[] = [];
  for (const m of sql.matchAll(/CREATE FUNCTION (?:public\.)?(\w+)\(/g)) {
    const as = /\bAS (\$\w*\$)/g;
    as.lastIndex = m.index ?? 0;
    const a = as.exec(sql);
    if (!a) continue;
    const start = a.index + a[0].length;
    out.push({ name: m[1]!, body: sql.slice(start, sql.indexOf(a[1]!, start)) });
  }
  return out;
}

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

/** Each message a function writes: an insert's `message`, or the fourth argument of dispatch_notify. */
export function messagesIn(fn: Body): string[] {
  const out: string[] = [];
  for (const m of fn.body.matchAll(/INSERT INTO (?:public\.)?notifications\s*\(/gi)) {
    const cols = listAt(fn.body, (m.index ?? 0) + m[0].length - 1);
    const at = cols.parts.indexOf('message');
    if (at < 0) continue;
    const rest = fn.body.slice(cols.end + 1);
    const kind = /^\s*(VALUES|SELECT)\b/i.exec(rest);
    if (!kind) { out.push(`?unread ${rest.slice(0, 40)}`); continue; }
    const items = kind[1]!.toUpperCase() === 'VALUES' ? listAt(rest, rest.indexOf('(')).parts : selectItems(rest.slice(kind[0].length));
    out.push(items[at] ?? '?unread');
  }
  if (fn.name !== 'dispatch_notify') {
    for (const m of fn.body.matchAll(/dispatch_notify\s*\(/g)) out.push(listAt(fn.body, (m.index ?? 0) + m[0].length - 1).parts[3] ?? '?unread');
  }
  return out;
}

/** The values in a message: its names once the words in quotes are taken out, locals followed to what they hold. */
export function valuesIn(expr: string, body: string, seen = new Set<string>()): string[] {
  const names = expr.replace(/'(?:[^']|'')*'/g, ' ').replace(/::\w+/g, ' ').match(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g) ?? [];
  const out = new Set<string>();
  for (const name of names) {
    if (GRAMMAR.has(name)) continue;
    const assigned = new RegExp(`\\b${name.replace('.', '\\.')}\\s*:=([^;]+);`).exec(body);
    if (assigned && !seen.has(name)) {
      seen.add(name);
      for (const v of valuesIn(assigned[1]!, body, seen)) out.add(v);
    } else out.add(name);
  }
  return [...out];
}

const writers = functionsIn(SNAPSHOT_SQL()).map((fn) => ({ fn, messages: messagesIn(fn) })).filter((w) => w.messages.length > 0);

describe('a push message', () => {
  it('is written by the functions listed, and the scan reads them all (17 inserts, 4 shared calls)', () => {
    expect(writers.map((w) => w.fn.name).sort()).toEqual(Object.keys(VALUES).sort());
    expect(writers.flatMap((w) => w.messages).length).toBe(21);
    expect(writers.flatMap((w) => w.messages).filter((m) => m.startsWith('?unread'))).toEqual([]);
  });

  it('carries only values judged fit for a lock screen, and every judgment still has its value', () => {
    const found = writers.map((w) => ({ name: w.fn.name, values: new Set(w.messages.flatMap((m) => valuesIn(m, w.fn.body))) }));
    const unjudged = found.flatMap((w) => [...w.values].filter((v) => !(v in (VALUES[w.name] ?? {}))).map((v) => `${w.name}: ${v}`));
    const stale = found.flatMap((w) => Object.keys(VALUES[w.name] ?? {}).filter((v) => !w.values.has(v)).map((v) => `${w.name}: ${v}`));
    expect({ unjudged, stale }).toEqual({ unjudged: [], stale: [] });
  });

  it('says NO to a member\'s words in a notice', () => {
    const fn = { name: 'probe', body: "DECLARE m text; BEGIN m := 'wrote: ' || NEW.body; INSERT INTO public.notifications (user_id, message) VALUES (NEW.to, m); PERFORM public.dispatch_notify(a, b, 'x', 'said ' || c.content, '{}', 'g'); END" };
    const messages = messagesIn(fn);
    expect(messages).toEqual(['m', "'said ' || c.content"]);
    expect(messages.flatMap((m) => valuesIn(m, fn.body))).toEqual(['NEW.body', 'c.content']);
  });
});
