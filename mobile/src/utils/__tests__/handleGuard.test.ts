/**
 * handleGuard.test.ts — #67, five of thirty-two members could not be followed
 * ─────────────────────────────────────────────────────────────────────────
 * The follow path gated username lookups on `^[a-zA-Z0-9_]{1,30}$`. That charset was
 * the app's INTENDED signup policy, not what `profiles.username` actually holds — and
 * the database holds five handles it rejects. Their profiles loaded, the Follow button
 * rendered, and tapping it failed with an error no amount of retrying could fix.
 *
 * The first block is the point of the fix: it is the live roster, and every handle on
 * it must resolve.
 *
 * The rest pin the deliberate inversion — this guard names what is UNSAFE rather than
 * allowlisting what is expected, because the defect WAS an allowlist that did not match
 * reality, and a wider allowlist only postpones the same failure.
 *
 * Every hostile input below is written as an escape, never as a pasted glyph: control
 * and zero-width characters do not survive editing, and a test that silently loses its
 * payload passes for the wrong reason. This file has already been bitten by that once.
 */
import { isLookupSafeHandle } from '../handleGuard';

/**
 * Every username on the live database, read from production on 2026-08-06.
 * Public data — these are the handles rendered on every profile in the app.
 */
const LIVE_HANDLES = [
  'alobaidisajad', 'test_agent_1772958016439', 'sajad.s.alobaidi', 'saleel.house',
  'saleel.sjs', 'saleelsaleel555@gmail.com', 'ug.mb', 'morpho', 'sajjadobaidi',
  'banen', 'maybeelamis', 'malal', 'malal1', 'dividbyzero', 'divisionops', 'one',
];

/** The five the old guard rejected — the entire finding, by name. */
const PREVIOUSLY_BLOCKED = [
  'sajad.s.alobaidi', 'saleel.house', 'saleel.sjs', 'saleelsaleel555@gmail.com', 'ug.mb',
];

const OLD_GUARD = /^[a-zA-Z0-9_]{1,30}$/;

describe('every live member can be looked up', () => {
  it.each(LIVE_HANDLES)('accepts %s', (handle) => {
    expect(isLookupSafeHandle(handle)).toBe(true);
  });

  it('accepts all five the old charset rejected — this IS #67', () => {
    for (const handle of PREVIOUSLY_BLOCKED) {
      expect(OLD_GUARD.test(handle)).toBe(false);      // the old guard blocked it…
      expect(isLookupSafeHandle(handle)).toBe(true);   // …this one does not
    }
  });

  it('is a strict WIDENING — nothing that worked before can stop working', () => {
    // The zero-negative-effect property, asserted rather than claimed: everything the
    // old allowlist accepted is still accepted, so no member can be newly locked out.
    const samples = [
      'a', 'A', '0', '_', 'morpho', 'MORPHO', 'user_123', 'a'.repeat(30),
      ...LIVE_HANDLES,
    ];
    for (const s of samples) {
      if (OLD_GUARD.test(s)) expect(isLookupSafeHandle(s)).toBe(true);
    }
  });
});

describe('what it still refuses, and why each refusal is real', () => {
  it('rejects nothing at all', () => {
    expect(isLookupSafeHandle('')).toBe(false);
    expect(isLookupSafeHandle('   ')).toBe(false);
    expect(isLookupSafeHandle(null)).toBe(false);
    expect(isLookupSafeHandle(undefined)).toBe(false);
    expect(isLookupSafeHandle(12345 as never)).toBe(false);
  });

  it('rejects whitespace — no handle has any, and it smuggles values across boundaries', () => {
    expect(isLookupSafeHandle('has space')).toBe(false);
    expect(isLookupSafeHandle('tab\there')).toBe(false);
    expect(isLookupSafeHandle('newline\nhere')).toBe(false);
    expect(isLookupSafeHandle('carriage\rreturn')).toBe(false);
    expect(isLookupSafeHandle('trailing ')).toBe(false);
    expect(isLookupSafeHandle(' leading')).toBe(false);
  });

  it('rejects control characters, asserted by codepoint', () => {
    // Deliberately NOT combined with a space: an earlier version read 'null byte',
    // which passed on the whitespace rule and proved nothing about control characters.
    const controls = ['\u0000', '\u0007', '\u001b', '\u001f', '\u007f'];
    for (const ch of controls) {
      expect(isLookupSafeHandle('mor' + ch + 'pho')).toBe(false);
    }
  });

  it('rejects zero-width and bidi characters — the homograph vector', () => {
    // Two handles that look identical but resolve to different members is exactly what
    // the sanitiser exists to prevent, and a lookup is the moment it matters.
    const vectors = ['\u200B', '‌', '‍', '\u200E', '\u200F',
                     '\u202A', '\u202E', '\u2066', '\u2069', '\uFEFF', '\u00AD', '\u034F'];
    for (const ch of vectors) {
      expect(isLookupSafeHandle('mor' + ch + 'pho')).toBe(false);
    }
  });

  it('rejects an absurd payload but accepts a generous real one', () => {
    expect(isLookupSafeHandle('a'.repeat(64))).toBe(true);
    expect(isLookupSafeHandle('a'.repeat(65))).toBe(false);
    expect(isLookupSafeHandle('a'.repeat(10000))).toBe(false);
  });

  it('does NOT reject the letter s — the regex was once mangled into matching it', () => {
    // A shell-escaping slip briefly turned the whitespace class into /[s...]/, which
    // would have blocked every handle containing an "s" — four of the five this fix
    // exists for. Cheap test, catastrophic bug.
    expect(isLookupSafeHandle('s')).toBe(true);
    expect(isLookupSafeHandle('sajjadobaidi')).toBe(true);
    expect(isLookupSafeHandle('saleel.house')).toBe(true);
  });
});

describe('the guard is stateless across calls', () => {
  it('gives the same answer every time for the same input', () => {
    // The invisible-character class is shared with the sanitiser, where it carries /g.
    // `.test()` on a global regex advances lastIndex and returns alternating answers,
    // so the guard builds its own non-global copy. This is that hazard, pinned.
    for (let i = 0; i < 10; i++) {
      expect(isLookupSafeHandle('mor\u200Bpho')).toBe(false);
      expect(isLookupSafeHandle('morpho')).toBe(true);
      expect(isLookupSafeHandle('sajad.s.alobaidi')).toBe(true);
    }
  });
});
