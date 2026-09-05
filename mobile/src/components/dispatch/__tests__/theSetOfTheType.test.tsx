/**
 * theSetOfTheType.test.tsx — two pieces of setting that were wrong on the page
 * and right in every test, because nothing had ever looked.
 * ─────────────────────────────────────────────────────────────────────────────
 * Both were found by rendering the real components to HTML and MEASURING them,
 * which is the only way either could have been found: neither is a crash, a
 * warning, or a failed assertion. They are the kind of fault that survives four
 * thousand passing tests because no test knew what the page was supposed to
 * look like.
 *
 *  1. THE SEPARATOR. The byline and the film credit both set two facts either
 *     side of a `·`, and both write it identically — a second Text beginning
 *     `'· '`. The byline's row reserves 6pt before that dot; the credit's row
 *     reserved nothing, so it rendered `TOKYO STORY· 1953` — a full word-space
 *     after the dot and 1.2pt of letter-spacing before it. Measured on the
 *     rendered page: 10pt of air before the byline's dot, 0 before the credit's.
 *
 *  2. THE INITIAL. The essay's opening cap was a flex SIBLING of the paragraph,
 *     so the paragraph sat in a column beside it and never came back under —
 *     46pt of indent for its whole height, a measure 15% narrower than every
 *     other paragraph, and a 66pt void below a cap only two lines tall. React
 *     Native has no float, so the cap is set INLINE instead: a raised initial,
 *     which it can do exactly, rather than a sunk one, which it cannot do
 *     without measuring text and re-rendering.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { p } from '../paper/paperStyles';
import { EssayOpening } from '../paper/PaperEssay';

describe('the separator between two facts is set the same way everywhere', () => {
  it('reserves the same space in the credit as in the byline', () => {
    // Not "a gap exists" — the SAME gap. The two rows carry the same
    // construction and must not drift apart again.
    expect(p.creditWords.gap).toBe(p.byline.gap);
  });

  it('still lets the title give way before the year does', () => {
    // The gap costs 6pt of width. The title must remain the part that shrinks,
    // or a long title pushes the year off the row instead of truncating itself.
    expect(p.creditWords.flexShrink).toBe(1);
    expect(p.creditWords.minWidth).toBe(0);
    expect(p.creditText.flexShrink).toBe(1);
    expect(p.creditYear.flexShrink).toBe(0);
  });
});

describe('the essay opens with a raised initial, not a column beside the text', () => {
  const opening = () =>
    render(<EssayOpening text="There is a shot in Tokyo Story that lasts eleven seconds." />);

  it('sets the cap INSIDE the paragraph, so no line is indented past it', () => {
    const { toJSON } = opening();
    const tree = toJSON() as any;

    // Walk to the node that holds the cap, and prove the paragraph's words are
    // in the SAME text block rather than in a sibling column.
    const holders: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      const kids = Array.isArray(n.children) ? n.children : [];
      const text = kids.filter((c: any) => typeof c === 'string').join('');
      if (text.includes('T') && text.includes('here is a shot')) holders.push(n);
      kids.forEach(walk);
      // A nested cap arrives as an element child, so look one level in too.
      for (const k of kids) {
        if (k && typeof k === 'object') {
          const inner = (Array.isArray(k.children) ? k.children : [])
            .filter((c: any) => typeof c === 'string').join('');
          const rest = kids.filter((c: any) => typeof c === 'string').join('');
          if (inner === 'T' && rest.includes('here is a shot')) holders.push(n);
        }
      }
    };
    walk(tree);

    expect(holders.length).toBeGreaterThan(0);
  });

  it('does not put the cap and the paragraph in a row', () => {
    const { toJSON } = opening();
    const rows: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      const style = ([] as any[]).concat(n.props?.style ?? []).filter(Boolean);
      const flat = Object.assign({}, ...style.map((s: any) => (typeof s === 'object' ? s : {})));
      if (flat.flexDirection === 'row') rows.push(flat);
      (Array.isArray(n.children) ? n.children : []).forEach(walk);
    };
    walk(toJSON());
    // A row here is what put the paragraph in its own narrow column.
    expect(rows).toEqual([]);
  });

  it('keeps the initial from growing into a line that cannot hold it', () => {
    // The body's line is a fixed 28. An initial that scaled with the type would
    // be clipped by that line at the largest setting, so it must not scale —
    // and it must still fit: Rye's ascent is about 0.75em.
    const { toJSON } = opening();
    const found: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      const kids = Array.isArray(n.children) ? n.children : [];
      if (kids.length === 1 && kids[0] === 'T') found.push(n);
      kids.forEach(walk);
    };
    walk(toJSON());

    expect(found.length).toBe(1);
    const cap = found[0];
    const style = Object.assign(
      {},
      ...([] as any[]).concat(cap.props.style ?? []).filter((s) => typeof s === 'object'),
    );
    expect(cap.props.allowFontScaling).toBe(false);
    expect(style.fontSize * 0.75).toBeLessThanOrEqual(style.lineHeight);
  });
});
