/**
 * paperTextLogic.test.ts — the branches of the text rules nobody had run.
 * ─────────────────────────────────────────────────────────────────────────────
 * `softBreak` and `clipToSentence` are the two places the paper decides what a
 * member's writing LOOKS like — where a line may break, and where an excerpt
 * stops. Both had branches no test had ever entered, and both are pure
 * functions, so there is no excuse for that: they are the cheapest thing in the
 * feature to be certain about.
 *
 * The interesting ones are the cases the code goes out of its way to handle,
 * because those are the ones somebody thought about and nobody checked:
 *
 *   · a stop that is NOT the end of a sentence — `Mr.`, `No. 17`, `U.S.`
 *   · a closing quote or bracket AFTER the stop, which belongs to the sentence
 *   · no sentence ending in the window at all, so it falls back to a word
 *   · a fallback that lands on a word which cannot end a phrase
 */
import { softBreak, clipToSentence, counted, MAX_RUN } from '@/src/components/dispatch/paper/paperText';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';

describe('softBreak — where a line may break', () => {
  it('hands back an empty string untouched', () => {
    // The guard that returns early. Anything else would build a new string for
    // nothing on every render of every empty field in the feature.
    expect(softBreak('')).toBe('');
  });

  it('leaves ordinary prose alone to the eye', () => {
    // No zero-width joiners inside normal words: the whole point is that a
    // reader cannot tell it ran.
    const plain = 'Ozu frames a room and then leaves it.';
    expect(softBreak(plain).replace(/[​­]/g, '')).toBe(plain);
  });

  it('gives a long unbroken run somewhere to break', () => {
    // React Native does not break a word wider than its box — it lets it out
    // and the page edge CUTS it, so the middle of a URL simply disappears.
    const url = 'https://www.bfi.org.uk/news/napoleon-restoration-tour-2026-full-city-listing';
    const out = softBreak(url);
    expect(out.length).toBeGreaterThan(url.length);
    // And nothing was lost doing it.
    expect(out.replace(/[​­]/g, '')).toBe(url);
  });

  /**
   * ── AND BREAKS IT WHERE A LINK COMES APART, NOT WHERE THE COUNT RAN OUT ────
   * This used to cut blind at the eighteenth character, so the wire's own
   * example came apart as `https://www.bfi.or` / `g.uk/news/…` — a URL split
   * through the middle of `org`, which reads as a typo rather than a link.
   */
  const ZWSP = '​';
  const segmentsOf = (s: string) => softBreak(s).split(ZWSP);

  it('breaks a link at its joints', () => {
    const url = 'https://www.bfi.org.uk/news/napoleon-restoration-tour-2026-full-city-listing';
    expect(segmentsOf(url)).toEqual([
      'https://www.bfi',
      '.org.uk/news/',
      'napoleon-',
      'restoration-tour-',
      '2026-full-city-',
      'listing',
    ]);
  });

  it('still lets no run grow wider than the narrowest column holds', () => {
    // The guarantee MAX_RUN was measured for. Preferring a joint only ever
    // breaks EARLIER, so this must hold for a link and for a word with no
    // joint anywhere in it.
    const inputs = [
      'https://www.bfi.org.uk/news/napoleon-restoration-tour-2026-full-city-listing',
      'Rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz',
      '#thelongsilenceinozu',
    ];
    for (const s of inputs) {
      for (const seg of segmentsOf(s)) expect(seg.length).toBeLessThanOrEqual(MAX_RUN);
      expect(segmentsOf(s).join('')).toBe(s);
    }
  });

  it('leaves a word with no joint in it exactly where it was', () => {
    // A German compound has nothing to break at, so it must still fall back to
    // the blind cut rather than being left to run off the page.
    const de = 'Rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz';
    expect(segmentsOf(de)[0]).toHaveLength(MAX_RUN);
  });

  it('keeps a hashtag with its tag', () => {
    // `#` opens what follows, it does not close what precedes. The first
    // version of the joint rule had it the other way round and put a lone `#`
    // on a line of its own.
    expect(segmentsOf('#thelongsilenceinozu')[0].startsWith('#the')).toBe(true);
  });
});

describe('clipToSentence — where an excerpt stops', () => {
  const at = (text: string, n: number) => clipToSentence(text, n);

  it('does not clip what already fits', () => {
    const short = 'A room, and then nobody in it.';
    expect(at(short, 200)).toEqual({ text: short, clipped: false });
  });

  it('stops at a sentence, not mid-word', () => {
    const t = 'The camera stays low. Ozu never once stood up. That is the argument.';
    const out = at(t, 30);
    expect(out.clipped).toBe(true);
    expect(out.text).toBe('The camera stays low.');
  });

  it('keeps a closing quote with the sentence it closes', () => {
    // `…the outliving."` — the quote belongs to the sentence, so the cut goes
    // AFTER it. Cutting before leaves a dangling open quotation.
    const t = 'He called it "the art of the outliving." Then he sat down again for good.';
    const out = at(t, 42);
    expect(out.text.endsWith('"')).toBe(true);
  });

  it('is not fooled by a full stop that ends no sentence', () => {
    /**
     * ── THIS FOUND A REAL ONE ───────────────────────────────────────────────
     * The code's own comment claimed it kept `No. 17` and `U.S.` from reading
     * as endings. It did not: whitespace follows the stop in all of them
     * exactly as it follows a real ending. Measured, the excerpts a card would
     * have printed were "Ballot No.", "J. L." and "Filed by Mr. Ozu of the
     * U.S." — the first two being a card that prints an abbreviation and
     * nothing else.
     */
    expect(at('Ballot No. 17 was opened this morning and the house marked it all day.', 20).text)
      .toBe('Ballot No. 17…');
    expect(at('J. L. Godard was asked and he said nothing at all about any of it.', 20).text)
      .toBe('J. L. Godard…');
    expect(at('Filed by Mr. Ozu of the U.S. desk, who never once stood up in his life.', 30).text)
      .toBe('Filed by Mr. Ozu of the U.S.…');
  });

  it('and not by an abbreviation nobody thought to list', () => {
    /**
     * The list of abbreviations can never be complete, which is why the rule
     * about what FOLLOWS carries the weight: a real ending is followed by a
     * capital or by the end of the essay, so a stop followed by a digit or a
     * lowercase letter is not one — whatever word came before it.
     *
     * `Fig.` and `Ch.` are not in the list on purpose. Removing that rule and
     * leaving only the list passes every other case in this file, which is how
     * a redundant-looking guard gets deleted.
     */
    expect(at('See Fig. 3 for the frame he holds longest in the whole picture.', 14).text)
      .toBe('See Fig. 3…');
    expect(at('Read Ch. 9 before you argue with anybody at all about the ending.', 15).text)
      .toBe('Read Ch. 9…');
  });

  it('still cuts at a real ending, which is the whole point', () => {
    // The guard must not be so cautious that nothing is ever a sentence.
    expect(at('A room. A door. A window nobody in the picture ever once opens.', 12).text)
      .toBe('A room.');
  });

  it('falls back to a word when no sentence ends inside the window', () => {
    const t = 'A single enormous opening clause that simply keeps going and going without ever once stopping';
    const out = at(t, 40);
    expect(out.clipped).toBe(true);
    expect(out.text.endsWith('…')).toBe(true);
  });

  it('never ends that fallback on a word that cannot end a phrase', () => {
    // `…left the frame, and…` reads as software that ran out of room. Dropping
    // the dangling word costs one word and buys a line that sounds deliberate.
    const t = 'She left the frame and the room stayed exactly as long as it needed to stay';
    const out = at(t, 22);
    const last = out.text.replace(/…$/, '').trim().split(' ').pop()!.toLowerCase();
    expect(['and', 'the', 'a', 'of', 'to', 'in', 'it', 'as', 'that']).not.toContain(last);
  });

  it('survives an empty essay without inventing one', () => {
    expect(at('', 100).text).toBe('');
  });
});

describe('counted — the house counts in English', () => {
  it('takes the singular only at exactly one', () => {
    expect(counted(0, 'CRITIQUE', 'CRITIQUES')).toBe('0 CRITIQUES');
    expect(counted(1, 'CRITIQUE', 'CRITIQUES')).toBe('1 CRITIQUE');
    expect(counted(2, 'CRITIQUE', 'CRITIQUES')).toBe('2 CRITIQUES');
  });

  it('formats the number but decides on the raw one', () => {
    // `1K CRITIQUE` is the same mistake pointing the other way.
    expect(counted(1000, 'CRITIQUE', 'CRITIQUES', formatCount)).toBe('1K CRITIQUES');
  });

  it('falls back to the plain number when the formatter declines', () => {
    // `formatCount` returns null below one, and a label reading "null
    // CRITIQUES" is the kind of thing that ships.
    expect(counted(0, 'BALLOT', 'BALLOTS', formatCount)).toBe('0 BALLOTS');
  });
});
