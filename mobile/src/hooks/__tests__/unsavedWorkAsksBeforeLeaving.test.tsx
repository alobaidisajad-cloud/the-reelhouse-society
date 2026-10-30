/**
 * A screen holding unsaved work asks before any way out (P4.12).
 *
 * Driven through a real router: a pop from anywhere (the same action an edge swipe and Android's
 * back send) is stopped and asks; Cancel stays, Discard leaves (and lets the screen's draft go first);
 * with nothing unsaved, nothing asks.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { Stack } from 'expo-router/stack';
import { router } from 'expo-router/build/imperative-api';
import { act, cleanup, renderRouter } from 'expo-router/testing-library';
import { useAskBeforeLeaving } from '../useAskBeforeLeaving';

let mockUnsaved = true;
const mockDiscarded = jest.fn();

function Desk() {
  useAskBeforeLeaving(mockUnsaved, { onDiscard: mockDiscarded });
  return <Text>the desk</Text>;
}

const house = () => ({
  _layout: () => <Stack />,
  index: () => <Text>the lobby</Text>,
  settings: Desk,
});

type Button = { text: string; onPress?: () => void };
const settle = () => act(() => { jest.runOnlyPendingTimers(); });

afterEach(async () => { await cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); mockUnsaved = true; });

// One render, one journey: expo-router keeps its router in one store for the whole file.
it('a pop over unsaved work is stopped and asks; Cancel stays, Discard leaves; nothing unsaved leaves at once', async () => {
  const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const app = renderRouter(house(), { initialUrl: '/' });
  await settle();
  await act(() => router.push('/settings'));
  await settle();
  expect(app.getPathname()).toBe('/settings');

  await act(() => router.back());
  await settle();
  expect(app.getPathname()).toBe('/settings');
  expect(asked).toHaveBeenCalledTimes(1);
  const [title, , buttons] = (asked.mock.calls.at(0) ?? []) as unknown as [string, string, Button[]];
  expect(title).toBe('Discard Changes?');

  await act(() => { buttons.find((b) => b.text === 'Cancel')?.onPress?.(); });
  await settle();
  expect([app.getPathname(), mockDiscarded.mock.calls.length]).toEqual(['/settings', 0]);

  await act(() => { buttons.find((b) => b.text === 'Discard')?.onPress?.(); });
  await settle();
  expect([app.getPathname(), mockDiscarded.mock.calls.length]).toEqual(['/', 1]);

  // Nothing unsaved: no question, out at once.
  mockUnsaved = false;
  asked.mockClear();
  await act(() => router.push('/settings'));
  await settle();
  await act(() => router.back());
  await settle();
  expect(app.getPathname()).toBe('/');
  expect(asked).not.toHaveBeenCalled();
});
