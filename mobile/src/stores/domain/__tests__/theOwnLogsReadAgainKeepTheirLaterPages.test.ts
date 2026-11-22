/**
 * theOwnLogsReadAgainKeepTheirLaterPages.test.ts — the member's own logs, read again from the top.
 *
 * The member's logs are held page by page (and a window of them kept on the phone). Read again from
 * the top (the file come back to, the Lobby opened), the first page alone was put in their place:
 * every page read past it left. Read again, they come back as far as they were held, from the house.
 */
import { fetchLogsOp } from '../logSlice/helpers/logOperations';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';

const ME = '00000000-0000-4000-8000-00000000000a';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** The house: 200 logs, newest watched first, a day apart. */
const HOUSE = Array.from({ length: 200 }, (_, i) => ({
  id: uuid(i + 1), user_id: ME, film_id: 1000 + i, film_title: `Film ${i + 1}`,
  watched_date: new Date(Date.UTC(2026, 10, 1) - i * 86_400_000).toISOString().slice(0, 10),
}));
const idOf = (n: number) => uuid(n);
let mockLogs = HOUSE;
const mockLimits: number[] = [];
/** The logs past the cursor's watched date (each day holds one log here), as many as the read asks. */
const answerLogs = (ask: Ask) => {
  mockLimits.push(ask.limit ?? 0);
  const before = /watched_date\.lt\.\W?(\d{4}-\d{2}-\d{2})/.exec(ask.ors?.[0] ?? '')?.[1];
  return mockLogs.filter((r) => before === undefined || r.watched_date < before).slice(0, ask.limit ?? undefined);
};
const mockHouse = supabaseFake({ answer: { logs: answerLogs } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME } }) } }));
jest.mock('@/src/stores/domain/helpers/sessionGuard', () => ({ stillSignedIn: () => true, memberUnchanged: () => true }));
jest.mock('@/src/utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn(() => true) }));

type State = { logs: { id: string }[]; _fetchingLogs: boolean; logsHasMore: boolean; _logsCursor: string | null };
const storeOf = () => {
  const state: State = { logs: [], _fetchingLogs: false, logsHasMore: true, _logsCursor: null };
  const set = (p: Partial<State>) => Object.assign(state, p);
  return { state, set: set as never, get: (() => state) as never };
};

beforeEach(() => { mockLogs = HOUSE; mockLimits.length = 0; });

it('read again from the top, the logs come back as far as the member had read them, as the house holds them', async () => {
  const s = storeOf();
  await fetchLogsOp(s.set, s.get);
  await fetchLogsOp(s.set, s.get, true);
  await fetchLogsOp(s.set, s.get, true);
  expect(s.state.logs).toHaveLength(150);
  expect(s.state.logs[149]?.id).toBe(idOf(150));

  // The third was deleted on another phone meanwhile.
  mockLogs = HOUSE.filter((r) => r.id !== idOf(3));
  mockLimits.length = 0;
  await fetchLogsOp(s.set, s.get);
  expect(s.state.logs).toHaveLength(150);
  expect(s.state.logs.map((l) => l.id)).not.toContain(idOf(3));
  expect(s.state.logs[149]?.id).toBe(idOf(151));
  expect(mockLimits).toEqual([150]);
  expect(s.state.logsHasMore).toBe(true);

  // A page more reads on from where the read again ended.
  await fetchLogsOp(s.set, s.get, true);
  expect(s.state.logs).toHaveLength(199);
  expect(s.state.logsHasMore).toBe(false);
});

it('with none held, the first page alone', async () => {
  const s = storeOf();
  await fetchLogsOp(s.set, s.get);
  expect(mockLimits).toEqual([50]);
  expect(s.state.logs).toHaveLength(50);
});
