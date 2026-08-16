/**
 * logSurfaces.test.ts — the log card and the log page.
 *
 * Both surfaces were unguarded. These pin the fixes that fail SILENTLY: no
 * crash, no type error, just a page that quietly goes back to being wrong on
 * someone's phone, in a language or at a text size nobody here is testing at.
 *
 * Source-reading rather than rendering: these are properties of stylesheets,
 * arithmetic and copy. A render test would prove less and cost more.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { hasPhysicalFormat, buildFilingMark } from '@/src/components/log/logRecord';
import { formatDate } from '@/src/utils/timeAgo';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SCREEN = 'app/log/[id].tsx';
const STYLES = 'src/components/log/logDetailStyles.ts';
const HERO = 'src/components/log/LogHero.tsx';
const DECK = 'src/components/log/LogActionDeck.tsx';
const REVIEW = 'src/components/feed/ReviewContent.tsx';
const CARD = 'src/components/feed/ActivityCard.tsx';
const POSTER = 'src/components/feed/PosterFrame.tsx';
const AUTOPSY = 'src/components/feed/AutopsyView.tsx';

/**
 * Brace-matched, so a single-line style cannot swallow the next block's body.
 * Matches both an object key (`foo: {`) and a declaration (`const foo = {`).
 */
function style(src: string, name: string): string {
  const at = src.search(new RegExp(`\\b${name}\\s*[:=]\\s*\\{`));
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return '';
}
const num = (body: string, prop: string) => {
  const m = body.match(new RegExp(`(?<![\\w.])${prop}\\s*:\\s*(-?[\\d.]+)`));
  return m ? Number(m[1]) : undefined;
};

// Special Elite, measured from the TTF earlier in this project.
const EM_PER_CHAR = 0.626;
const textWidth = (s: string, size: number, ls: number) => s.length * (size * EM_PER_CHAR + ls);

describe('the header eyebrow fits the box it is centred in', () => {
  it('fits at 360dp, the narrowest width the app targets', () => {
    const styles = read(STYLES);
    const wrap = style(styles, 'eyebrowWrap');
    const eyebrow = style(styles, 'eyebrow');
    const header = style(styles, 'header');

    const gutter = num(wrap, 'left')!;
    const pad = num(header, 'paddingHorizontal')!;
    const size = num(eyebrow, 'fontSize')!;
    const ls = num(eyebrow, 'letterSpacing')!;

    // The copy is lifted from the screen, so shortening the box or lengthening
    // the words both fail here rather than on a phone.
    const copy = read(SCREEN).match(/allowFontScaling=\{false\}>([A-Z ]+)<\/Text>/)![1];

    const box = 360 - pad * 2 - gutter * 2;
    expect(textWidth(copy, size, ls)).toBeLessThanOrEqual(box);
  });

  it('still clears the right cluster it is centred around', () => {
    const styles = read(STYLES);
    const gutter = num(style(styles, 'eyebrowWrap'), 'right')!;
    const share = num(style(styles, 'shareBtnText'), 'fontSize')!;
    const shareLs = num(style(styles, 'shareBtnText'), 'letterSpacing')!;
    // icon 14 + gap 4 + SHARE + gap 14 + the ⋯ button a visitor also sees.
    const cluster = 14 + 4 + textWidth('SHARE', share, shareLs) + 14 + 20;
    expect(gutter).toBeGreaterThanOrEqual(cluster);
  });
});

describe('a record states only facts', () => {
  it('never prints the composer’s "None" as a format', () => {
    // 'None' is PHYSICAL_OPTIONS[0], stored as that literal string and truthy.
    for (const v of ['None', 'none', 'NONE', ' none ', '', null, undefined]) {
      expect(hasPhysicalFormat(v)).toBe(false);
    }
    for (const v of ['DVD', 'Blu-Ray', '4K UHD', 'VHS', 'Film Print']) {
      expect(hasPhysicalFormat(v)).toBe(true);
    }
  });

  it('the offline mapping applies the same guard as the save path', () => {
    // The save path drops 'None'; this mapping used to pass it straight
    // through, so one log read two different ways.
    expect(read(SCREEN)).toMatch(/physical_media:\s*\bhasPhysicalFormat\b\(/);
  });

  it('the filing mark only appears when it has something to say', () => {
    expect(read(HERO)).toMatch(/filed\.length > 0 &&/);
    expect(buildFilingMark({})).toEqual([]);
    expect(buildFilingMark({ watched_date: null, watched_with: '', physical_media: 'None' })).toEqual([]);
  });

  it('the filing mark prints facts and nothing else', () => {
    // An empty caption inside a ruled band renders fine and reads wrong, so
    // these are the cases that matter: each field present but unprintable.
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
  });

  it('no surface formats a date itself', () => {
    // The critiques list printed the device's short form; the chronicle printed
    // a third shape again. All of them defer to timeAgo.ts now — including
    // logRecord, which briefly grew its own and got it wrong twice over.
    for (const f of ['src/components/log/LogComments.tsx', 'src/components/log/LogChronicle.tsx',
                     'src/components/log/LogHero.tsx', 'src/components/log/logRecord.ts', SCREEN]) {
      expect(read(f)).not.toMatch(/toLocaleDateString|toLocaleString|Intl\./);
    }
  });

  it('a calendar day is never turned into an instant', () => {
    // THE rule this project already learned once: `new Date("2026-08-05")` is
    // midnight UTC by definition, so anything built from it reads as the day
    // before across the Americas. Hermes ships with no Intl polyfill here, so a
    // `timeZone: 'UTC'` option cannot be trusted to correct it either. Months
    // come from a table in timeAgo.ts; nothing on these surfaces may re-derive.
    expect(read('src/components/log/logRecord.ts')).not.toMatch(/new Date\(/);

    // A calendar date keeps its own day, wherever it is read…
    expect(formatDate('2026-01-01')).toBe('JAN 1, 2026');
    expect(buildFilingMark({ watched_date: '2026-01-01' })[0].value).toBe('JAN 1, 2026');

    // …and an instant takes the reader's, which is the OTHER half of the rule:
    // a critique filed at 8pm in Los Angeles is dated that evening, not tomorrow.
    const evening = new Date(2026, 0, 1, 20, 0, 0);   // local by construction
    expect(formatDate(evening.toISOString())).toBe('JAN 1, 2026');
  });
});

describe('a member’s own writing is rendered in their own direction', () => {
  it('resolves direction from the text, not the device', () => {
    expect(isRTLText('يُعد فيلم سبايدر مان')).toBe(true);
    expect(isRTLText('A film that slowly hypnotizes you')).toBe(false);
    // Neutrals must not decide it: a review may open with a guillemet or a year.
    expect(isRTLText('« يُعد فيلم »')).toBe(true);
    expect(isRTLText('1997 — a quiet masterpiece')).toBe(false);
    // First-strong, both ways: a Latin title inside Arabic must not flip the
    // paragraph, and an Arabic title inside English must not flip it either.
    expect(isRTLText('لا يتفوق على Spider-Man')).toBe(true);
    expect(isRTLText('Spider-Man لا يتفوق عليه')).toBe(false);
    expect(isRTLText('')).toBe(false);
  });

  it('every surface carrying member prose asks the question', () => {
    // LogChronicle is on this list because it was missed the first time: past
    // viewings are member prose too, and they read on the same page.
    // The count is the point. A file-level "does it mention RTL" passed while
    // the chronicle had none, and still passed when one of three prose blocks
    // on a surface lost its direction — so every block is counted.
    const BLOCKS: [string, number][] = [
      [REVIEW, 3],                                       // pull quote, review, read-more row
      ['src/components/log/LogReviewBody.tsx', 3],        // pull quote, essay, private notes
      ['src/components/log/LogComments.tsx', 1],          // critique body
      ['src/components/log/LogChronicle.tsx', 1],         // past viewing
    ];
    for (const [f, blocks] of BLOCKS) {
      // Imports are stripped first: matching the whole file proved only that
      // the helper was IMPORTED, not that it is called where text renders.
      const body = read(f).replace(/^\s*import[\s\S]*?;\s*$/gm, '');
      expect(body).toMatch(/\bisRTLText\s*\(/);
      expect(body.match(/&&\s*s\.rtl/g) ?? []).toHaveLength(blocks);
    }
  });

  it('no drop cap on a joined script', () => {
    // Lifting the first letter out of an Arabic word leaves an isolated form
    // and breaks the word behind it.
    expect(read(REVIEW)).toMatch(/drop_cap && !rtl/);
    expect(read('src/components/log/LogReviewBody.tsx')).toMatch(/dropCap && !rtl/);
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
    // The card's old cleaner deleted anything between brackets, which ate the
    // first two words of `<The Batman> is the best of them`.
    expect(stripHTML('<The Batman> is the best of them')).toBe('<The Batman> is the best of them');
    expect(stripHTML('<president> was a strange choice')).toBe('<president> was a strange choice');
    // …while still removing real tags, including ones no whitelist had before.
    expect(stripHTML('<blockquote cite="x">kept</blockquote>')).toBe('kept');
    expect(stripHTML('a <br/> b')).toBe('a \n b');
  });

  it('the card no longer carries a second copy', () => {
    const src = read(REVIEW);
    expect(src).toMatch(/\bstripHTML\b/);
    expect(src).not.toMatch(/const ENTITIES/);
  });
});

describe('a shadow is never asked for through a clip', () => {
  // overflow:'hidden' sets clipsToBounds, and a layer that masks to its bounds
  // cannot draw a shadow outside them — so on iOS the shadow simply never
  // existed, while Android drew one from elevation. Four of these shipped.
  const pairs: [string, string, string][] = [
    [POSTER, 'wrapShadow', 'wrap'],
    [CARD, 'cardShadow', 'card'],
    [STYLES, 'contentCardShadow', 'contentCard'],
    [STYLES, 'posterBoundsShadow', 'posterBounds'],
  ];
  it.each(pairs)('%s :: %s casts, %s clips', (file, shadowName, clipName) => {
    const src = read(file);
    const shadow = style(src, shadowName);
    const clip = style(src, clipName);
    expect(shadow).not.toBe('');
    expect(clip).not.toBe('');
    // The host that casts must not clip…
    expect(shadow).not.toMatch(/overflow:\s*['"]hidden['"]/);
    expect(shadow).toMatch(/shadowOpacity|shadowRadius|shadowOffset/);
    // …and the host that clips must not carry the iOS box shadow.
    expect(clip).toMatch(/overflow:\s*['"]hidden['"]/);
    expect(clip.split('\n').filter((l) => !/textShadow/.test(l)).join('\n'))
      .not.toMatch(/shadowOpacity|shadowRadius|shadowOffset/);
    // Android is the other half, and it splits the OTHER way: its shadow comes
    // from the painted background's outline, so `elevation` belongs on the clip
    // host — which is also exactly where it sat before the split, so Android
    // renders unchanged. An elevation on the empty outer host may cast nothing.
    expect(clip).toMatch(/elevation:/);
    expect(shadow).not.toMatch(/elevation:/);
  });
});

describe('neighbours do not claim the same pixels', () => {
  // Both platforms hand an overlap to the LATER sibling, so each side may claim
  // at most half the real gap between them.
  it('the card deck yields to the strip flush beneath it', () => {
    const slop = read('src/components/feed/ActionDeck.tsx').match(/hitSlop=\{\{([^}]*)\}\}/)![1];
    expect(Number(slop.match(/bottom:\s*(\d+)/)![1])).toBe(0);
    // 14pt above to the prose block.
    expect(Number(slop.match(/top:\s*(\d+)/)![1])).toBeLessThanOrEqual(7);
  });

  it('the strip yields upward to the deck', () => {
    const slop = read(AUTOPSY).match(/hitSlop=\{\{([^}]*)\}\}/)![1];
    expect(Number(slop.match(/top:\s*(\d+)/)![1])).toBe(0);
  });

  it('the prose sits between the title and the deck', () => {
    const slop = read(REVIEW).match(/hitSlop=\{\{([^}]*)\}\}/)![1];
    // 10pt above at its tightest (no year, no rating); 14pt below.
    expect(Number(slop.match(/top:\s*(\d+)/)![1])).toBeLessThanOrEqual(5);
    expect(Number(slop.match(/bottom:\s*(\d+)/)![1])).toBeLessThanOrEqual(7);
  });

  it('a critique’s DELETE and the next critique’s byline split their gap', () => {
    // 14pt of padding below one critique and 14 above the next: 28pt of real
    // gap, so 14 each. Derived from the stylesheet so that changing the row
    // padding fails here instead of silently re-creating the overlap.
    const item = style(read(STYLES), 'commentItem');
    const gap = num(item, 'paddingVertical')! * 2;
    const src = read('src/components/log/LogComments.tsx');
    const slop = (name: string) => style(src, name);
    const deleteDown = num(slop('HITSLOP_DELETE'), 'bottom')!;
    const bylineUp = num(slop('HITSLOP_BYLINE'), 'top')!;
    expect(deleteDown + bylineUp).toBeLessThanOrEqual(gap);
    // Neither may be starved to buy the other room.
    expect(deleteDown).toBeGreaterThanOrEqual(gap / 2 - 1);
    expect(bylineUp).toBeGreaterThanOrEqual(gap / 2 - 1);
  });

  it('the page deck sits 8pt under the autopsy toggle', () => {
    const src = read(DECK);
    for (const m of src.matchAll(/hitSlop=\{\{([^}]*)\}\}/g)) {
      expect(Number(m[1].match(/top:\s*(\d+)/)![1])).toBeLessThanOrEqual(4);
    }
  });
});

describe('text can be enlarged without leaving its line box', () => {
  // Every FIXED line box on this page, and the cap declared where it renders.
  // 1.35 = scaledTextProps, 1.2 = displayTextProps, 1 = decorative (no scaling).
  const TIERS: Record<string, [cap: number, file: string]> = {
    logFilmTitle: [1.2, 'src/components/log/LogHero.tsx'],
    featuredQuote: [1.2, 'src/components/log/LogReviewBody.tsx'],
    reviewParagraph: [1.35, 'src/components/log/LogReviewBody.tsx'],
    commBody: [1.35, 'src/components/log/LogComments.tsx'],
    privateNotesBody: [1.35, 'src/components/log/LogReviewBody.tsx'],
    critiqueInput: [1.35, 'src/components/log/LogComments.tsx'],
    chronicleReviewText: [1.35, 'src/components/log/LogChronicle.tsx'],
    chronicleReviewTextCurrent: [1.35, 'src/components/log/LogChronicle.tsx'],
    dropCapLetter: [1, 'src/components/log/LogReviewBody.tsx'],
  };
  const PROP: Record<number, RegExp> = {
    1.35: /\{\.\.\.scaledTextProps\}/,
    1.2: /\{\.\.\.displayTextProps\}/,
    1: /allowFontScaling=\{false\}/,
  };

  /** The opening tag that carries this style, brace-aware so `() =>` in a prop
   *  cannot end it early. */
  function tagUsing(src: string, styleName: string): string {
    const at = src.search(new RegExp(`s\\.${styleName}\\b`));
    if (at === -1) return '';
    const start = src.lastIndexOf('<', at);
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      else if (src[i] === '>' && depth === 0) return src.slice(start, i + 1);
    }
    return '';
  }

  // The card has its own stylesheet and its own fixed boxes. All within the
  // caps below; listed so that a new one there is caught too.
  // `ownSite: false` means the cap is inherited from the enclosing <Text>,
  // which RN does for nested text — so there is no prop to assert on the tag.
  const CARD_TIERS: Record<string, [cap: number, file: string, ownSite: boolean]> = {
    pullQuote: [1.2, REVIEW, true],
    review: [1.35, REVIEW, true],
    dropCapText: [1.35, REVIEW, false],  // nested in `review`, inherits its 13pt
    dropCapLetter: [1, REVIEW, true],
  };

  // The enumeration IS the test. A style with a fixed lineHeight and no
  // declared cap fails here rather than clipping on someone's phone — this page
  // grew three such boxes without anyone noticing.
  //
  // `lineHeight: undefined` is deliberately NOT a fixed box: that is how
  // dropCapReview releases the line height so a 32pt initial has room.
  const boxes = (file: string) =>
    [...read(file).matchAll(/(\w+)\s*:\s*\{[^{}]*lineHeight:\s*\d/g)].map((m) => m[1]).sort();

  it('every fixed line box on the record page is accounted for', () => {
    expect(boxes(STYLES)).toEqual(Object.keys(TIERS).sort());
  });

  it('every fixed line box on the card is accounted for', () => {
    expect(boxes(REVIEW)).toEqual(Object.keys(CARD_TIERS).sort());
  });

  it.each(Object.entries(CARD_TIERS))('%s on the card survives its tier', (name, [cap, file, ownSite]) => {
    const body = style(read(file), name);
    const lh = num(body, 'lineHeight')!;
    // dropCapText sets no size of its own — it reads the paragraph's.
    const size = num(body, 'fontSize') ?? num(style(read(file), 'review'), 'fontSize')!;
    expect(lh / (size * cap)).toBeGreaterThanOrEqual(1.05);
    if (ownSite) expect(tagUsing(read(file), name)).toMatch(PROP[cap]);
  });

  it.each(Object.entries(TIERS))('%s survives its declared tier', (name, [cap]) => {
    const body = style(read(STYLES), name);
    const size = num(body, 'fontSize')!;
    const lh = num(body, 'lineHeight')!;
    expect(lh / (size * cap)).toBeGreaterThanOrEqual(1.05);
  });

  // The arithmetic above is only true if the cap is actually DECLARED where the
  // text renders. Without this, deleting the prop leaves every sum still green.
  it.each(Object.entries(TIERS))('%s declares that tier where it renders', (name, [cap, file]) => {
    const tag = tagUsing(read(file), name);
    expect(tag).not.toBe('');
    expect(tag).toMatch(PROP[cap]);
  });

  it('one essay reads at one size', () => {
    // The opening paragraph is a different element from the rest (it carries
    // the initial), and it was the only one without a cap — so at large text
    // paragraph one grew while paragraphs two onward held.
    const src = read('src/components/log/LogReviewBody.tsx');
    for (const p of ['dropCapParagraph', 'reviewParagraph']) {
      expect(tagUsing(src, p)).toMatch(/\{\.\.\.scaledTextProps\}/);
    }
  });

  it('the drop caps do not scale at all — they clipped above 1.01x', () => {
    // Ornamental initials, not reading text. Raising their line height instead
    // would push the first line of the paragraph off its own baseline.
    expect(read(REVIEW)).toMatch(/dropCapLetter\}\s*allowFontScaling=\{false\}/);
    expect(read('src/components/log/LogReviewBody.tsx')).toMatch(/dropCapLetter\}\s*allowFontScaling=\{false\}/);
  });
});

describe('every colour on these surfaces is a named one', () => {
  const SURFACES = [STYLES, HERO, DECK, REVIEW, CARD, POSTER, AUTOPSY,
    'src/components/feed/ActionDeck.tsx', 'src/components/feed/UserAttributionRow.tsx',
    'src/components/log/LogComments.tsx', 'src/components/log/LogReviewBody.tsx',
    'src/components/log/LogChronicle.tsx'];

  it.each(SURFACES)('%s mixes no raw hex', (file) => {
    // #000 stays: it is the shadow colour, and every shadow on these surfaces
    // is black by definition rather than by choice.
    const raw = [...read(file).matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((m) => m[0]).filter((h) => !/^#(000|000000)$/i.test(h));
    expect(raw).toEqual([]);
  });

  it('carries no red the palette already retired', () => {
    // theme.ts says, in as many words, that rgb(125,31,31) was replaced so every
    // red in the app is bloodReel or crimson. Three instances had survived on
    // these two surfaces — the auteur washes on the card and on the record.
    for (const file of [...SURFACES, SCREEN]) {
      expect(read(file)).not.toMatch(/125\s*,\s*31\s*,\s*31/);
    }
  });

  it('does not hand-write a value the theme already names', () => {
    // Nine of these were sitting on these surfaces: the exact digits of
    // bloodFaint, sepiaSubtle, sepiaFaint, sepiaBorder and selection, written
    // out by hand. The token existing is worth nothing if it is bypassed.
    const theme = read('src/theme/theme.ts');
    const flat = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const named = new Map<string, string>();
    for (const m of theme.matchAll(/(\w+):\s*'(rgba\([^']+\))'/g)) named.set(flat(m[2]), m[1]);

    const offenders: string[] = [];
    for (const file of SURFACES) {
      for (const m of read(file).matchAll(/rgba\([^)]+\)/g)) {
        const token = named.get(flat(m[0]));
        if (token) offenders.push(`${file}: ${m[0]} is colors.${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a control that erases something looks like one', () => {
  it('DELETE is the same red on both pages that show it', () => {
    // These two rows are the same control with the same name and size. One of
    // them was changed alone and they drifted — crimson on the dossier, body
    // text on the log. Whatever the colour is, it has to be one colour.
    const log = style(read(STYLES), 'commDelete');
    const dossier = style(read('app/dossier/[id].tsx'), 'commDelete');
    const colourOf = (b: string) => b.match(/color:\s*colors\.(\w+)/)![1];
    expect(colourOf(log)).toBe(colourOf(dossier));
    // …and not a neutral. bone/fog/parchment are what prose is set in.
    expect(['bone', 'fog', 'parchment', 'ash']).not.toContain(colourOf(log));
  });
});

describe('no deck label outgrows its column', () => {
  // A deck splits the width evenly and cannot reflow, so a label that grows
  // past its share wraps or truncates. Both decks now read one shared prop set;
  // this checks the geometry that set was chosen for, at the narrowest width
  // the app targets, with the labels taken from the shipped source.
  // Read from the shipped constants, never restated here: a test that keeps its
  // own copy of the cap goes on passing after someone changes the real one.
  const scaling = read('src/constants/textScaling.ts');
  const deckProps = style(scaling, 'deckLabelProps');
  const CAP = num(style(scaling, 'scaledTextProps'), 'maxFontSizeMultiplier')!;
  const MIN_SCALE = num(deckProps, 'minimumFontScale')!;

  it('the shared props are the capped tier plus one line', () => {
    expect(deckProps).toMatch(/\.\.\.scaledTextProps/);
    expect(deckProps).toMatch(/numberOfLines:\s*1/);
    expect(deckProps).toMatch(/adjustsFontSizeToFit:\s*true/);
    expect(CAP).toBeGreaterThan(1);
    expect(MIN_SCALE).toBeGreaterThan(0);
  });

  const widest = (file: string) => {
    const labels = [...read(file).matchAll(/'([A-Z]{3,})'/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(3);
    return labels.reduce((a, b) => (b.length > a.length ? b : a));
  };

  it.each([
    // record deck: 360 − two 20pt spines − 2pt padding − 3 seams
    ['src/components/log/LogActionDeck.tsx', STYLES, 'deckLabel', (360 - 40 - 2 - 3) / 4],
    // card deck: 360 − two 16pt rails − 2pt card border − 3 seams
    ['src/components/feed/ActionDeck.tsx', 'src/components/feed/ActionDeck.tsx', 'actionLabel', (360 - 32 - 2 - 3) / 4],
  ])('%s never truncates a label', (file, styleFile, styleName, column) => {
    const label = widest(file);
    const body = style(read(styleFile), styleName);
    // Shrink-to-fit lowers the font but NOT the letter spacing, which is a
    // fixed pt value — the reason a label can still overrun after shrinking.
    const floor = num(body, 'fontSize')! * CAP * MIN_SCALE;
    expect(textWidth(label, floor, num(body, 'letterSpacing')!)).toBeLessThanOrEqual(column);
    // And every label declares the shared props rather than its own.
    const src = read(file);
    const labelTags = [...src.matchAll(/<Text[^>]*?(?:deckLabel|actionLabel)[^>]*>/g)];
    expect(labelTags.length).toBeGreaterThan(3);
    for (const t of labelTags) expect(t[0]).toMatch(/\{\.\.\.deckLabelProps\}/);
  });
});

describe('the page pays only for what it shows', () => {
  it('the share card mounts on demand, not on every open', () => {
    const src = read(SCREEN);
    expect(src).toMatch(/shareCardMounted &&/);
    expect(src).toMatch(/setShareCardMounted\(true\)/);
    // And is always released, including after a failed capture.
    expect(src).toMatch(/finally[\s\S]{0,200}setShareCardMounted\(false\)/);
  });

  it('subscribes to values, not to the whole store', () => {
    const src = read(SCREEN);
    // Destructuring the store re-renders this screen on any change anywhere.
    expect(src).not.toMatch(/const \{[^}]*\} = useInteractionStore\(\)/);
    expect(src).toMatch(/useInteractionStore\(st =>/);
  });

  it('a rating-only log renders no empty review section', () => {
    expect(read('src/components/log/LogReviewBody.tsx')).toMatch(/if \(!hasBody\) return null/);
  });
});

describe('the log page offers what the card offers', () => {
  it('a visitor can save the film from the record', () => {
    const deck = read(DECK);
    expect(deck).toMatch(/isOwner \?/);          // EDIT on your own
    expect(deck).toMatch(/\bonSavePress\b/);     // SAVE on someone else's
    expect(read(SCREEN)).toMatch(/\bhandleToggleSave\b/);
  });
});
