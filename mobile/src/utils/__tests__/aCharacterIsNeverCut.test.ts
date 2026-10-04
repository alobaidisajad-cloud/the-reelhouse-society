/**
 * aCharacterIsNeverCut.test.ts — every place the app cuts text cuts between
 * characters, never inside one.
 *
 * Three cuts counted code units: the sanitiser's length cap, a share card's
 * excerpt (truncateReview), and the drop cap on a phone (Hermes has no
 * Intl.Segmenter, so it took one code point). Each could split a joined emoji
 * or a skin tone; the cap and the excerpt mended only a lone surrogate half.
 */
import { characterStart, extractDropCap, firstCharacter, initialOf, isCharacterBoundary, isRTLText, truncateReview } from '../text';
import { MAX_LENGTHS, sanitizeInput } from '../sanitizeInput';

const s = (...cps: number[]) => String.fromCodePoint(...cps);
const TECHNOLOGIST = s(0x1f469, 0x200d, 0x1f4bb);
const THUMB_TONED = s(0x1f44d, 0x1f3fd);
const IRAQ = s(0x1f1ee, 0x1f1f6);
const USA = s(0x1f1fa, 0x1f1f8);

describe('the boundary', () => {
  it('is never inside a joined emoji, a skin tone, a surrogate pair, or a flag', () => {
    expect(isCharacterBoundary(TECHNOLOGIST, 1)).toBe(false); // between the halves of 👩
    expect(isCharacterBoundary(TECHNOLOGIST, 2)).toBe(false); // before the joiner
    expect(isCharacterBoundary(TECHNOLOGIST, 3)).toBe(false); // after the joiner
    expect(isCharacterBoundary(THUMB_TONED, 2)).toBe(false);
    expect(isCharacterBoundary(IRAQ, 2)).toBe(false);
  });

  it('is between two flags, and between two plain emoji', () => {
    expect(isCharacterBoundary(IRAQ + USA, 4)).toBe(true);
    expect(isCharacterBoundary(IRAQ + USA, 2)).toBe(false);
    expect(isCharacterBoundary(s(0x1f525, 0x1f525), 2)).toBe(true);
  });

  it('steps back to the start of the character a cut fell in', () => {
    const text = `ab${TECHNOLOGIST}`;
    for (let at = 3; at < text.length; at += 1) expect(characterStart(text, at)).toBe(2);
    expect(characterStart(text, text.length)).toBe(text.length);
  });
});

describe('the cuts', () => {
  it('the sanitiser caps a field without breaking its last emoji', () => {
    const max = MAX_LENGTHS.bio;
    const text = 'x'.repeat(max - 3) + TECHNOLOGIST; // the cap falls inside the emoji
    const out = sanitizeInput(text, 'bio');
    expect(out).toBe('x'.repeat(max - 3));
    expect(out.length).toBeLessThanOrEqual(max);
  });

  it('a share card’s excerpt ends between characters', () => {
    const text = '字'.repeat(349) + THUMB_TONED + '字'.repeat(10); // no space: the raw index is used
    const out = truncateReview(text, 350);
    expect(out).toBe('字'.repeat(349) + '…');
  });

  it('the drop cap takes the whole first character, by the phone’s rule even where Intl could split it', () => {
    const intl = globalThis.Intl as { Segmenter?: unknown };
    const segmenter = intl.Segmenter;
    // A splitter that would be wrong: the drop cap must not be asking it.
    intl.Segmenter = function Wrong() { throw new Error('the drop cap asked Intl, which the phone does not have'); };
    try {
      expect(extractDropCap(`${TECHNOLOGIST} saw it twice`)).toEqual({ first: TECHNOLOGIST, rest: ' saw it twice' });
      expect(extractDropCap(`${IRAQ}${USA} both`)).toEqual({ first: IRAQ, rest: `${USA} both` });
      expect(extractDropCap('Remarkable.')).toEqual({ first: 'R', rest: 'emarkable.' });
      expect(extractDropCap(`${JA_NUKTA}${s(0x0930)} fine`)).toEqual({ first: JA_NUKTA, rest: `${s(0x0930)} fine` });
    } finally {
      intl.Segmenter = segmenter;
    }
  });
});

// Written by code point, so no editor or normaliser can quietly change what is tested.
const JA_NUKTA = s(0x091c, 0x093c); // ज़: ज with its dot is another letter
const KSSA = s(0x0915, 0x094d, 0x0937); // क्ष: two consonants joined by a virama
const KI = s(0x0915, 0x093f); // कि: the vowel sign is drawn before, written after
const BENGALI_RRA = s(0x09a1, 0x09bc); // ড়
const TAMIL_KO = s(0x0b95, 0x0bca); // கொ
const HAN_PARTS = s(0x1112, 0x1161, 0x11ab); // 한 typed as its three parts
const HAN_WHOLE_TAIL = s(0xd558, 0x11ab); // 하 + a final ㄴ: still one syllable
const SHALOM = s(0x05e9, 0x05c1, 0x05b8); // שָׁ: a shin with its dot and vowel
const ARABIC_BI = s(0x0628, 0x0650); // بِ
const THAI_KI = s(0x0e01, 0x0e34, 0x0e48); // กิ่
const KANJI_IVS = s(0x845b, 0xe0100); // 葛 in a chosen form
const CYRILLIC_ACCENT = s(0x0438, 0x0306); // й written as и and its mark

describe('a character, in every script', () => {
  const whole: [string, string][] = [
    ['a Hindi letter keeps its dot', JA_NUKTA],
    ['a conjunct stays joined', KSSA],
    ['a vowel sign stays on its consonant', KI],
    ['Bengali keeps its dot', BENGALI_RRA],
    ['Tamil keeps its two-part vowel', TAMIL_KO],
    ['Korean typed in parts is one syllable', HAN_PARTS],
    ['a Korean syllable keeps a final typed apart', HAN_WHOLE_TAIL],
    ['Hebrew keeps its points', SHALOM],
    ['Arabic keeps its vowel mark', ARABIC_BI],
    ['Thai keeps its vowel and tone', THAI_KI],
    ['a chosen kanji form stays chosen', KANJI_IVS],
    ['a Cyrillic letter keeps its mark', CYRILLIC_ACCENT],
    ['a family', s(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)],
    ['a toned thumb', THUMB_TONED],
    ['a keycap', s(0x31, 0xfe0f, 0x20e3)],
    ['a flag of tags', s(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f)],
  ];

  it.each(whole)('%s: the first character is all of it, and no cut falls inside it', (_, ch) => {
    expect(firstCharacter(`${ch}${s(0x20)}next`)).toBe(ch);
    for (let i = 1; i < ch.length; i += 1) expect([i, isCharacterBoundary(`${ch}x`, i)]).toEqual([i, false]);
    expect(isCharacterBoundary(`${ch}x`, ch.length)).toBe(true);
  });

  it('ends where the next letter starts, in each script', () => {
    expect(firstCharacter(`${KI}${s(0x0924, 0x093e)}`)).toBe(KI); // कि then ता
    expect(firstCharacter(s(0x1112, 0x1161, 0x1112, 0x1161))).toBe(s(0x1112, 0x1161)); // 하하 in parts
    expect(firstCharacter(`${ARABIC_BI}${s(0x0627)}`)).toBe(ARABIC_BI);
    expect(firstCharacter(`${IRAQ}${USA}`)).toBe(IRAQ);
    expect(firstCharacter('')).toBe('');
    expect(firstCharacter(null)).toBe('');
  });

  it('a share card’s excerpt never strips a vowel sign off its letter', () => {
    const text = 'क'.repeat(349) + KI + 'क'.repeat(10); // the cut falls between क and its sign
    expect(truncateReview(text, 350)).toBe('क'.repeat(349) + '…');
  });
});

describe('a raised first letter', () => {
  it.each([
    ['a straight quote', '"Wow," she said.', '"W', 'ow," she said.'],
    ['a curly quote, as a phone types it', '“Masterpiece”', '“M', 'asterpiece”'],
    ['a bracket', '(Spoilers) the end', '(S', 'poilers) the end'],
    ['an ellipsis', '…and then nothing.', '…A', 'nd then nothing.'],
    ['guillemets', '«Ozu» again', '«O', 'zu» again'],
    ['a lower-case opening, raised as a capital', 'i loved it', 'I', ' loved it'],
    ['ß, whose capital is two letters', 'ßlah', 'ß', 'lah'],
  ])('keeps %s: the mark rides up with the letter, and nothing is lost', (_, text, first, rest) => {
    expect(extractDropCap(text)).toEqual({ first, rest });
  });

  it('raises nothing from text with no letter in it, and keeps all of it', () => {
    expect(extractDropCap('…')).toEqual({ first: '', rest: '…' });
    expect(extractDropCap('')).toEqual({ first: '', rest: '' });
  });

  it.each([
    ['a long opening', '*** SPOILERS *** The film'],
    ['a rule of dashes', '----------The film opens'],
    ['an opening holding a line break', '"\nThe film opens'],
    ['an opening holding spaces', '- - - - Part one'],
  ])('raises nothing from %s, wider than the column beside it, and keeps all of it', (_, text) => {
    expect(extractDropCap(text)).toEqual({ first: '', rest: text });
  });

  it('still raises the most a mark may be: three dots; and not one more', () => {
    expect(extractDropCap('...and so')).toEqual({ first: '...A', rest: 'nd so' });
    expect(extractDropCap('....and so')).toEqual({ first: '', rest: '....and so' });
  });
});

describe('right-to-left words, every script of them, raise no letter', () => {
  // Their letters join: one lifted out of its word draws in another shape.
  it.each([
    ['Hebrew', s(0x05e9, 0x05dc, 0x05d5, 0x05dd)],
    ['Arabic', s(0x0645, 0x0631, 0x062d, 0x0628, 0x0627)],
    ["N'Ko", s(0x07d2, 0x07de, 0x07cf)],
    ['Samaritan', s(0x0800, 0x0801, 0x0802)],
    ['Mandaic', s(0x0840, 0x0841, 0x0842)],
    ['Syriac Supplement', s(0x0860, 0x0861, 0x0862)],
    ['Arabic Extended-B', s(0x0870, 0x0871, 0x0872)],
    ['Hanifi Rohingya', s(0x10d00, 0x10d01, 0x10d02)],
    ['Adlam', s(0x1e900, 0x1e901, 0x1e902)],
  ])('%s reads right to left', (_, word) => {
    expect(isRTLText(`${word} ${word}`)).toBe(true);
  });

  it('and words that open left to right stay so', () => {
    expect(isRTLText('Remarkable.')).toBe(false);
    expect(isRTLText(`Remarkable, ${s(0x1e900, 0x1e901)}`)).toBe(false);
  });
});

describe('a letter for a portrait', () => {
  it('is the first character, capitalised where the script has a capital for it alone', () => {
    expect(initialOf('  kane')).toBe('K');
    expect(initialOf(`${s(0x65, 0x301)}lise`)).toBe(s(0x45, 0x301)); // é, its accent written after
    expect(initialOf(s(0x0131, 0x6c))).toBe('I'); // Turkish dotless ı
    expect(initialOf(s(0x10e1, 0x10d0))).toBe(s(0x10e1)); // Georgian keeps its everyday letter
    expect(initialOf(s(0xdf, 0x70))).toBe(s(0xdf)); // ß: its capital is two letters
    expect(initialOf(`${JA_NUKTA}${s(0x0930)}`)).toBe(JA_NUKTA);
    expect(initialOf(`${TECHNOLOGIST} dev`)).toBe(TECHNOLOGIST);
  });

  it('is empty when there is no name: a departed member’s disc is blank', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('   ')).toBe('');
    expect(initialOf(null)).toBe('');
    expect(initialOf(undefined)).toBe('');
  });
});
