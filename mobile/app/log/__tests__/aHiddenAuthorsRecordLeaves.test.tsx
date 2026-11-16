/**
 * aHiddenAuthorsRecordLeaves.test.tsx — review round 6
 * ─────────────────────────────────────────────────────
 * Blocking or muting a record's author (from its ···, from a REPORT that also blocks, or from
 * anywhere else) left the page standing with their words under the toast "Their content is now
 * hidden". The page now leaves (nav.back), and is never drawn as their record while it goes; but
 * never from under a sheet of its own still on it: it leaves as that sheet closes.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import { useBlockStore } from '@/src/stores/blockStore';

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
jest.mock('@/src/stores/auth', () => {
  const state = {
    isAuthenticated: true,
    user: { id: 'me', username: 'kane', role: 'archivist', tier: 'archivist', is_social_private: false, preferences: {} },
    restoreSession: () => Promise.resolve(),
    updateUser: () => Promise.resolve(),
  };
  const useAuthStore = (sel?: (x: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});

const LOG_ID = '22222222-2222-4222-8222-222222222222';
const AUTHOR = 'someone-else';
const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love',
  poster_path: null, year: 2000, rating: 5, review: 'Every corridor is a held breath.', pull_quote: null,
  drop_cap: false, alt_poster: null, status: 'watched', is_spoiler: false, watched_date: '2026-08-12',
  watched_with: null, physical_media: null, abandoned_reason: null, is_autopsied: false, autopsy: null,
  user_id: AUTHOR, created_at: '2026-08-12T21:00:00Z', editorial_header: null,
};
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      if (opts.queryKey[0] === 'log') {
        return {
          data: { log: LOG, profile: { id: AUTHOR, username: 'tomas', role: 'archivist', avatar_url: null, member_no: 7 },
            comments: [], commentTotal: 0, certifyCount: 0 },
          isLoading: false, isError: false, refetch: jest.fn(),
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
/** The page's own sheets (no native gesture root here), stubbed to record what each is handed while open. */
const mockSheet: Record<string, unknown>[] = [];
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({
  ContentActionSheet: (props: Record<string, unknown>) => { if (props.visible) mockSheet.push(props); return null; },
}));
const mockReport: Record<string, unknown>[] = [];
jest.mock('@/src/components/moderation/ReportSheet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => { if (props.visible) mockReport.push(props); return null; },
}));

const LogPage = () => { const C = require('@/app/log/[id]').default; return <C />; };

// The whole record page, drawn: its first drawing in a file loads the app's modules, seconds on a
// busy machine (and a planted fault runs one test alone, which is then that first drawing).
jest.setTimeout(30_000);
const nobodyHidden = () => useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() });
/**
 * The store's acts as the page meets them: the member hidden at once (the store's optimistic
 * step). The house's answer is the block store's own tests' to give.
 */
const AS_BUILT = useBlockStore.getState();
const hideAt = (as: 'blocked' | 'muted') => async (id: string) => {
  useBlockStore.setState(as === 'blocked' ? { blocked: [id], _blockedIndex: new Set([id]) } : { muted: [id], _mutedIndex: new Set([id]) });
};
/** The latest props a stubbed sheet was drawn with, open. */
const latest = (drawn: Record<string, unknown>[]) => {
  const last = drawn[drawn.length - 1];
  expect(last).toBeDefined();
  return last!;
};

let back: jest.SpyInstance;
beforeEach(() => {
  mockSheet.length = 0;
  mockReport.length = 0;
  nobodyHidden();
  useBlockStore.setState({ blockUser: hideAt('blocked'), muteUser: hideAt('muted') });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: LOG_ID });
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => {
  back.mockRestore();
  nobodyHidden();
  useBlockStore.setState({ blockUser: AS_BUILT.blockUser, muteUser: AS_BUILT.muteUser });
});

it("a blocked author's log leaves the page once the sheet has closed, never drawn as theirs again", async () => {
  const r = await render(<LogPage />);
  expect(r.getByText(/Every corridor is a held breath/)).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getByLabelText('More options')); });
  // The ···'s BLOCK: the member is hidden at once, and the sheet closes.
  await act(async () => { (latest(mockSheet).onBlock as () => void)(); });
  expect(back).toHaveBeenCalledTimes(1);
  expect(r.queryByText(/Every corridor is a held breath/)).toBeNull();
}, 20000);   // the first test loads the page's whole tree: past 5 s on a cold run

it("a muted author's log leaves the page too", async () => {
  const r = await render(<LogPage />);
  await act(async () => { await fireEvent.press(r.getByLabelText('More options')); });
  await act(async () => { (latest(mockSheet).onMute as () => void)(); });
  expect(back).toHaveBeenCalledTimes(1);
  expect(r.queryByText(/Every corridor is a held breath/)).toBeNull();
});

it('a REPORT that also blocks: the page stays under the report sheet, and leaves as the sheet closes', async () => {
  const r = await render(<LogPage />);
  await act(async () => { await fireEvent.press(r.getByLabelText('More options')); });
  await act(async () => { (latest(mockSheet).onReport as () => void)(); });
  // The report sheet's own "also block", while it is still open.
  await act(async () => { useBlockStore.setState({ blocked: [AUTHOR], _blockedIndex: new Set([AUTHOR]) }); });
  expect(back).not.toHaveBeenCalled();
  expect(r.getByText(/Every corridor is a held breath/)).toBeTruthy();
  await act(async () => { (latest(mockReport).onDismiss as () => void)(); });
  expect(back).toHaveBeenCalledTimes(1);
});

it('an author muted from anywhere else, with no sheet of the page open, leaves at once', async () => {
  const r = await render(<LogPage />);
  expect(r.getByText(/Every corridor is a held breath/)).toBeTruthy();
  await act(async () => { useBlockStore.setState({ muted: [AUTHOR], _mutedIndex: new Set([AUTHOR]) }); });
  expect(back).toHaveBeenCalledTimes(1);
});
