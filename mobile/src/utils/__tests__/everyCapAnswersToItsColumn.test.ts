/**
 * everyCapAnswersToItsColumn.test.ts — every length the app allows is one the
 * database takes.
 * ─────────────────────────────────────────────────────────────────────────────
 * A cap LOOSER than its column's CHECK is a promise the database breaks: the
 * member types to the end of the box, presses send, and is refused with an
 * error naming a column. A cap TIGHTER than the column cuts their words in
 * silence — a salon's name lost ten characters that way, because one number in
 * four said 50 while the box, the counter and the column said 60.
 *
 * dispatchFieldCaps holds the Dispatch's caps against its tables. This holds
 * every other cap in MAX_LENGTHS, read from the same place: the snapshot of
 * production, which `npm run schema:check` keeps true. Nothing here is a number
 * typed from memory — the column's limit is parsed, and a cap smaller than its
 * column must say why.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAX_LENGTHS } from '../sanitizeInput';

const SNAPSHOT = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'schema', 'live-schema.sql'), 'utf8');

/** Every `char_length(column) <= n` CHECK in the snapshot, by constraint name. */
const LIMITS = new Map<string, { table: string; column: string; limit: number }>();
for (const t of SNAPSHOT.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)) {
  for (const c of t[2].matchAll(/CONSTRAINT (\w+) CHECK \(\(char_length\((\w+)\) <= (\d+)\)\)/g)) {
    LIMITS.set(c[1], { table: t[1], column: c[2], limit: Number(c[3]) });
  }
}

type Answer =
  | { constraint: string; smaller?: string }
  | { dispatch: true }
  | { noColumn: string };

/**
 * Each cap, and the column it answers to. A cap smaller than its column names
 * the reason it is smaller; a cap with no column of its own says where it lands.
 */
const ANSWERS: Record<keyof typeof MAX_LENGTHS, Answer> = {
  review: { constraint: 'logs_review_len' },
  loungeMessage: { constraint: 'lounge_messages_content_len' },
  bio: { constraint: 'profiles_bio_len' },
  listTitle: { constraint: 'lists_title_len' },
  listDescription: { constraint: 'lists_description_len' },
  listComment: { constraint: 'list_comments_content_len' },
  logComment: { constraint: 'log_comments_body_len' },
  // older builds' queued critiques replay through the legacy dossier view
  dossierComment: { constraint: 'dossier_comments_body_len' },
  loungeName: { constraint: 'lounges_name_len' },
  username: { constraint: 'profiles_username_len', smaller: 'a handle is at most 30 by enforce_username_policy; the column holds 100' },
  displayName: { constraint: 'profiles_display_name_len' },
  persona: { constraint: 'profiles_persona_len' },
  linkTitle: { noColumn: 'a link\'s title is one field inside profiles.social_links (jsonb, 4000 in all)' },
  reportDetails: { constraint: 'reports_details_len' },
  dossierTitle: { constraint: 'dispatch_dossiers_title_len' },
  dossierExcerpt: { constraint: 'dispatch_dossiers_excerpt_len' },
  dossierContent: { constraint: 'dispatch_dossiers_full_content_len' },
  loungeShareTitle: { constraint: 'lounge_messages_film_title_len', smaller: 'a shared card shows two lines of it; the column holds 300' },
  filingTitle: { dispatch: true },
  filingBody: { dispatch: true },
  filingExcerpt: { dispatch: true },
  filingEssay: { dispatch: true },
  wireSource: { dispatch: true },
  sourceUrl: { dispatch: true },
  spoilerLabel: { dispatch: true },
  seriesTitle: { dispatch: true },
  subjectTitle: { dispatch: true },
  subjectSub: { dispatch: true },
  subjectImage: { dispatch: true },
  subjectBackdrop: { dispatch: true },
  ballotOption: { dispatch: true },
  critique: { dispatch: true },
};

describe('the snapshot is read, before anything is judged against it', () => {
  it('found the column limits, rather than an empty map that passes everything', () => {
    expect(LIMITS.size).toBeGreaterThan(80);
    expect(LIMITS.get('lounges_name_len')).toEqual({ table: 'lounges', column: 'name', limit: 60 });
    expect(LIMITS.get('profiles_bio_len')).toEqual({ table: 'profiles', column: 'bio', limit: 160 });
  });
});

describe('every cap answers to its column', () => {
  it('every cap in MAX_LENGTHS is accounted for here — a new cap fails until it is', () => {
    expect(Object.keys(MAX_LENGTHS).filter((k) => !(k in ANSWERS))).toEqual([]);
    expect(Object.keys(ANSWERS).filter((k) => !(k in MAX_LENGTHS))).toEqual([]);
  });

  it('each named constraint is really in the database', () => {
    const missing = Object.entries(ANSWERS)
      .filter(([, a]) => 'constraint' in a && !LIMITS.has(a.constraint))
      .map(([k, a]) => `${k}: ${(a as { constraint: string }).constraint}`);
    expect(missing).toEqual([]);
  });

  it('no cap is looser than its column — the database would refuse what the box allowed', () => {
    const looser = Object.entries(ANSWERS)
      .filter(([, a]) => 'constraint' in a)
      .map(([k, a]) => [k, MAX_LENGTHS[k as keyof typeof MAX_LENGTHS], LIMITS.get((a as { constraint: string }).constraint)!.limit] as const)
      .filter(([, cap, limit]) => cap > limit)
      .map(([k, cap, limit]) => `${k}: ${cap} > ${limit}`);
    expect(looser).toEqual([]);
  });

  it('no cap is tighter than its column in silence — a smaller one says why', () => {
    const silent = Object.entries(ANSWERS)
      .filter(([, a]) => 'constraint' in a && !(a as { smaller?: string }).smaller)
      .map(([k, a]) => [k, MAX_LENGTHS[k as keyof typeof MAX_LENGTHS], LIMITS.get((a as { constraint: string }).constraint)!.limit] as const)
      .filter(([, cap, limit]) => cap !== limit)
      .map(([k, cap, limit]) => `${k}: ${cap} < ${limit}`);
    expect(silent).toEqual([]);
  });

  it('a cap left to dispatchFieldCaps is one that test really holds', () => {
    const held = fs.readFileSync(path.join(__dirname, 'dispatchFieldCaps.test.ts'), 'utf8');
    const dropped = Object.entries(ANSWERS)
      .filter(([, a]) => 'dispatch' in a)
      .map(([k]) => k)
      .filter((k) => !held.includes(`'${k}'`));
    expect(dropped).toEqual([]);
  });

  it('and a reason given is still true — the cap really is smaller', () => {
    const stale = Object.entries(ANSWERS)
      .filter(([, a]) => 'constraint' in a && (a as { smaller?: string }).smaller)
      .filter(([k, a]) => MAX_LENGTHS[k as keyof typeof MAX_LENGTHS] >= LIMITS.get((a as { constraint: string }).constraint)!.limit)
      .map(([k]) => k);
    expect(stale).toEqual([]);
  });
});
