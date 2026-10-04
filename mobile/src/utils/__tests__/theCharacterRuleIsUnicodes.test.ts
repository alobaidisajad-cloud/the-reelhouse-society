/**
 * theCharacterRuleIsUnicodes.test.ts — the app's rule for where a character
 * ends is Unicode's, for every script, held to Node's own segmenter.
 *
 * The phone (Hermes) has no Intl.Segmenter, so utils/text.ts carries the rule
 * itself, over a table written by scripts/grapheme-table.js. Hand-picked
 * samples let a hand-typed rule cut Thai, Punjabi, Bengali and Tamil letters in
 * two, so this does not pick: every run of the table, at both its ends, beside
 * one code point of every class, both ways round; then thousands of seeded
 * random strings built from those classes, every boundary of each compared.
 */
import { firstCharacter, isCharacterBoundary } from '../text';
import { GRAPHEME_CLASSES, GRAPHEME_RUNS } from '../graphemeTable';

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const s = (...cps: number[]) => String.fromCodePoint(...cps);

/** Where Unicode puts the boundaries inside `text`, as UTF-16 indexes. */
const unicodeCuts = (text: string) => [...seg.segment(text)].map((x) => x.index).filter((i) => i > 0);
/** Where the app puts them. */
const appCuts = (text: string) => {
  const out: number[] = [];
  for (let i = 1; i < text.length; i += 1) if (isCharacterBoundary(text, i)) out.push(i);
  return out;
};

/** Every run of the table: its first and last code point, and its class. */
const RUNS = (() => {
  const runs: { from: number; to: number; cls: string }[] = [];
  let at = 0;
  for (const [, digits, letter] of GRAPHEME_RUNS.matchAll(/([0-9a-z]+)([A-Z])/g)) {
    at += parseInt(digits, 36);
    if (runs.length) runs[runs.length - 1].to = at - 1;
    runs.push({ from: at, to: 0x10ffff, cls: GRAPHEME_CLASSES[letter.charCodeAt(0) - 65] });
  }
  return runs;
})();
const real = (cp: number) => cp < 0xd800 || cp > 0xdfff;

/** One code point of each class, each one Unicode itself puts in that class. */
const ONE_OF_EACH: Record<string, number> = {
  Other: 0x61, CR: 0x0d, LF: 0x0a, Control: 0x07, Extend: 0x0301, ZWJ: 0x200d, RI: 0x1f1ee,
  Prepend: 0x0600, SpacingMark: 0x0903, L: 0x1100, V: 0x1161, T: 0x11a8, LV: 0xac00, LVT: 0xac01,
  ExtPict: 0x1f600, Consonant: 0x0915, Linker: 0x094d, ExtendOnly: 0x200c,
};

describe('the table', () => {
  it('covers every code point, in order, and names only the classes the rule knows', () => {
    expect(RUNS[0].from).toBe(0);
    expect(RUNS.length).toBeGreaterThan(1000);
    for (let i = 1; i < RUNS.length; i += 1) expect(RUNS[i].from).toBeGreaterThan(RUNS[i - 1].from);
    expect(new Set(RUNS.map((r) => r.cls))).toEqual(new Set(GRAPHEME_CLASSES));
  });

  it('agrees with Unicode on each class’s own example, so the sweep below has every class to test against', () => {
    for (const [cls, cp] of Object.entries(ONE_OF_EACH)) {
      const run = RUNS.find((r) => r.from <= cp && cp <= r.to);
      expect([cls, run?.cls]).toEqual([cls, cls]);
    }
  });
});

describe('the rule is Unicode’s', () => {
  it('beside every class, at both ends of every run, both ways round, and at the end of every sequence that looks back', () => {
    const wrong: string[] = [];
    const others = Object.values(ONE_OF_EACH);
    for (const run of RUNS) {
      for (const cp of new Set([run.from, run.to])) {
        if (!real(cp)) continue;
        // Two rules look further back than one code point: an emoji sequence
        // (a picture, a joiner, a picture) and an Indic conjunct (a consonant,
        // a virama, a consonant). So each code point also ends those.
        const reaching = [s(0x1f600, 0x200d, cp), s(0x1f600, 0x0301, 0x200d, cp), s(0x0915, 0x094d, cp), s(0x0915, 0x094d, 0x093c, cp), s(cp, 0x094d, 0x0915)];
        for (const text of [...others.flatMap((o) => [s(o, cp), s(cp, o)]), ...reaching]) {
          const app = appCuts(text).join();
          const uni = unicodeCuts(text).join();
          if (app !== uni && wrong.length < 20) wrong.push(`${[...text].map((c) => c.codePointAt(0)!.toString(16)).join('+')}: app ${app} / unicode ${uni}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('on thousands of strings built from every class, every boundary', () => {
    // Seeded, so a failure is the same failure every run.
    let seed = 20261004;
    const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    const pool = [
      ...Object.values(ONE_OF_EACH),
      0x0e17, 0x0e33, 0x0e49, 0x0e19, // Thai: letters, the sara am, a tone
      0x0a2a, 0x0a70, 0x0a71, 0x0a1c, // Gurmukhi: letters, tippi, addak
      0x09a4, 0x09cd, 0x09ce, 0x09b8, // Bengali: ta, virama, khanda ta, sa
      0x0bb8, 0x0bcd, 0x0b9f, 0x0bbe, // Tamil: letters, pulli, a vowel sign
      0x0d32, 0x0d4d, 0x0d54, 0x0d3a, // Malayalam: la, virama, a chillu, ttta
      0x0ccd, 0x0c95, 0x0a4d, 0x0a95, // Kannada and Gujarati
      0x304b, 0x3099, 0xfe0f, 0x1f3fd, 0x1f468, 0x2764, 0xe0067, 0xe007f, 0x20e3, 0x23, // kana, emoji parts
      0x05e9, 0x05c1, 0x0628, 0x0650, 0x0d4e, 0x110bd, 0x1f1fa, 0xd7b0, 0xd7cb, 0x0020,
    ];
    const wrong: string[] = [];
    for (let n = 0; n < 6000; n += 1) {
      const cps = Array.from({ length: 2 + (next() % 7) }, () => pool[next() % pool.length]);
      const text = s(...cps);
      const app = appCuts(text).join();
      const uni = unicodeCuts(text).join();
      if (app !== uni && wrong.length < 20) wrong.push(`${cps.map((c) => c.toString(16)).join('+')}: app ${app} / unicode ${uni}`);
    }
    expect(wrong).toEqual([]);
  });

  it.each([
    ['Thai: a letter and its sara am', s(0x0e17, 0x0e33, 0x0e44, 0x0e21), s(0x0e17, 0x0e33)],
    ['Thai: a letter, its tone and its sara am', s(0x0e19, 0x0e49, 0x0e33), s(0x0e19, 0x0e49, 0x0e33)],
    ['Punjabi: a letter and its tippi', s(0x0a2a, 0x0a70, 0x0a1c, 0x0a3e), s(0x0a2a, 0x0a70)],
    ['Punjabi: a letter and its addak', s(0x0a38, 0x0a71, 0x0a1a), s(0x0a38, 0x0a71)],
    ['Bengali: khanda ta is a letter of its own', s(0x0989, 0x09ce, 0x09b8, 0x09ac), s(0x0989)],
    ['Tamil: the pulli makes no conjunct', s(0x0bb8, 0x0bcd, 0x0b9f, 0x0bbe), s(0x0bb8, 0x0bcd)],
    ['Hindi: a conjunct stays joined', s(0x0915, 0x094d, 0x0937, 0x093e), s(0x0915, 0x094d, 0x0937, 0x093e)],
    ['Japanese: a kana and its voicing mark', s(0x304b, 0x3099, 0x3042), s(0x304b, 0x3099)],
  ])('%s', (_, text, first) => {
    expect(firstCharacter(text)).toBe(first);
    expect(firstCharacter(text)).toBe([...seg.segment(text)][0].segment);
  });
});
