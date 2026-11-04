/**
 * The Lounge's measures, as drawn (design/redesign/lounge.html): the page's edge, the rail of your
 * salons, the framed directory. Planned by arithmetic from the column's width, never measured
 * after they are drawn.
 */
export const CORRIDOR = {
  /** The page's edge, both sides. */
  page: 16,
  /** A field, a button, a card, the directory: one corner. */
  radius: 9,
  /** Between two cards on the rail. */
  gap: 10,
  /** A card is never narrower than this. */
  least: 150,
  /** Nor wider, when one or two stand alone. */
  most: 200,
  /** The directory's inner rule, inside its edge. */
  rule: 6,
} as const;

/**
 * How wide a card on the rail stands. One or two that fit stand whole, side by side, and the rail
 * does not scroll. More: as many whole cards as fit, and about half of the next, never a sliver,
 * so the rail shows it goes on. `column` is the page's column; the rail reaches the screen's
 * right edge.
 */
export function railCardWidth(column: number, count: number): number {
  const room = column - CORRIDOR.page;
  const { gap, least, most } = CORRIDOR;
  if (count <= 2) {
    const side = (room - CORRIDOR.page - gap * (count - 1)) / Math.max(1, count);
    if (side >= least) return Math.min(most, side);
  }
  let whole = 1;
  while ((room - gap * (whole + 1)) / (whole + 1.5) >= least) whole++;
  return (room - gap * whole) / (whole + 0.5);
}

/** Whether the rail scrolls: more cards than stand whole in it. */
export const railScrolls = (column: number, count: number) =>
  count * railCardWidth(column, count) + (count - 1) * CORRIDOR.gap > column - 2 * CORRIDOR.page + 0.5;
