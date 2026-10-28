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
  // the log's own read; any other on the page (the Lobby's honour) answers nothing
  useQuery: (opts: { queryKey: unknown[] }) => {
    if (opts.queryKey[0] !== 'log') return { data: undefined };
    mockOptions = opts as never;
    return mockQuery;
  },
  useQueryClient: () => ({
    setQueryData: jest.fn((_k: unknown, fn: (old: unknown) => unknown) => { mockCache = fn(mockCache) as never; }),
    getQueryData: jest.fn(() => mockCache),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()), removeQueries: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
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
/** The reader's clearance to speak in a salon, and its rope; every other rank is held here. */
let mockSpeaking: { held: boolean; standing: 'stranger' | 'lapsed' | 'reading' } = { held: true, standing: 'stranger' };
const mockRope = jest.fn();
jest.mock('@/src/hooks/useClearance', () => ({
  useClearance: (feature: string) => (feature === 'lounge-speaking'
    ? { ...mockSpeaking, rank: 'archivist', open: mockRope, openOr: mockRope }
    : { held: true, standing: 'held', open: jest.fn() }),
}));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({ note: null, loaded: true, unreachable: false }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
/** Whether the salon list was opened: sharing a log into a salon is speaking there. */
let mockSalonsShown = false;
jest.mock('@/src/components/ShareToLoungeModal', () => (p: { visible: boolean }) => { mockSalonsShown = p.visible; return null; });
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
  // The house's answer, with the member's own certification in it.
  mockCache = { log: LOG, profile: PROFILE, comments: [], commentTotal: 3, certifyCount: 7, certifiedKnown: true };
  mockQuery = { data: mockCache, isLoading: false };
});

it('a log whose own mark the house did not answer draws the heart unknown, and a press asks again', async () => {
  const reread = jest.fn();
  mockQuery = { data: { ...mockCache, certifyCount: null, certifiedKnown: false }, isLoading: false, refetch: reread };
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  const heart = r.getByLabelText('Certify this critique. Reading your mark');
  await act(async () => { await fireEvent.press(heart); });
  expect(reread).toHaveBeenCalled();
  expect(jest.requireActual('@/src/stores/films').useFilmStore.getState()._endorsedIndex).toEqual({});
});

it('the house\'s answer says whether the mark is known; the phone\'s stand-in never does', async () => {
  const details = mockLogService.getLogDetails as jest.Mock;
  (mockLogService.getLogComments as jest.Mock).mockResolvedValue({ comments: [], total: 3 });
  details.mockResolvedValue({ ...LOG, profiles: PROFILE, certify_count: [{ count: 7 }], certified: [{ count: 0 }] });
  await act(async () => { render(<LogDetailScreen />); });
  let data: Record<string, unknown> = {};
  await act(async () => { data = await mockOptions.queryFn({}); });
  expect(data).toMatchObject({ certifiedKnown: true });
  details.mockResolvedValue({ ...LOG, profiles: PROFILE, certify_count: [{ count: 7 }] });
  await act(async () => { data = await mockOptions.queryFn({}); });
  expect(data).toMatchObject({ certifiedKnown: false });
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
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Write a critique on this log'), 'A second look.'); });
  await act(async () => { await fireEvent.press(r.getByText('FILE CRITIQUE')); });
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

it('while the record loads, the page shows a spinner that says what it is waiting for', async () => {
  // It used to return an empty View: a black screen, and silence to a screen
  // reader, for as long as the fetch took.
  mockQuery = { data: undefined, isLoading: true };
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<LogDetailScreen />); });
  expect(r.getByLabelText('Loading record')).toBeTruthy();
});

describe('LOUNGE, sharing the log into a salon (P4.16)', () => {
  const pressLounge = async (standing: typeof mockSpeaking, label: string) => {
    mockSpeaking = standing;
    mockSalonsShown = false;
    let r!: ReturnType<typeof render>;
    await act(async () => { r = render(<LogDetailScreen />); });
    await act(async () => { await fireEvent.press(r.getByLabelText(label)); });
    return r;
  };
  afterAll(() => { mockSpeaking = { held: true, standing: 'stranger' }; });

  it('opens the rope for a member without the rank, and no salon list', async () => {
    await pressLounge({ held: false, standing: 'stranger' }, 'Share to a lounge. Clearance required. The Archivist opens this. Opens the Society.');
    expect(mockRope).toHaveBeenCalledTimes(1);
    expect(mockSalonsShown).toBe(false);
  });

  it('opens the rope for a member whose dues have lapsed, said as theirs', async () => {
    await pressLounge({ held: false, standing: 'lapsed' }, 'Share to a lounge. Your dues have lapsed. The Archivist opens this again. Opens the Society.');
    expect(mockRope).toHaveBeenCalledTimes(1);
    expect(mockSalonsShown).toBe(false);
  });

  it('opens the salon list for an Archivist', async () => {
    await pressLounge({ held: true, standing: 'stranger' }, 'Share to a lounge');
    expect(mockRope).not.toHaveBeenCalled();
    expect(mockSalonsShown).toBe(true);
  });
});
