/**
 * thePaperIsMeasuredAndCounted.test.ts — the Dispatch paper's numbers (paper/paperMetrics.ts): the
 * margins and padding at each width step, the text measure and column they leave, a byline's indent,
 * each section's hue, a still's height,
 * a kind's printed name, a number grouped by thousands, and a count cut — never rounded up — to four
 * characters.
 */
import {
  BYLINE_INDENT, columnWidth, docMargin, docPad, formatCount, groupDigits, KIND_RULE, measure, nameOf, SECTION_COLOR, stillHeight,
} from '../paper/paperMetrics';
import { colors } from '@/src/theme/theme';

it('sets a byline in from the column\'s edge by the rule and the gap after it, where the words start', () => {
  expect(BYLINE_INDENT).toBe(3 + 12);
});

it('wears each section\'s name in its kind\'s hue, and ALL in no hue at all', () => {
  expect(SECTION_COLOR).toEqual({
    ALL: colors.parchment, TAKES: KIND_RULE.take, SEEKING: KIND_RULE.seeking, WIRE: KIND_RULE.wire,
    BALLOTS: KIND_RULE.ballot, ESSAYS: KIND_RULE.dossier,
  });
  expect(new Set(Object.values(SECTION_COLOR)).size).toBe(6);
});

it('steps the margin and padding at 360 and 390 points wide, and not a point before', () => {
  expect([319, 359, 360, 389, 390, 430].map(docPad)).toEqual([14, 14, 18, 18, 24, 24]);
  expect([319, 359, 360, 389, 390, 430].map(docMargin)).toEqual([6, 6, 9, 9, 12, 12]);
});

it('leaves the measure the comments name, and never sets the paper wider than 560', () => {
  expect([390, 375, 320, 560, 700].map(measure)).toEqual([315, 318, 277, 485, 485]);
  expect(columnWidth(390)).toBe(315 - 44 - 3 - 12);
  expect(columnWidth(320)).toBe(277 - 59);
});

it('sets a still at 16:9 of the measure, rounded, never taller than 108', () => {
  expect([100, 190, 192, 300].map(stillHeight)).toEqual([56, 107, 108, 108]);
});

it('prints a kind by its name in any case, and an unknown one as itself in capitals', () => {
  expect(['take', 'SEEKING', 'Wire', 'ballot', 'dossier', 'DOSSIER', 'mystery'].map(nameOf)).toEqual(['TAKE', 'SEEKING', 'WIRE', 'BALLOT', 'ESSAY', 'ESSAY', 'MYSTERY']);
});

it('groups a number by thousands, its fraction dropped, its sign kept', () => {
  expect([0, 7, 999, 1000, 25000, 100000, 1234567, 12.9, -1234].map(groupDigits))
    .toEqual(['0', '7', '999', '1,000', '25,000', '100,000', '1,234,567', '12', '-1,234']);
});

it('cuts a count to four characters at most, never claiming more than happened, and gives nothing for none', () => {
  const counts = [1, 7, 999, 999.9, 1000, 1960, 2100, 9999, 10000, 24310, 999_999, 1_000_000, 1_200_000, 3_000_000_000, 2e12];
  expect(counts.map(formatCount)).toEqual(['1', '7', '999', '999', '1K', '1.9K', '2.1K', '9.9K', '10K', '24K', '999K', '1M', '1.2M', '3B', '999B']);
  expect([0, 0.9, -5, Number.NaN, Infinity].map(formatCount)).toEqual([null, null, null, null, null]);
});
