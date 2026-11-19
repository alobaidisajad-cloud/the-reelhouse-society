/**
 * theShareSheetStaysBelowTheStatusBar.test.tsx — typing a message to share keeps the sheet's
 * title and its X on the screen (round 14).
 *
 * The overlay was padded by the whole keyboard and laid its card out from the foot, and nothing in
 * the card could give up room: on an iPhone SE seated in three salons the card stood about 20pt
 * past the top of the screen once the keys were up, its title and X under the clock, and on a
 * 360x640 Android with three buttons about 95pt, the "SHARING:" line gone with them. Now the card
 * stops below the status bar, as CreateLoungeSheet does, and its body scrolls; while the message
 * is typed the body keeps the message and SHARE TO LOUNGE in view.
 */
import React, { act } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { overlayTop } from '@/src/components/layout/navMetrics';

jest.mock('@/src/stores/auth', () => {
  const s = { user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist' }, isAuthenticated: true };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(s) : s);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useAuthStore };
});
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

// eslint-disable-next-line import/first
import ShareToLoungeModal from '../ShareToLoungeModal';
// eslint-disable-next-line import/first
import { useLoungeStore } from '@/src/stores/lounge';

type Handler = (e?: unknown) => void;
let listeners: Record<string, Handler[]>;
const was = Platform.OS;

const room = (id: string, name: string) => ({
  id, name, description: null, is_private: false, creator_id: 'host', created_at: '2026-01-01T00:00:00Z',
  member_count: 4, membership_status: 'approved', mine: true, unread_count: 0,
});

beforeEach(() => {
  Platform.OS = 'ios';
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    (listeners[event] ??= []).push(fn);
    return { remove: () => { listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn); } };
  }) as never);
  useLoungeStore.setState({
    lounges: [room('a', 'The Back Row'), room('b', 'Nitrate Club'), room('c', 'Silents Only')],
    loungesFailed: false, loungesLoading: false, loungesRead: true, fetchLounges: jest.fn(async () => {}),
  } as never);
});
afterEach(() => {
  Platform.OS = was;
  jest.restoreAllMocks();
});

const sheet = () => <ShareToLoungeModal visible onClose={() => {}} filmTitle="Sunrise" filmId={631} posterPath={null} />;
async function open() {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(sheet()); });
  return r;
}
/** The keys rise, and the sheet is drawn again (the jest Reanimated draws a style as it renders). */
const keysUp = async (r: ReturnType<typeof render>, height: number) => {
  await act(async () => {
    (listeners.keyboardWillShow ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
  });
  await act(async () => { r.rerender(sheet()); });
};

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
const styleOf = (n: Node) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;
const all = (n: Node | string | null, out: Node[] = []): Node[] => {
  if (!n || typeof n === 'string') return out;
  out.push(n);
  n.children?.forEach((c) => all(c, out));
  return out;
};
const tree = (r: ReturnType<typeof render>) => [r.toJSON() as unknown as Node | Node[]].flat().flatMap((n) => all(n));
const holds = (n: Node, test: (m: Node) => boolean) => all(n).some(test);
const says = (words: string) => (m: Node) => (m.children ?? []).includes(words);

it('the sheet stops below the status bar, with the keys up as with them down', async () => {
  const r = await open();
  await keysUp(r, 260);
  // The overlay the card stands in: padded by the keys at its foot, and by the status bar at its top.
  const overlay = tree(r).filter((n) => styleOf(n).paddingBottom === 260 && holds(n, says('Share to Lounge')));
  expect(overlay).toHaveLength(1);
  expect(styleOf(overlay[0]!).paddingTop).toBe(overlayTop(0));
});

it('the card gives up room from its body, never its title and X', async () => {
  const r = await open();
  const body = tree(r).find((n) => n.props.testID === 'share-body');
  expect(body).toBeDefined();
  expect(styleOf(body!).flexShrink).toBe(1);
  // The header is outside the body: it stays whatever the body gives up.
  expect(holds(body!, (m) => m.props.accessibilityLabel === 'Close')).toBe(false);
  expect(holds(body!, says('Share to Lounge'))).toBe(false);
  expect(holds(body!, (m) => m.props.accessibilityLabel === 'Share message')).toBe(true);
  expect(holds(body!, says('SHARE TO LOUNGE'))).toBe(true);
  // And the card itself may shrink to the room it is given.
  const card = tree(r).filter((n) => styleOf(n).borderTopWidth === 2 && holds(n, says('Share to Lounge')));
  expect(card).toHaveLength(1);
  expect(styleOf(card[0]!).flexShrink).toBe(1);
});

it('typing the message, the body keeps the message and SHARE in view as the keys rise', async () => {
  const r = await open();
  const scrollToEnd = jest.spyOn(ScrollView.prototype as unknown as { scrollToEnd: (o: unknown) => void }, 'scrollToEnd');
  // Laid out before anything is typed: left where the member put it.
  await act(async () => { await fireEvent(r.getByTestId('share-body'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 342, height: 380 } } }); });
  expect(scrollToEnd).not.toHaveBeenCalled();
  await act(async () => { await fireEvent(r.getByLabelText('Share message'), 'focus'); });
  await keysUp(r, 260);
  // The keys took the room: the body is laid out shorter, and shows its foot.
  await act(async () => { await fireEvent(r.getByTestId('share-body'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 342, height: 210 } } }); });
  expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
});
