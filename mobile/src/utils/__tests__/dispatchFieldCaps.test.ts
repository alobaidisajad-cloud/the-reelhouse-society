/**
 * dispatchFieldCaps.test.ts — the Dispatch, step 2
 * ─────────────────────────────────────────────────
 * An app-side length cap that is LOOSER than the database's CHECK constraint is
 * not a cap at all — it is a promise the member can keep and the database will
 * break. The string travels, the insert fails, and what comes back is a
 * constraint error naming a column they have never heard of, after they pressed
 * FILE, with their words gone.
 *
 * So every cap is reconciled against the constraint that is actually live. The
 * fences are not written down here twice: they are PARSED OUT OF THE MIGRATIONS
 * that created them, so the day someone changes a ceiling in SQL and forgets the
 * app, this fails and names the field.
 *
 * That parse is what makes this test worth having, and it is also the thing most
 * likely to rot silently — so it checks itself first.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MAX_LENGTHS, sanitizeInput } from '../sanitizeInput';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const sql =
  read('supabase/migrations/20260902_01_dispatch_step_one.sql') +
  read('supabase/migrations/20260902_02_dispatch_rename_fallout.sql') +
  read('supabase/migrations/20260902_03_ballot_options_room.sql');

/**
 * The ceilings, keyed by CONSTRAINT NAME rather than by column.
 *
 * Two reasons it cannot be keyed by column. One column can carry two ceilings
 * that are both live under different conditions — `body` is 2000 for any filing
 * and 500 when the kind is a dossier — so collapsing them loses the distinction
 * the app has to honour. And one constraint can be redefined by a later
 * migration: `options_ceiling` is 1200 in step one and 4000 in step three, and
 * only the later one exists. A name is what Postgres itself keys on, so a name
 * is what makes "last definition wins" correct rather than lucky.
 */
const fences: Record<string, { column: string; fence: number }> = {};
for (const m of sql.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK/g)) {
  const tail = sql.slice(m.index!, m.index! + 300);
  const c = tail.match(/char_length\((?:btrim\()?([a-z_]+)(?:::text)?\)?\s*<=\s*(\d+)/);
  if (c) fences[m[1]] = { column: c[1], fence: Number(c[2]) };   // later wins
}

/** field type in MAX_LENGTHS → the constraint it is answering to. */
const MAPPING: Array<{ field: keyof typeof MAX_LENGTHS; constraint: string }> = [
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
  { field: 'critique', constraint: 'critique_ceiling' },
];

describe('the parse of the migrations, before anything is judged against it', () => {
  it('found the ceilings, rather than an empty object that passes everything', () => {
    expect(Object.keys(fences).length).toBeGreaterThanOrEqual(12);
    expect(fences.title_ceiling).toEqual({ column: 'title', fence: 200 });
    expect(fences.essay_ceiling).toEqual({ column: 'full_content', fence: 25000 });
    // the same column, two live ceilings, kept apart
    expect(fences.body_ceiling.fence).toBe(2000);
    expect(fences.excerpt_ceiling.fence).toBe(500);
    expect(fences.body_ceiling.column).toBe(fences.excerpt_ceiling.column);
  });

  it('and a redefined constraint reads as its LAST definition, not its first', () => {
    // options_ceiling is 1200 in step one and 4000 in step three. If this ever
    // reads 1200 the parse has stopped honouring migration order and every
    // ceiling below is being checked against history instead of the database.
    expect(fences.options_ceiling.fence).toBe(4000);
  });

  it('and every constraint this test relies on is really in the SQL', () => {
    for (const { field, constraint } of MAPPING) {
      expect([field, constraint, Boolean(fences[constraint])]).toEqual([field, constraint, true]);
    }
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
    // A single constant here would either refuse 1500 characters a take is
    // entitled to, or let a 2000-character dossier excerpt reach a 500 fence.
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
