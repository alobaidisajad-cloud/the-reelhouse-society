/**
 * A member's critique on a log is spoken of as on a stack.
 * ─────────────────────────────────────────────────────────────────────────────
 * One act, one sentence, on both pages. The log page said "Failed to file
 * critique." and "Failed to delete critique." where a stack says "Your critique
 * could not be filed/removed.", and said NOTHING when a critique was kept for
 * later, filed or taken back; a stack says so. A critique still waiting to be
 * sent was deleted at the house (which has no row for it), and its filing then
 * arrived and stood. And a log read only from this phone, offline, drew "No
 * critiques yet" over critiques it had never read. Mounted for real: the
 * screen, its query function and its handlers.
 */
import React, { act } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { resetMarkCounts } from '@/src/stores/markCounts';
import { useOfflineQueueStore } from '@/src/stores/offlineQueueStore';

import LogDetailScreen from '../[id]';

const LOG_ID = '22222222-2222-4222-8222-222222222222';
const ME = '33333333-3333-4333-8333-333333333333';

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
const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
const mockToast = jest.fn();
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => ({
  __esModule: true,
  default: Object.assign((...a: unknown[]) => mockToast(...a), {
    error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn(),
  }),
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
const MINE = { id: 'c-mine', user_id: ME, username: 'visitor', avatar_url: null, body: 'A second look.', created_at: '2026-09-26T10:00:00Z' };
const rereadLog = jest.fn();

beforeEach(() => {
  resetMarkCounts();
  jest.clearAllMocks();
  mockCache = { log: LOG, profile: PROFILE, comments: [MINE], commentTotal: 1, certifyCount: 7 };
  mockQuery = { data: mockCache, isLoading: false, refetch: rereadLog };
});
afterEach(() => { useOfflineQueueStore.setState({ queued: [] }); });

const mount = async () => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  return r;
};
const file = async (r: ReturnType<typeof render>) => {
  await act(async () => { fireEvent.changeText(r.getByLabelText('Write a critique on this log'), 'A third look.'); });
  await act(async () => { fireEvent.press(r.getByText('FILE CRITIQUE')); });
};
/** WITHDRAW, and a yes to the house's question (a critique is never taken back on one tap). */
const withdrawCritique = async (r: ReturnType<typeof render>) => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => { await fireEvent.press(r.getByLabelText('Withdraw your critique')); });
  const buttons = (alert.mock.calls[alert.mock.calls.length - 1]?.[2] ?? []) as AlertButton[];
  alert.mockRestore();
  await act(async () => { buttons.find((b) => b.style === 'destructive')?.onPress?.(); });
};
const takeBack = withdrawCritique;

describe('filing', () => {
  it('kept for later is said, as on a stack — it was silent', async () => {
    mockLogService.addLogComment.mockRejectedValue(new TypeError('Network request failed'));
    await file(await mount());
    expect(mockToast).toHaveBeenCalledWith('Critique saved offline. Will sync when connected.');
  });

  it('refused, it says the stack’s sentence', async () => {
    mockLogService.addLogComment.mockRejectedValue(Object.assign(new Error('violates check'), { code: '23514' }));
    await file(await mount());
    expect(mockToastError).toHaveBeenCalledWith('Your critique could not be filed.');
  });

  it('refused by the maker’s setting, it says whose setting', async () => {
    mockLogService.addLogComment.mockRejectedValue(Object.assign(new Error('rls'), { code: '42501' }));
    await file(await mount());
    expect(mockToastError).toHaveBeenCalledWith('This member limits who may annotate their critiques.');
  });
});

describe('taking one back', () => {
  it('without a connection, it is kept and said', async () => {
    mockLogService.deleteLogComment.mockRejectedValue(new TypeError('Network request failed'));
    await takeBack(await mount());
    expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_log_comment', payload: { comment_id: 'c-mine', user_id: ME, log_id: LOG_ID } });
    expect(mockToast).toHaveBeenCalledWith('Removed offline. Will sync when connected.');
  });

  it('refused, it comes back and says the stack’s sentence', async () => {
    mockLogService.deleteLogComment.mockRejectedValue(Object.assign(new Error('refused'), { code: '42501' }));
    await takeBack(await mount());
    expect(mockToastError).toHaveBeenCalledWith('Your critique could not be removed.');
  });

  it('one still waiting to be sent goes through the queue, behind its filing — never to the house', async () => {
    useOfflineQueueStore.setState({ queued: [{ id: 'q1', type: 'add_log_comment', timestamp: 0, payload: { id: 'c-mine', log_id: LOG_ID, user_id: ME, body: 'A second look.' } }] });
    await takeBack(await mount());
    expect(mockLogService.deleteLogComment).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_log_comment', payload: { comment_id: 'c-mine', user_id: ME, log_id: LOG_ID } });
  });
});

describe('critiques that could not be read', () => {
  it('are said to be unreachable, never "No critiques yet", and asked for again', async () => {
    mockCache = { ...mockCache, comments: [], critiquesUnread: true };
    mockQuery = { data: mockCache, isLoading: false, refetch: rereadLog };
    const r = await mount();
    r.getByText('The critiques could not be reached.');
    expect(r.queryByText('No critiques yet. Leave a mark on this record.')).toBeNull();
    await act(async () => { fireEvent.press(r.getByLabelText('Read the critiques again')); });
    expect(rereadLog).toHaveBeenCalled();
  });

  it('none, read, is still none', async () => {
    mockCache = { ...mockCache, comments: [], critiquesUnread: false };
    mockQuery = { data: mockCache, isLoading: false, refetch: rereadLog };
    const r = await mount();
    r.getByText('No critiques yet. Leave a mark on this record.');
    expect(r.queryByText('The critiques could not be reached.')).toBeNull();
  });

  it('a log drawn from this phone alone, offline, says its critiques were not read', async () => {
    // The member's own log, not cached, the house unreachable: the page draws
    // it from the phone's copy — and its critiques are only what was queued.
    const films = jest.requireActual('@/src/stores/films').useFilmStore;
    films.setState({ logs: [{ id: LOG_ID, filmId: 843, title: 'In the Mood for Love', rating: 5, status: 'watched', createdAt: '2026-08-12T21:00:00Z' }] });
    mockLogService.getLogDetails.mockRejectedValue(new TypeError('Network request failed'));
    mockCache = undefined;
    mockQuery = { data: undefined, isLoading: true, refetch: rereadLog };
    await mount();
    const answer = await mockOptions.queryFn({});
    expect(answer.critiquesUnread).toBe(true);
    films.setState({ logs: [] });
  });
});
