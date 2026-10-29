/**
 * aToastWaitsForItsAnswer.test.tsx — a toast that asks for a response is not a race.
 * ─────────────────────────────────────────────────────────────────────────────
 * A toast with an action left after five to nine seconds whatever the member was
 * using, and pressing its action left it standing. With a screen reader a member
 * hears the sentence, then swipes to the button: five seconds is not always
 * enough, and a control that vanishes mid-swipe cannot be answered. Now, with a
 * screen reader on, it stays until answered or dismissed; answered, it goes; and
 * Android keeps the member's own "time to take action".
 */
import React from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

import { ToastHost } from '../ToastHost';
import reelToast from '@/src/utils/reelToast';
import { TOAST_EXIT_MS } from '@/src/utils/toastBus';

const OS = Platform.OS;
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

/** The bus's listener for the screen reader, as React Native was handed it. */
const readerTurns = (on: boolean) => {
  const calls = jest.mocked(AccessibilityInfo.addEventListener).mock.calls as unknown as [string, (on: boolean) => void][];
  const call = calls.find(([type]) => type === 'screenReaderChanged');
  if (!call) throw new Error('the toast bus never listened for the screen reader');
  call[1](on);
};

const mount = async () => {
  const r = render(<View><ToastHost layer="root" /></View>);
  await act(async () => { await Promise.resolve(); });
  return r;
};

beforeEach(() => { setOS('ios'); jest.useFakeTimers(); });
afterEach(async () => {
  await act(async () => { readerTurns(false); });
  jest.useRealTimers();
  setOS(OS);
});

it('with a screen reader on, it waits for its answer, and offers DISMISS', async () => {
  const r = await mount();
  await act(async () => { readerTurns(true); });
  const undo = jest.fn();
  await act(async () => { reelToast.info('The log was removed.', { label: 'Undo', onPress: undo }); });
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(r.getByText('The log was removed.')).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getByLabelText('Dismiss')); });
  await act(async () => { jest.advanceTimersByTime(TOAST_EXIT_MS + 50); });
  expect(r.queryByText('The log was removed.')).toBeNull();
  expect(undo).not.toHaveBeenCalled();
});

it('answered, it goes at once, having done its work', async () => {
  const r = await mount();
  await act(async () => { readerTurns(true); });
  const undo = jest.fn();
  await act(async () => { reelToast.info('The log was removed.', { label: 'Undo', onPress: undo }); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Undo')); });
  expect(undo).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(TOAST_EXIT_MS + 50); });
  expect(r.queryByText('The log was removed.')).toBeNull();
});

it('without a screen reader it keeps its clock and offers no DISMISS; answered, it still goes', async () => {
  const r = await mount();
  await act(async () => { reelToast.info('Saved.', { label: 'Undo', onPress: () => {} }); });
  expect(r.queryByLabelText('Dismiss')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(5000 + TOAST_EXIT_MS + 50); });
  expect(r.queryByText('Saved.')).toBeNull();

  await act(async () => { reelToast.info('Saved again.', { label: 'Undo', onPress: () => {} }); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Undo')); });
  await act(async () => { jest.advanceTimersByTime(TOAST_EXIT_MS + 50); });
  expect(r.queryByText('Saved again.')).toBeNull();
});

it('a screen reader turned on mid-toast stops its clock; turned off, the clock runs again', async () => {
  const r = await mount();
  await act(async () => { reelToast.info('Saved.', { label: 'Undo', onPress: () => {} }); });
  await act(async () => { jest.advanceTimersByTime(4000); readerTurns(true); });
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(r.getByText('Saved.')).toBeTruthy();
  await act(async () => { readerTurns(false); });
  await act(async () => { jest.advanceTimersByTime(5000 + TOAST_EXIT_MS + 50); });
  expect(r.queryByText('Saved.')).toBeNull();
});

it('a plain toast is never held: it has nothing to answer', async () => {
  const r = await mount();
  await act(async () => { readerTurns(true); });
  await act(async () => { reelToast.success('Filed.'); });
  expect(r.getByText('Filed.')).toBeTruthy();
  expect(r.queryByLabelText('Dismiss')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(2500 + TOAST_EXIT_MS + 50); });
  expect(r.queryByText('Filed.')).toBeNull();
});

it('on Android every toast stays the member\'s own time to take action', async () => {
  setOS('android');
  jest.mocked(AccessibilityInfo.getRecommendedTimeoutMillis).mockImplementationOnce(() => Promise.resolve(20_000));
  const r = await mount();
  await act(async () => { reelToast.success('Filed.'); });
  await act(async () => { await Promise.resolve(); });
  expect(AccessibilityInfo.getRecommendedTimeoutMillis).toHaveBeenLastCalledWith(2500);
  await act(async () => { jest.advanceTimersByTime(19_000); });
  expect(r.getByText('Filed.')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1000 + TOAST_EXIT_MS + 50); });
  expect(r.queryByText('Filed.')).toBeNull();
});
