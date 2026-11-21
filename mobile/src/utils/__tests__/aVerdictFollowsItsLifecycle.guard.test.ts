/**
 * A verdict follows its lifecycle: every way the house moves a case, a piece or a sanction is a
 * transition written below, and each is proven for every actor who may take it and every one who
 * may not (the kinds pass, kind 10: moderation without a lifecycle).
 * ─────────────────────────────────────────────────────────────────────────────
 * Case, piece, sanction and appeal were built verdict by verdict, each for its plain case, so every
 * review found one more missing transition or actor: REMOVE CONTENT refused on every standing filing,
 * a shorter sentence cutting a longer one, an admin hearing their own appeal, the evidence changed
 * before the verdict, and a moderator ruling on a case about themselves. Here:
 *   - the lifecycle is written once (TRANSITIONS): from and to, the function that moves it, and each
 *     actor, allowed or refused, with the rehearsal case (or attack-matrix case) that proves it;
 *   - every function the house will hold (test-utils/house.js) that writes a moderation state (a
 *     report's status, a verdict, an appeal, a lift, a warning, a member's standing, a withheld piece)
 *     is the mover of some transition, so a new path is written into the lifecycle before it ships;
 *   - every proof named exists, word for word, where it is named.
 * Checked on planted text first, so it is seen to say no.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { read, type House } from '@/test-utils/house';

/** A write of a moderation state, by what it moves. */
const STATES: [string, RegExp][] = [
  ['a report', /\b(?:UPDATE\s+(?:public\.)?reports\s+(?:\w+\s+)?SET\b|INSERT\s+INTO\s+(?:public\.)?reports\b|DELETE\s+FROM\s+(?:public\.)?reports\b)/i],
  ['a verdict', /\b(?:UPDATE\s+(?:public\.)?mod_actions\s+(?:\w+\s+)?SET\b|INSERT\s+INTO\s+(?:public\.)?mod_actions\b|DELETE\s+FROM\s+(?:public\.)?mod_actions\b)/i],
  ['a withheld piece', /\b(?:UPDATE\s+(?:public\.)?withheld_pieces\s+(?:\w+\s+)?SET\b|INSERT\s+INTO\s+(?:public\.)?withheld_pieces\b|DELETE\s+FROM\s+(?:public\.)?withheld_pieces\b)|\bSET\s+withheld_at\s*=/i],
  ['a warning', /\b(?:INSERT\s+INTO\s+(?:public\.)?warnings\b|DELETE\s+FROM\s+(?:public\.)?warnings\b)/i],
  ['a member\'s standing', /\bUPDATE\s+(?:public\.)?profiles\s+(?:\w+\s+)?SET\b[^;]*?\b(?:suspended_until|is_banned|warning_count)\s*=/i],
];

/** Each function the house holds that writes a moderation state, with what it moves. */
export function stateWriters(h: House): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of h.functions.values()) {
    const moves = STATES.filter(([, re]) => re.test(f.body)).map(([what]) => what);
    if (moves.length) out.set(f.name, moves);
  }
  return out;
}

/** A proof: a rehearsal's case (its label as the file writes it, quotes doubled) or an attack-matrix case of a function. */
type Proof = { rehearsal: string; case: string } | { matrix: string; case: string };
type Transition = { from: string; to: string; by: string[]; allowed: Record<string, Proof>; refused: Record<string, Proof> };

const R = (rehearsal: string, label: string): Proof => ({ rehearsal: `${rehearsal}_rehearsal.sql`, case: label });
const M = (fn: string, name: string): Proof => ({ matrix: fn, case: name });

/** The lifecycle of a case, a piece and a sanction: each transition, its mover, and each actor's proof. */
const TRANSITIONS: Record<string, Transition> = {
  'a case is reported': {
    from: 'none', to: 'case pending', by: ['public.submit_report'],
    allowed: { 'a member reporting words they saw': R('the_tribunal_reads_the_words_as_reported', 'the reporter reads their own report') },
    refused: { 'a member reporting in another\'s name': M('submit_report', 'a report naming another as its reporter') },
  },
  'a case is judged': {
    from: 'case pending', to: 'case judged', by: ['public.resolve_moderation_report_v2', 'public.standing_from_verdicts'],
    allowed: {
      'a moderator, on another member': R('a_shorter_sentence_never_cuts_a_longer_one', '720 hours on the first case'),
      'a later, shorter sentence never cuts a longer one': R('a_shorter_sentence_never_cuts_a_longer_one', 'the 720 hours still stand'),
      'another moderator, on a case about a moderator': R('a_judge_never_rules_on_their_own_case', 'moderator 2 judges the case about moderator 1'),
    },
    refused: {
      'a member': M('resolve_moderation_report_v2', 'another\'s report'),
      'a moderator, on a case about themselves': R('a_judge_never_rules_on_their_own_case', 'moderator 1 dismisses a case about themselves: refused, as their own'),
      'a second moderator, on a case judged meanwhile': R('a_dismissal_is_recorded_once', 'the one already resolved gains nothing'),
    },
  },
  'cases are dismissed together': {
    from: 'case pending', to: 'case judged', by: ['public.bulk_dismiss_reports'],
    allowed: { 'a moderator, on others\' cases': R('a_bulk_dismissal_tells_each_reporter', 'the three dismissed at once: two closed') },
    refused: {
      'a member': M('bulk_dismiss_reports', 'dismissing another\'s report'),
      'a moderator, on a case about themselves (left pending)': R('a_judge_never_rules_on_their_own_case', 'the case about moderator 1 still waits, for another moderator'),
    },
  },
  'a verdict is appealed': {
    from: 'case judged', to: 'verdict appealed', by: ['public.file_appeal'],
    allowed: { 'the member it is about': R('a_verdict_is_read_whole_and_appealed_once', '2 appeals the suspension') },
    refused: {
      'another member': R('a_verdict_is_read_whole_and_appealed_once', "1 appeals 2''s verdict"),
      'the member, a second time': R('a_verdict_is_read_whole_and_appealed_once', 'a second appeal of it'),
    },
  },
  'an appeal is heard': {
    from: 'verdict appealed', to: 'appeal heard (upheld or overturned)', by: ['public.judge_appeal'],
    allowed: {
      'another moderator, overturning': R('a_verdict_is_read_whole_and_appealed_once', '3 overturns the suspension'),
      'another moderator, upholding': R('a_verdict_is_read_whole_and_appealed_once', '3 upholds it'),
    },
    refused: {
      'the moderator who ruled': R('a_verdict_is_read_whole_and_appealed_once', '4, who ruled, may not hear it'),
      'a moderator the verdict is about': R('a_verdict_is_read_whole_and_appealed_once', '3 may not hear the appeal of a verdict about themselves'),
      'the only moderator, who ruled (the appeal waits)': R('a_removed_piece_waits_for_its_appeal', '4, the only moderator, ruled it: refused, and the appeal waits'),
      'a member': M('judge_appeal', 'an appeal of another moderator\'s verdict'),
    },
  },
  'a sanction is lifted': {
    from: 'sanction standing', to: 'sanction lifted', by: ['public.lift_sanction'],
    allowed: { 'a moderator, on another member': R('a_shorter_sentence_never_cuts_a_longer_one', '4 lifts the suspension') },
    refused: {
      'a member': R('a_shorter_sentence_never_cuts_a_longer_one', 'a member lifts nothing'),
      'a moderator, on their own sanction': R('a_shorter_sentence_never_cuts_a_longer_one', 'an admin lifts no sanction of their own'),
      'anyone, on an exile': R('a_shorter_sentence_never_cuts_a_longer_one', 'an exile is never lifted by hand'),
    },
  },
  'a piece is withheld': {
    from: 'piece standing', to: 'piece withheld', by: ['public.withhold_piece'],
    allowed: { 'a moderator removing content (through the verdict)': R('a_removed_piece_waits_for_its_appeal', 'withheld, not deleted') },
    refused: { 'a member': R('a_removed_piece_is_kept_whole', 'a member writes one') },
  },
  'a withheld piece is given back': {
    from: 'piece withheld', to: 'piece standing', by: ['public.give_back_withheld_piece'],
    allowed: { 'an appeal overturned': R('a_removed_piece_waits_for_its_appeal', '1 reads the log, their critique and the card again') },
    refused: { 'a member': R('a_removed_piece_is_kept_whole', 'a member writes one') },
  },
  'a withheld piece is removed': {
    from: 'piece withheld', to: 'piece removed', by: ['public.delete_withheld_piece'],
    allowed: { 'the hourly job, past 30 days unappealed': R('a_removed_piece_waits_for_its_appeal', 'the hourly job deletes the two') },
    refused: {
      'the hourly job, on a piece under appeal': R('a_removed_piece_waits_for_its_appeal', 'the job, holding it after the appeal, leaves it withheld'),
      'a member': R('a_removed_piece_waits_for_its_appeal', 'the job asks no member: no member may run it'),
    },
  },
};

const MOBILE = join(__dirname, '..', '..', '..');
const proven = (p: Proof): boolean => {
  if ('rehearsal' in p) {
    const text = readFileSync(join(MOBILE, 'supabase', 'diagnostics', p.rehearsal), 'utf8');
    return text.includes(`rh_case('${p.case}'`) || text.includes(`rh_case(${'\n'}  '${p.case}'`);
  }
  const matrix = JSON.parse(readFileSync(join(MOBILE, 'e2e', 'db', 'attack', 'matrix.json'), 'utf8')) as { functions: Record<string, { cases?: { name: string }[] }> };
  return (matrix.functions[p.matrix]?.cases ?? []).some((c) => c.name === p.case);
};

const fn = (name: string, body: string) => `CREATE FUNCTION public.${name}() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN ${body} END $$;\n`;

describe('the rules, on planted text', () => {
  it('find each function that moves a moderation state, and none that only reads one', () => {
    const h = read(fn('reopen', "UPDATE public.reports SET status = 'pending' WHERE id = p;")
      + fn('pardon', 'UPDATE public.profiles SET suspended_until = NULL WHERE id = p;')
      + fn('unwithhold', 'UPDATE public.logs SET withheld_at = NULL WHERE id = p;')
      + fn('peek', 'PERFORM 1 FROM public.reports r WHERE r.status = \'pending\'; UPDATE public.profiles SET bio = \'x\' WHERE id = p;'));
    expect([...stateWriters(h)]).toEqual([['public.reopen', ['a report']], ['public.pardon', ['a member\'s standing']], ['public.unwithhold', ['a withheld piece']]]);
  });

  it('say no to a proof its file does not hold, word for word', () => {
    expect(proven(R('a_judge_never_rules_on_their_own_case', 'moderator 1 dismisses a case about themselves: refused, as their own'))).toBe(true);
    expect(proven(R('a_judge_never_rules_on_their_own_case', 'a case no rehearsal ever ran'))).toBe(false);
    expect(proven(M('judge_appeal', 'an appeal of one\'s own verdict'))).toBe(true);
    expect(proven(M('judge_appeal', 'no such case'))).toBe(false);
  });
});

describe('the lifecycle, against the house as production will hold it', () => {
  const h = read();
  const writers = stateWriters(h);
  const movers = new Set(Object.values(TRANSITIONS).flatMap((t) => t.by));

  it('reads the house\'s moderation paths', () => {
    for (const f of ['public.resolve_moderation_report_v2', 'public.judge_appeal', 'public.lift_sanction', 'public.withhold_piece']) expect(writers.has(f)).toBe(true);
  });

  it('moves every moderation state only by a transition the lifecycle writes', () => {
    const unwritten = [...writers].filter(([f]) => !movers.has(f) && !(f in OUTSIDE)).map(([f, what]) => `${f} (${what.join(', ')})`);
    expect({ unwritten, stale: [...movers, ...Object.keys(OUTSIDE)].filter((f) => !writers.has(f)) }).toEqual({ unwritten: [], stale: [] });
  });

  it('proves every transition for each actor allowed and each refused, where it says', () => {
    const unproven = Object.entries(TRANSITIONS).flatMap(([name, t]) => [...Object.entries(t.allowed), ...Object.entries(t.refused)]
      .filter(([, p]) => !proven(p)).map(([actor]) => `${name}: ${actor}`));
    expect(unproven).toEqual([]);
    for (const [name, t] of Object.entries(TRANSITIONS)) expect([name, Object.keys(t.allowed).length > 0, Object.keys(t.refused).length > 0]).toEqual([name, true, true]);
  });
});

/** Functions that write a moderation state outside the lifecycle of a case, each with why: none now. */
const OUTSIDE: Record<string, string> = {};
