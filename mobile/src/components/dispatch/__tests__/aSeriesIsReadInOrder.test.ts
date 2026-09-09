/**
 * aSeriesIsReadInOrder.test.ts — the grouping and the numbering.
 * ─────────────────────────────────────────────────────────────────────────────
 * A series is three columns on a filing, not a table, so "what series have I
 * begun?" is a question answered by grouping a member's own dossiers. The
 * grouping and the next number are pure, and they are what the sheet is FOR —
 * so they are tested without a network or a render.
 */
import { groupSeries, nextPart, roman } from '../SeriesPicker';

describe('grouping a member’s own filings into series', () => {
  it('gathers parts under the series they belong to', () => {
    const out = groupSeries([
      { series_id: 'a', series_title: 'Ozu, in Four Parts', part_number: 1 },
      { series_id: 'b', series_title: 'The Long Take', part_number: 1 },
      { series_id: 'a', series_title: 'Ozu, in Four Parts', part_number: 3 },
      { series_id: 'a', series_title: 'Ozu, in Four Parts', part_number: 2 },
    ]);
    expect(out).toHaveLength(2);
    const ozu = out.find((s) => s.id === 'a')!;
    expect(ozu.title).toBe('Ozu, in Four Parts');
    // Sorted, because the sheet prints them as a sequence and "I, III, II"
    // would read as a mistake in the data rather than in the display.
    expect(ozu.parts).toEqual([1, 2, 3]);
  });

  it('drops a row that cannot name its series', () => {
    // `series_whole` makes this unwritable today. It is guarded anyway: a row
    // written before that constraint existed must not produce a series with no
    // name for a member to recognise.
    const out = groupSeries([
      { series_id: 'a', series_title: null, part_number: 1 },
      { series_id: null, series_title: 'Orphan', part_number: 1 },
      { series_id: 'b', series_title: 'Real', part_number: 1 },
    ]);
    expect(out.map((s) => s.title)).toEqual(['Real']);
  });

  it('keeps a series that exists but has no numbered part yet', () => {
    const out = groupSeries([{ series_id: 'a', series_title: 'Begun', part_number: null }]);
    expect(out).toEqual([{ id: 'a', title: 'Begun', parts: [] }]);
    expect(nextPart(out[0].parts)).toBe(1);
  });
});

describe('the next part', () => {
  it('is one past the highest, not one past the count', () => {
    // The difference matters the moment a part is withdrawn. With I, II and IV
    // filed, the next is V — counting would offer IV again and put two parts on
    // one number, which the index permits and the series page would print.
    expect(nextPart([1, 2, 4])).toBe(5);
    expect(nextPart([3])).toBe(4);
  });

  it('starts a new series at one', () => {
    expect(nextPart([])).toBe(1);
  });

  it('is not confused by parts arriving out of order', () => {
    expect(nextPart([4, 1, 2])).toBe(5);
  });
});

describe('the numeral the reader prints', () => {
  it('writes the numbers a series actually reaches', () => {
    expect(roman(1)).toBe('I');
    expect(roman(2)).toBe('II');
    expect(roman(4)).toBe('IV');
    expect(roman(9)).toBe('IX');
    expect(roman(14)).toBe('XIV');
    expect(roman(40)).toBe('XL');
  });

  it('says nothing rather than something wrong', () => {
    // A part number is a smallint from a column that may be null on an old row.
    expect(roman(0)).toBe('');
    expect(roman(-3)).toBe('');
    expect(roman(NaN)).toBe('');
  });
});
