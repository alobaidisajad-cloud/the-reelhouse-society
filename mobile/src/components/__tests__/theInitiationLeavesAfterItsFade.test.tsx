/**
 * The induction's beats cross-fade, and the induction closes, by state: a beat that is
 * finished stays only while it fades, then is gone from the tree, and the door holds open
 * for the last fade (Presence; exitingIsNeverUsed.guard.test.ts says why).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import InitiationModal from '../InitiationModal';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

const FADE = 180;
/** A fading beat is hidden from the screen reader; these look past that. */
const ALL = { includeHiddenElements: true } as const;
const FIRST = 'The Society admits you.';
const SECOND = 'Every film, in ink.';

const shown = (visible: boolean) => (
  <InitiationModal visible={visible} username="vera" memberNo={12} onComplete={jest.fn()} />
);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  (Reanimated.useReducedMotion as jest.Mock).mockImplementation(() => false);
  jest.useRealTimers();
});

const next = async (r: ReturnType<typeof render>) => {
  await act(async () => { await fireEvent.press(r.getByLabelText('Next')); });
};

it('a finished beat fades over the next one, then leaves the tree', async () => {
  const r = render(shown(true));
  await next(r);
  expect(r.getByText(SECOND)).toBeTruthy();
  expect(r.getByText(FIRST, ALL)).toBeTruthy();
  React.act(() => { jest.advanceTimersByTime(FADE + ARRIVAL_GRACE_MS - 1); });
  expect(r.getByText(FIRST, ALL)).toBeTruthy();
  React.act(() => { jest.advanceTimersByTime(1); });
  expect(r.queryByText(FIRST, ALL)).toBeNull();
  expect(r.getByText(SECOND)).toBeTruthy();
});

it('closed, it stays open for the last beat\'s fade, untouchable, then is gone', () => {
  const r = render(shown(true));
  r.rerender(shown(false));
  expect(r.getByText(FIRST, ALL)).toBeTruthy();
  expect(r.queryByLabelText('Next')).toBeNull();
  React.act(() => { jest.advanceTimersByTime(FADE + ARRIVAL_GRACE_MS); });
  expect(r.queryByText(FIRST, ALL)).toBeNull();
  expect(r.toJSON()).toBeNull();
});

it('under reduced motion a beat and the door go at once, as they did with no fade', async () => {
  (Reanimated.useReducedMotion as jest.Mock).mockImplementation(() => true);
  const r = render(shown(true));
  await next(r);
  expect(r.queryByText(FIRST, ALL)).toBeNull();
  r.rerender(shown(false));
  expect(r.toJSON()).toBeNull();
});
