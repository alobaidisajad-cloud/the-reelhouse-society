/**
 * aReportedFilingIsReadWholeBeforeItIsRuledOn.test.tsx — the docket's filing is read whole a tap away.
 * ─────────────────────────────────────────────────────────────────────────────
 * The reported docket drew the filing cut at three lines, with nothing that opened the rest, under
 * LET IT STAND and STRIKE IT: a moderator ruled on three lines of the piece. The filing now opens
 * whole on a tap (READ IT WHOLE), as a stack's description does, and folds again; one that fits in
 * three lines is drawn whole with nothing to tap. The verdicts stay where they are.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperCase } from '@/src/components/dispatch/paper/PaperMore';
import type { PaperAuthor } from '@/src/components/dispatch/paper/PaperPost';

const AUTHOR: PaperAuthor = { name: 'Dan', memberNo: 402, tier: 'free' };
const LONG = 'Anyone who rates this above a two has never sat through a real film, and I include the people who made it, the people who paid for it, and every one of you who clapped when the lights came up.';

const drawCase = (body: string) => render(
  <PaperCase reports={9} reasons="Abuse · Off the film" kind="take" author={AUTHOR} age="2 HR" body={body}
    onStand={jest.fn()} onStrike={jest.fn()} />,
);

/** The unclamped copy answers how many lines the words wrap to. */
const measure = async (r: ReturnType<typeof drawCase>, lines: number) => {
  await act(async () => {
    await fireEvent(r.getByTestId('case-measure', { includeHiddenElements: true }), 'textLayout', { nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } });
  });
};

/** The Text that draws the filing for the reader, not the hidden copy that measures it. */
const drawnBody = (r: ReturnType<typeof drawCase>) => {
  const all = r.getAllByText(/never sat through a real film|A plain word/);
  const shown = all.filter((t) => t.props.testID !== 'case-measure');
  expect(shown).toHaveLength(1);
  return shown[0]!;
};

// A press is taken once in 400ms (PressableScale): the clock moves on between the reader's taps.
let clock = 1000;
beforeEach(() => { jest.spyOn(globalThis.performance, 'now').mockImplementation(() => clock); });
afterEach(() => { jest.restoreAllMocks(); });

describe('a reported filing', () => {
  it('cut at three lines opens whole on READ IT WHOLE, and folds again', async () => {
    const r = drawCase(LONG);
    await measure(r, 5);
    expect(drawnBody(r).props.numberOfLines).toBe(3);
    await act(async () => { await fireEvent.press(r.getByText('READ IT WHOLE ▾')); });
    expect(drawnBody(r).props.numberOfLines).toBeUndefined();
    clock += 1000;
    await act(async () => { await fireEvent.press(r.getByText('FOLD ▴')); });
    expect(drawnBody(r).props.numberOfLines).toBe(3);
  });

  it('that fits in three lines is drawn whole, with nothing to open', async () => {
    const r = drawCase('A plain word.');
    await measure(r, 1);
    expect(drawnBody(r).props.numberOfLines).toBeUndefined();
    expect(r.queryByText('READ IT WHOLE ▾')).toBeNull();
  });

  it('keeps its two verdicts where they are, whole or cut', async () => {
    const r = drawCase(LONG);
    await measure(r, 5);
    expect(r.getByLabelText('Let it stand: the filing stays')).toBeTruthy();
    expect(r.getByLabelText('Strike it: the filing is removed')).toBeTruthy();
    await act(async () => { await fireEvent.press(r.getByText('READ IT WHOLE ▾')); });
    expect(r.getByLabelText('Let it stand: the filing stays')).toBeTruthy();
    expect(r.getByLabelText('Strike it: the filing is removed')).toBeTruthy();
  });
});
