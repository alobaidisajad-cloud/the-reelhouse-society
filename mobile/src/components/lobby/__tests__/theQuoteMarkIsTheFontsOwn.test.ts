/**
 * theQuoteMarkIsTheFontsOwn.test.ts — the Lobby's drawn quote marks are the
 * outline the app's own Spectral Italic holds today.
 *
 * parts.tsx keeps a copy of what mockups/tools/quote-ink.cjs reads from the
 * font file, so the marks draw without waiting on a font. A new font release
 * would leave the copy drawing the old face's marks beside the new face's
 * words; this reads the font as installed and holds the copy to it.
 */
import { QUOTE_MARKS } from '@/src/components/lobby/parts';

const { marks } = require('../../../../mockups/tools/quote-ink.cjs') as {
  marks: Record<'open' | 'close', { d: string; w: number; h: number }>;
};

it('draws the open and close marks the installed font holds, in a box their ink fills', () => {
  expect(QUOTE_MARKS).toEqual({ open: marks.open.d, close: marks.close.d, w: marks.open.w, h: marks.open.h });
  // One box serves both marks: the font gives them the same ink size.
  expect([marks.close.w, marks.close.h]).toEqual([marks.open.w, marks.open.h]);
});

it('reads a real outline: two strokes each, inside the box it names', () => {
  for (const m of [marks.open, marks.close]) {
    expect(m.d.match(/M/g)).toHaveLength(2);
    expect(m.w).toBeGreaterThan(0.2);
    const numbers = m.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(Math.max(m.w, m.h));
  }
});
