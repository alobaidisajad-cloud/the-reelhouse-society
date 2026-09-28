/**
 * dispatchFieldCaps.test.ts — the Dispatch, step 2
 * ─────────────────────────────────────────────────
 * An app-side length cap that is LOOSER than the database's CHECK constraint is
 * not a cap at all — it is a promise the member can keep and the database will
 * break. The string travels, the insert fails, and what comes back is a
 * constraint error naming a column they have never heard of, after they pressed
 * FILE, with their words gone.
 *
 * So every cap is reconciled against the constraint that is actually live: the
 * fences are PARSED OUT OF THE SNAPSHOT OF PRODUCTION (supabase/schema, kept
 * true by `npm run schema:check`), so a ceiling changed in SQL and not in the
 * app fails here and names the field — and a ceiling ADDED with no app cap fails
 * the completeness test below.
 *
 * That parse is what makes this test worth having, and it is also the thing most
 * likely to rot silently — so it checks itself first.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAX_LENGTHS, sanitizeInput } from '../sanitizeInput';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The CREATE TABLE of each table a member's filing writes, from the live snapshot. */
const snapshot = read('supabase/schema/live-schema.sql');
const tableOf = (name: string) => {
  const at = snapshot.indexOf(`CREATE TABLE public.${name} (`);
  return at === -1 ? '' : snapshot.slice(at, snapshot.indexOf('\n);', at));
};
const sql = tableOf('dispatch_posts') + tableOf('dispatch_comments');

// Keyed by CONSTRAINT, not column: `body` carries two live ceilings (2000, and 500 for a
// dossier), and by column the app's distinction would be lost.
const fences: Record<string, { column: string; fence: number }> = {};
for (const m of sql.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK/g)) {
  // The snapshot prints one constraint per line, so a constraint is read from its own line only.
  const tail = sql.slice(m.index!, sql.indexOf('\n', m.index!));
  // The snapshot prints `char_length(title) <= 200` or `char_length((options)::text) <= 4000`.
  const c = tail.match(/char_length\(\(*(?:btrim\()?\(*([a-z_]+)\)*(?:::text)?\)*\s*<=\s*(\d+)/);
  if (c) fences[m[1]] = { column: c[1], fence: Number(c[2]) };
}

/** Ceilings no member's text is cut to, each with the place that answers to it instead. */
const NOT_A_FIELD_CAP: Record<string, string> = {
  options_ceiling: 'the serialised ballot — "six ballot options at the cap" below',
  frozen_ceiling: 'frozen_totals, written by the server when a ballot closes',
  handle_ceiling: 'author_username, overwritten by the server from profiles (toInsertRow)',
};

/** field type in MAX_LENGTHS → the constraint it is answering to. */
const MAPPING: { field: keyof typeof MAX_LENGTHS; constraint: string }[] = [
  { field: 'filingTitle', constraint: 'title_ceiling' },
  { field: 'filingBody', constraint: 'body_ceiling' },
  { field: 'filingExcerpt', constraint: 'excerpt_ceiling' },
  { field: 'filingEssay', constraint: 'essay_ceiling' },
  { field: 'wireSource', constraint: 'source_ceiling' },
  { field: 'sourceUrl', constraint: 'source_url_ceiling' },
  { field: 'spoilerLabel', constraint: 'spoiler_ceiling' },
  { field: 'seriesTitle', constraint: 'series_title_ceiling' },
  { field: 'subjectTitle', constraint: 'subject_title_ceiling' },
  { field: 'subjectSub', constraint: 'subject_sub_ceiling' },
  { field: 'subjectImage', constraint: 'subject_image_ceiling' },
  { field: 'subjectBackdrop', constraint: 'subject_backdrop_ceiling' },
  { field: 'critique', constraint: 'critique_ceiling' },
];

describe('the parse of the snapshot, before anything is judged against it', () => {
  it('found the ceilings, rather than an empty object that passes everything', () => {
    expect(Object.keys(fences).length).toBeGreaterThanOrEqual(15);
    expect(fences.title_ceiling).toEqual({ column: 'title', fence: 200 });
    expect(fences.essay_ceiling).toEqual({ column: 'full_content', fence: 25000 });
    // the same column, two live ceilings, kept apart
    expect(fences.body_ceiling.fence).toBe(2000);
    expect(fences.excerpt_ceiling.fence).toBe(500);
    expect(fences.body_ceiling.column).toBe(fences.excerpt_ceiling.column);
    // a ceiling on a cast value parses too
    expect(fences.options_ceiling.fence).toBe(4000);
  });

  it('and every constraint this test relies on is really in the SQL', () => {
    for (const { field, constraint } of MAPPING) {
      expect([field, constraint, Boolean(fences[constraint])]).toEqual([field, constraint, true]);
    }
  });

  it('and every ceiling on the two tables has an app cap, or says where it is answered', () => {
    const mapped = new Set(MAPPING.map((m) => m.constraint));
    const unanswered = Object.keys(fences).filter((c) => !mapped.has(c) && !NOT_A_FIELD_CAP[c]);
    expect(unanswered).toEqual([]);
  });
});

describe('no app cap promises more than the database will take', () => {
  it.each(MAPPING)('$field fits $constraint', ({ field, constraint }) => {
    expect(MAX_LENGTHS[field]).toBeLessThanOrEqual(fences[constraint].fence);
  });

  it('and a string cut to the cap really does fit the column', () => {
    // The cap is a number; this is the behaviour. sanitizeInput can return
    // one character FEWER than the cap when the cut would split an emoji, never
    // more — so `<=` is the assertion, in both directions.
    for (const { field, constraint } of MAPPING) {
      const { fence } = fences[constraint];
      const cut = sanitizeInput('a'.repeat(fence + 500), field);
      expect([field, cut.length <= MAX_LENGTHS[field]]).toEqual([field, true]);
      expect([field, cut.length <= fence]).toEqual([field, true]);
    }
  });
});

describe('cleanFiling covers every column it is the last gate for', () => {
  const src = read('src/utils/mutationExecutor.ts');
  const body = src.slice(src.indexOf('function cleanFiling'), src.indexOf('const insertLog'));

  it('was located, and is not an empty slice', () => {
    expect(body).toContain('cap(');
    expect(body.length).toBeGreaterThan(400);
  });

  // critique is excluded because it is a column on dispatch_comments, capped at
  // its own call site in add_critique and update_critique, not by cleanFiling.
  it.each(MAPPING.filter((m) => m.field !== 'critique'))(
    'caps $constraint',
    ({ constraint }) => {
      expect(body).toContain(`cap('${fences[constraint].column}'`);
    },
  );

  it('and walks a ballot\'s options, which are the one field inside a structure', () => {
    expect(body).toContain("sanitizeInput(o2.title, 'ballotOption')");
  });

  it('picks the body\'s cap from the kind rather than fixing one', () => {
    // One constant would refuse a take its 2000, or send a dossier's excerpt past 500.
    expect(body).toMatch(/kind === 'dossier' \? 'filingExcerpt' : 'filingBody'/);
  });
});

describe('six ballot options at the cap still fit the options column', () => {
  it('serialises well inside the fence', () => {
    const option = {
      film_id: 999999,
      title: 'x'.repeat(MAX_LENGTHS.ballotOption),
      poster_path: '/' + 'a'.repeat(31) + '.jpg',
    };
    const worst = JSON.stringify(Array.from({ length: 6 }, () => option)).length;
    const { fence } = fences.options_ceiling;
    expect([worst, fence, worst <= fence]).toEqual([worst, fence, true]);
  });
});
