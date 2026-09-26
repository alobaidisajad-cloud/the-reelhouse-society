/**
 * The log page moves every card of its log.
 * ─────────────────────────────────────────────────────────────────────────────
 * A log is drawn on The Reel, on its film's archive and on its own page. The
 * page fetches the two counts itself; it must TELL the shared store, so a card
 * the member goes back to shows the page's numbers — and a critique filed here
 * must move every card's CRITIQUE count at once, and move it back if the house
 * refuses it. Mounted for real: the screen, its query function and its handlers.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { resetMarkCounts, selectMarkCount, tellMarkCounts, useMarkCounts } from '@/src/stores/markCounts';

import LogDetailScreen from '../[id]';

const LOG_ID = '22222222-2222-4222-8222-222222222222';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

let mockQuery: Record<string, unknown>;
let mockOptions: { queryFn: (ctx: { signal?: AbortSignal }) => Promise<Record<string, unknown>> };
let mockCache: Record<string, unknown> | undefined;
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: (opts: never) => { mockOptions = opts; return mockQuery; },
  useQueryClient: () => ({
    setQueryData: jest.fn((_k: unknown, fn: (old: unknown) => unknown) => { mockCache = fn(mockCache) as never; }),
    getQueryData: jest.fn(() => mockCache),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()), removeQueries: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: '33333333-3333-4333-8333-333333333333', username: 'visitor' }, isAuthenticated: true };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({ note: null, loaded: true, unreachable: false }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('@/src/services/LogService', () => ({
  LogService: { getLogDetails: jest.fn(), getLogComments: jest.fn(), addLogComment: jest.fn(), deleteLogComment: jest.fn() },
}));
const mockLogService = jest.requireMock('@/src/services/LogService').LogService as Record<string, jest.Mock>;

const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love', poster_path: null, year: 2000,
  rating: 5, review: 'Every corridor is a held breath.', pull_quote: null, drop_cap: false, alt_poster: null,
  status: 'watched', is_spoiler: false, watched_date: '2026-08-12', watched_with: null, physical_media: null,
  abandoned_reason: null, is_autopsied: false, autopsy: null, user_id: 'u1', created_at: '2026-08-12T21:00:00Z',
  editorial_header: null,
};
const PROFILE = { id: 'u1', username: 'morpho', role: 'archivist', avatar_url: null, member_no: 7 };
const shown = (kind: 'certify' | 'critique') => selectMarkCount(useMarkCounts.getState(), kind, LOG_ID);

beforeEach(() => {
  resetMarkCounts();
  jest.requireActual('@/src/stores/films').useFilmStore.setState({ _endorsedIndex: {}, interactions: [] });
  jest.clearAllMocks();
  mockCache = { log: LOG, profile: PROFILE, comments: [], commentTotal: 3, certifyCount: 7 };
  mockQuery = { data: mockCache, isLoading: false };
});

it('tells the store both numbers it fetched', async () => {
  mockLogService.getLogDetails.mockResolvedValue({ ...LOG, profiles: PROFILE, certify_count: [{ count: 7 }] });
  mockLogService.getLogComments.mockResolvedValue({ comments: [], total: 3 });
  await act(async () => { render(<LogDetailScreen />); });
  let data: Record<string, unknown> = {};
  // Inside act: telling the stores re-renders the page's bar.
  await act(async () => { data = await mockOptions.queryFn({}); });
  expect(data).toMatchObject({ certifyCount: 7, commentTotal: 3 });
  expect([shown('certify'), shown('critique')]).toEqual([7, 3]);
});

it('fills its heart from the server’s answer, not the sign-in index', async () => {
  const { useFilmStore } = jest.requireActual('@/src/stores/films');
  useFilmStore.setState({ _endorsedIndex: {}, interactions: [] });
  mockLogService.getLogDetails.mockResolvedValue({ ...LOG, profiles: PROFILE, certify_count: [{ count: 7 }], certified: [{ count: 1 }] });
  mockLogService.getLogComments.mockResolvedValue({ comments: [], total: 3 });
  await act(async () => { render(<LogDetailScreen />); });
  await act(async () => { await mockOptions.queryFn({}); });
  expect(!!useFilmStore.getState()._endorsedIndex[LOG_ID]).toBe(true);
});

it('draws the store’s certify number on its bar', async () => {
  tellMarkCounts([{ id: LOG_ID, certify: 12 }], Date.now());
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  expect(r.getByLabelText(/^Certify this critique\. 12 members have certified this critique/)).toBeTruthy();
});

const file = async (r: ReturnType<typeof render>) => {
  await act(async () => { fireEvent.changeText(r.getByLabelText('Write a critique on this log'), 'A second look.'); });
  await act(async () => { fireEvent.press(r.getByText('FILE CRITIQUE')); });
};

it('a critique filed here moves every card’s count, at once', async () => {
  tellMarkCounts([{ id: LOG_ID, critique: 3 }], Date.now() - 1000);
  mockLogService.addLogComment.mockResolvedValue({
    id: 'c9', user_id: 'me', body: 'A second look.', created_at: '2026-09-26T10:00:00Z', profiles: { username: 'visitor' },
  });
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  await file(r);
  expect(mockLogService.addLogComment).toHaveBeenCalled();
  expect(shown('critique')).toBe(4);
});

it('and takes it back when the house refuses it', async () => {
  tellMarkCounts([{ id: LOG_ID, critique: 3 }], Date.now() - 1000);
  mockLogService.addLogComment.mockRejectedValue(Object.assign(new Error('refused'), { code: '42501' }));
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  await file(r);
  expect(mockLogService.addLogComment).toHaveBeenCalled();
  expect(shown('critique')).toBe(3);
});
