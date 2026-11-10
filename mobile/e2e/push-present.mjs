#!/usr/bin/env node
/**
 * push-present.mjs — a notice sent as production sends it, and the link that puts it on the phone
 * (WORKLIST P4.22, P4.26; audit P4-22-PUSH-TAP-PLAN).
 *
 * In the sealed world: the member is given a push token (as the app registers one: the emulator
 * reaches no Expo server for a real one), a notice is written for them as the house writes one, and
 * notify-push is called with the body production's notice trigger sends it ({type, table, record})
 * and the function secret the world set. notify-push builds the message and sends it to the Expo
 * stand-in (e2e/functions/stand-ins.mjs), which keeps it. The kept message, as notify-push built it,
 * is printed as reelhouse://e2e/present?message=…, which the E2E build presents as the app's own
 * notice (src/utils/e2ePresent.ts), with the title notify-push gave it, and the route mark of the
 * room the tap must open (E2ERouteMark). Nothing here builds a message: what is tapped is
 * notify-push's.
 *
 *   node mobile/e2e/push-present.mjs <kind>
 *     kind: one for each room a notice opens (noticeRoute), each from the seeded admin to the
 *     seeded member: follow (the follower's file), critique (the log critiqued: a critique written,
 *     its notice the trigger's), salon (the salon admitted to), house (a notice from the house,
 *     which opens the notices sheet)
 *
 * Needs API_URL (the local stack), FN_FUNCTION_SHARED_SECRET (the world's), E2E_MEMBER_USERNAME.
 */
import { execFileSync } from 'node:child_process';

// The local stack's database and the stand-ins, on the runner itself, as e2e.yml starts them.
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const API = process.env.API_URL ?? '';
const SECRET = process.env.FN_FUNCTION_SHARED_SECRET ?? '';
const STAND_INS = 'http://127.0.0.1:54990';
const MEMBER = process.env.E2E_MEMBER_USERNAME ?? 'e2e_member';
const SENDER = 'e2e_admin';
/** The token the member's phone stands for: a token's form, the stand-in's to answer. */
export const TOKEN = 'ExponentPushToken[e2e-phone]';

/** The route mark of a path, as the app draws it (src/components/layout/E2ERouteMark.tsx). */
export function markOf(path) {
  const words = path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return words ? `e2e-route-${words}` : 'e2e-route';
}

const local = (url) => /^(postgresql|http):\/\/[^@/]*@?(127\.0\.0\.1|localhost)(:\d+)?/.test(url);

const sql = (q) => execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** A notice written for the member as the house writes it, read back whole. */
function notice(member, fields) {
  const cols = Object.keys(fields);
  return JSON.parse(sql(`INSERT INTO public.notifications (user_id, ${cols.join(', ')})
    VALUES (${quote(member)}, ${cols.map((c) => quote(fields[c])).join(', ')}) RETURNING row_to_json(notifications)`));
}

/**
 * Each kind the flows tap, one for each room a notice opens: written as the house writes it, and the
 * route mark of the room the tap must land on.
 */
export const KINDS = {
  follow: ({ member, sender }) => ({
    record: notice(member, { type: 'follow', from_username: SENDER, from_user_id: sender, message: 'started following your frequency.' }),
    lands: markOf(`/user/${SENDER}`),
  }),
  // A critique of the member's newest log, written as a member writes one: its notice is the
  // trigger's (notify_on_log_comment), which names the log (20261109_03).
  critique: ({ member, sender }) => {
    const log = sql(`SELECT id FROM public.logs WHERE user_id = ${quote(member)} ORDER BY created_at DESC, id LIMIT 1`);
    if (!log) throw new Error('the seed holds no log of the member to critique');
    sql(`INSERT INTO public.log_comments (log_id, user_id, username, body)
      VALUES (${quote(log)}, ${quote(sender)}, ${quote(SENDER)}, 'A critique the push flow taps.')`);
    const record = sql(`SELECT row_to_json(n) FROM public.notifications n WHERE n.user_id = ${quote(member)}
      AND n.type = 'comment' AND n.from_user_id = ${quote(sender)} ORDER BY n.created_at DESC, n.id DESC LIMIT 1`);
    if (!record) throw new Error('the critique wrote no notice');
    return { record: JSON.parse(record), lands: markOf(`/log/${log}`) };
  },
  // A salon of the admin's, the member admitted to it, as approve_lounge_member admits and tells them
  // (the walk's open Lounge is seeded for the walk alone).
  salon: ({ member, sender }) => {
    const lounge = sql(`INSERT INTO public.lounges (name, description, is_private, creator_id)
      VALUES ('The push flow salon', 'Where a notice admits the member.', true, ${quote(sender)}) RETURNING id`);
    if (!lounge) throw new Error('no salon was founded for the member to be admitted to');
    sql(`INSERT INTO public.lounge_members (lounge_id, user_id, status) VALUES (${quote(lounge)}, ${quote(member)}, 'approved')
      ON CONFLICT (user_id, lounge_id) DO UPDATE SET status = 'approved'`);
    return {
      record: notice(member, { type: 'system', from_user_id: sender, message: 'You were admitted to The push flow salon.', related_lounge_id: lounge }),
      lands: markOf(`/lounge/${lounge}`),
    };
  },
  // Word from the house about the member's membership: it points at nothing, and opens the sheet.
  house: ({ member }) => ({
    record: notice(member, { type: 'moderation', title: 'A notice from the house', body: 'The house has read your report.', message: 'The house has read your report.' }),
    lands: markOf('/notifications-modal'),
  }),
};

/** A kept request's body: the stand-in keeps it as the text it was sent. */
const parsed = (body) => {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { return null; }
};

/** The message notify-push sent the stand-in for this token, last of all. */
export function messageFor(seen, token = TOKEN) {
  const sent = seen.filter((r) => r.method === 'POST' && r.path === '/--/api/v2/push/send')
    .flatMap((r) => { const b = parsed(r.body); return Array.isArray(b) ? b : []; });
  return sent.filter((m) => m && m.to === token).at(-1) ?? null;
}

/** The link the E2E build presents the message from. */
export const linkOf = (message) => `reelhouse://e2e/present?message=${encodeURIComponent(JSON.stringify(message))}`;

async function main(kind) {
  const make = KINDS[kind];
  if (!make) throw new Error(`no kind ${kind}: ${Object.keys(KINDS).join(', ')}`);
  if (!local(DB) || !local(API)) throw new Error('push-present runs against the local stack alone');
  if (!SECRET) throw new Error('FN_FUNCTION_SHARED_SECRET is not set: the world gives notify-push its secret');
  const ids = Object.fromEntries(sql(`SELECT username || '=' || id FROM public.profiles WHERE username IN (${quote(MEMBER)}, ${quote(SENDER)})`)
    .split('\n').filter(Boolean).map((l) => l.split('=')));
  if (!ids[MEMBER] || !ids[SENDER]) throw new Error(`the seed holds no ${ids[MEMBER] ? SENDER : MEMBER}`);
  sql(`DELETE FROM public.push_tokens WHERE user_id = ${quote(ids[MEMBER])};
       INSERT INTO public.push_tokens (user_id, token, platform) VALUES (${quote(ids[MEMBER])}, ${quote(TOKEN)}, 'android')`);
  const { record, lands } = make({ member: ids[MEMBER], sender: ids[SENDER] });
  await fetch(`${STAND_INS}/__reset`, { method: 'POST' });
  const res = await fetch(`${API}/functions/v1/notify-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-function-secret': SECRET },
    body: JSON.stringify({ type: 'INSERT', table: 'notifications', record }),
  });
  const said = await res.text();
  if (!res.ok) throw new Error(`notify-push answered ${res.status}: ${said.slice(0, 300)}`);
  const message = messageFor(await (await fetch(`${STAND_INS}/__seen`)).json());
  if (!message) throw new Error(`notify-push sent the stand-in nothing for the member's token (it said ${said.slice(0, 300)})`);
  // The link, the title notify-push gave the notice (the flow finds it in the shade by it), and the
  // route mark of the room the tap must open: one a line, for run-flows.sh.
  console.log(linkOf(message));
  console.log(String(message.title ?? ''));
  console.log(lands);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('push-present.mjs')) {
  main(process.argv[2]).catch((e) => { console.error(`push-present: ${e.message}`); process.exit(1); });
}
