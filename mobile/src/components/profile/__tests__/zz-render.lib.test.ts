/**
 * zz-render.lib.test.ts — the mockup harness must not lie about the app.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Four mockups went out looking wrong, and every single cause was a place where
 * React Native and CSS use the SAME WORD for a DIFFERENT DEFAULT. Not one was a
 * fault in the app. Each one was invisible in the markup and only appeared as a
 * smear in the picture, so each was found by eye, one per round.
 *
 * They are pinned here because the next one will be found the same slow way
 * unless the known ones can never come back.
 *
 *   1. a style prop arrives as an object, an array, or (rarely) an id.
 *   2. flex-shrink defaults to 0 in RN, 1 in CSS.  → everything crushed to fit
 *   3. position defaults to relative in RN, static in CSS.  → overlays escaped
 *   4. zIndex is sibling-scoped in RN, context-wide in CSS.  → text over the bar
 *   5. `paddingHorizontal` and friends do not exist in CSS.  → insets dropped
 *   6. a border needs a STYLE in CSS, and its initial width is `medium`.
 *   7. `flex: 0` means "size to content" in RN, "collapse" in CSS.  → 16x0 icons
 *   8. transform units are per-function; `scale(1px)` voids the WHOLE list.
 */
import { StyleSheet } from 'react-native';
import { css, expandBox, flat, decodeColour, toHtml } from './zz-render.lib';

const decl = (out: string) => new Set(out.split(';').filter(Boolean));
const has = (out: string, d: string) => decl(out).has(d);
/** The last declaration of a property is the one CSS applies. */
const wins = (out: string, prop: string) => {
  const all = out.split(';').filter((d) => d.startsWith(prop + ':'));
  return all.length ? all[all.length - 1] : null;
};

describe('1 — every shape a style prop arrives in', () => {
  /**
   * A correction: the first diagnosis of the missing backdrop fade blamed
   * `StyleSheet.absoluteFill` being a registered id — a number the converter
   * returned untouched. It is not. In this RN version it is a plain object,
   * and the fade was never missing from the live page at all; it was missing
   * from the PROPOSED scaffold, because that scaffold had never been given
   * one. The flatten path below is kept because it costs nothing and handles
   * an id if one ever appears, but it fixed nothing and is not load-bearing.
   */
  it('resolves absoluteFill however RN chooses to represent it', () => {
    expect(flat(StyleSheet.absoluteFill)).toMatchObject({ position: 'absolute', top: 0, bottom: 0 });
  });

  it('flattens an array, in order, with later entries winning', () => {
    expect(flat([{ a: 1, b: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });

  it('treats a missing style as empty rather than throwing', () => {
    expect(flat(undefined)).toEqual({});
    expect(flat(null)).toEqual({});
  });
});

describe('2, 3, 4 — the three defaults every box needs', () => {
  const out = css({}, false);
  it('does not shrink', () => expect(has(out, 'flex-shrink:0')).toBe(true));
  it('is positioned, so an absolute child anchors to it', () =>
    expect(has(out, 'position:relative')).toBe(true));
  it('is its own stacking context, so a child zIndex cannot escape', () =>
    expect(has(out, 'z-index:0')).toBe(true));

  it('lets the real style win over each default', () => {
    const o = css({ position: 'absolute', zIndex: 10, flexShrink: 1 }, false);
    expect(wins(o, 'position')).toBe('position:absolute');
    expect(wins(o, 'z-index')).toBe('z-index:10');
    expect(wins(o, 'flex-shrink')).toBe('flex-shrink:1');
  });

  /**
   * Text is positioned but never shrink-locked. RN paints in document order,
   * so a label must be positioned or an absolutely-filled sibling (the stub's
   * brass ramp) paints over it — the words vanished off a gold plate. But it
   * must still be allowed to shrink, or a one-line label in a flex row
   * overflows instead of ellipsising.
   */
  it('positions text so document order decides what is on top', () => {
    const o = css({ color: '#fff' }, true);
    expect(has(o, 'position:relative')).toBe(true);
    expect(has(o, 'z-index:0')).toBe(true);
  });

  it('but never shrink-locks it, or a capped label overflows its row', () => {
    expect(css({ color: '#fff' }, true)).not.toMatch(/flex-shrink/);
  });

  it('and never lays a span out as a flex box', () => {
    expect(css({ color: '#fff' }, true)).not.toMatch(/display:flex/);
  });
});

describe('5 — the insets RN actually writes', () => {
  it('expands paddingHorizontal, which is the commonest key in the codebase', () => {
    const o = css({ paddingHorizontal: 24 }, false);
    expect(has(o, 'padding-left:24px')).toBe(true);
    expect(has(o, 'padding-right:24px')).toBe(true);
  });

  it('expands the vertical and margin forms too', () => {
    expect(has(css({ paddingVertical: 8 }, false), 'padding-top:8px')).toBe(true);
    expect(has(css({ marginHorizontal: 12 }, false), 'margin-right:12px')).toBe(true);
    expect(has(css({ marginVertical: 6 }, false), 'margin-bottom:6px')).toBe(true);
  });

  it('honours RN precedence: a named side beats the shorthand it belongs to', () => {
    const st = expandBox({ paddingHorizontal: 20, paddingLeft: 4 });
    expect(st.paddingLeft).toBe(4);
    expect(st.paddingRight).toBe(20);
  });

  it('and paddingHorizontal beats the all-round padding', () => {
    const st = expandBox({ padding: 2, paddingHorizontal: 16 });
    expect(st.paddingLeft).toBe(16);
    expect(st.paddingTop).toBe(2);
  });
});

describe('6 — a border that actually draws, on the sides it was asked for', () => {
  it('sets a style, because CSS draws nothing without one', () => {
    expect(has(css({ borderBottomWidth: 1, borderBottomColor: '#fff' }, false), 'border-style:solid')).toBe(true);
  });

  it('zeroes the width first, because CSS initial width is `medium` not 0', () => {
    // Without this a single bottom hairline drew a 3px box on all four sides.
    const o = css({ borderBottomWidth: 1 }, false);
    expect(has(o, 'border-width:0')).toBe(true);
    expect(wins(o, 'border-bottom-width')).toBe('border-bottom-width:1px');
  });

  it('leaves a border-free box alone', () => {
    expect(css({ backgroundColor: '#000' }, false)).not.toMatch(/border-style/);
  });

  it('lets an explicit dashed style win — the ticket tear line', () => {
    expect(wins(css({ borderLeftWidth: 1, borderStyle: 'dashed' }, false), 'border-style'))
      .toBe('border-style:dashed');
  });
});

describe('7 — flex means opposite things in the two languages', () => {
  it('RN `flex: 0` sizes to content; CSS `flex: 0` collapses it', () => {
    // Lucide sets flex:0 on EVERY icon. Passing it through measured 16x0.
    expect(wins(css({ flex: 0 }, false), 'flex')).toBe('flex:0 0 auto');
  });

  it('RN `flex: 1` fills, and needs the min-size unlocked to do it', () => {
    const o = css({ flex: 1 }, false);
    expect(wins(o, 'flex')).toBe('flex:1 1 0%');
    expect(has(o, 'min-width:0')).toBe(true);
    expect(has(o, 'min-height:0')).toBe(true);
  });

  it('handles a weight above one, and RN\'s negative form', () => {
    expect(wins(css({ flex: 2 }, false), 'flex')).toBe('flex:2 1 0%');
    expect(wins(css({ flex: -1 }, false), 'flex')).toBe('flex:0 1 auto');
  });
});

describe('8 — transform units are per function', () => {
  it('leaves scale unitless', () => {
    // `scale(1px)` is invalid, and one invalid function voids the WHOLE list —
    // taking any translate beside it with it.
    expect(css({ transform: [{ scale: 1 }] }, false)).toContain('transform:scale(1)');
  });

  it('keeps px on translate and deg on rotate', () => {
    expect(css({ transform: [{ translateY: 12 }] }, false)).toContain('translateY(12px)');
    expect(css({ transform: [{ rotate: 45 }] }, false)).toContain('rotate(45deg)');
  });
});

describe('9 — numberOfLines, which is how the app stops overflow', () => {
  const span = (props: Record<string, unknown>) =>
    toHtml({ type: 'Text', props, children: ['x'] });

  it('ellipsises a single line', () => {
    const s = span({ numberOfLines: 1, style: {} });
    expect(s).toContain('white-space:nowrap');
    expect(s).toContain('text-overflow:ellipsis');
  });

  it('clamps a multi-line cap to exactly that many lines', () => {
    expect(span({ numberOfLines: 3, style: {} })).toContain('-webkit-line-clamp:3');
  });

  it('leaves uncapped text free to wrap', () => {
    expect(span({ style: {} })).not.toMatch(/line-clamp|nowrap/);
  });
});

describe('the colour decoder', () => {
  it('reads react-native-svg\'s packed ARGB integers', () => {
    // Inner svg nodes carry {type:0, payload:<int>}, not colour strings.
    expect(decodeColour({ payload: 0xffb8891a })).toBe('#b8891a');
    expect(decodeColour('#fff')).toBe('#fff');
    expect(decodeColour(null)).toBeNull();
  });
});
