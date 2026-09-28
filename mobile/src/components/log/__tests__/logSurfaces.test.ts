/**
 * logSurfaces.test.ts — the log card and the log page: their rules as FUNCTIONS
 * and VALUES, and the one sweep only their source can answer.
 *
 * This file used to hold its surfaces' fixes as text read out of the source.
 * They live where they can be proven now:
 *
 *   · what a member sees and does — the facts a record prints, each block of
 *     their writing in its own direction, no drop cap on a joined script, no
 *     empty review section, the share card only while sharing, SAVE for a
 *     visitor, their angle brackets kept — on the MOUNTED page:
 *     app/log/__tests__/theRecordReadsTrue.test.tsx;
 *   · whether things FIT and do not collide — the eyebrow, every line box at
 *     every text size, every deck label at its floor, every control against
 *     its neighbour, every shadow against a clip — MEASURED on the drawn page
 *     (zz-log.gen and the Lobby's cards, mockups/tools/layout.cjs, all widths);
 *   · dates — the no-Intl lint rule, and the time-zone suite (npm run test:tz).
 */
import { StyleSheet, type TextStyle } from 'react-native';
import { readCode } from '@/test-utils/readCode';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { hasPhysicalFormat, buildFilingMark } from '@/src/components/log/logRecord';
import { formatDate } from '@/src/utils/timeAgo';
import { s as record } from '@/src/components/log/logDetailStyles';
import { p as paper } from '@/src/components/dispatch/paper/paperStyles';
import { colors } from '@/src/theme/theme';
import { deckLabelProps, scaledTextProps } from '@/src/constants/textScaling';

const SCREEN = 'app/log/[id].tsx';

describe('a record states only facts', () => {
  it('never takes the composer’s "None" for a format', () => {
    // 'None' is PHYSICAL_OPTIONS[0], stored as that literal string and truthy.
    for (const v of ['None', 'none', 'NONE', ' none ', '', null, undefined]) {
      expect(hasPhysicalFormat(v)).toBe(false);
    }
    for (const v of ['DVD', 'Blu-Ray', '4K UHD', 'VHS', 'Film Print']) {
      expect(hasPhysicalFormat(v)).toBe(true);
    }
  });

  it('the filing mark prints facts and nothing else', () => {
    // An empty caption inside a ruled band renders fine and reads wrong, so
    // these are the cases that matter: each field present but unprintable.
    expect(buildFilingMark({})).toEqual([]);
    expect(buildFilingMark({ watched_date: null, watched_with: '', physical_media: 'None' })).toEqual([]);
    expect(buildFilingMark({ watched_date: 'not a date' })).toEqual([]);
    expect(buildFilingMark({ watched_with: '   ' })).toEqual([]);
    expect(buildFilingMark({ physical_media: '  none  ' })).toEqual([]);

    expect(buildFilingMark({
      watched_date: '2026-08-05',
      watched_with: 'mara',
      physical_media: '4k uhd',
    })).toEqual([
      { key: 'date', value: 'AUG 5, 2026' },
      { key: 'with', value: 'WITH MARA', accent: true },
      { key: 'format', value: '4K UHD' },
    ]);

    // Order is the record's grammar: when, with whom, on what. A gap in the
    // middle must close up rather than leave the band lopsided.
    expect(buildFilingMark({ watched_date: '2026-08-05', physical_media: 'VHS' })
      .map((e) => e.key)).toEqual(['date', 'format']);
  });

  it('one date shape on the page', () => {
    expect(formatDate('2026-08-05')).toBe('AUG 5, 2026');
    // An instant takes the reader's day: a critique filed at 8pm in Los Angeles
    // is dated that evening, not tomorrow.
    const evening = new Date(2026, 0, 1, 20, 0, 0);   // local by construction
    expect(formatDate(evening.toISOString())).toBe('JAN 1, 2026');
  });
});

describe('direction is read from the text, not the device', () => {
  it('first strong character, both ways', () => {
    expect(isRTLText('يُعد فيلم سبايدر مان')).toBe(true);
    expect(isRTLText('A film that slowly hypnotizes you')).toBe(false);
    // Neutrals must not decide it: a review may open with a guillemet or a year.
    expect(isRTLText('« يُعد فيلم »')).toBe(true);
    expect(isRTLText('1997 — a quiet masterpiece')).toBe(false);
    // A Latin title inside Arabic must not flip the paragraph, nor an Arabic
    // title inside English.
    expect(isRTLText('لا يتفوق على Spider-Man')).toBe(true);
    expect(isRTLText('Spider-Man لا يتفوق عليه')).toBe(false);
    expect(isRTLText('')).toBe(false);
  });
});

describe('one cleaner, so a review reads the same on both surfaces', () => {
  it('decodes entities, strips unknown tags, and finds paragraph breaks', () => {
    expect(stripHTML('<p>He said &quot;yes&quot;</p>')).toContain('He said "yes"');
    expect(stripHTML('<blockquote>kept</blockquote>')).toBe('kept');
    expect(stripHTML('<p>one</p><p>two</p>')).toMatch(/one\n\ntwo/);
    expect(stripHTML('a &mdash; b')).toBe('a — b');
    expect(stripHTML('Powell &amp; Pressburger')).toBe('Powell & Pressburger');
  });

  it('an escaped entity cannot smuggle a bracket through', () => {
    // &amp; is held back from the first pass and decoded LAST, so one level of
    // escaping is undone and no more: &amp;lt; yields &lt;, never <.
    expect(stripHTML('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(stripHTML('&amp;amp;')).toBe('&amp;');
  });

  it('leaves a member’s own angle brackets alone', () => {
    expect(stripHTML('<The Batman> is the best of them')).toBe('<The Batman> is the best of them');
    expect(stripHTML('<president> was a strange choice')).toBe('<president> was a strange choice');
    // …while still removing real tags, including ones no whitelist had before.
    expect(stripHTML('<blockquote cite="x">kept</blockquote>')).toBe('kept');
    expect(stripHTML('a <br/> b')).toBe('a \n b');
  });
});

describe('a control that erases something looks like one', () => {
  // Style VALUES, asked directly. These two rows are the same control — a
  // member taking back their own words — on the log and on the Dispatch, and
  // they drifted apart once: crimson on one, body text on the other.
  it('DELETE on a log and WITHDRAW on a filing are one red, and not a neutral', () => {
    const log = (StyleSheet.flatten(record.commDelete) as TextStyle).color;
    const dispatch = (StyleSheet.flatten(paper.critiqueWithdraw) as TextStyle).color;
    expect(log).toBeTruthy();
    expect(log).toBe(dispatch);
    // bone/fog/parchment/ash are what prose is set in.
    expect([colors.bone, colors.fog, colors.parchment, colors.ash]).not.toContain(log);
  });
});

describe('a deck label is the capped tier, on one line, shrinking to fit', () => {
  // The props every deck label shares, asked as values. Whether each label
  // FITS at its floor is measured on the drawn decks at every width.
  it('the shared props', () => {
    expect(deckLabelProps).toEqual(expect.objectContaining({ ...scaledTextProps, numberOfLines: 1, adjustsFontSizeToFit: true }));
    expect(deckLabelProps.minimumFontScale).toBeGreaterThan(0);
    expect(scaledTextProps.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

/**
 * Why source: a colour written as a literal and the same colour taken from the
 * theme RENDER identically. Only the source shows which one the page uses —
 * and a literal is the colour that stays behind when the palette moves.
 */
describe('every colour on these surfaces is a named one', () => {
  const SURFACES = ['src/components/log/logDetailStyles.ts', 'src/components/log/LogHero.tsx',
    'src/components/log/LogActionDeck.tsx', 'src/components/feed/ReviewContent.tsx',
    'src/components/feed/ActivityCard.tsx', 'src/components/feed/PosterFrame.tsx',
    'src/components/feed/AutopsyView.tsx', 'src/components/feed/ActionDeck.tsx',
    'src/components/feed/UserAttributionRow.tsx', 'src/components/log/LogComments.tsx',
    'src/components/log/LogReviewBody.tsx', 'src/components/log/LogChronicle.tsx'];

  it.each(SURFACES)('%s mixes no raw hex', (file) => {
    // #000 stays: it is the shadow colour, and every shadow on these surfaces
    // is black by definition rather than by choice.
    const raw = [...readCode(file).matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((m) => m[0]).filter((h) => !/^#(000|000000)$/i.test(h));
    expect(raw).toEqual([]);
  });

  it('carries no red the palette already retired', () => {
    // theme.ts says rgb(125,31,31) was replaced so every red in the app is
    // bloodReel or crimson. Three instances had survived on these surfaces.
    for (const file of [...SURFACES, SCREEN]) {
      expect(readCode(file)).not.toMatch(/125\s*,\s*31\s*,\s*31/);
    }
  });

  it('does not hand-write a value the theme already names', () => {
    // Nine of these were sitting on these surfaces: the exact digits of
    // bloodFaint, sepiaSubtle, sepiaFaint, sepiaBorder and selection, written
    // out by hand. The token existing is worth nothing if it is bypassed.
    const flat = (x: string) => x.replace(/\s+/g, '').toLowerCase();
    const named = new Map<string, string>();
    for (const [name, value] of Object.entries(colors)) {
      if (typeof value === 'string' && value.startsWith('rgba(')) named.set(flat(value), name);
    }
    expect(named.size).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of SURFACES) {
      for (const m of readCode(file).matchAll(/rgba\([^)]+\)/g)) {
        const token = named.get(flat(m[0]));
        if (token) offenders.push(`${file}: ${m[0]} is colors.${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the page subscribes to values, not to the whole store', () => {
  // Why source, for now: destructuring the store re-renders this screen on ANY
  // change anywhere in it, which no render in this suite counts. The render
  // budgets (step 6) measure it; until they cover this page, the shape is pinned.
  it('picks each value it needs', () => {
    const src = readCode(SCREEN);
    expect(src).not.toMatch(/const \{[^}]*\} = useInteractionStore\(\)/);
    expect(src).toMatch(/useInteractionStore\(st =>/);
  });
});
