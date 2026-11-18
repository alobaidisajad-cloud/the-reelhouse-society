/**
 * aRecordUnreadIsSaid.test.tsx — a member's file whose summary or count could not be read draws
 * no run from a part, and says its record could not be read (round 13).
 *
 * The house's summary of a file (the run, the longest run, the average mark, the heaviest month)
 * was read and, failed, answered as nothing: the record was simply missing, and the run was
 * counted over the records on the phone against a count that had not answered either (0), so the
 * first page of a long record drew a run counted short. Now the summary's failure is kept and the
 * Projector says THE RECORD COULD NOT BE READ with TRY AGAIN; the run is counted over the records
 * held only against a count the house answered on this read, and is otherwise not drawn.
 */
import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { ProjectorRoom } from '../ProjectorRoom';
import { useProfileComputed } from '../profileComputed';
import { useProfileData } from '@/src/hooks/useProfileData';

const mockService: Record<string, jest.Mock> = {
  fetchProfile: jest.fn(),
  fetchCounts: jest.fn(),
  fetchAnalyticsSummary: jest.fn(),
  fetchOtherUserLogs: jest.fn(async () => ({ items: [], nextCursor: null })),
};
jest.mock('@/src/services/ProfileDataService', () => ({
  ProfileDataService: new Proxy({}, { get: (_t, k: string) => mockService[k] ?? jest.fn(async () => null) }),
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const MEMBER = { id: 'u9', username: 'vesper', tier: 'auteur', role: 'auteur', is_founding: false, is_social_private: false };
const RECORD = { current_streak: 4, current_run: { length: 4, ends_on: '2026-11-15' }, longest_streak: 9, avg_rating: 3.8 };
const LOST = new Error('Network request failed');

const openFile = async () => {
  const r = await renderHook(() => useProfileData({ username: 'vesper', isSelf: false, isFollowing: false, activeTab: null as never }));
  await waitFor(() => expect(r.result.current.targetUser?.id).toBe('u9'));
  return r;
};

beforeEach(() => {
  mockService.fetchProfile!.mockResolvedValue(MEMBER);
  mockService.fetchCounts!.mockReset().mockResolvedValue({ logs: 400, ledger: 0, watchlist: 0, vault: 0, lists: 0 });
  mockService.fetchAnalyticsSummary!.mockReset().mockResolvedValue(RECORD);
});

describe('the file, as read', () => {
  it('a summary that could not be read is kept as unread, never as a file with no record', async () => {
    mockService.fetchAnalyticsSummary!.mockRejectedValue(LOST);
    const { result } = await openFile();
    expect([result.current.summaryUnread, result.current.analyticsShape]).toEqual([true, null]);
    // Asked again, the summary that answers is the record.
    mockService.fetchAnalyticsSummary!.mockResolvedValue(RECORD);
    await act(async () => { await result.current.fetchUserData(); });
    expect([result.current.summaryUnread, result.current.analyticsShape]).toEqual([false, RECORD]);
  });

  it("TRY AGAIN asks the summary alone: the file is not read again, and the archive's pages stay", async () => {
    mockService.fetchAnalyticsSummary!.mockRejectedValue(LOST);
    const { result } = await openFile();
    expect(result.current.summaryUnread).toBe(true);
    const files = mockService.fetchProfile!.mock.calls.length;
    const pages = mockService.fetchOtherUserLogs!.mock.calls.length;
    mockService.fetchAnalyticsSummary!.mockResolvedValue(RECORD);
    await act(async () => { await result.current.retrySummary(); });
    expect([result.current.summaryUnread, result.current.analyticsShape, result.current.serverStreak]).toEqual([false, RECORD, 4]);
    expect([mockService.fetchProfile!.mock.calls.length, mockService.fetchOtherUserLogs!.mock.calls.length]).toEqual([files, pages]);
  });

  it('a count that could not be read is no count: the record is not counted as 0', async () => {
    mockService.fetchCounts!.mockResolvedValue({});
    const { result } = await openFile();
    expect(result.current.recordCounted).toBeNull();
  });

  it('a count the house answered is the record counted', async () => {
    const { result } = await openFile();
    expect([result.current.recordCounted, result.current.summaryUnread]).toEqual([400, false]);
  });
});

describe('the run and the record, drawn', () => {
  const base = {
    isSelf: false, myLogs: [], myWatchlist: [], myVault: [], myLists: [],
    mainLogs: [], archiveLogs: [], ledgerLogs: [], watchlist: [], vault: [], lists: [],
    counts: { logs: 0, ledger: 0, watchlist: 0, vault: 0, lists: 0 },
    isArchivistPlus: true, targetUser: { id: 'u9' }, username: 'vesper', serverStreak: null,
    archiveSieve: 'all', archiveSearch: '', listsSearch: '', physicalSearch: '',
    ledgerSearch: '', ledgerRatingFilter: 'all' as const, watchlistDecade: null,
    watchlistSearch: '', watchlistSort: 'default' as const, physicalFilter: null,
    physicalSort: 'default' as const, listsSort: 'default' as const,
  };
  const NIGHTS = ['2026-11-15', '2026-11-14', '2026-11-13'].map((day, i) => ({ id: `l${i}`, filmId: i + 1, watchedDate: day }));
  afterEach(() => jest.restoreAllMocks());
  const realNow = Date.now.bind(Date);
  /** The member's own evening of the 16th, the clock running on from there. */
  const computed = async (over: Record<string, unknown>) => {
    const from = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => new Date('2026-11-16T20:00:00').getTime() + (realNow() - from));
    return (await renderHook(() => useProfileComputed({ ...base, ...over } as never))).result.current;
  };

  it('with no summary and no count answered, no run is drawn from the first page, and the record is said unread', async () => {
    const c = await computed({ mainLogs: NIGHTS, summaryUnread: true, recordCounted: null });
    expect([c.streak, c.recordUnread]).toEqual([null, true]);
  });

  it('with no summary but the whole record held, as the house counted it, the run is counted over it', async () => {
    const c = await computed({ mainLogs: NIGHTS, summaryUnread: true, recordCounted: 3 });
    expect([c.streak, c.recordUnread]).toEqual([3, true]);
  });

  it('the Projector says its record could not be read, and TRY AGAIN asks for it', async () => {
    const onRetry = jest.fn();
    const r = await render(<ProjectorRoom stats={{ count: 400, level: 'X', color: '#B8891A', progress: 0.4 }} user={{ username: 'vesper' }} recordUnread onRetry={onRetry} />);
    expect(r.getByText('THE RECORD COULD NOT BE READ')).toBeTruthy();
    await fireEvent.press(r.getByLabelText('Try again: read the record'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('TRY AGAIN says it is asking until the summary answers', async () => {
    let answer: () => void = () => {};
    const onRetry = jest.fn(() => new Promise<void>((resolve) => { answer = resolve; }));
    const r = await render(<ProjectorRoom stats={{ count: 400, level: 'X', color: '#B8891A', progress: 0.4 }} user={{ username: 'vesper' }} recordUnread onRetry={onRetry} />);
    await fireEvent.press(r.getByLabelText('Try again: read the record'));
    const asking = r.getByLabelText('Asking: read the record');
    expect(asking.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await act(async () => { answer(); });
    expect(r.getByLabelText('Try again: read the record')).toBeTruthy();
  });

  it('a record read is never said unread', async () => {
    const r = await render(<ProjectorRoom stats={{ count: 400, level: 'X', color: '#B8891A', progress: 0.4 }} user={{ username: 'vesper' }} record={RECORD} streak={4} />);
    expect(r.queryByText('THE RECORD COULD NOT BE READ')).toBeNull();
    expect(r.getByText('4 NIGHTS RUNNING')).toBeTruthy();
  });
});
