/**
 * personPage.test.ts — the artist's file had no tests at all.
 * ─────────────────────────────────────────────────────────────
 * Every fix in the Person pass was unguarded before this. These pin the four
 * that would fail SILENTLY — no crash, no type error, just a page that quietly
 * goes back to being wrong:
 *
 *   · the canon's ordering (a sort is invisible until you read the screen)
 *   · the line-box headroom (only shows on a device with enlarged text)
 *   · the tap-target overlap (only shows as opening the wrong film)
 *   · the two Android elevation pairings (only show on Android)
 *
 * Source-reading rather than rendering, deliberately: these are properties of
 * the stylesheet and the sort, and a render test would prove less while
 * costing more.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SCREEN = 'app/person/[id].tsx';
const STYLES = 'src/components/person/personStyles.ts';
const HERO = 'src/components/person/PersonHero.tsx';
const FILMOG = 'src/components/person/PersonFilmography.tsx';
const DEFINING = 'src/components/person/PersonDefining.tsx';

/** Pulls `key: { … }` or a single-line `key: { … },` out of a stylesheet. */
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
  const m = body.match(new RegExp(`${prop}\\s*:\\s*(-?[\\d.]+)`));
  return m ? Number(m[1]) : undefined;
};

describe('THE CANON is ordered as a record', () => {
  it('does not treat a missing date as the newest thing in the file', () => {
    const src = read(SCREEN);
    // The old sort substituted this sentinel, which floated undated entries to
    // the very top — a 92-film career opened on an untitled placeholder.
    expect(src).not.toContain("'9999-99-99'");
  });

  it('ranks released work above announced work above undated', () => {
    const src = read(SCREEN);
    const fn = src.match(/const rank = \(c: PersonCredit\) =>([\s\S]*?);\n/);
    expect(fn).not.toBeNull();
    // Reconstruct the shipped expression rather than a copy of it.
    const rank = new Function('c', 'today', `return (${fn![1].trim()});`) as (c: any, t: string) => number;
    const today = '2026-08-15';
    expect(rank({ release_date: '2001-01-01' }, today)).toBe(0);
    expect(rank({ release_date: '2027-01-01' }, today)).toBe(1);
    expect(rank({}, today)).toBe(2);
  });
});

describe('text can grow without leaving its line box', () => {
  // The page declares the 1.2 tier. A fixed lineHeight must still contain the
  // glyphs at that cap, or enlarged system text clips.
  const CAP = 1.2;
  const cases: [string, string][] = [
    [STYLES, 'personName'],
    [STYLES, 'recordValue'],
    [STYLES, 'gridTitle'],
    [STYLES, 'defTitle'],
  ];
  it.each(cases)('%s :: %s survives the 1.2 tier', (file, name) => {
    const body = style(read(file), name);
    expect(body).not.toBe('');
    const size = num(body, 'fontSize');
    const lh = num(body, 'lineHeight');
    expect(size).toBeGreaterThan(0);
    if (lh === undefined) return; // no fixed line box, nothing to outgrow
    expect(lh / (size! * CAP)).toBeGreaterThanOrEqual(1.05);
  });

  it('the grid title reserves room for the two lines it now allows', () => {
    const body = style(read(STYLES), 'gridTitle');
    const lh = num(body, 'lineHeight')!;
    const h = num(body, 'height')!;
    // A fixed height is what keeps a three-column grid's rows level when one
    // title wraps and its neighbour does not.
    expect(h).toBeGreaterThanOrEqual(lh * 2);
  });
});

describe('neighbouring posters do not steal each other’s taps', () => {
  it('grid cards claim at most half the real gap', () => {
    const src = read(FILMOG);
    const slop = src.match(/hitSlop=\{\{([^}]*)\}\}/);
    expect(slop).not.toBeNull();
    const side = (n: string) => Number((slop![1].match(new RegExp(`${n}\\s*:\\s*(\\d+)`)) || [])[1] ?? 15);
    // Columns are 10pt apart (gridColLeft paddingRight 0 + gridColCenter
    // paddingLeft 10); rows are 18 (gridCard 8 + column 10).
    expect(side('left')).toBeLessThanOrEqual(5);
    expect(side('right')).toBeLessThanOrEqual(5);
    expect(side('top')).toBeLessThanOrEqual(9);
    expect(side('bottom')).toBeLessThanOrEqual(9);
  });

  it('defining cards claim at most half their separator', () => {
    const src = read(DEFINING);
    const sep = num(style(read(STYLES), 'defSeparator'), 'width');
    expect(sep).toBe(12);
    const slop = src.match(/hitSlop=\{\{([^}]*)\}\}/);
    expect(slop).not.toBeNull();
    const side = (n: string) => Number((slop![1].match(new RegExp(`${n}\\s*:\\s*(\\d+)`)) || [])[1] ?? 15);
    expect(side('left')).toBeLessThanOrEqual(sep! / 2);
    expect(side('right')).toBeLessThanOrEqual(sep! / 2);
  });
});

describe('Android paint order is paired, not half-declared', () => {
  it('the portrait sits above its own glow', () => {
    const src = read(STYLES);
    const glow = num(style(src, 'portraitGlow'), 'elevation');
    const card = num(style(src, 'portraitCard'), 'elevation');
    expect(glow).toBeGreaterThan(0);
    // Android orders siblings by elevation, not JSX. Without this the glow — a
    // wash 10pt larger than the card on every side — painted over the face.
    expect(card).toBeGreaterThan(glow!);
  });

  it('the veil covers the list but never the way out', () => {
    const src = read(STYLES);
    const veil = num(style(src, 'topVeil'), 'elevation');
    const back = num(style(src, 'floatingBack'), 'elevation');
    const portrait = num(style(src, 'portraitCard'), 'elevation');
    expect(veil).toBeGreaterThan(portrait!); // clears everything in the list
    expect(back).toBeGreaterThan(veil!);     // and stays under the back button
  });
});

describe('the record card', () => {
  it('only renders rows that have something to say', () => {
    const src = read(HERO);
    // Guards the empty-data cases: a file with no birthday, no birthplace and
    // no credits must produce no card rather than an empty brass frame.
    expect(src).toMatch(/rows\.length > 0 &&/);
  });

  it('keeps KNOWN FOR alive exactly when the shelf cannot show it', () => {
    const src = read(HERO);
    expect(src).toMatch(/definingWorksCount === 0/);
  });
});

describe('the skeleton describes the page that actually arrives', () => {
  it('mirrors the record card, not the caption lines it replaced', () => {
    const src = read(SCREEN);
    expect(src).toContain('shimmerRecordCard');
    for (const dead of ['shimmerDateRow', 'shimmerPlaceRow', 'shimmerStatsRow']) {
      expect(src).not.toContain(dead);
    }
  });
});

describe('the record card’s labels fit the column they sit in', () => {
  // Caught a real defect: "KNOWN FOR" measured 72pt against a 58pt column and
  // would have wrapped or clipped on every file where the shelf was empty.
  // Nothing in TypeScript or the renderer complains about that — the text just
  // silently goes to two lines.
  const EM_PER_CHAR = 0.626; // Special Elite, read from the TTF
  const CAP = 1.2;           // the tier this text declares

  it('every label the card can emit fits, at rest AND at the cap', () => {
    const hero = read(HERO);
    // The labels are lifted OUT of the component, so adding a new row without
    // widening the column fails here instead of on someone's screen.
    const labels = [...hero.matchAll(/label:\s*'([A-Z ]+)'/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThanOrEqual(3);

    const body = style(read(STYLES), 'recordLabel');
    const col = num(body, 'width')!;
    const size = num(body, 'fontSize')!;
    const ls = num(body, 'letterSpacing')!;

    const tooWide = labels.filter((l) => {
      // letterSpacing is a fixed point value: it does not scale with the font.
      const w = l.length * (size * CAP * EM_PER_CHAR + ls);
      return w > col;
    });
    expect(tooWide).toEqual([]);
  });
});

describe('every way off the page is reachable and labelled', () => {
  it('all three screen states use the same back control', () => {
    const src = read(SCREEN);
    // Loading and error used to wrap a bare PressableScale in a View, so the
    // tap target was the icon plus its slop rather than the circle you can see,
    // and neither announced itself. The page has three states; a blind member
    // hits all three.
    const labelled = (src.match(/accessibilityLabel="Go back"/g) || []).length;
    const styled = (src.match(/style=\{\[s\.floatingBack, floatingBackDynStyle\]\}/g) || []).length;
    expect(styled).toBeGreaterThanOrEqual(3);
    expect(labelled).toBe(styled);
    // And none of them may go back to being a plain View wrapper.
    expect(src).not.toMatch(/<View style=\{\[s\.floatingBack/);
  });
});
