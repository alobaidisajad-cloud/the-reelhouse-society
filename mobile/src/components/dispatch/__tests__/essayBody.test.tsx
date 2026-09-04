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

/**
 * ── THE BRANCHES THE DROP CAP DEPENDS ON ────────────────────────────────────
 * `plainTextOf` decides whether a paragraph can take a drop cap. It returned
 * null for every paragraph once already — the drop cap had NEVER rendered — so
 * the three ways it says no are worth entering deliberately rather than
 * trusting.
 *
 * And the horizontal rule, which is the house's printed ornament between
 * sections and had no test at all.
 */
describe('the essay’s ornaments and its refusals', () => {
  const draw = (text: string) => {
    const { toJSON } = render(<EssayBody text={text} />);
    return JSON.stringify(toJSON());
  };

  /**
   * A drop cap, found by its SHAPE rather than by a style name.
   *
   * Style names do not survive into the rendered tree — RN flattens them to
   * values — so asserting on the string "dropCap" passes for nothing and fails
   * for everything. It failed here on a cap that renders correctly, which is
   * the test being wrong, not the essay.
   *
   * What a cap actually is: a Text whose entire content is ONE character, set
   * much larger than the prose beside it.
   */
  const hasDropCap = (text: string): boolean => {
    const { toJSON } = render(<EssayBody text={text} />);
    let found = false;
    const walk = (n: any) => {
      if (n == null || typeof n === 'string' || found) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const kids = n.children ?? [];
      const size = Number(n.props?.style?.fontSize ?? 0);
      if (
        n.type === 'Text' && size >= 40
        && kids.length === 1 && typeof kids[0] === 'string' && kids[0].length === 1
      ) { found = true; return; }
      walk(kids);
    };
    walk(toJSON());
    return found;
  };

  it('sets a section rule as the ornament, not a line', () => {
    // `---` in an essay is the ✦ break, drawn by EssayBreak. It had never run.
    const out = draw('An opening paragraph that runs on for a while.\n\n---\n\nAnd then the next.');
    expect(out).toContain('✦');
  });

  it('draws a drop cap on an opening that is plain prose', () => {
    expect(hasDropCap('Ozu frames a room and then he leaves it entirely alone for a while.'))
      .toBe(true);
  });

  it('refuses one where the opening is not plain text', () => {
    /**
     * Three refusals, and each is a real shape a member can type:
     *   · a paragraph whose first child is not a text group — an image
     *   · one with mixed inline nodes — bold in the first words
     *   · an empty one
     * A cap taken from any of these would print the markup's characters.
     */
    expect(hasDropCap('**Ozu** frames a room and then leaves it entirely alone.')).toBe(false);
    expect(hasDropCap('![a still](https://example.com/x.png)')).toBe(false);
  });

  it('draws nothing at all for an essay with no words in it', () => {
    const { toJSON } = render(<EssayBody text="   " />);
    expect(toJSON()).toBeNull();
  });
});

describe('an essay does not fetch from strangers', () => {
  /**
   * `![](https://anywhere/x.png)` in a dossier reached the markdown library's
   * default image rule, which renders an <Image> and LOADS the URL —
   * automatically, on render, with no tap and no allowlist.
   *
   * That is a tracking pixel. The author of an essay learns the address of
   * everybody who reads it, and what sits at the far end can be changed after
   * the Tribunal has read the words. This app has a whole module about that
   * risk for LINKS, whose docstring calls `safeOpenURL` "the single choke-point
   * every externally-sourced link must pass through" — and an image is worse,
   * because a link at least needs a tap.
   *
   * How it surfaced: an image in a test CRASHED the renderer, which is what
   * proved the library was really trying to load one.
   */
  const treeOf = (text: string) => JSON.stringify(render(<EssayBody text={text} />).toJSON());

  it('loads no remote image, and mounts no Image at all', () => {
    const out = treeOf('An opening line here.\n\n![a still](https://tracker.example/pixel.png)');
    expect(out).not.toContain('tracker.example');
    expect(out).not.toContain('"Image"');
  });

  it('says what was there, using the words the member wrote', () => {
    const { getByText } = render(
      <EssayBody text={'An opening line here.\n\n![the last shot](https://x.example/a.png)'} />,
    );
    expect(getByText('[image: the last shot]')).toBeTruthy();
  });

  it('still says something when there is no alt text to use', () => {
    const { getByText } = render(
      <EssayBody text={'An opening line here.\n\n![](https://x.example/a.png)'} />,
    );
    expect(getByText('[image]')).toBeTruthy();
  });
});
