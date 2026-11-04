/**
 * The Darkroom's measures, as drawn (design/redesign/darkroom.html): the page's edge, the baths,
 * the contact sheet and the edge print under each poster. Every count is planned by arithmetic
 * from the column's width and the member's text size, never measured after it is drawn.
 */
import { ceilingFor, fitsAt } from '@/src/components/lobby/measure';

export const ROOM = {
  /** The page's edge, both sides. */
  page: 16,
  /** A bath, a set bar, a panel, the sheet: one corner. */
  radius: 9,
} as const;

export const SHEET = {
  /** Inside the sheet, both sides; at its top before the first row. */
  pad: 12,
  /** Between two prints side by side. */
  gutter: 10,
  /**
   * The edge print under a poster: its place, its year, the logged tick and SAVE. As tall as SAVE,
   * which is a commit and 48 by its own box; the rows need no gap of their own beneath it.
   */
  edge: 48,
} as const;

/** How many prints stand to a row: two on the narrowest phones, three on a phone, four on a tablet. */
export const printsPerRow = (width: number) => (width >= 600 ? 4 : width < 360 ? 2 : 3);

/** A print's width: the column less the page's edges, the sheet's sides and the gutters between. */
export function printWidth(column: number): number {
  const cols = printsPerRow(column);
  return (column - 2 * ROOM.page - 2 * SHEET.pad - (cols - 1) * SHEET.gutter) / cols;
}

/** An undeveloped plate: its padding and dashed edge, and the title it carries. */
export const PLATE = { pad: 8, border: 1, size: 10, spacing: 1.4 } as const;

/**
 * How far a plate's title grows with the member's text: only as far as its longest word stands
 * whole inside the plate, so no word is broken across two lines.
 */
export function plateTitleCeiling(title: string, column: number): number {
  const room = printWidth(column) - 2 * PLATE.pad - 2 * PLATE.border;
  const words = title.split(/\s+/).filter(Boolean);
  return Math.min(...words.map((w) => ceilingFor(w, 'elite', PLATE.size, PLATE.spacing, room)));
}

/** The prints, as the rows the sheet draws: the last one filled out with nothing, so every print is one width. */
export function rowsOf<T>(items: readonly T[], cols: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row: (T | null)[] = items.slice(i, i + cols);
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  return rows;
}

export const BATH = { gap: 6, pad: 6, border: 1, size: 11, spacing: 1 } as const;

/**
 * The baths stand three across while every name fits its tile whole at the member's size; else two.
 * The name's room is the tile's inside: the tile less its padding and its hairline border.
 */
export function bathsPerRow(width: number, names: readonly string[], scale: number): 2 | 3 {
  const tile = (width - 2 * ROOM.page - 2 * BATH.gap) / 3;
  const room = tile - 2 * BATH.pad - 2 * BATH.border;
  return names.every((n) => fitsAt(n.toUpperCase(), 'elite', BATH.size, BATH.spacing, room, scale)) ? 3 : 2;
}
