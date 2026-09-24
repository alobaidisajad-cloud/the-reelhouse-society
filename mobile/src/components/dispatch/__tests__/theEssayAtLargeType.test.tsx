/**
 * theEssayAtLargeType.test.tsx — what a dossier does when a member turns the
 * type up.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two faults lived here, and neither was visible to anything that existed:
 *
 *  1. NO CEILING. React Native scales text with no maximum unless one is set.
 *     The paragraph rule set one, so everything INSIDE a paragraph — bold,
 *     italic, a link, a quotation, inline code — inherited it. Everything the
 *     library renders outside a paragraph did not: a heading, a list item, a
 *     fenced block and a table cell all grew without limit. A member can type
 *     any of them whether or not the toolbar offers it.
 *
 *  2. NO LEADING. `lineHeight` is an absolute number, so the type grew and the
 *     leading did not. Measured on the reader: a ratio of 1.70 — right for a
 *     long read — became 1.26 at the largest setting. The one screen built for
 *     reading got harder to read at exactly the setting chosen by the people
 *     who need bigger type.
 *
 * ── WHY NOTHING CAUGHT EITHER ───────────────────────────────────────────────
 * The ceiling test scans JSX `<Text>` and these are produced by the library.
 * The rendered sweep found nothing because no plate drew the markdown path —
 * the essay plate hand-builds its paragraphs. And every layout check renders at
 * normal type, where a missing ceiling looks exactly like a present one.
 *
 * ── AND WHAT THIS HAD TO GET RIGHT ──────────────────────────────────────────
 * INHERITANCE. Reading each node's own props reports the blockquote, the link
 * and the prose around it as uncapped, and all three inherit correctly. That
 * first reading would have filed four faults that were not there.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import { scaledTextProps } from '@/src/constants/textScaling';

jest.mock('@/src/utils/markdownSafety', () => ({
  capMarkdownForRender: (s: string) => s,
  onMarkdownLinkPress: () => false,
}));

/** Every shape a member can type, whether or not the toolbar offers it. */
const SHAPES: [string, string][] = [
  ['a paragraph', 'A second paragraph of ordinary prose.'],
  ['a heading', '# A Heading Here'],
  ['a smaller heading', '## A Smaller Heading'],
  ['the smallest heading', '### Smaller Still'],
  ['bold', 'Some **bold words** here.'],
  ['italic', 'Some *italic words* here.'],
  ['a link', 'A [link](https://example.com) in prose.'],
  ['a quotation', '> A quotation set apart.'],
  ['a bullet list', '- first item\n- second item'],
  ['an ordered list', '1. first item\n2. second item'],
  ['inline code', 'A `code span` in prose.'],
  ['a fenced block', '```\na fenced block\n```'],
  ['a table', '| a | b |\n| - | - |\n| 1 | 2 |'],
];

/**
 * Text with no ceiling anywhere above it. `known` are the two characters the
 * library draws inside its own list-item rule, beside the numbering logic —
 * capping those means copying forty lines of its internals, which breaks
 * silently on an upgrade for one to three characters of misalignment.
 */
const uncappedIn = (tree: unknown): string[] => {
  const out: string[] = [];
  const walk = (n: any, capped: boolean) => {
    if (!n || typeof n === 'string') return;
    let c = capped;
    if (n.props?.allowFontScaling === false) c = true;
    else if (typeof n.props?.maxFontSizeMultiplier === 'number') c = true;

    const kids = n.children ?? [];
    const text = kids.filter((k: any) => typeof k === 'string').join('').trim();
    if (text && !c) out.push(text);
    kids.forEach((k: any) => walk(k, c));
  };
  walk(tree, false);
  return out;
};

const LIST_MARKERS = /^(·|\d+\.)$/;

describe('every shape in a dossier has a ceiling on how far it may grow', () => {
  for (const [name, src] of SHAPES) {
    it(name + ' cannot grow without limit', () => {
      const { toJSON } = render(<EssayBody text={'The opening line of the essay.\n\n' + src} />);
      const bare = uncappedIn(toJSON()).filter((t) => !LIST_MARKERS.test(t));
      expect(bare).toEqual([]);
    });
  }

  it('finds text at all, so a silent zero cannot pass for a clean sweep', () => {
    // If the walker stopped matching, every case above would pass by seeing
    // nothing. This proves it reads the tree.
    const { toJSON } = render(<EssayBody text={'One paragraph.\n\n# A heading'} />);
    const all: string[] = [];
    const walk = (n: any) => {
      if (!n || typeof n === 'string') return;
      const kids = n.children ?? [];
      const t = kids.filter((k: any) => typeof k === 'string').join('').trim();
      if (t) all.push(t);
      kids.forEach(walk);
    };
    walk(toJSON());
    expect(all.join(' ')).toContain('A heading');
  });
});

/**
 * ── THE LEADING IS THE PHONE'S TO GROW, ONCE ────────────────────────────────
 * This section used to assert the opposite: that `lineHeight` is fixed and the
 * essay must grow it. React Native grows it itself, by the same capped factor
 * as the type (iOS RCTAttributedTextUtils.mm, Android TextAttributes.kt), so
 * the essay's own growing was a second one — at the largest setting a ratio of
 * 2.30 where the design set 1.70. What is asserted now is what the phone is
 * handed: the designed number, at every setting, for the phone to grow once.
 */
describe('the leading is grown once, by the phone', () => {
  const { ESSAY_BODY } = require('@/src/components/dispatch/paper/PaperEssay');

  /** Every line height the essay hands the phone, flattened. */
  const leadingsIn = (tree: unknown): number[] => {
    const out: number[] = [];
    const flat = (s: any): any => (Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s ?? {});
    const walk = (n: any) => {
      if (!n || typeof n === 'string') return;
      const lh = flat(n.props?.style).lineHeight;
      if (n.type === 'Text' && typeof lh === 'number') out.push(lh);
      (n.children ?? []).forEach(walk);
    };
    walk(tree);
    return out;
  };

  it('is set for a long read: 16.5/28, a ratio above 1.6', () => {
    expect(ESSAY_BODY.lineHeight / ESSAY_BODY.fontSize).toBeGreaterThan(1.6);
  });

  it.each([1, 1.2, scaledTextProps.maxFontSizeMultiplier, 2])(
    'hands the phone the designed leading at text size %s, never one already grown',
    (fontScale) => {
      const dims = jest.spyOn(require('react-native'), 'useWindowDimensions')
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
      try {
        // The markdown path the app reads, and the design's own pieces the
        // plates are drawn with — a plate set at twice its leading would
        // mislead the next measurement as surely as the app would mislead a member.
        const { EssayOpening, EssayPara } = require('@/src/components/dispatch/paper/PaperEssay');
        const { toJSON } = render(
          <>
            <EssayBody text={'The opening line of the essay.\n\nA second paragraph.\n\n# A heading'} />
            <EssayOpening text="An opening set by hand." />
            <EssayPara>A paragraph set by hand.</EssayPara>
          </>,
        );
        const leadings = leadingsIn(toJSON());
        expect(leadings).toContain(ESSAY_BODY.lineHeight);
        // Nothing larger than any leading the design wrote down.
        expect(Math.max(...leadings)).toBeLessThanOrEqual(ESSAY_BODY.lineHeight);
      } finally {
        dims.mockRestore();
      }
    },
  );
});
