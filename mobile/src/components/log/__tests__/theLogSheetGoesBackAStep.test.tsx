/**
 * theLogSheetGoesBackAStep.test.tsx — review round 4 (navigation)
 * ────────────────────────────────────────────────────────────────
 * On a film in the Log sheet, the chevron went back to the search, and Android's back closed the
 * whole sheet. Now Android's back on a film is the chevron's: back to the search, the sheet still
 * open. On the search there is no step behind, and back closes the sheet as before.
 */
import React from 'react';
import { AppState, BackHandler, Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
  useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  usePreventRemove: jest.fn(),
}));
// The form and its seal are their own tests' to draw; here only the step is asked. The form's
// flow is kept, so a test can amend a record as the member's typing would.
let mockFlow: Record<string, (...a: unknown[]) => unknown> | null = null;
jest.mock('@/src/components/log/LogForm', () => (props: { flow: Record<string, (...a: unknown[]) => unknown> }) => { mockFlow = props.flow; return null; });
jest.mock('@/src/components/log/LogAtmosphere', () => () => null);
jest.mock('@/src/components/log/LogSealBar', () => ({
  ...jest.requireActual('@/src/components/log/LogSealBar'),
  __esModule: true,
  default: () => null,
}));

const LogSheet = () => { const C = require('@/app/(modals)/log-modal').default; return <C />; };

type Held = { handler: () => boolean | null | undefined; remove: jest.Mock };
let held: Held[] = [];
let listen: jest.SpyInstance;
beforeEach(() => {
  held = [];
  listen = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((event: string, handler: () => boolean) => {
    const sub = { handler, remove: jest.fn() };
    if (event === 'hardwareBackPress') held.push(sub);
    return { remove: sub.remove };
  }) as never);
  useAuthStore.setState({ isAuthenticated: true, user: { id: '55555555-5555-4555-8555-555555555555', username: 'me', tier: 'free', role: 'cinephile' } as never });
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});
afterEach(() => { listen.mockRestore(); });

/** The back handlers standing now, the latest first, as Android asks them. */
const standing = () => held.filter((h) => h.remove.mock.calls.length === 0).reverse();

it("Android's back on a film goes back to the search, and the sheet stays open", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  const r = await render(<LogSheet />);
  expect(r.queryByLabelText('Search for a film to log')).toBeNull();
  const [first] = standing();
  expect(first).toBeDefined();
  let taken: boolean | null | undefined;
  await act(async () => { taken = first!.handler(); });
  // Taken here: the press never reaches the router, which would close the sheet.
  expect(taken).toBe(true);
  expect(r.getByLabelText('Search for a film to log')).toBeTruthy();
});

it('on the search there is no step behind: the sheet keeps no back of its own', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  const r = await render(<LogSheet />);
  expect(r.getByLabelText('Search for a film to log')).toBeTruthy();
  expect(standing()).toEqual([]);
});

/**
 * The room a launch may reopen (lastRoom.ts) is the film being written, never the search: the
 * search entered as a room reopened, after the phone closed the app, on the last film unsent.
 */
it('a film being written is a room a launch may reopen; back on the search, it is left', async () => {
  const { LAST_ROOM_KEY } = require('@/src/utils/lastRoom');
  const { storage } = require('@/src/stores/mmkv-storage');
  storage.delete(LAST_ROOM_KEY);
  // The app in front: a room closed then is one the member left (with it behind, the phone tore it down).
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
  await render(<LogSheet />);
  expect(JSON.parse(storage.getString(LAST_ROOM_KEY) ?? 'null')?.room).toBe('log-modal');
  const [first] = standing();
  await act(async () => { first!.handler(); });
  expect(storage.getString(LAST_ROOM_KEY)).toBeUndefined();
});

it('the search alone is no room at all', async () => {
  const { LAST_ROOM_KEY } = require('@/src/utils/lastRoom');
  const { storage } = require('@/src/stores/mmkv-storage');
  storage.delete(LAST_ROOM_KEY);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  await render(<LogSheet />);
  expect(storage.getString(LAST_ROOM_KEY)).toBeUndefined();
});

describe('an edit asks before its amendments go (review round 5)', () => {
  const LOG_ID = '66666666-6666-4666-8666-666666666666';
  // The amendments' ask, read by what it says: the sheet holds another way out of its own while
  // they seal (review round 10), and the last asked of a render is that one.
  const preventing = () => {
    const calls = (jest.requireMock('expo-router/react-navigation').usePreventRemove as jest.Mock).mock.calls;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      for (let i = calls.length - 1; i >= 0; i--) {
        alert.mockClear();
        (calls[i]?.[1] as (e: { data: { action: unknown } }) => void)({ data: { action: {} } });
        if (alert.mock.calls[0]?.[0] === 'Discard these amendments?') return calls[i]?.[0];
      }
      return undefined;
    } finally { alert.mockRestore(); }
  };
  beforeEach(() => {
    (jest.requireMock('expo-router/react-navigation').usePreventRemove as jest.Mock).mockClear();
    useFilmStore.setState({
      logs: [{ id: LOG_ID, filmId: 550, title: 'The Seventh Seal', rating: 4, review: 'Death plays well.', status: 'watched', watchedDate: '2026-11-01', createdAt: '2026-11-01T20:00:00Z' }],
      _loggedIndex: { 550: true },
    } as never);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: LOG_ID, filmId: '550', filmTitle: 'The Seventh Seal' });
  });

  it('holds every way out once a field is amended, and none before', async () => {
    await render(<LogSheet />);
    expect(preventing()).toBe(false);
    await act(async () => { mockFlow?.setReview?.('Death plays well, and cheats.'); });
    // CLOSE, a swipe and Android's back are all a removal of the sheet: each is held and asked.
    expect(preventing()).toBe(true);
  });
});
