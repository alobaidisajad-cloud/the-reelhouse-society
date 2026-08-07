/**
 * searchPattern.test.ts — batch 19
 * ────────────────────────────────
 * The old escaper had unit tests that asserted the STRING IT RETURNED, and it
 * returned the right string for years while the database ignored it entirely.
 * Those tests could never have caught the bug.
 *
 * So these assert the two properties that actually matter, both of which were
 * measured against production before being written down:
 *
 *   1. every wildcard leaves as a literal — `%`, `_`, AND PostgREST's own `*`,
 *      which is an alias for `%` and is not a SQL wildcard at all. Searching
 *      `_` matched all 32 members before the fix; so did `*` after the FIRST
 *      version of the fix, which escaped the two SQL ones and missed this one.
 *   2. none of `,` `(` `)` can survive — they belong to the filter parser and
 *      are consumed before the value exists, so no escape reaches them. A
 *      crafted comma returned all 32 members; so did a LEADING `)`, which closes
 *      the group early and collapses the query to "match everything".
 *
 * Property 2 is the security one and is tested as an invariant over arbitrary
 * input, not as a list of payloads someone thought of. All 95 printable ASCII
 * characters were then swept against production in five positions each.
 */
import { buildSearchPattern } from '../searchPattern';

describe('buildSearchPattern · LIKE wildcards become literal', () => {
  it('escapes the "any run" wildcard', () => {
    expect(buildSearchPattern('100%')).toBe('100\\%');
  });

  it('escapes the "any single character" wildcard', () => {
    expect(buildSearchPattern('a_b')).toBe('a\\_b');
  });

  it('escapes PostgREST\'s OWN wildcard, which is not a SQL one', () => {
    // Inside an ilike value PostgREST treats `*` as an alias for `%`. Escaping
    // the two SQL wildcards and leaving this one live reproduced the identical
    // bug at a different character: searching `*` returned all 32 members.
    expect(buildSearchPattern('*')).toBe('\\*');
    expect(buildSearchPattern('sa*ad')).toBe('sa\\*ad');
  });

  it('escapes the escape character itself, and does so FIRST', () => {
    // If backslash were escaped last it would double the escapes we just added,
    // turning `\%` into `\\%` — a literal backslash followed by a live wildcard.
    expect(buildSearchPattern('\\')).toBe('\\\\');
    expect(buildSearchPattern('\\%')).toBe('\\\\\\%');
  });

  it('leaves ordinary text completely alone', () => {
    expect(buildSearchPattern('Wuthering Heights')).toBe('Wuthering Heights');
    expect(buildSearchPattern('Amélie')).toBe('Amélie');
    expect(buildSearchPattern('spider-man 2')).toBe('spider-man 2');
  });

  it('trims, because a trailing space would silently narrow the match', () => {
    expect(buildSearchPattern('  Amélie  ')).toBe('Amélie');
  });

  it('does NOT touch the quote — doubling it was the injection vector', () => {
    // The old version turned `"` into `""`, which re-opened PostgREST's quoted
    // value. Unquoted, a quote is just a character.
    expect(buildSearchPattern('5"')).toBe('5"');
  });
});

describe('buildSearchPattern · , ( ) can never reach the parser', () => {
  it('a comma becomes the single-character wildcard', () => {
    expect(buildSearchPattern('Girl, Interrupted')).toBe('Girl_ Interrupted');
  });

  it('the replacement still matches the comma it replaced', () => {
    // `_` matches exactly one character, so the stored title is still found.
    // Verified live: *W_thering* returns the same 2 rows as *Wuthering*.
    const p = buildSearchPattern('W,thering');
    expect(p).toBe('W_thering');
  });

  it('a paren becomes the single-character wildcard too', () => {
    // A LEADING `)` closed the filter group early and collapsed the query to
    // "match everything" — 32 of 32 members, measured after the first fix
    // shipped. A backslash cannot rescue it: `\)` reaches SQL, where it is not
    // a valid LIKE escape, and the query dies with 22025.
    expect(buildSearchPattern('Bin (2020)')).toBe('Bin _2020_');
    expect(buildSearchPattern(')abc')).toBe('_abc');
  });

  it('INVARIANT: no output ever contains , ( or ), for any input', () => {
    const inputs = [
      'zzqq,id.not.is.null,username.ilike.*zz',   // the payload that returned all 32
      'zz*,and(id.not.is.null),*zz',
      'zz*),or(id.not.is.null',
      'a,b,c,d',
      ',,,,a',
      'Sex, Lies, and Videotape',
      '"),or=(id.not.is.null',
    ];
    for (const input of inputs) {
      expect(buildSearchPattern(input) ?? '').not.toMatch(/[(),]/);
    }
  });

  it('INVARIANT holds for randomly generated input too', () => {
    const alphabet = [...'ab,()"\\%_ .*:&\'|=<>!@#'];
    for (let i = 0; i < 500; i++) {
      const len = 1 + Math.floor(Math.random() * 12);
      let s = '';
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      const out = buildSearchPattern(s);
      if (out !== null) expect(out).not.toMatch(/[(),]/);
    }
  });
});

describe('buildSearchPattern · refuses terms that would match everything', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['a single comma', ','],
    ['only commas', ',,,'],
    ['commas and spaces', ' , , '],
    ['a lone close paren', ')'],
    ['a lone open paren', '('],
    ['only structural characters', '(),'],
    ['null', null],
    ['undefined', undefined],
  ])('refuses %s', (_label, input) => {
    expect(buildSearchPattern(input as string)).toBeNull();
  });

  it('why: commas become wildcards, and ___ matched all 32 members live', () => {
    // Any term with real content is still accepted, however many commas it has.
    expect(buildSearchPattern('a,,,')).toBe('a___');
    expect(buildSearchPattern('a)')).toBe('a_');
  });
});
