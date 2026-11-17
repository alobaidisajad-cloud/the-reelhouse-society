/**
 * wordsOnTheirWayHoldTheDoor.test.tsx — review round 10 (A1, useHoldWhileSending)
 *
 * A screen whose words are on their way to the house, and kept nowhere else, let every way out
 * go: left mid-send, a refusal lost the words, and its "try again" spoke to a screen already
 * gone. Now every way out is held while they travel ("Still on its way", one WAIT), and let go
 * the moment the house answers.
 *
 * Driven through a real router: a pop from anywhere (the same action an edge swipe and Android's
 * back send) is stopped while the words travel, and taken at once once they have arrived.
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { Stack } from 'expo-router/stack';
import { router } from 'expo-router/build/imperative-api';
import { act, cleanup, fireEvent, renderRouter } from 'expo-router/testing-library';
import { useHoldWhileSending } from '../useAskBeforeLeaving';

/** A desk whose words are on their way until the house answers (the test's press). */
function Desk() {
  const [sending, setSending] = React.useState(true);
  useHoldWhileSending(sending);
  return <Text onPress={() => setSending(false)}>the house answers</Text>;
}

const house = () => ({
  _layout: () => <Stack />,
  index: () => <Text>the lobby</Text>,
  // At a route the typed routes know (as unsavedWorkAsksBeforeLeaving draws its screen).
  settings: Desk,
});

type Button = { text: string; onPress?: () => void };
const settle = () => act(() => { jest.runOnlyPendingTimers(); });

afterEach(async () => { await cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); });

// One render, one journey: expo-router keeps its router in one store for the whole file.
it('a way out while the words are on their way stays, and says "Still on its way"; once answered, it leaves at once', async () => {
  const asked = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const app = renderRouter(house(), { initialUrl: '/' });
  await settle();
  await act(() => router.push('/settings'));
  await settle();
  expect(app.getPathname()).toBe('/settings');

  // On their way: the pop is held, and the one thing said is to wait.
  await act(() => router.back());
  await settle();
  expect(app.getPathname()).toBe('/settings');
  expect(asked).toHaveBeenCalledTimes(1);
  const call = asked.mock.calls[0];
  expect(call).toBeDefined();
  const [title, message, buttons] = call as unknown as [string, string, Button[]];
  expect([title, message]).toEqual(['Still on its way', 'The house has not answered yet. One moment.']);
  expect(buttons.map((b) => b.text)).toEqual(['Wait']);
  // WAIT keeps the member where their words are.
  await act(() => { buttons.find((b) => b.text === 'Wait')?.onPress?.(); });
  await settle();
  expect(app.getPathname()).toBe('/settings');

  // Answered: nothing is held, and nothing asked.
  asked.mockClear();
  await act(async () => { await fireEvent.press(app.getByText('the house answers')); });
  await settle();
  await act(() => router.back());
  await settle();
  expect(app.getPathname()).toBe('/');
  expect(asked).not.toHaveBeenCalled();
});
