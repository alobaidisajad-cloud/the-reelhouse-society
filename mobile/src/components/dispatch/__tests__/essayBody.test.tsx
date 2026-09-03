/**
 * essayBody.test.tsx — the essay, and the two guards it must not bypass.
 * ─────────────────────────────────────────────────────────────────────────────
 * Nothing had ever run this file. It is nineteen statements that decide how a
 * twenty-five-thousand-word dossier is set AND whether a `[click](tel:…)` in
 * somebody's essay can dial a number, so "nineteen statements" is not a reason
 * to leave it unexercised.
 *
 * The drop-cap test exists because of a specific claim in the component's own
 * docstring: the paragraph counter is "reset on every render pass rather than
 * held in state", with a paragraph explaining that a counter which survives a
 * re-render would make the drop cap migrate down the essay. The counter is
 * closed over inside a `useMemo` keyed on the body text — so it survives every
 * re-render where the text has not changed, which is all of them. The reader
 * re-renders whenever a critique arrives.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { EssayBody } from '@/src/components/dispatch/EssayBody';

const mockLinkPress = jest.fn(() => false);
jest.mock('@/src/utils/markdownSafety', () => ({
  capMarkdownForRender: jest.fn((s: string) => s.slice(0, 25000)),
  onMarkdownLinkPress: (...a: unknown[]) => mockLinkPress(...(a as [])),
}));

const OPENING = 'Ozu frames a room and then leaves it. The camera stays at the height of somebody kneeling.';
const SECOND = 'What follows is not a shot list. It is an argument about attention.';

/** The drop cap is the design's own opening block: one big letter, set apart. */
const capOf = (tree: unknown): string | null => {
  const found: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    const size = Array.isArray(n.props?.style)
      ? Object.assign({}, ...n.props.style.filter(Boolean))
      : n.props?.style;
    if (size && size.fontSize >= 40 && typeof n.children?.[0] === 'string') found.push(n.children[0]);
    for (const k of n.children ?? []) walk(k);
  };
  walk(tree);
  return found[0] ?? null;
};

beforeEach(() => { mockLinkPress.mockClear(); });

describe('the essay body', () => {
  it('sets the first paragraph with a drop cap', () => {
    const { toJSON } = render(<EssayBody text={`${OPENING}\n\n${SECOND}`} />);
    expect(capOf(toJSON())).toBe('O');
  });

  it('KEEPS the drop cap when the page re-renders', () => {
    // A critique arriving under the essay re-renders the reader. The body text
    // is unchanged, so the memoised rules — and the counter inside them — are
    // reused, and every paragraph looks like "not the first one".
    const { toJSON, rerender } = render(<EssayBody text={`${OPENING}\n\n${SECOND}`} />);
    expect(capOf(toJSON())).toBe('O');

    rerender(<EssayBody text={`${OPENING}\n\n${SECOND}`} />);
    expect(capOf(toJSON())).toBe('O');

    // And still there several renders later, because the reader does this a lot.
    for (let i = 0; i < 4; i++) rerender(<EssayBody text={`${OPENING}\n\n${SECOND}`} />);
    expect(capOf(toJSON())).toBe('O');
  });

  it('sets a first paragraph that carries emphasis as an ordinary one', () => {
    // The cap needs the letter as a string. Breaking the markup to get it would
    // print the asterisks, so the design gives way rather than the guard.
    const { toJSON } = render(<EssayBody text={`*${OPENING}*\n\n${SECOND}`} />);
    expect(capOf(toJSON())).toBeNull();
  });

  it('renders nothing at all for an empty body', () => {
    // Braces, not quotes. `text="   \n  "` is a JSX attribute STRING, where a
    // backslash is a backslash — so the first draft of this test handed the
    // component two literal characters, watched it correctly set a drop-cap
    // `\` followed by `n`, and called that a bug in the component.
    expect(render(<EssayBody text={'   \n  '} />).toJSON()).toBeNull();
    expect(render(<EssayBody text={''} />).toJSON()).toBeNull();
  });

  it('passes member markdown through the cap, never raw', () => {
    const { capMarkdownForRender } = require('@/src/utils/markdownSafety');
    render(<EssayBody text={OPENING} />);
    expect(capMarkdownForRender).toHaveBeenCalledWith(OPENING);
  });

  it('hands every link to the app’s own handler', () => {
    // `onMarkdownLinkPress` is the only thing standing between a member's essay
    // and a `tel:` or Android `intent://` link opening. If the renderer is
    // mounted without it, markdown opens links itself.
    render(<EssayBody text={`[a link](https://example.com)\n\n${SECOND}`} />);
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'EssayBody.tsx'), 'utf8',
    );
    expect(src).toMatch(/onLinkPress=\{onMarkdownLinkPress\}/);
  });
});
