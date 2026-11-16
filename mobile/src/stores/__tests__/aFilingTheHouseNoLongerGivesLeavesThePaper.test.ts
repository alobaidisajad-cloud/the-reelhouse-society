/**
 * aFilingTheHouseNoLongerGivesLeavesThePaper.test.ts — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * A filing opened from the paper is read again from the house (hydrate). When the house no longer
 * gave it (withheld, withdrawn, or its author has blocked the member since the paper was read), the
 * paper's copy stayed: the reader drew it whole from there, with every act on it refused, instead
 * of "This filing is no longer here.". It now leaves the page and the opened filings, unless it
 * was filed on this phone and is still in the queue (the house has not seen it yet).
 * Against the house as strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';
import { useOfflineQueueStore } from '../offlineQueueStore';
import { resetAllStores } from '../resetAllStores';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const GONE = '00000000-0000-4000-9000-000000000001';
const STAYS = '00000000-0000-4000-9000-000000000002';

const take = (id: string) => ({
  id, kind: 'take', user_id: AUTHOR, author_username: 'mara', title: null,
  body: 'A take.', is_published: true, withheld_at: null, ended_at: null,
  certify_count: 0, comment_count: 0, created_at: '2026-11-15T10:00:00Z',
});
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'cinephile', role: 'cinephile', is_founding: false };
const houseHolding = (...takes: ReturnType<typeof take>[]) => supabaseFake({ rows: {
  dispatch_posts: takes, profiles: [profile],
  dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [],
} });

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));

const onPage = () => useDispatch.getState().filings.map((f) => f.id);
const opened = () => Object.keys(useDispatch.getState().opened).sort();

/** The paper as the member read it: both filings on the page, and both opened once. */
const readThePaper = async () => {
  mockHouse = houseHolding(take(GONE), take(STAYS));
  const gone = await useDispatch.getState().hydrate(GONE);
  const stays = await useDispatch.getState().hydrate(STAYS);
  expect(gone).toEqual(expect.objectContaining({ id: GONE }));
  expect(stays).toEqual(expect.objectContaining({ id: STAYS }));
  useDispatch.setState({ filings: [gone, stays] as never });
  expect(onPage()).toEqual([GONE, STAYS]);
  expect(opened()).toEqual([GONE, STAYS]);
};

beforeEach(async () => {
  await resetAllStores(ME);
  useOfflineQueueStore.setState({ queued: [] });
});

it('a filing the house no longer gives leaves the page and the opened filings, so the reader says it is no longer here', async () => {
  await readThePaper();
  // Since then, its author has blocked the member: the house holds only the other.
  mockHouse = houseHolding(take(STAYS));
  expect(await useDispatch.getState().hydrate(GONE)).toBeNull();
  expect(onPage()).toEqual([STAYS]);
  expect(opened()).toEqual([STAYS]);
});

it('a filing written on this phone stays on the page while it waits to be sent, and leaves once the house has not got it', async () => {
  await readThePaper();
  useOfflineQueueStore.setState({ queued: [{ id: 'q1', type: 'add_filing', payload: { _tempId: GONE }, timestamp: 0 }] });
  mockHouse = houseHolding(take(STAYS));
  expect(await useDispatch.getState().hydrate(GONE)).toBeNull();
  expect(onPage()).toEqual([GONE, STAYS]);
  expect(opened()).toEqual([GONE, STAYS]);
  // Out of the queue, and still not in the house: it goes.
  useOfflineQueueStore.setState({ queued: [] });
  expect(await useDispatch.getState().hydrate(GONE)).toBeNull();
  expect(onPage()).toEqual([STAYS]);
  expect(opened()).toEqual([STAYS]);
});
