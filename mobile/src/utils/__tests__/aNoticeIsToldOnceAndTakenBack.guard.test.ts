/**
 * A notice is told once, through the house's one gate, and taken back when its cause is undone; a
 * count kept by a trigger moves both ways and is read under its row's lock (the kinds pass, kind 14:
 * house side effects not symmetric or once).
 * ─────────────────────────────────────────────────────────────────────────────
 * aPushCarriesNoPrivateWords enumerates every notice writer but asks only whether its words are
 * private. Each review found one more writer that wrote on insert and never took back, or told twice,
 * or a count taken before its lock. Here the whole house, as production will hold it
 * (test-utils/house.js), is asked once:
 *   - every function that writes a notice (an insert into notifications, or a call of dispatch_notify)
 *     is listed with what takes its notice back when its cause is undone (a trigger the house holds
 *     on the cause's table that deletes notices), or why its notice stands; and with what tells it once;
 *   - every notice passes one gate: notifications refuses a notice from a member its reader hid
 *     (a BEFORE INSERT trigger) and hides one on read (a restrictive SELECT rule), so no writer keeps
 *     its own;
 *   - a count a trigger sets from count(*) is read after its row is locked (FOR UPDATE, FOR NO KEY
 *     UPDATE or FOR SHARE), so two writes at once never leave it one short;
 *   - a count a trigger adds to on a table's insert is taken from on its delete.
 * Each rule is checked on planted text first, so it is seen to say no.
 */
import { read, type House } from '@/test-utils/house';

/** Whether a body writes a notice: an insert into notifications, or a call of the shared writer. */
const writesNotice = (body: string) => /\bINSERT\s+INTO\s+(?:public\.)?notifications\b/i.test(body) || /\bdispatch_notify\s*\(/.test(body);
/** Whether a body takes notices back. */
const takesNotices = (body: string) => /\bDELETE\s+FROM\s+(?:public\.)?notifications\b/i.test(body);

/** Every notice writer the house holds, the shared writer itself left out (each caller is read). */
export function noticeWriters(h: House): string[] {
  return [...h.functions.values()].filter((f) => f.name !== 'public.dispatch_notify' && writesNotice(f.body)).map((f) => f.name).sort();
}

/** The tables whose writes fire a function (its triggers). */
const firedOn = (h: House, fn: string) => [...h.triggers.values()].filter((t) => t.fn === fn).map((t) => t.table);

/** Whether a named trigger stands on one of the tables and takes notices back. */
export function takesBack(h: House, writer: string, trigger: string): boolean {
  const tables = firedOn(h, writer);
  return [...h.triggers.values()].some((t) => t.name === trigger && (tables.includes(t.table) || !tables.length)
    && (t.events.includes('DELETE') || t.events.includes('UPDATE')) && takesNotices(h.functions.get(t.fn)?.body ?? ''));
}

/**
 * Trigger functions that set a count from a count(*) of a table without first locking a row. A count
 * of the rows a statement of its own just changed (FROM a WITH ... AS (UPDATE | DELETE | INSERT ...))
 * is exact, and is no read of the table.
 */
export function countsUnlocked(h: House): string[] {
  return [...h.functions.values()].filter((f) => {
    if (!f.returnsTrigger || !/\bSET\s+\w*count\w*\s*=/i.test(f.body)) return false;
    return [...f.body.matchAll(/\bcount\s*\(\s*\*\s*\)[\s\S]*?\bINTO\b[\s\S]*?\bFROM\s+(?:public\.)?(\w+)/gi)].some((m) => {
      if (new RegExp(String.raw`\b${m[1]}\s+AS\s*\(\s*(?:UPDATE|DELETE|INSERT)\b`, 'i').test(f.body)) return false;
      return !/\bFOR\s+(?:NO\s+KEY\s+)?UPDATE\b|\bFOR\s+SHARE\b|pg_advisory_xact_lock/i.test(f.body.slice(0, m.index));
    });
  }).map((f) => f.name).sort();
}

/**
 * Each count a trigger adds one to (UPDATE t SET c = c + 1, or NEW.c := NEW.c + 1 on its own row)
 * that no trigger anywhere takes one from: by the counted table and column.
 */
export function countsOneWay(h: House): string[] {
  const moves = new Map<string, Set<string>>();
  const move = (key: string, sign: string) => moves.set(key, new Set([...(moves.get(key) ?? []), sign]));
  const STEP = String.raw`(?:GREATEST\s*\(\s*0\s*,\s*)?(?:COALESCE\s*\(\s*)?(?:\w+\.)?\1\s*(?:,\s*0\s*\))?\s*([+-])\s*1\b`;
  for (const t of h.triggers.values()) {
    const body = h.functions.get(t.fn)?.body ?? '';
    for (const u of body.matchAll(/\bUPDATE\s+(?:public\.)?(\w+)\s+SET\b([^;]*)/gi)) {
      for (const m of u[2]!.matchAll(new RegExp(String.raw`\b(\w*count\w*)\s*=\s*${STEP}`, 'gi'))) move(`public.${u[1]}.${m[1]!.toLowerCase()}`, m[2]!);
    }
    // An upsert's DO UPDATE SET counts the table it inserts into.
    for (const u of body.matchAll(/\bINSERT\s+INTO\s+(?:public\.)?(\w+)[^;]*?\bDO\s+UPDATE\s+SET\b([^;]*)/gi)) {
      for (const m of u[2]!.matchAll(new RegExp(String.raw`\b(\w*count\w*)\s*=\s*${STEP}`, 'gi'))) move(`public.${u[1]}.${m[1]!.toLowerCase()}`, m[2]!);
    }
    for (const m of body.matchAll(new RegExp(String.raw`\bNEW\.(\w*count\w*)\s*:=\s*${STEP}`, 'gi'))) move(`${t.table}.${m[1]!.toLowerCase()}`, m[2]!);
  }
  return [...moves].filter(([, signs]) => signs.size < 2).map(([k]) => k).sort();
}

type Judged = { back: string[] | string; once: string };

/**
 * Each notice writer: the triggers that take its notice back when its cause is undone (by name), or
 * why its notice stands; and what tells it once.
 */
const WRITERS: Record<string, Judged> = {
  'public.notify_on_interaction': {
    back: ['a_follow_takes_its_notice', 'a_request_takes_its_notice', 'a_certification_takes_its_notice'],
    once: 'a certification or follow given again after it was taken back is pushed once (tg_notify_push: certifications_pushed by its group key or the one followed)',
  },
  'public.notify_on_log_comment': { back: ['a_critique_takes_its_notice'], once: 'one notice a critique, a critique a row; pushed once an hour from one member to another (critique_to:<recipient>)' },
  'public.notify_on_list_comment': { back: ['a_critique_takes_its_notice'], once: 'as a record\'s critique' },
  'public.dispatch_notify_critique': { back: ['a_critique_takes_its_notice'], once: 'as a record\'s critique' },
  'public.dispatch_notify_certify': { back: ['a_certification_takes_its_notice'], once: 'a certification a member and piece (its key); pushed once by its piece or critique' },
  'public.dispatch_notify_answer': { back: ['notify_answer'], once: 'the answer moved away takes its notice in the same trigger; pushed once a critique (answer:<critique>)' },
  'public.dispatch_notify_ballot_closed': { back: 'a ballot closes once and is never reopened: its close is a fact, never undone', once: 'written only on the update that closes it (OLD open, NEW closed), and only to members who voted' },
  'public.handle_privacy_switch': { back: ['tr_handle_privacy_switch'], once: 'the requests it turns into follows are written as follows once, the requests\' notices taken in the same trigger' },
  'public.request_lounge_membership': { back: 'taken by a_salon_request_takes_its_notice on lounge_members when the seat is answered or given up', once: 'one seat a member and salon (its key); pushed once a salon (salon_request:<salon>)' },
  'public.approve_lounge_member': { back: 'an admission happened: the member was let in, which a later removal does not undo', once: 'once a seat: approving an approved seat writes nothing' },
  'public.accept_follow_request': { back: 'an acceptance happened; a later unfollow is the follow\'s own (a_follow_takes_its_notice)', once: 'once a request: the request is turned into the follow it accepts' },
  'public.resolve_moderation_report_v2': { back: 'a verdict is the house\'s record to the member, kept with its appeal (MOD: a verdict keeps its appeal)', once: 'once a case: a case judged is refused again (ALREADY_JUDGED)' },
  'public.bulk_dismiss_reports': { back: 'a dismissal told to its reporter is the house\'s record, as the single dismissal\'s is', once: 'once a case: only pending cases are dismissed' },
  'public.lift_sanction': { back: 'a lift is the house\'s record to the member', once: 'once a sanction: a lifted sanction is refused again (NOT_SANCTIONED)' },
  'public.judge_appeal': { back: 'a heard appeal is the house\'s record to the member', once: 'once an appeal: an appeal heard is refused again (ALREADY_JUDGED)' },
  'public.give_back_withheld_piece': { back: 'a piece given back is the house\'s record to its author', once: 'once a piece: a piece given back is no longer withheld' },
  'public.lobby_choose_edition': { back: 'the Lobby\'s edition is the house\'s, turned once a day', once: 'once a day and edition (its own check), and never pushed' },
  'public.notify_on_dossier_certify': { back: 'a legacy table no member writes any more (matrix: insert none)', once: 'as the legacy writer wrote it' },
  'public.notify_on_dossier_comment': { back: 'a legacy table no member writes any more (matrix: insert none)', once: 'as the legacy writer wrote it' },
};

const fn = (name: string, body: string, trigger = '') => `CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END $$;\n${trigger}`;
const trg = (name: string, when: string, table: string, f: string) => `CREATE TRIGGER ${name} ${when} ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.${f}();\n`;

describe('the rules, on planted text', () => {
  it('find every notice writer, and a take-back only where its trigger stands on the cause and deletes notices', () => {
    const sql = fn('tell', "INSERT INTO public.notifications (user_id, message) VALUES (NEW.to, 'x');", trg('tell', 'AFTER INSERT', 't', 'tell'))
      + fn('shared_call', "PERFORM public.dispatch_notify(a, b, 'comment', 'x', '{}', 'g');")
      + fn('unsay', 'DELETE FROM public.notifications WHERE from_user_id = OLD.user_id;', trg('unsay', 'AFTER DELETE', 't', 'unsay'))
      + fn('elsewhere', 'DELETE FROM public.notifications WHERE true;', trg('elsewhere', 'AFTER DELETE', 'u', 'elsewhere'))
      + fn('touch', 'UPDATE public.t SET x = 1;', trg('touch', 'AFTER DELETE', 't', 'touch'));
    const h = read(sql);
    expect(noticeWriters(h)).toEqual(['public.shared_call', 'public.tell']);
    expect(takesBack(h, 'public.tell', 'unsay')).toBe(true);
    expect(takesBack(h, 'public.tell', 'elsewhere')).toBe(false);
    expect(takesBack(h, 'public.tell', 'touch')).toBe(false);
    expect(takesBack(h, 'public.tell', 'missing')).toBe(false);
  });

  it('find a count read from count(*) before its row is locked, and none once it is', () => {
    const counted = (lock: string) => read(fn('recount', `${lock} SELECT count(*) INTO v FROM public.m WHERE r = NEW.r; UPDATE public.r SET member_count = v WHERE id = NEW.r;`));
    expect(countsUnlocked(counted(''))).toEqual(['public.recount']);
    expect(countsUnlocked(counted('PERFORM 1 FROM public.r WHERE id = NEW.r FOR NO KEY UPDATE;'))).toEqual([]);
    expect(countsUnlocked(counted('PERFORM 1 FROM public.r WHERE id = NEW.r FOR UPDATE;'))).toEqual([]);
    // A lock taken after the count is no lock on it.
    expect(countsUnlocked(read(fn('recount', 'SELECT count(*) INTO v FROM public.m; UPDATE public.r SET member_count = v; PERFORM 1 FROM public.r FOR UPDATE;')))).toEqual(['public.recount']);
    // A count of the rows its own statement changed is exact.
    expect(countsUnlocked(read(fn('switch', 'WITH moved AS (UPDATE public.m SET k = 1 RETURNING u) SELECT count(*) INTO v FROM moved; UPDATE public.r SET member_count = v;')))).toEqual([]);
  });

  it('find a count that only climbs, and none once some trigger takes one from it', () => {
    const up = fn('up', 'UPDATE public.p SET certify_count = certify_count + 1 WHERE id = NEW.p;', trg('up', 'AFTER INSERT', 'c', 'up'));
    expect(countsOneWay(read(up))).toEqual(['public.p.certify_count']);
    const down = fn('down', 'UPDATE public.p SET certify_count = GREATEST(0, certify_count - 1) WHERE id = OLD.p;', trg('down', 'AFTER DELETE', 'c', 'down'));
    expect(countsOneWay(read(up + down))).toEqual([]);
    // Taken from another table's count is not this one's.
    expect(countsOneWay(read(up + down.split('UPDATE public.p').join('UPDATE public.q')))).toEqual(['public.p.certify_count', 'public.q.certify_count']);
    // An upsert's climb counts its table, and is seen.
    const upsert = fn('keep', 'INSERT INTO public.k AS c (id, critique_count) VALUES (NEW.id, 1) ON CONFLICT (id) DO UPDATE SET critique_count = c.critique_count + 1;', trg('keep', 'AFTER INSERT', 'c', 'keep'));
    expect(countsOneWay(read(upsert))).toEqual(['public.k.critique_count']);
    // A row's own count, moved by its own trigger.
    expect(countsOneWay(read(fn('own', 'NEW.total_count := COALESCE(NEW.total_count, 0) + 1;', trg('own', 'BEFORE UPDATE', 'r', 'own'))))).toEqual(['public.r.total_count']);
  });
});

describe('every notice and every count, in the house as production will hold it', () => {
  const h = read();

  it('reads the writers aPushCarriesNoPrivateWords reads, and those the pending cars add', () => {
    const writers = noticeWriters(h);
    for (const w of ['public.notify_on_interaction', 'public.dispatch_notify_critique', 'public.request_lounge_membership', 'public.judge_appeal']) expect(writers).toContain(w);
  });

  it('lists every notice writer with what takes its notice back, or why it stands, and what tells it once', () => {
    const writers = noticeWriters(h);
    expect({ unlisted: writers.filter((w) => !(w in WRITERS)), stale: Object.keys(WRITERS).filter((w) => !writers.includes(w)) }).toEqual({ unlisted: [], stale: [] });
    const missing = Object.entries(WRITERS).flatMap(([w, j]) => (Array.isArray(j.back) ? j.back : []).filter((t) => !takesBack(h, w, t)).map((t) => `${w}: ${t}`));
    expect(missing).toEqual([]);
  });

  it('passes every notice through the one gate: refused from a member its reader hid, and hidden on read', () => {
    const gate = [...h.triggers.values()].find((t) => t.table === 'public.notifications' && t.timing === 'BEFORE' && t.events.includes('INSERT')
      && /hidden_authors|is_hidden_by|user_blocks/.test(h.functions.get(t.fn)?.body ?? ''));
    expect(gate?.name).toBe('a_hidden_members_word_is_not_written');
    const hides = [...h.policies.values()].filter((p) => p.table === 'public.notifications' && p.restrictive && p.cmd === 'SELECT' && /hidden_authors|is_hidden_by/.test(p.using ?? ''));
    expect(hides.map((p) => p.name)).toEqual(['notifications_hide_blocked']);
  });

  it('reads every count it sets from count(*) under its row\'s lock', () => {
    expect(countsUnlocked(h)).toEqual([]);
  });

  it('takes from every count a trigger adds to, on the same table', () => {
    expect(countsOneWay(h)).toEqual([]);
  });
});
