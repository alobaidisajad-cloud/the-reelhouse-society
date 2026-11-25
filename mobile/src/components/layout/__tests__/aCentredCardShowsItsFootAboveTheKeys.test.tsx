/**
 * While the keys are up, a centred card shows its foot: the field's press stands there.
 *
 * A Modal's window never resizes for the keyboard, so CentredCard's scroll ends above the keys. A
 * card taller than that room scrolled, but stayed where it stood: at the largest text the recovery
 * card's SEND RESET LINK was clear of the letters and 10 px under the emoji panel, which is taller
 * (the nightly's keyboard probes, largest-text, narrowest and right-to-left, 2026-11-13 to -24).
 * Now each change of the card's room or content while the keys are up scrolls it to its end, as the
 * share sheet's body does (theShareSheetStaysBelowTheStatusBar); with the keys down, nothing moves.
 */
import React from 'react';
import { Keyboard, Platform, ScrollView, Text, TextInput } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CentredCard } from '@/src/components/layout/CentredCard';

type Handler = (e: unknown) => void;
let listeners: Record<string, Handler[]> = {};
/** The keys' events as the platform under test names them (iOS here: the Will events). */
const UP = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const DOWN = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
const heard = () => [...(listeners[UP] ?? []), ...(listeners[DOWN] ?? [])];
const emit = (event: string, height: number) => act(async () => {
  (listeners[event] ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
});

beforeEach(() => {
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (listeners[event] ??= []).push(fn);
    return { remove: () => { listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn); } };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

type Scroll = ReturnType<ReturnType<typeof render>['getByTestId']>;
const layout = (scroll: Scroll, height: number) =>
  act(async () => { await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } }); });
const grows = (scroll: Scroll) =>
  act(async () => { await fireEvent(scroll, 'contentSizeChange', 390, 1700); });

function card() {
  // React Native's mock ScrollView holds scrollToEnd as a jest.fn: the spy is that mock, its calls
  // kept from the last test until cleared.
  const ends = jest.spyOn(ScrollView.prototype as unknown as { scrollToEnd: (o: unknown) => void }, 'scrollToEnd');
  ends.mockClear();
  const r = render(
    <CentredCard>
      <Text>Enter the email associated with your account.</Text>
      <TextInput accessibilityLabel="Recovery email address" />
      <Text>SEND RESET LINK</Text>
    </CentredCard>,
  );
  return { r, ends, scroll: r.getByTestId('centred-card') };
}

it('with the keys up, its room changed (the letters, then the taller emoji panel), it scrolls to its foot', async () => {
  const { ends, scroll } = card();
  await emit(UP, 883);
  await layout(scroll, 1517);
  expect(ends).toHaveBeenLastCalledWith({ animated: false });
  ends.mockClear();
  await emit(UP, 946);
  await layout(scroll, 1454);
  expect(ends).toHaveBeenCalledTimes(1);
});

it('with the keys up, its content changed (a refusal said above the field), it scrolls to its foot', async () => {
  const { ends, scroll } = card();
  await emit(UP, 883);
  await grows(scroll);
  expect(ends).toHaveBeenCalledWith({ animated: false });
});

it('with the keys down, never moved: not at first, nor once they have gone', async () => {
  const { ends, scroll } = card();
  await layout(scroll, 2400);
  await grows(scroll);
  await emit(UP, 883);
  await emit(DOWN, 0);
  await layout(scroll, 2400);
  expect(ends).not.toHaveBeenCalled();
});

it('hears the keys no longer once it is gone', async () => {
  const { r } = card();
  expect(heard().length).toBeGreaterThanOrEqual(2);
  await act(async () => { r.unmount(); });
  expect(heard()).toEqual([]);
});
