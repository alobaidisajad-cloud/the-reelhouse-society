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

describe('6b — a border of a fraction of a point keeps its true width', () => {
  // A browser snaps borders to whole pixels (0.5 → 1, 1.5 → 1). The phone does
  // not: its layout has the exact width. So the side is laid out as padding
  // and drawn as an inset shadow of the same width and colour.
  it('lays a hairline out as padding of its exact width, added to the padding there', () => {
    const o = css({ borderTopWidth: 0.5, borderTopColor: '#b8891a', paddingTop: 6 }, false);
    expect(wins(o, 'padding-top')).toBe('padding-top:6.5px');
    expect(wins(o, 'border-top-width')).toBe('border-top-width:0px');
    expect(wins(o, 'box-shadow')).toBe('box-shadow:inset 0px 0.5px 0 0 #b8891a');
  });

  it('draws each side on its own edge, and keeps the box\'s own shadow under them', () => {
    const o = css({ borderWidth: 1.5, borderColor: 'red', boxShadow: 'inset 0px 1px 0px 0px white' }, false);
    expect(wins(o, 'box-shadow')).toBe('box-shadow:inset 0px 1.5px 0 0 red, inset -1.5px 0px 0 0 red, '
      + 'inset 0px -1.5px 0 0 red, inset 1.5px 0px 0 0 red, inset 0px 1px 0px 0px white');
  });

  it('leaves a whole-point border, and a dashed one, as a real border', () => {
    expect(wins(css({ borderBottomWidth: 1 }, false), 'border-bottom-width')).toBe('border-bottom-width:1px');
    expect(wins(css({ borderTopWidth: 0.5, borderStyle: 'dashed' }, false), 'border-top-width')).toBe('border-top-width:0.5px');
  });

  it('moves an absolute child in by its parent\'s thin border, where the phone puts it', () => {
    const html = toHtml({ type: 'View', props: { style: { height: 28, borderTopWidth: 0.5, borderBottomWidth: 0.5 } }, children: [
      { type: 'View', props: { style: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } }, children: [] },
    ] });
    const child = /<div[^>]*><div[^>]* style="([^"]*)"/.exec(html)![1];
    expect([wins(child, 'top'), wins(child, 'bottom'), wins(child, 'left')]).toEqual(['top:0.5px', 'bottom:0.5px', 'left:0px']);
  });
});

describe('6d — an absolute box lands where Yoga puts it', () => {
  // The first child's own style, inside a parent with the given style.
  const placed = (parent: Record<string, unknown>, child: Record<string, unknown>) =>
    /<div[^>]*><div[^>]* style="([^"]*)"/.exec(toHtml({ type: 'View', props: { style: parent }, children: [
      { type: 'View', props: { style: { position: 'absolute', ...child } }, children: [] },
    ] }))![1];

  it('takes a percentage of the parent LESS its padding (errata AbsolutePercentAgainstInnerSize)', () => {
    // 48% of (49 − 22.5 padding) = 12.72, not 48% of 49 = 23.52 — the film page's shade.
    const o = placed({ height: 49, paddingTop: 10, paddingBottom: 12.5 }, { top: 0, left: 0, height: '48%' });
    expect(wins(o, 'height')).toBe('height:calc(48% - 10.8px)');
  });

  it('places an axis with no inset at the parent\'s BORDER, not its padding', () => {
    const o = placed({ padding: 20 }, { width: 5, height: 10 });
    expect([wins(o, 'left'), wins(o, 'top')]).toEqual(['left:0px', 'top:0px']);
  });

  it('by the parent\'s justifyContent on the main axis and alignItems on the cross', () => {
    const o = placed({ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', padding: 20 }, { width: 10, height: 6 });
    expect(wins(o, 'right')).toBe('right:0px');
    expect(wins(o, 'top')).toBe('top:calc(50% - 3px)');
  });

  it('and leaves an axis that has an inset alone', () => {
    const o = placed({ padding: 20 }, { right: 4, width: 5 });
    expect(wins(o, 'right')).toBe('right:4px');
    expect(wins(o, 'left')).toBeNull();
  });
});

describe('6e — the keys that were dropped without a word', () => {
  it('writes a box\'s side margins, which the harness takes off its column\'s width', () => {
    // A rule pulled to both edges by marginHorizontal: -16 is 32pt WIDER than its column.
    expect(wins(css({ marginHorizontal: -16 }, false), '--mx')).toBe('--mx:-32px');
    expect(wins(css({ marginLeft: 10, marginRight: 6 }, false), '--mx')).toBe('--mx:16px');
    expect(wins(css({}, false), '--mx')).toBeNull();
  });

  it('sets a wrapping box\'s lines at the top, as React Native does, unless told otherwise', () => {
    expect(wins(css({ flexWrap: 'wrap' }, false), 'align-content')).toBe('align-content:flex-start');
    expect(wins(css({ flexWrap: 'wrap', alignContent: 'center' }, false), 'align-content')).toBe('align-content:center');
  });

  it('underlines, turns from its origin, and fits an image as its style says', () => {
    expect(wins(css({ textDecorationLine: 'underline' }, true), 'text-decoration-line')).toBe('text-decoration-line:underline');
    expect(wins(css({ transformOrigin: 'top left' }, false), 'transform-origin')).toBe('transform-origin:top left');
    expect(wins(css({ transformOrigin: [0, 10, 0] }, false), 'transform-origin')).toBe('transform-origin:0px 10px 0px');
    expect(wins(css({ resizeMode: 'stretch' }, false), 'object-fit')).toBe('object-fit:fill');
    expect(wins(css({ flexBasis: 40 }, false), 'flex-basis')).toBe('flex-basis:40px');
  });

  it('paints a tinted image in its tint, through the image as a mask', () => {
    const html = toHtml({ type: 'Image', props: { source: { testUri: 'seal.png' }, style: { width: 20, height: 20, tintColor: '#b8891a' } } },
      { local: { 'seal.png': 'data:image/png;base64,AAAA' } });
    expect(html).toContain('background-color:#b8891a');
    expect(html).toContain('mask:url(data:image/png;base64,AAAA) center/contain no-repeat');
  });
});

describe('6f — a modal is a window of its own', () => {
  const page = toHtml({ type: 'View', props: { style: { padding: 30 } }, children: [
    { type: 'Text', props: {}, children: ['under'] },
    { type: 'Modal', props: { transparent: true }, children: [{ type: 'View', props: { style: { flex: 1 } }, children: [] }] },
  ] });

  it('is lifted out of the page and drawn after it, over the whole phone', () => {
    const [body, layer] = page.split('<div data-t="modal"');
    expect(body).not.toContain('flex:1 0 0%'); // the sheet is no longer inline
    expect(layer).toMatch(/^[^>]*style="[^"]*position:absolute;left:0px;right:0px;top:0px;bottom:0px/);
  });

  it('holds its content in a flex: 1 container, clear when transparent and white when not', () => {
    expect(page).toContain('background-color:transparent');
    const opaque = toHtml({ type: 'Modal', props: {}, children: [] });
    expect(opaque).toContain('background-color:white');
  });
});

describe('6g — a control is marked with the area it answers touches in', () => {
  const press = (props: Record<string, unknown>) =>
    /data-press="([^"]*)"/.exec(toHtml({ type: 'View', props: { onClick: () => {}, ...props }, children: [] }))?.[1] ?? null;

  it('carries its hitSlop per side (top, right, bottom, left)', () => {
    expect(press({ hitSlop: { top: 10, bottom: 4, left: 15, right: 15 } })).toBe('10,15,4,15');
    expect(press({ hitSlop: 8 })).toBe('8,8,8,8');
    expect(press({})).toBe('0,0,0,0');
  });

  it('marks nothing that cannot be pressed — or is disabled', () => {
    expect(/data-press/.test(toHtml({ type: 'View', props: {}, children: [] }))).toBe(false);
    expect(press({ accessibilityState: { disabled: true } })).toBeNull();
  });
});

describe('6h — a control carries the line of source that made it', () => {
  // jest.setup.ts wraps PressableScale in a SrcMark (capture and generator
  // runs). It is not a box: the control is drawn exactly as without it.
  const control = { type: 'View', props: { onClick: () => {}, style: { width: 40, height: 40 } }, children: [] };

  it('writes the site onto the control and adds nothing else', () => {
    const bare = toHtml(control);
    const marked = toHtml({ type: 'SrcMark', props: { src: 'src/components/x/Y.tsx:12' }, children: [control] });
    expect(marked).toBe(bare.replace(/^<div/, '<div data-src="src/components/x/Y.tsx:12"'));
  });

  it('draws the control untouched when no site was found', () => {
    expect(toHtml({ type: 'SrcMark', props: {}, children: [control] })).toBe(toHtml(control));
  });
});

describe('6c — a scroll view grows, and a horizontal one is a row', () => {
  // ScrollView's own base style (flexGrow 1, flexShrink 1, a row when
  // horizontal) is not on Jest's host element; the phone has it.
  const scroll = (props: Record<string, unknown>) => /class="[hv]scroll"[^>]* style="([^"]*)"/.exec(
    toHtml({ type: 'RCTScrollView', props, children: [{ type: 'View', props: {}, children: [] }] }))![1];

  it('gives both kinds flexGrow 1 and flexShrink 1', () => {
    for (const horizontal of [false, true]) {
      const o = scroll({ horizontal, style: {} });
      expect([wins(o, 'flex-grow'), wins(o, 'flex-shrink')]).toEqual(['flex-grow:1', 'flex-shrink:1']);
    }
  });

  it('lays a horizontal one out as a row, a vertical one as a column', () => {
    expect(wins(scroll({ horizontal: true, style: {} }), 'flex-direction')).toBe('flex-direction:row');
    expect(wins(scroll({ style: {} }), 'flex-direction')).toBe('flex-direction:column');
  });

  it('lets the screen\'s own grow and shrink win, as the phone does', () => {
    const o = scroll({ style: { flexGrow: 0, flexShrink: 0 } });
    expect([wins(o, 'flex-grow'), wins(o, 'flex-shrink')]).toEqual(['flex-grow:0', 'flex-shrink:0']);
  });
});

describe('7 — flex means opposite things in the two languages', () => {
  it('RN `flex: 0` sizes to content; CSS `flex: 0` collapses it', () => {
    // Lucide sets flex:0 on EVERY icon. Passing it through measured 16x0.
    expect(wins(css({ flex: 0 }, false), 'flex')).toBe('flex:0 0 auto');
  });

  it('RN `flex: 1` fills from a zero basis, never shrinks, and needs the min-size unlocked', () => {
    // Yoga with RN's defaults: grow 1, shrink 0 (not the web's 1), basis 0.
    const o = css({ flex: 1 }, false);
    expect(wins(o, 'flex')).toBe('flex:1 0 0%');
    expect(has(o, 'min-width:0')).toBe(true);
    expect(has(o, 'min-height:0')).toBe(true);
  });

  it('handles a weight above one, and RN\'s negative form (shrink by its size)', () => {
    expect(wins(css({ flex: 2 }, false), 'flex')).toBe('flex:2 0 0%');
    expect(wins(css({ flex: -1 }, false), 'flex')).toBe('flex:0 1 auto');
    expect(wins(css({ flex: -2 }, false), 'flex')).toBe('flex:0 2 auto');
  });
});

describe('7b — a box that may shrink goes as far as Yoga lets it', () => {
  // Yoga gives a shrinking flex item no automatic minimum (min-width: auto in
  // CSS stops it at its content). Without this, a row of name, badge and time
  // where the phone shortens the name reported the TIME running off at 320pt.
  it('any shrinking box — flexShrink, a positive flex, a negative flex — may reach zero', () => {
    for (const style of [{ flexShrink: 1 }, { flex: 1 }, { flex: -1 }]) {
      const o = css(style, false);
      expect([wins(o, 'min-width'), wins(o, 'min-height')]).toEqual(['min-width:0', 'min-height:0']);
    }
    // a shrinking TEXT too: the phone ellipsises it rather than letting it push
    expect(wins(css({ flexShrink: 1 }, true), 'min-width')).toBe('min-width:0');
  });

  it('a box with an aspect ratio holds it, whatever is inside', () => {
    // CSS's automatic minimum let a poster's image stretch its 2:3 frame taller.
    const o = css({ width: 322, aspectRatio: 2 / 3 }, false);
    expect([wins(o, 'min-width'), wins(o, 'min-height')]).toEqual(['min-width:0', 'min-height:0']);
  });

  it('a box that does not shrink keeps CSS\'s floor', () => {
    expect(wins(css({ flex: 0 }, false), 'min-width')).toBeNull();
    expect(wins(css({}, false), 'min-width')).toBeNull();
    expect(wins(css({ flexShrink: 0 }, false), 'min-width')).toBeNull();
  });

  it('a real minWidth wins, whichever order the style lists them in', () => {
    // It used to lose when it came FIRST: the flex branch pushed min-width:0 later.
    expect(wins(css({ minWidth: 40, flex: 1 }, false), 'min-width')).toBe('min-width:40px');
    expect(wins(css({ flex: 1, minWidth: 40 }, false), 'min-width')).toBe('min-width:40px');
    expect(wins(css({ minHeight: 12, flexShrink: 1 }, false), 'min-height')).toBe('min-height:12px');
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
