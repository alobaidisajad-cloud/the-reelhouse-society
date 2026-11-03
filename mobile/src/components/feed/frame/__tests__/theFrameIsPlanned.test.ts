/**
 * The Reel's frame, planned before it is drawn: an Auteur's scores read under the AUTOPSY LAW,
 * the review's lines broken as the phone breaks them, READ ON only where words were left out,
 * and the breakdown's row split only where a label cannot hold its sixth.
 */
import { getAutopsyStats, hasRatedAutopsy } from '../scores';
import { planReview, wrapLetters, REVIEW, COURIER_ADVANCE } from '../planReview';
import { breakdownColumns } from '../Breakdown';

describe('the scores', () => {
  it('reads a v2 payload whole: a filed zero is a verdict', () => {
    expect(getAutopsyStats({ _v: 2, story: 0, sound: 10 }).map((s) => [s.label, s.value])).toEqual([['STORY', 0], ['SOUND', 10]]);
  });

  it('drops a legacy zero, which its editor wrote for every score left untouched', () => {
    expect(getAutopsyStats({ story: 0, acting: 7 }).map((s) => s.label)).toEqual(['ACTING']);
    expect(hasRatedAutopsy({ story: 0, sound: 0 })).toBe(false);
  });

  it('reads the old names and numbers kept as words, and holds each to 0–10', () => {
    const stats = getAutopsyStats({ _v: 2, screenplay: '8.5' as unknown as number, pacing: 14, direction: -3 });
    expect(stats.map((s) => [s.key, s.value])).toEqual([['story', 8.5], ['script', 8.5], ['acting', 0], ['editing', 10]]);
  });

  it('reads nothing from nothing', () => {
    expect(getAutopsyStats(null)).toEqual([]);
    expect(getAutopsyStats(undefined)).toEqual([]);
    expect(hasRatedAutopsy(null)).toBe(false);
  });
});

describe('the review', () => {
  // A line of exactly forty letters at the first text size.
  const width = 40 * REVIEW.size * COURIER_ADVANCE;

  it('fits: every word drawn, no READ ON', () => {
    const plan = planReview('Some films are watched. This one is attended.', { width, scale: 1, limit: 5, dropCap: false });
    expect(plan).toEqual(expect.objectContaining({ cut: false, cap: '', beside: [], words: 8 }));
    expect(plan.under.join(' ')).toBe('Some films are watched. This one is attended.');
  });

  it('runs past its lines: the last shown ends in an ellipsis within its room, and every word is counted', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const plan = planReview(text, { width, scale: 1, limit: 2, dropCap: false });
    expect(plan.cut).toBe(true);
    expect(plan.words).toBe(60);
    expect(plan.under).toHaveLength(2);
    expect(plan.under[1]!.endsWith('…')).toBe(true);
    expect(plan.under.every((l) => l.length <= 40)).toBe(true);
  });

  it('lifts the record\'s initial, the whole letter, and sets the first lines shorter beside it', () => {
    const plan = planReview('"Wow," she said, and left the theatre before the credits had finished rolling.', { width, scale: 1, limit: 5, dropCap: true });
    expect(plan.cap).toBe('"W');
    expect(plan.beside).toHaveLength(2);
    expect(plan.beside[0]!.startsWith('ow,"')).toBe(true);
    expect(plan.beside.every((l) => l.length < 40)).toBe(true);
  });

  it('a larger text size holds fewer letters to a line', () => {
    const text = 'A courtroom drama with no courtroom. Twelve men and a fan that does not work.';
    expect(planReview(text, { width, scale: 1.35, limit: 9, dropCap: false }).under.length)
      .toBeGreaterThan(planReview(text, { width, scale: 1, limit: 9, dropCap: false }).under.length);
  });

  it('breaks a word wider than a line by whole letters, never inside one', () => {
    const coder = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
    const lines = wrapLetters(`ab${coder}cd`, () => 3);
    expect(lines.join('')).toBe(`ab${coder}cd`);
    expect(lines.some((l) => l.includes(coder))).toBe(true);
  });

  it('starts each paragraph on a line of its own', () => {
    expect(wrapLetters('one\ntwo', () => 40)).toEqual(['one', 'two']);
  });
});

describe('the breakdown', () => {
  const labels = ['STORY', 'SCRIPT', 'ACTING', 'CINEMA', 'EDIT', 'SOUND'];
  it('stands six to a row where every label holds its sixth', () => {
    expect(breakdownColumns(labels, 330, 1)).toBe(6);
  });
  it('and three where one cannot (a narrow frame at its largest text)', () => {
    expect(breakdownColumns(labels, 240, 1.35)).toBe(3);
  });
});
