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
import { formatFiledDate, hasPhysicalFormat } from '@/src/components/log/logRecord';

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

/** Brace-matched, so a single-line style cannot swallow the next block's body. */
function style(src: string, name: string): string {
  const at = src.search(new RegExp(`\\b${name}\\s*:\\s*\\{`));
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
  });

  it('one date shape on the page', () => {
    expect(formatFiledDate('2026-08-05')).toBe('AUG 5, 2026');
    // The critiques list used to print the device's short form beneath it.
    expect(read('src/components/log/LogComments.tsx')).not.toMatch(/toLocaleDateString/);
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
    for (const f of [REVIEW, 'src/components/log/LogReviewBody.tsx', 'src/components/log/LogComments.tsx']) {
      expect(read(f)).toMatch(/\bisRTLText\b/);
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
    // …and the host that clips must not carry a box shadow.
    expect(clip).toMatch(/overflow:\s*['"]hidden['"]/);
    expect(clip.split('\n').filter((l) => !/textShadow/.test(l)).join('\n'))
      .not.toMatch(/shadowOpacity|shadowRadius|shadowOffset/);
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

  it('the page deck sits 8pt under the autopsy toggle', () => {
    const src = read(DECK);
    for (const m of src.matchAll(/hitSlop=\{\{([^}]*)\}\}/g)) {
      expect(Number(m[1].match(/top:\s*(\d+)/)![1])).toBeLessThanOrEqual(4);
    }
  });
});

describe('text can be enlarged without leaving its line box', () => {
  const cases: [string, number][] = [
    ['logFilmTitle', 1.2],
    ['featuredQuote', 1.2],
    ['reviewParagraph', 1.35],
    ['commBody', 1.35],
    ['privateNotesBody', 1.35],
  ];
  it.each(cases)('%s survives its declared tier', (name, cap) => {
    const body = style(read(STYLES), name);
    const size = num(body, 'fontSize')!;
    const lh = num(body, 'lineHeight')!;
    expect(lh / (size * cap)).toBeGreaterThanOrEqual(1.05);
  });

  it('the drop caps do not scale at all — they clipped above 1.01x', () => {
    // Ornamental initials, not reading text. Raising their line height instead
    // would push the first line of the paragraph off its own baseline.
    expect(read(REVIEW)).toMatch(/dropCapLetter\}\s*allowFontScaling=\{false\}/);
    expect(read('src/components/log/LogReviewBody.tsx')).toMatch(/dropCapLetter\}\s*allowFontScaling=\{false\}/);
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
