/**
 * theCoverWaitsForTheSheetToGo.test.tsx — review round 4 (navigation)
 * ───────────────────────────────────────────────────────────────────
 * The salon's settings are React Native's own <Modal>; the cover picker is a route modal. CHANGE
 * asked for the picker straight after asking the settings to close, while they were still sliding
 * away: on iOS one sheet was asked for while another left, which is how the Concierge's own trip
 * failed before its presentation law. The trip is now parked, and taken once the settings have
 * left the screen (or by a backstop, should their exit never end), never while they stand.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { LoungeSettingsPanel } from '../LoungeSettingsPanel';

const mockPush = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (...a: unknown[]) => mockPush(...a), dismissTo: jest.fn(), back: jest.fn() },
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: 'host', is_private: false, cover_image: null } as never;
const draw = (visible: boolean, onClose: () => void) =>
  <LoungeSettingsPanel lounge={room} members={[]} visible={visible} isCreator standing="approved" onClose={onClose} />;

beforeEach(() => {
  mockPush.mockClear();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); });

it('the picker is asked for only once the settings have gone, and once', async () => {
  const onClose = jest.fn();
  const r = render(draw(true, onClose));
  await act(async () => { await fireEvent.press(r.getByLabelText('Choose a film for the cover')); });
  expect(onClose).toHaveBeenCalledTimes(1);
  // The settings still stand (the room has not closed them): no trip, however long.
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(mockPush).not.toHaveBeenCalled();

  // Closed: the trip is taken as they go, by their leaving or by the backstop, and only once.
  await r.rerender(draw(false, onClose));
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/cover-picker', { loungeId: 'l1' });
});

it('settings closed for any other reason take no trip', async () => {
  const onClose = jest.fn();
  const r = render(draw(true, onClose));
  await r.rerender(draw(false, onClose));
  await act(async () => { jest.advanceTimersByTime(700); });
  r.unmount();
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(mockPush).not.toHaveBeenCalled();
});

it('settings closed with no trip asked for leave no frame booked behind them', async () => {
  // A frame booked on every close outlived the screen that booked it (it held a test file open).
  // The sheet's own exit books frames of its own; the trip's frame is the one more a trip asks for.
  const framesBookedClosing = async (askForTrip: boolean) => {
    const onClose = jest.fn();
    const r = render(draw(true, onClose));
    if (askForTrip) await act(async () => { await fireEvent.press(r.getByLabelText('Choose a film for the cover')); });
    const raf = jest.spyOn(globalThis, 'requestAnimationFrame');
    // The sheet's contents leave the screen (here, with the room).
    r.unmount();
    const n = raf.mock.calls.length;
    raf.mockRestore();
    return n;
  };
  const withTrip = await framesBookedClosing(true);
  const without = await framesBookedClosing(false);
  expect(withTrip - without).toBe(1);
});

it('a salon gone from the screen takes no trip, though one was asked for', async () => {
  const onClose = jest.fn();
  const r = render(draw(true, onClose));
  await act(async () => { await fireEvent.press(r.getByLabelText('Choose a film for the cover')); });
  r.unmount();
  await act(async () => { jest.advanceTimersByTime(700); });
  expect(mockPush).not.toHaveBeenCalled();
});
