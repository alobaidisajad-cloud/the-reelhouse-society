/**
 * A function run as the house keeps the reader's rules (the kinds pass, kind 5: a reader protection
 * kept per surface).
 * ─────────────────────────────────────────────────────────────────────────────
 * A SECURITY DEFINER function reads past every row rule: the hiding of a member the reader blocked or
 * muted (or who blocked them), and the withholding of a piece the Tribunal took down, hold in it only
 * where its author wrote them in again. Each review found one more that had not: a salon's last word
 * counting a hidden member, follower counts with hidden members in them, a withheld piece readable in
 * the old Dispatch tables, a blocked member reading a Watchlist. Here every definer function a member
 * may run, as production will hold it (test-utils/house.js), that reads a table of members' words or
 * acts is held to both rules:
 *   - it names the hiding rule (hidden_authors, is_hidden_by, can_view_user_data, members_blocking_me,
 *     audience_allows, or user_blocks itself), or is judged below;
 *   - where it reads a table that can hold a withheld piece, it names withheld_at (or piece_stands), or
 *     is judged below.
 * A judgment names why: the caller's own rows alone, the staff's alone, or a total that names no one.
 * Checked on planted text first, so it is seen to say no.
 */
import { read, membersRun, type House } from '@/test-utils/house';

/** Tables of members' words or acts that another member may read. */
const WORDS = ['logs', 'lists', 'list_items', 'log_comments', 'list_comments', 'dispatch_posts', 'dispatch_comments', 'lounge_messages',
  'interactions', 'watchlists', 'physical_archive', 'dispatch_certifications', 'lounge_message_reactions', 'viewings'];
/** Tables a withheld piece can stand in (a withheld_at column). */
const WITHHELD = ['logs', 'lists', 'log_comments', 'list_comments', 'dispatch_posts', 'dispatch_comments'];
const HIDING = /\b(?:hidden_authors|is_hidden_by|can_view_user_data|members_blocking_me|audience_allows)\s*\(|\buser_blocks\b/i;
const WITHHOLDING = /\bwithheld_at\b|\bpiece_stands\s*\(/i;

const readsOf = (body: string) => WORDS.filter((t) => new RegExp(String.raw`\b(?:FROM|JOIN)\s+(?:public\.)?${t}\b`, 'i').test(body));

/** A function only the staff may run through: it refuses any caller but an admin, who reads every piece to judge it. */
const STAFF_ONLY = /\bIF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:public\.)?profiles\s+WHERE\s+id\s*=\s*[\w.]+(?:\(\))?\s+AND\s+role\s*=\s*'admin'\s*\)\s*THEN\s+RAISE/i;

/** Whether the admin door stands before everything else the function does: in no branch (no ELSE before it). */
const staffOnly = (body: string) => {
  const m = STAFF_ONLY.exec(body);
  return !!m && !/\bELSE\b/i.test(body.slice(0, m.index));
};

/**
 * Each member-run definer function that reads members' words with a rule unnamed: "name: hiding" or
 * "name: withheld". The staff's own functions are left out.
 */
export function unkept(h: House): string[] {
  return [...h.functions.values()].filter((f) => f.definer && !f.returnsTrigger && membersRun(h, f.name) && !staffOnly(f.body)).flatMap((f) => {
    const reads = readsOf(f.body);
    if (!reads.length) return [];
    const out: string[] = [];
    if (!HIDING.test(f.body)) out.push(`${f.name}: hiding`);
    if (reads.some((t) => WITHHELD.includes(t)) && !WITHHOLDING.test(f.body)) out.push(`${f.name}: withheld`);
    return out;
  }).sort();
}

const OWN = 'reads the caller\'s own rows alone (by auth.uid()), which no rule hides from their author';
const STAFF = 'the staff\'s alone (it refuses any caller but an admin), who read every piece to judge it';

/** Each rule a function leaves unnamed, with why it may. */
const JUDGED: Record<string, string> = {
  'public.accept_follow_request: hiding': 'a request made to the caller; a block between the two has already taken it (sever_follows_on_block)',
  'public.decline_follow_request: hiding': 'a request made to the caller, which they turn away',
  'public.decline_all_follow_requests: hiding': 'the requests made to the caller, which they turn away',
  'public.delete_list_cascade: hiding': `${OWN}: the caller's own stack and what hangs from it`,
  'public.delete_list_cascade: withheld': `${OWN}: deleting a stack of theirs, withheld or not`,
  'public.dispatch_door: hiding': `${OWN}: how many films the caller has logged`,
  'public.dispatch_door: withheld': `${OWN}: a count of the caller's own records`,
  'public.may_file: hiding': `${OWN}: how many films the caller has logged`,
  'public.may_file: withheld': `${OWN}: a count of the caller's own records`,
  'public.end_filing: hiding': `${OWN}, or ${STAFF}`,
  'public.end_filing: withheld': `${OWN}, or ${STAFF}`,
  'public.get_marks_ledger: withheld': `${OWN}: the caller's own marks, a withheld record of theirs still theirs to see`,
  'public.request_account_deletion: hiding': `${OWN}: the closing member's own words`,
  'public.request_account_deletion: withheld': `${OWN}: the closing member's own words, withheld or not`,
  'private.logs_seen_again_in: hiding': 'returns record ids alone, never words: read only inside private.viewings_between, which reads those records as the member, under the records\' own rules; in private, which the API never serves',
  'private.logs_seen_again_in: withheld': 'as above: private.viewings_between asks the withheld rule of each record it reads by those ids',
  'public.submit_report: hiding':'a report is made of words the reporter saw; it reads the piece reported to keep its words as reported, and returns none of them',
  'public.submit_report: withheld': 'as above: a piece already withheld is reported as it stands, its words kept for the Tribunal',
  'public.toggle_dossier_certify: hiding': 'the certification\'s own insert is refused across a block (refuse_across_a_block on dispatch_certifications)',
  'public.viewing_note_remove: hiding': `${OWN}: a note on a viewing of the caller's own record`,
  'public.viewing_note_remove: withheld': `${OWN}: a note on the caller's own record`,
  'public.withdraw_lounge_message: hiding': `${OWN}: the caller withdrawing their own message`,
  'private.a_withheld_piece_holds_it: hiding': 'the withholding rule itself, asked by the row rules: it answers only whether a piece is withheld',
};

const fn = (name: string, body: string, grant = true) => `CREATE FUNCTION ${name}(p uuid) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ ${body} $$;\n${grant ? `GRANT ALL ON FUNCTION ${name}(p uuid) TO authenticated;\n` : ''}`;

describe('the rule, on planted text', () => {
  it('says no to a definer read of members\' words that names neither rule, and yes once it names both', () => {
    expect(unkept(read(fn('public.count_them', 'SELECT count(*) FROM public.dispatch_comments c WHERE c.post_id = p')))).toEqual(['public.count_them: hiding', 'public.count_them: withheld']);
    expect(unkept(read(fn('public.count_them', 'SELECT count(*) FROM public.dispatch_comments c WHERE c.post_id = p AND c.withheld_at IS NULL AND NOT (c.user_id = ANY ((SELECT private.hidden_authors())::uuid[]))')))).toEqual([]);
    // A table that holds no withheld piece asks only the hiding rule.
    expect(unkept(read(fn('public.faces', 'SELECT count(*) FROM public.lounge_messages m WHERE m.lounge_id = p')))).toEqual(['public.faces: hiding']);
  });

  it('asks it only of a definer a member may run that reads members\' words', () => {
    expect(unkept(read(fn('public.count_them', 'SELECT count(*) FROM public.dispatch_comments c', false)))).toEqual([]);
    expect(unkept(read(fn('public.count_them', 'SELECT count(*) FROM public.dispatch_comments c').split('SECURITY DEFINER').join('')))).toEqual([]);
    expect(unkept(read(fn('public.my_role', 'SELECT role FROM public.profiles WHERE id = auth.uid()')))).toEqual([]);
    const staff = "BEGIN IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'no'; END IF; PERFORM count(*) FROM public.dispatch_comments; END";
    expect(unkept(read(fn('public.judge', staff).split('LANGUAGE sql').join('LANGUAGE plpgsql')))).toEqual([]);
    // A staff door in one branch leaves the other branch a member's.
    expect(unkept(read(fn('public.judge', staff.split('BEGIN IF NOT').join("BEGIN IF p IS NULL THEN PERFORM 1; ELSE IF NOT").split('END IF; PERFORM').join('END IF; END IF; PERFORM')).split('LANGUAGE sql').join('LANGUAGE plpgsql')))).toEqual(['public.judge: hiding', 'public.judge: withheld']);
    // A mention of the admin role that refuses no one is no staff door.
    expect(unkept(read(fn('public.judge', "SELECT count(*) FROM public.dispatch_comments c WHERE c.post_id = p OR 'admin' = 'admin'")))).toEqual(['public.judge: hiding', 'public.judge: withheld']);
  });
});

describe('every definer function a member may run, as production will hold it', () => {
  const h = read();
  const found = unkept(h);

  it('reads the definer functions the reviews fixed, each now naming its rules', () => {
    for (const f of ['public.get_profile_counts', 'public.get_lounge_unread_counts', 'public.search_logs']) {
      expect(h.functions.get(f)?.definer || !h.functions.has(f)).toBe(true);
      expect(found.filter((x) => x.startsWith(`${f}:`))).toEqual([]);
    }
  });

  it('names the hiding rule and the withheld rule in each that reads members\' words, or is judged why it need not', () => {
    expect({ unjudged: found.filter((x) => !(x in JUDGED)), stale: Object.keys(JUDGED).filter((x) => !found.includes(x)) }).toEqual({ unjudged: [], stale: [] });
  });
});
