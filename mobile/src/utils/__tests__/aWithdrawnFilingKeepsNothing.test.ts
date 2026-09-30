/**
 * aWithdrawnFilingKeepsNothing.test.ts — what ending a filing empties, decided once.
 *
 * A withdrawn filing keeps its row, so the critiques under it survive, and is
 * emptied, so the API does not go on serving what the member took down. The
 * emptying was written out twice (end_filing, and the no_hard_delete trigger the
 * Tribunal's DELETE runs into), and both lists predated `subject_backdrop` and
 * `source_url`: a withdrawn filing's cover and link stayed readable by anyone
 * holding the anon key. 20260930_02 made ONE erase, dispatch_empty_filing.
 *
 * This reads the snapshot of production (kept true by `npm run schema:check`)
 * and holds every column of dispatch_posts to a decision: emptied, or kept for
 * a reason written here. A column added without that decision fails, which is
 * how the two above slipped through. The rehearsal that proves the erase on the
 * live rules is mobile/supabase/diagnostics/withdrawn_filing_rehearsal.sql.
 */
import * as fs from 'fs';
import * as path from 'path';

const snapshot = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8');

const tableColumns = (name: string): string[] => {
  const at = snapshot.indexOf(`CREATE TABLE public.${name} (`);
  const body = snapshot.slice(at, snapshot.indexOf('\n);', at));
  return [...body.matchAll(/^ {4}([a-z_]+) [a-z]/gm)].map((m) => m[1]);
};
const functionBody = (name: string): string => {
  const at = snapshot.indexOf(`CREATE FUNCTION public.${name}(`);
  if (at === -1) return '';
  const open = snapshot.indexOf('$$', at);
  return snapshot.slice(open + 2, snapshot.indexOf('$$', open + 2));
};
const policy = (name: string, table: string): string => {
  const at = snapshot.indexOf(`CREATE POLICY ${name} ON public.${table} `);
  return at === -1 ? '' : snapshot.slice(at, snapshot.indexOf(';\n', at));
};

/** Emptied when a filing ends: the member's own words, images and links. */
const ERASED = [
  'body', 'full_content', 'title', 'subject_image', 'subject_backdrop',
  'source', 'source_url', 'spoiler_label',
];

/** Kept when a filing ends, each for a reason. */
const KEPT: Record<string, string> = {
  id: 'the room the critiques stay in',
  kind: 'the room the critiques stay in',
  user_id: 'the author may still see it is theirs; SET NULL when they leave',
  author_username: 'NOT NULL; derived from profiles, not written by the member',
  subject_kind: 'what it was about: the catalogue’s fact, not the member’s words',
  subject_id: 'what it was about',
  subject_title: 'what it was about',
  subject_sub: 'what it was about',
  options: 'a ballot’s films, from the catalogue',
  closes_at: 'a date, and ballot_options requires it',
  frozen_totals: 'the count of votes, not anyone’s words; a withdrawn ballot is never frozen',
  answer_id: 'points at a critique, which survives',
  series_id: 'the SeriesPicker counts ended parts, so the next part is not numbered twice',
  series_title: 'shared with the other parts of the series',
  part_number: 'the SeriesPicker counts ended parts',
  withheld_at: 'the house’s record',
  ended_at: 'IS the ending',
  ended_by: 'IS the ending',
  is_published: 'the house’s record',
  certify_count: 'the members’ acts, not the author’s',
  comment_count: 'the critiques, which survive',
  created_at: 'orders the paper',
  updated_at: 'the house’s record',
  edited_at: 'the house’s record',
};

describe('the parse of the snapshot, before anything is judged against it', () => {
  it('found the table and its functions, rather than empty strings that pass everything', () => {
    const cols = tableColumns('dispatch_posts');
    expect(cols.length).toBeGreaterThanOrEqual(30);
    expect(cols).toEqual(expect.arrayContaining(['id', 'body', 'subject_backdrop', 'source_url']));
    expect(functionBody('dispatch_empty_filing')).toMatch(/UPDATE public\.dispatch_posts/);
    expect(functionBody('end_filing')).toMatch(/not yours/);
  });
});

describe('every column of a filing is decided', () => {
  const cols = tableColumns('dispatch_posts');

  it('is either emptied or kept for a reason', () => {
    const undecided = cols.filter((c) => !ERASED.includes(c) && !(c in KEPT));
    expect(undecided).toEqual([]);
  });

  it('is not both, and names no column the table does not have', () => {
    expect(ERASED.filter((c) => c in KEPT)).toEqual([]);
    expect([...ERASED, ...Object.keys(KEPT)].filter((c) => !cols.includes(c))).toEqual([]);
  });
});

describe('the erase is one, and it empties exactly the emptied columns', () => {
  const erase = functionBody('dispatch_empty_filing');
  const set = erase.slice(erase.indexOf('SET'), erase.indexOf('WHERE'));
  const assigned = [...set.matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]);

  it('assigns every emptied column, and ends the filing', () => {
    expect([...assigned].sort()).toEqual([...ERASED, 'ended_at', 'ended_by'].sort());
  });

  it('empties them: a blank body, and nothing in the rest', () => {
    for (const c of ERASED) {
      expect(set).toMatch(new RegExp(`\\b${c} = ${c === 'body' ? "''" : 'NULL'}`));
    }
  });

  it('is what both ways of ending call, and neither keeps a list of its own', () => {
    for (const fn of ['end_filing', 'dispatch_no_hard_delete']) {
      const body = functionBody(fn);
      expect(body).toMatch(/PERFORM public\.dispatch_empty_filing\(/);
      expect(body).not.toMatch(/UPDATE public\.dispatch_posts/);
    }
  });

  it('no role may call it directly', () => {
    expect(snapshot).toMatch(/REVOKE ALL ON FUNCTION public\.dispatch_empty_filing\(p_post uuid, p_by text\) FROM PUBLIC;/);
    expect(snapshot).not.toMatch(/GRANT \w+ ON FUNCTION public\.dispatch_empty_filing\([^)]*\) TO (anon|authenticated);/);
  });
});

describe('an ended filing takes no more acts', () => {
  it('no critique, certification or vote on it', () => {
    expect(policy('critiques_open_post', 'dispatch_comments')).toMatch(/ended_at IS NULL/);
    expect(policy('certs_open_post', 'dispatch_certifications')).toMatch(/ended_at IS NULL/);
    expect(policy('votes_still_open', 'dispatch_votes')).toMatch(/ended_at IS NULL/);
  });

  it('a withdrawn ballot is never frozen, so no voter is told it closed', () => {
    expect(functionBody('freeze_closed_ballots')).toMatch(/ended_at IS NULL/);
  });
});
