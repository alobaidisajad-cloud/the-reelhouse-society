/**
 * aCutWordIsSeen.test.ts — cutOf (src/utils/cutText.ts) says when a Text's laid-out lines lost
 * words, ran out of their box or were clipped by it, and says nothing of a Text that shows all
 * of its words however they broke, were spaced, upper-cased or ellipsized at their natural end.
 */
import { cutOf, type LaidLine } from '../cutText';

const line = (text: string, width = 100, height = 20): LaidLine => ({ text, width, height });
const BOX = { width: 100, height: 40 };

describe('a Text that shows every word', () => {
  it('is not cut, however its lines broke', () => {
    expect(cutOf('THE HOUSE REMEMBERS', [line('THE HOUSE '), line('REMEMBERS')], BOX)).toBeNull();
  });

  it('is not cut by a case its style gave it, or by its spaces and line breaks', () => {
    expect(cutOf('The house\nremembers', [line('THE HOUSE'), line('REMEMBERS')], BOX)).toBeNull();
  });

  it('is not cut when its lines fill its box to the rounding', () => {
    expect(cutOf('Two lines', [line('Two', 100.4, 20), line('lines', 99, 20.2)], BOX)).toBeNull();
  });

  it('says nothing of a Text with no words, or not yet laid out', () => {
    expect(cutOf('  ', [line('')], BOX)).toBeNull();
    expect(cutOf('Words', [], BOX)).toBeNull();
  });

  it('is judged on its words alone until its box is known', () => {
    expect(cutOf('Words', [line('Words', 500, 500)], null)).toBeNull();
  });
});

describe('a Text that lost words', () => {
  it('ended early: an ellipsis, or lines past its numberOfLines', () => {
    expect(cutOf('FOUNDING MEMBER OF THE SOCIETY', [line('FOUNDING MEMBER OF…')], BOX)).toBe('ended early');
    expect(cutOf('One two three four', [line('One two'), line('three')], BOX)).toBe('ended early');
  });

  it('ran wider than its box: a word that could not break', () => {
    expect(cutOf('Supercalifragilistic', [line('Supercalifragilistic', 140)], BOX)).toBe('wider than its box');
  });

  it('ran taller than its box: its last lines clipped', () => {
    expect(cutOf('One two three', [line('One'), line('two'), line('three')], BOX)).toBe('taller than its box');
  });

  it('says first that it ended early, the cut a member cannot read past', () => {
    expect(cutOf('One two three', [line('One', 140, 50)], BOX)).toBe('ended early');
  });
});
