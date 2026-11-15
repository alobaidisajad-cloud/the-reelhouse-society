/**
 * aRecordWithdrawnLeavesItsPage.test.tsx — review round 4 (navigation)
 * ─────────────────────────────────────────────────────────────────────
 * A member opened their own log's page, opened its editor and withdrew the record. The editor
 * went back one screen, onto the page of the record just withdrawn, which then said "No Such
 * Record — Its member withdrew it" to the member who had, and asked for one more back.
 *
 * Now the page of one's own record, read and then gone, leaves with it, and says nothing as it
 * goes. A record never read here, or another member's, is still said to be gone.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';

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
const logOf = (owner: string) => ({
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love',
  poster_path: null, year: 2000, rating: 5, review: 'Every corridor is a held breath.', pull_quote: null,
  drop_cap: false, alt_poster: null, status: 'watched', is_spoiler: false, watched_date: '2026-08-12',
  watched_with: null, physical_media: null, abandoned_reason: null, is_autopsied: false, autopsy: null,
  user_id: owner, created_at: '2026-08-12T21:00:00Z', editorial_header: null,
});
/** What the log's query hands over now: its record, or none (withdrawn). */
let mockLog: ReturnType<typeof logOf> | null = null;
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      if (opts.queryKey[0] === 'log') {
        return {
          data: { log: mockLog, profile: mockLog ? { id: mockLog.user_id, username: 'kane', role: 'archivist', avatar_url: null, member_no: 7 } : null,
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
// The member's own notes to the Vault, as the page reads them for its owner: none written.
jest.mock('@/src/hooks/useVault', () => ({
  useVault: () => ({
    noteFor: () => '', unreachable: false, reload: jest.fn(), openedNote: null,
    openNote: jest.fn(), closeNote: jest.fn(), confirmRemove: jest.fn(),
  }),
}));

const LogPage = () => { const C = require('@/app/log/[id]').default; return <C />; };

let back: jest.SpyInstance;
beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: LOG_ID });
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => { back.mockRestore(); });

it('the member\'s own record, withdrawn from its editor, takes its page with it, saying nothing', async () => {
  mockLog = logOf('me');
  const r = await render(<LogPage />);
  expect(r.getAllByText('In the Mood for Love').length).toBeGreaterThan(0);
  expect(back).not.toHaveBeenCalled();

  mockLog = null;
  await r.rerender(<LogPage />);
  expect(back).toHaveBeenCalledTimes(1);
  expect(r.queryByText('No Such Record')).toBeNull();
});

it('another member\'s record gone from under the page is still said to be gone, and the page stays', async () => {
  mockLog = logOf('someone-else');
  const r = await render(<LogPage />);
  expect(r.getAllByText('In the Mood for Love').length).toBeGreaterThan(0);
  mockLog = null;
  await r.rerender(<LogPage />);
  expect(r.getByText('No Such Record')).toBeTruthy();
  expect(back).not.toHaveBeenCalled();
});

it('a record never read here is said to be gone, and the page stays', async () => {
  mockLog = null;
  const r = await render(<LogPage />);
  expect(r.getByText('No Such Record')).toBeTruthy();
  expect(back).not.toHaveBeenCalled();
});
