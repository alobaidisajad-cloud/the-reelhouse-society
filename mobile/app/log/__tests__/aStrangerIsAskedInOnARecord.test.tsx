/**
 * aStrangerIsAskedInOnARecord.test.tsx — review round 6
 * ──────────────────────────────────────────────────────
 * A record's page is public. A signed-out visitor's SAVE said "Saved to watchlist ✦" over a store
 * that saved nothing for them, and their CERTIFY read "Reading your mark" for good (a stranger holds
 * no mark to read) and asked the house again on every tap. Now both ask them in (askIn), and save
 * nothing; their heart is plain. A member's SAVE says nothing at the tap: the store says how it
 * went, once (said here too, it said "Saved" before a save that then failed).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { useInteractionStore } from '@/src/stores/films';
import reelToast from '@/src/utils/reelToast';

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
  ...require('@/test-utils/navigationMock').navigationMock(),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
/** Who is signed in: null for a visitor. */
let mockUser: Record<string, unknown> | null = null;
jest.mock('@/src/stores/auth', () => {
  const state = {
    get user() { return mockUser; },
    get isAuthenticated() { return !!mockUser; },
    restoreSession: () => Promise.resolve(),
    updateUser: () => Promise.resolve(),
  };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

const LOG_ID = '22222222-2222-4222-8222-222222222222';
const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love',
  poster_path: null, year: 2000, rating: 5, review: 'Every corridor is a held breath.', pull_quote: null,
  drop_cap: false, alt_poster: null, status: 'watched', is_spoiler: false, watched_date: '2026-08-12',
  watched_with: null, physical_media: null, abandoned_reason: null, is_autopsied: false, autopsy: null,
  user_id: 'u1', created_at: '2026-08-12T21:00:00Z', editorial_header: null,
};
/** The record's read again ("is it certified?"), as the page asks it. */
const mockReread = jest.fn(() => Promise.resolve());
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      if (opts.queryKey[0] === 'log') {
        // No word from the house on the reader's own certification: a stranger has none.
        return {
          data: { log: LOG, profile: { id: 'u1', username: 'tomas', role: 'archivist', avatar_url: null, member_no: 7 },
            comments: [], commentTotal: 0, certifyCount: 2 },
          isLoading: false, isError: false, refetch: mockReread,
        };
      }
      return actual.useQuery(opts);
    },
  };
});
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: () => ({ held: true, standing: 'held', open: jest.fn(), loading: false }),
}));
jest.mock('@/src/hooks/useVault', () => ({
  useVault: () => ({
    noteFor: () => '', unreachable: false, reload: jest.fn(), openedNote: null,
    openNote: jest.fn(), closeNote: jest.fn(), confirmRemove: jest.fn(),
  }),
}));
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);

const LogPage = () => { const C = require('@/app/log/[id]').default; return <C />; };

// The whole record page, drawn: its first drawing in a file loads the app's modules, seconds on a
// busy machine (and a planted fault runs one test alone, which is then that first drawing).
jest.setTimeout(30_000);
const toast = reelToast as unknown as jest.Mock & { error: jest.Mock; success: jest.Mock; info: jest.Mock };
const said = () => [...toast.mock.calls, ...toast.error.mock.calls, ...toast.success.mock.calls, ...toast.info.mock.calls];

const AS_BUILT = useInteractionStore.getState();
const addToWatchlist = jest.fn();
const removeFromWatchlist = jest.fn();
const toggleEndorse = jest.fn(() => Promise.resolve());
let push: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  useInteractionStore.setState({ addToWatchlist, removeFromWatchlist, toggleEndorse, _watchlistIndex: {}, _endorsedIndex: {} } as never);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: LOG_ID });
  push = jest.spyOn(nav, 'push').mockImplementation(() => {});
});
afterEach(() => {
  push.mockRestore();
  useInteractionStore.setState({
    addToWatchlist: AS_BUILT.addToWatchlist, removeFromWatchlist: AS_BUILT.removeFromWatchlist,
    toggleEndorse: AS_BUILT.toggleEndorse, _watchlistIndex: {}, _endorsedIndex: {},
  } as never);
});

/** Sent to the sign-in, to come back here: askIn's way. */
const askedIn = () => push.mock.calls.filter(([to]) => typeof to === 'string' && to.startsWith('/login'));

describe('a signed-out visitor on a record', () => {
  it("their SAVE asks them in, saves nothing, and says nothing of a save", async () => {
    const r = await render(<LogPage />);
    await act(async () => { await fireEvent.press(r.getByLabelText('Save film to your watchlist')); });
    expect(askedIn()).toHaveLength(1);
    expect(addToWatchlist).not.toHaveBeenCalled();
    expect(said()).toEqual([]);
  });

  it('their CERTIFY is plain, never "Reading your mark", and asks them in', async () => {
    const r = await render(<LogPage />);
    expect(r.queryByLabelText(/Reading your mark/)).toBeNull();
    await act(async () => { await fireEvent.press(r.getByLabelText(/^Certify this critique/)); });
    expect(askedIn()).toHaveLength(1);
    // Neither filed nor asked of the house again.
    expect(toggleEndorse).not.toHaveBeenCalled();
    expect(mockReread).not.toHaveBeenCalled();
  });
});

describe("a member's SAVE on a record", () => {
  beforeEach(() => { mockUser = { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', preferences: {} }; });

  it('saves, and says nothing at the tap: the store’s own word is the only one', async () => {
    const r = await render(<LogPage />);
    await act(async () => { await fireEvent.press(r.getByLabelText('Save film to your watchlist')); });
    expect(addToWatchlist).toHaveBeenCalledTimes(1);
    expect(askedIn()).toEqual([]);
    expect(said()).toEqual([]);
  });

  it('takes it off, and says nothing at the tap either', async () => {
    useInteractionStore.setState({ _watchlistIndex: { 843: true } } as never);
    const r = await render(<LogPage />);
    await act(async () => { await fireEvent.press(r.getByLabelText('Save: on your watchlist. Takes it off')); });
    expect(removeFromWatchlist).toHaveBeenCalledWith(843);
    expect(said()).toEqual([]);
  });
});
