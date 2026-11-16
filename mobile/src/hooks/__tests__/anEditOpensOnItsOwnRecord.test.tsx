/**
 * anEditOpensOnItsOwnRecord.test.tsx — useLogFlow (src/hooks/useLogFlow.ts) over a record the
 * phone has not paged in, against the house as strict as it is (test-utils/supabaseFake).
 *
 * The phone holds a member's newest fifty logs. The editor took its record from those pages
 * alone, so a record older than them (opened from its own page, a profile, or the feed) opened
 * on a BLANK form: no rating, no critique, today's date. A rating is all the seal asks for, and
 * sealing wrote the blanks over the record — its critique, its date, its ranked fields. Deleting
 * one played the warning, closed the sheet, and deleted nothing.
 *   - the form opens on the record as it is, and stays shut while it is not in hand;
 *   - what the member types survives the pages being read again under it;
 *   - a read that fails, or a record that is not theirs, is said, and the seal refuses;
 *   - a delete takes the record it was opened on.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';
import { mapLogRow } from '@/src/utils/mappers';

const ME = '33333333-3333-4333-8333-333333333333';
const OTHER = '77777777-7777-4777-8777-777777777777';
const OLD = '44444444-4444-4444-8444-444444444444';
const VIEWING = '55555555-5555-4555-8555-555555555555';
const NETWORK = { message: 'Failed to fetch', code: '' };

/** A record from two years ago, as the house holds it: far past the pages the phone has read. */
const oldRow = (owner = ME) => ({
  id: OLD, user_id: owner, film_id: 603, film_title: 'The Matrix', poster_path: '/m.jpg', year: '1999',
  rating: 4, review: 'Still the best lobby shootout ever filmed.', status: 'watched',
  watched_date: '2024-03-02', is_spoiler: false, watched_with: 'Mara', abandoned_reason: null,
  physical_media: null, is_autopsied: false, autopsy: null, alt_poster: null, editorial_header: null,
  drop_cap: false, pull_quote: '', video_url: null, format: 'digital', created_at: '2024-03-02T20:00:00Z',
  view_count: 1, viewing_history: [], viewing_id: VIEWING,
});

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

/** The editor, opened on the old record from its own page, over a house that holds `rows`. */
const openEditor = async (options: Parameters<typeof supabaseFake>[0]) => {
  mockHouse = supabaseFake(options);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: OLD, filmId: '603', filmTitle: 'The Matrix', filmPoster: '/m.jpg' });
  return (await renderHook(() => useLogFlow())).result;
};
const settle = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

beforeEach(() => {
  useVaultStore.getState().clear();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  // The pages the phone holds: none of them is the old record.
  useFilmStore.setState({ logs: [], _loggedIndex: {} } as never);
});

it('opens on the record as it is: its rating, its critique, its date, its company', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  expect([flow.current.rating, flow.current.review, flow.current.date, flow.current.watchedWith])
    .toEqual([4, 'Still the best lobby shootout ever filmed.', '2024-03-02', 'Mara']);
});

it('seals the change over the record, never the blanks', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  await act(async () => { flow.current.setRating(5); });
  await act(async () => { await flow.current.handleLog(); });
  const [held] = mockHouse.rows('logs');
  expect([held?.rating, held?.review, held?.watched_date, held?.watched_with])
    .toEqual([5, 'Still the best lobby shootout ever filmed.', '2024-03-02', 'Mara']);
  // Only what the member changed is sent: what they left alone stays as the house holds it.
  const sent = mockHouse.asked.filter((a) => a.table === 'logs' && a.op === 'update').map((a) => Object.keys(a.values?.[0] ?? {}));
  expect(sent).toEqual([['rating']]);
});

it('keeps what the member typed when the pages are read again under it', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  await act(async () => { flow.current.setReview('A second thought.'); });
  // A refresh lands mid-edit, and this time its pages hold the record.
  const paged = mapLogRow(oldRow() as never);
  await act(async () => { useFilmStore.setState({ logs: [paged], _loggedIndex: { 603: paged } } as never); });
  await settle();
  expect(flow.current.review).toBe('A second thought.');
});

it('says a read that failed, refuses the seal, and opens when asked again', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] }, fail: { logs: NETWORK } });
  await waitFor(() => expect(flow.current.editRead).toBe('failed'));
  expect(flow.current.editReady).toBe(false);
  // Even with a rating, which is all a seal asks of a form.
  await act(async () => { flow.current.setRating(5); });
  await act(async () => { await flow.current.handleLog(); });
  expect(mockHouse.asked.filter((a) => a.table === 'logs' && a.op !== 'select')).toEqual([]);
  mockHouse = supabaseFake({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await act(async () => { flow.current.rereadEdit(); });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  expect(flow.current.rating).toBe(4);
});

it('says a record that is not theirs as withdrawn, and never opens on it', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow(OTHER)], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editRead).toBe('withdrawn'));
  expect(flow.current.editReady).toBe(false);
});

it('deletes the record it was opened on', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  await act(async () => { await flow.current.handleDelete(); });
  expect(mockHouse.rows('logs')).toEqual([]);
});

it('a delete of a record nobody has in hand is a failure said, never a silent nothing', async () => {
  mockHouse = supabaseFake({ rows: { logs: [oldRow()] } });
  await expect(useFilmStore.getState().removeLog(OLD)).rejects.toThrow();
  expect(mockHouse.rows('logs')).toHaveLength(1);
});

it('reads the record once, its viewing’s id in the same row: no second request for it (P4.53)', async () => {
  const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
  await waitFor(() => expect(flow.current.editReady).toBe(true));
  await settle();
  const logReads = mockHouse.asked.filter((a) => a.table === 'logs' && a.op === 'select');
  expect(logReads).toHaveLength(1);
  expect(logReads[0]?.columns).toContain('viewing_id');
});

describe('amendments not yet sealed (review round 5)', () => {
  // An edit keeps no draft, and the sheet let it go on any way out without a word: the sheet
  // asks while amendmentsUnsealed holds (log-modal.tsx, useAskBeforeLeaving).
  it('none on the record as it opened, and none while it is still being read', async () => {
    const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
    expect(flow.current.amendmentsUnsealed).toBe(false);
    await waitFor(() => expect(flow.current.editReady).toBe(true));
    await settle();
    expect(flow.current.amendmentsUnsealed).toBe(false);
  });

  it('one changed field is an amendment, and changing it back is none', async () => {
    const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
    await waitFor(() => expect(flow.current.editReady).toBe(true));
    await act(async () => { flow.current.setReview('Still the best lobby shootout ever filmed. And the rain.'); });
    expect(flow.current.amendmentsUnsealed).toBe(true);
    await act(async () => { flow.current.setReview('Still the best lobby shootout ever filmed.'); });
    expect(flow.current.amendmentsUnsealed).toBe(false);
    await act(async () => { flow.current.setRating(5); });
    expect(flow.current.amendmentsUnsealed).toBe(true);
  });

  it('sealed, nothing is left to ask about', async () => {
    const flow = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
    await waitFor(() => expect(flow.current.editReady).toBe(true));
    await act(async () => { flow.current.setRating(5); });
    await act(async () => { await flow.current.handleLog(); });
    expect(flow.current.sealed).toBe(true);
    expect(flow.current.amendmentsUnsealed).toBe(false);
  });
});

/**
 * Review round 6: DELETE THIS ENTIRE LOG was always asked of the store as a viewing, so on a
 * record watched again it took the latest viewing alone, under "this log is gone for good". The
 * whole record goes now; a viewing alone is its own act (REMOVE THIS VIEWING), and one that cannot
 * be named without a connection is said, with the sheet left standing.
 */
describe('a record watched again (review round 6)', () => {
  const EARLIER = '66666666-6666-4666-8666-666666666666';
  const watchedTwice = (over: Record<string, unknown> = {}) => ({
    ...oldRow(), view_count: 2,
    viewing_history: [{ viewingId: EARLIER, date: '2023-01-05', rating: 3, review: 'The first time.', status: 'watched' }],
    ...over,
  });
  const reelToast = require('@/src/utils/reelToast').default as { error: (m: string) => void };
  const { nav } = require('@/src/utils/typedRouter') as typeof import('@/src/utils/typedRouter');
  let said: jest.SpyInstance;
  let back: jest.SpyInstance;
  beforeEach(() => {
    said = jest.spyOn(reelToast, 'error').mockImplementation(() => {});
    back = jest.spyOn(nav, 'back').mockImplementation(() => {});
  });
  afterEach(() => { said.mockRestore(); back.mockRestore(); });

  it('offers its latest viewing alone to remove; a record watched once does not', async () => {
    const twice = await openEditor({ rows: { logs: [watchedTwice()], log_private_notes: [] } });
    await waitFor(() => expect(twice.current.editReady).toBe(true));
    expect(twice.current.hasEarlierViewings).toBe(true);
    const once = await openEditor({ rows: { logs: [oldRow()], log_private_notes: [] } });
    await waitFor(() => expect(once.current.editReady).toBe(true));
    expect(once.current.hasEarlierViewings).toBe(false);
  });

  it('DELETE THIS ENTIRE LOG takes the whole record, every viewing in it', async () => {
    const flow = await openEditor({ rows: { logs: [watchedTwice()], log_private_notes: [] } });
    await waitFor(() => expect(flow.current.editReady).toBe(true));
    await act(async () => { await flow.current.handleDelete(true); });
    expect(mockHouse.rows('logs')).toEqual([]);
    expect(said).not.toHaveBeenCalled();
  });

  // Review round 7: the first removal steps the record back on the phone before it is answered, so
  // a second asked meanwhile found no earlier viewing and deleted the whole record. The hook turns
  // it away itself, whoever asks: the press's own debounce and busy state are only its first door.
  it('REMOVE THIS VIEWING asked twice at once is asked of the store once', async () => {
    // The store's removal, held on the wire: the second ask comes while the first is out.
    let land: () => void = () => {};
    const removeLog = jest.fn(() => new Promise<void>((res) => { land = res; }));
    const real = useFilmStore.getState().removeLog;
    useFilmStore.setState({ removeLog } as never);
    try {
      const flow = await openEditor({ rows: { logs: [watchedTwice()], log_private_notes: [] } });
      await waitFor(() => expect(flow.current.editReady).toBe(true));
      const { handleDelete } = flow.current;
      let both: Promise<unknown> = Promise.resolve();
      await act(async () => { both = Promise.all([handleDelete(false), handleDelete(false)]); });
      expect(removeLog).toHaveBeenCalledTimes(1);
      expect(removeLog).toHaveBeenCalledWith(OLD, false, expect.anything());
      await act(async () => { land(); await both; });
      expect(removeLog).toHaveBeenCalledTimes(1);
    } finally {
      useFilmStore.setState({ removeLog: real } as never);
    }
  });

  it('a viewing that cannot be named without a connection is said, nothing is removed, and the sheet stays', async () => {
    const flow = await openEditor({ rows: { logs: [watchedTwice({ viewing_id: null })], log_private_notes: [] } });
    await waitFor(() => expect(flow.current.editReady).toBe(true));
    await act(async () => { await flow.current.handleDelete(false); });
    await settle();
    expect(said).toHaveBeenCalledWith('Removing a viewing needs a connection.');
    expect(back).not.toHaveBeenCalled();
    expect(mockHouse.rows('logs')).toHaveLength(1);
  });
});
