/**
 * aCutWordIsSeen.test.ts — cutOf (src/utils/cutText.ts) says when a Text's laid-out lines lost
 * words, ran out of their box or were clipped by it, and says nothing of a Text that shows all
 * of its words however they broke, were spaced, upper-cased or ellipsized at their natural end;
 * and stillCut confirms an early end only when the words' natural length is longer than the room.
 */
import { cutOf, stillCut, type LaidLine } from '../cutText';

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

  it('is fitted, not cut, when it shrinks to fit: Android reports its lines as wide as before the shrink', () => {
    expect(cutOf('SEALING RECORD…', [line('SEALING RECORD…', 180, 30)], BOX, true)).toBeNull();
    // The same lines from a Text that does not shrink are cut.
    expect(cutOf('SEALING RECORD…', [line('SEALING RECORD…', 180, 30)], BOX)).toBe('wider than its box');
    // Still too long at its smallest size, it is ellipsized: an early end, fitted or not.
    expect(cutOf('@E2E_MEMBER · MEMBER Nº 0001', [line('@E2E_MEMBER · MEMB…', 100)], BOX, true)).toBe('ended early');
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

describe('the confirmation of an early end (stillCut)', () => {
  it('is no cut for words no more than a point longer than their room', () => {
    expect([stillCut(100, 100, 1), stillCut(101, 100, 1), stillCut(101.5, 100, 1)]).toEqual([false, false, true]);
  });

  it('gives a Text of several lines the room of all of them', () => {
    expect([stillCut(190, 100, 2), stillCut(250, 100, 2)]).toEqual([false, true]);
  });

  it('measures words that shrink to fit at their smallest size, and never cuts what may shrink without end', () => {
    expect([stillCut(120, 100, 1, 0.8), stillCut(140, 100, 1, 0.8), stillCut(900, 100, 1, 0)]).toEqual([false, true, false]);
  });
});
