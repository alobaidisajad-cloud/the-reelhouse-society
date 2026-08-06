/**
 * queueErrorClassification.test.ts — #77, the word match that hid a data loss
 * ─────────────────────────────────────────────────────────────────────────
 * The queue decided "this already synced, drop it" by looking for the word "unique"
 * anywhere in an error message. PostgreSQL's 42P10 reads:
 *
 *     "there is no unique or exclusion constraint matching the ON CONFLICT specification"
 *
 * `interactions` has no unique constraint on (user_id, target_user_id, type) — probed
 * against production and confirmed. So EVERY offline follow raised 42P10, matched the
 * word, and was filed as already-synced: discarded with no dead-letter, no toast and no
 * Sentry event. The optimistic follow sat on screen until the next hydrate erased it.
 *
 * The register struck this finding as a false positive. It is real; the retraction had
 * answered a different question (whether follows QUEUE — they do) than the finding
 * asked (what happens when they FLUSH).
 *
 * These tests pin the classifier itself. The exact 42P10 string below is the one the
 * live database returned, copied verbatim.
 */
import { classifyQueueError as classify } from '../offlineQueue';

const PG_42P10 = 'there is no unique or exclusion constraint matching the ON CONFLICT specification';
const PG_23505 = 'duplicate key value violates unique constraint "logs_user_id_film_id_key"';

describe('the error that caused this', () => {
  it('42P10 is a SCHEMA fault, never "already synced"', () => {
    expect(classify('42P10', PG_42P10, undefined)).toBe('schema');
  });

  it('it is classified that way even though its text says "unique"', () => {
    // The whole defect in one assertion.
    expect(PG_42P10).toContain('unique');
    expect(classify('42P10', PG_42P10, undefined)).not.toBe('duplicate');
  });
});

describe('genuine duplicates are still dropped', () => {
  it('23505 by code', () => {
    expect(classify('23505', PG_23505, undefined)).toBe('duplicate');
  });

  it('409 by status, for transports that lose the code', () => {
    expect(classify('', 'conflict', 409)).toBe('duplicate');
  });

  it("PostgreSQL's actual duplicate wording, as a fallback", () => {
    expect(classify('', PG_23505, undefined)).toBe('duplicate');
  });

  it('but NOT any prose that merely mentions the word unique', () => {
    // This is what let 42P10 through, and would have let the next one through too.
    expect(classify('', 'could not create unique index concurrently', undefined)).not.toBe('duplicate');
    expect(classify('', 'the unique constraint is missing', undefined)).not.toBe('duplicate');
  });
});

describe('other 42xxx statement faults get the same loud treatment', () => {
  it.each([
    ['42703', 'column "positon" does not exist'],
    ['42P01', 'relation "intercations" does not exist'],
    ['42883', 'function public.replace_list_items(uuid) does not exist'],
    ['42601', 'syntax error at or near "FROM"'],
  ])('%s is a schema fault', (code, msg) => {
    expect(classify(code, msg, undefined)).toBe('schema');
  });

  it('42501 is NOT — an RLS refusal is a legitimate runtime outcome', () => {
    // A banned member, or a row that is not yours. Dead-lettering every one of those
    // as a "schema fault" would fill the report with normal behaviour.
    expect(classify('42501', 'new row violates row-level security policy', undefined)).not.toBe('schema');
  });
});

describe('everything else is left to the paths that already handle it', () => {
  it('an ordinary failure is neither', () => {
    const r = classify('', 'boom', undefined);
    expect(r).not.toBe('schema');
    expect(r).not.toBe('duplicate');
  });

  it('a missing code does not accidentally look like class 42', () => {
    expect(classify('undefined', 'boom', undefined)).toBe('other');
    expect(classify('', '', undefined)).toBe('other');
  });
});
