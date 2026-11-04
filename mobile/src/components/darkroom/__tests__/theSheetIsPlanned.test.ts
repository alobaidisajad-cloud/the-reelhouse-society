/**
 * theSheetIsPlanned.test.ts — the Darkroom's measures, planned by arithmetic before anything is
 * drawn (sheet.ts): the prints a row holds, the baths three across while every name fits a tile's
 * inside whole, and an undeveloped plate's title grown no further than its longest word fits.
 */
import { lineWidth } from '@/src/components/lobby/measure';
import { MOODS } from '../constants';
import { BATH, PLATE, ROOM, SHEET, bathsPerRow, plateTitleCeiling, printWidth, printsPerRow, rowsOf } from '../sheet';

const NAMES = MOODS.map((m) => m.label);

describe('the contact sheet', () => {
  it('two prints to a row under 360, three on a phone, four on a tablet', () => {
    expect([320, 359, 360, 390, 599, 600, 1024].map(printsPerRow)).toEqual([2, 2, 3, 3, 3, 4, 4]);
  });

  it('a print is the column less the edges, the sheet\'s sides and the gutters, shared', () => {
    expect(printWidth(390)).toBeCloseTo((390 - 2 * ROOM.page - 2 * SHEET.pad - 2 * SHEET.gutter) / 3, 5);
    expect(printWidth(320)).toBeCloseTo((320 - 2 * ROOM.page - 2 * SHEET.pad - SHEET.gutter) / 2, 5);
  });

  it('rows are filled out with nothing, so every print is one width', () => {
    expect(rowsOf([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4, null, null]]);
    expect(rowsOf([], 3)).toEqual([]);
  });
});

describe('the baths', () => {
  it('three across at 390 and wider, as drawn; two where a name would not fit its tile whole', () => {
    expect(bathsPerRow(390, NAMES, 1)).toBe(3);
    expect(bathsPerRow(440, NAMES, 1)).toBe(3);
    expect(bathsPerRow(320, NAMES, 1)).toBe(2);
    expect(bathsPerRow(390, NAMES, 1.35)).toBe(2);
  });

  it('three only while the widest name fits a tile\'s inside: its padding and its border', () => {
    for (const width of [320, 360, 375, 390, 430, 440]) {
      const inside = (width - 2 * ROOM.page - 2 * BATH.gap) / 3 - 2 * BATH.pad - 2 * BATH.border;
      const widest = Math.max(...NAMES.map((n) => lineWidth(n.toUpperCase(), 'elite', BATH.size, 1, BATH.spacing)));
      expect(bathsPerRow(width, NAMES, 1)).toBe(widest <= inside + 0.5 ? 3 : 2);
    }
  });
});

describe('an undeveloped plate', () => {
  it('its title grows only as far as its longest word stands whole in the plate', () => {
    for (const column of [320, 360, 390]) {
      const inside = printWidth(column) - 2 * PLATE.pad - 2 * PLATE.border;
      const cap = plateTitleCeiling('OBSESSION', column);
      expect(lineWidth('OBSESSION', 'elite', PLATE.size, cap, PLATE.spacing)).toBeLessThanOrEqual(inside + 0.5);
      expect(cap).toBeGreaterThanOrEqual(1);
    }
  });

  it('the longest word decides, not the first', () => {
    expect(plateTitleCeiling('A NIGHTMARE', 360)).toBe(plateTitleCeiling('NIGHTMARE', 360));
    expect(plateTitleCeiling('UP', 360)).toBeGreaterThan(plateTitleCeiling('OBSESSION', 360));
  });
});
