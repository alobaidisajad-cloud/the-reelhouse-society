/**
 * theSalonNameIsNotCutInSilence.test.ts — ten characters that vanished.
 * ─────────────────────────────────────────────────────────────────────────────
 * Four numbers decide how long a salon's name may be. Three of them said 60:
 *
 *   the input box            maxLength={60}
 *   the counter under it     {name.length}/60
 *   the column               lounges_name_len  CHECK (char_length(name) <= 60)
 *   MAX_LENGTHS.loungeName   50   <- the only one that disagreed
 *
 * So a member typed up to the 60 the app told them they had, and
 * `sanitizeInput` cut the name to 50 on its way to the database. No error, no
 * warning, nothing to notice — the salon was simply created with a shortened
 * name.
 *
 * ── AND THE GUARD THAT SHOULD HAVE CAUGHT IT WAS DEAD ───────────────────────
 * `createLounge` carried `if (trimmedName.length > 50) { toast }` — but
 * `sanitizeInput` runs FIRST and had already trimmed to 50, so that branch
 * could never be true. It read as the protection against an over-long name
 * while being unreachable code standing where the protection should have been.
 *
 * The cap now matches the column, and the branch asks MAX_LENGTHS rather than
 * repeating a number, so it cannot go dead the same way again.
 */
import { sanitizeInput, MAX_LENGTHS } from '../../utils/sanitizeInput';

/** The live ceiling, read off production on 2026-09-12. */
const LOUNGES_NAME_LEN = 60;

describe('a salon name survives the trip to the database', () => {
  it('the cap matches the column — the box and the counter already did', () => {
    expect(MAX_LENGTHS.loungeName).toBe(LOUNGES_NAME_LEN);
  });

  it('a name of exactly the length the app OFFERS is kept whole', () => {
    const typed = 'A'.repeat(60);
    expect(sanitizeInput(typed, 'loungeName')).toHaveLength(60);
  });

  it('the old cap would have eaten ten characters — this is what was happening', () => {
    // Not a hypothetical: 60 in, 50 out, silently.
    const typed = 'A'.repeat(60);
    expect(typed.slice(0, 50)).toHaveLength(50);
    expect(sanitizeInput(typed, 'loungeName').length).toBeGreaterThan(50);
  });

  it('still refuses more than the column will take', () => {
    const tooLong = 'A'.repeat(200);
    expect(sanitizeInput(tooLong, 'loungeName').length).toBeLessThanOrEqual(LOUNGES_NAME_LEN);
  });

  it('the createLounge length check is not a repeated NUMBER', () => {
    // A literal there is how the branch went dead: sanitizeInput trimmed to the
    // cap, and a hardcoded comparison against a different number could never
    // fire. Asking MAX_LENGTHS keeps the two in step by construction.
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'lounge.ts'), 'utf8',
    );
    expect(src).toMatch(/trimmedName\.length > MAX_LENGTHS\.loungeName/);
    expect(src).not.toMatch(/trimmedName\.length > \d+/);
  });
});
