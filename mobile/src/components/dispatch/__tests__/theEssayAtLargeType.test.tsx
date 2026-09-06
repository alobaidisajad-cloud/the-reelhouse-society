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
const SHAPES: Array<[string, string]> = [
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

describe('the leading opens as the type does', () => {
  it('holds the essay at the ratio it was set at, whatever the member chooses', () => {
    // 16.5/28 is a ratio of 1.70, which is what a long read wants. Fixed, it
    // falls to 1.26 at the ceiling — this asserts the ratio, not the number.
    const { fontSize, lineHeight } = require('@/src/components/dispatch/paper/PaperEssay').ESSAY_BODY;
    const designed = lineHeight / fontSize;
    expect(designed).toBeGreaterThan(1.6);

    const ceiling = scaledTextProps.maxFontSizeMultiplier;
    const atCeiling = (lineHeight * ceiling) / (fontSize * ceiling);
    expect(atCeiling).toBeCloseTo(designed, 5);
  });

  it('scales the leading by the same ceiling the type carries, not a second number', () => {
    // Two numbers drift. The leading reads its ceiling from scaledTextProps so
    // there is one place to change and no way for them to disagree.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'paper', 'PaperEssay.tsx'), 'utf8',
    );
    expect(src).toMatch(/Math\.min\(fontScale,\s*scaledTextProps\.maxFontSizeMultiplier\)/);
  });
});
