/**
 * theRailShowsItGoesOn.test.ts — YOUR SALONS on the rail, sized as the drawing sizes them
 * (design/redesign/lounge.html, PLAN_EXTRA): one or two that fit stand whole and still, no wider
 * than the most; more show as many whole cards as fit and about half of the next, never a sliver,
 * so the rail says it goes on.
 */
import { CORRIDOR, railCardWidth, railScrolls } from '../corridor';

/** The drawing's own rule, as its page computes it, for a column `column` wide. */
function drawn(column: number, n: number): number {
  const W = column - 16;
  const gap = 10;
  if (n <= 2 && (W - 16 - gap * (n - 1)) / n >= 150) return Math.min(200, (W - 16 - gap * (n - 1)) / n);
  let k = 1;
  while ((W - gap * (k + 1)) / (k + 1.5) >= 150) k++;
  return (W - gap * k) / (k + 0.5);
}

describe('a card on the rail', () => {
  it.each([320, 375, 390, 402, 440, 744, 1024])('at %ipt, as wide as the drawing makes it, for one to five salons', (column) => {
    for (const n of [1, 2, 3, 4, 5]) expect(railCardWidth(column, n)).toBeCloseTo(drawn(column, n), 5);
  });

  it('one or two stand whole, no wider than the most, and the rail stands still', () => {
    expect(railCardWidth(390, 1)).toBe(CORRIDOR.most);
    expect(railCardWidth(390, 2)).toBeCloseTo((390 - 2 * CORRIDOR.page - CORRIDOR.gap) / 2, 5);
    expect(railScrolls(390, 1)).toBe(false);
    expect(railScrolls(390, 2)).toBe(false);
  });

  it('more than stand whole show half of the next, never narrower than the least, and the rail scrolls', () => {
    for (const column of [320, 390, 440, 744]) {
      const w = railCardWidth(column, 6);
      expect(w).toBeGreaterThanOrEqual(CORRIDOR.least);
      // what shows of the next card past the whole ones: half of one, in the room the rail has
      const room = column - CORRIDOR.page;
      const whole = Math.floor((room + CORRIDOR.gap) / (w + CORRIDOR.gap));
      expect((room - whole * (w + CORRIDOR.gap)) / w).toBeCloseTo(0.5, 5);
      expect(railScrolls(column, 6)).toBe(true);
    }
  });
});
