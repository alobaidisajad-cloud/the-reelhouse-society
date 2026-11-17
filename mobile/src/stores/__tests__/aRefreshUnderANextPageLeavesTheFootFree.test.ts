/**
 * aRefreshUnderANextPageLeavesTheFootFree.test.ts — review round 9 (B1)
 * ─────────────────────────────────────────────────────────────────────────────
 * The paper read again (a pull, the tab come back to) while a next page was still on its way: that
 * page belongs to the page the read replaced, and lowers its own flag only while its read stands.
 * So `loadingMore` stood up for good: the foot spun, no next page was ever asked again, and the
 * N NEW count above the page was never asked either. A read of the paper now lowers it, so the
 * next page is asked again from the page the member now holds.
 * Against the house as strict as it is (test-utils/supabaseFake), each answer held until let go.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { useDispatch } from '../dispatch';
import { PAGE_SIZE } from '../dispatchTypes';
import { resetAllStores } from '../resetAllStores';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '55555555-5555-4555-8555-555555555555';

/** The nth filing, newest first: n = 0 is the newest. */
const idOf = (n: number) => `00000000-0000-4000-9000-${String(n + 1).padStart(12, '0')}`;
const take = (n: number) => ({
  id: idOf(n), kind: 'take', user_id: AUTHOR, author_username: 'mara', title: null,
  body: `Take ${n}.`, is_published: true, withheld_at: null, ended_at: null,
  certify_count: 0, comment_count: 0,
  created_at: `2026-11-15T10:${String(59 - Math.floor(n / 60)).padStart(2, '0')}:${String(59 - (n % 60)).padStart(2, '0')}Z`,
});
/** The house's paper: three pages and a little more. */
const PAPER = Array.from({ length: PAGE_SIZE * 3 + 5 }, (_, n) => take(n));

/** Every row strictly after the keyset cursor an `or()` names (created_at, then id, newest first). */
const pastTheCursor = (ask: Ask, rows: typeof PAPER) => {
  const or = ask.ors?.[0];
  if (!or) return rows;
  const m = /^created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([^)]+)\)$/.exec(or);
  expect(m).not.toBeNull();
  const [, at = '', id = ''] = m ?? [];
  return rows.filter((r) => r.created_at < at || (r.created_at === at && r.id < id));
};

const mockHouse = supabaseFake({
  answer: {
    // The HEAD count of what is newer (checkForNew), or a page of the paper.
    dispatch_posts: (ask) => (ask.head ? [] : pastTheCursor(ask, PAPER)),
  },
  rows: { profiles: [], dispatch_certifications: [], dispatch_saves: [], dispatch_votes: [] },
});
const mockHeld = heldClient(mockHouse.client);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333' } }) } }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));

const onPage = () => useDispatch.getState().filings.map((f) => f.id);
const pageAsks = () => mockHouse.asked.filter((a) => a.table === 'dispatch_posts' && !a.head);
const countAsks = () => mockHouse.asked.filter((a) => a.table === 'dispatch_posts' && a.head);

/** Until n reads of the paper are waiting on the house. */
const waiting = async (n: number) => {
  for (let i = 0; i < 200 && mockHeld.count('dispatch_posts') < n; i++) await Promise.resolve();
  expect(mockHeld.count('dispatch_posts')).toBe(n);
};
/** The paper read, its answer let go: `behind` reads were already waiting before it. */
const readThePaper = async (behind = 0) => {
  const read = useDispatch.getState().fetch();
  await waiting(behind + 1);
  await mockHeld.release('dispatch_posts', behind);
  await read;
};
/** The next page asked, and left on its way. */
const askTheNextPage = async () => {
  const more = useDispatch.getState().loadMore();
  await waiting(1);
  // Inside an object: an async function handing back the promise itself would wait on it.
  return { more };
};

beforeEach(async () => {
  await resetAllStores(ME);
});

it('a pull to refresh while the next page is on its way leaves no foot spinning, and the next page is asked again', async () => {
  await readThePaper();
  expect(onPage()).toEqual(PAPER.slice(0, PAGE_SIZE).map((f) => f.id));

  // The member scrolls to the foot: the next page is on its way.
  const { more } = await askTheNextPage();
  expect(useDispatch.getState().loadingMore).toBe(true);

  // A pull to refresh, on the same department, answered first.
  await readThePaper(1);
  expect(useDispatch.getState().loadingMore).toBe(false);

  // The next page of the page that was replaced lands: dropped, and the foot is free.
  await mockHeld.release('dispatch_posts');
  await more;
  expect(useDispatch.getState().loadingMore).toBe(false);
  expect(onPage()).toEqual(PAPER.slice(0, PAGE_SIZE).map((f) => f.id));

  // So scrolling to the foot asks the next page again, and it is laid under the page.
  const asked = pageAsks().length;
  const { more: again } = await askTheNextPage();
  await mockHeld.release('dispatch_posts');
  await again;
  expect(pageAsks()).toHaveLength(asked + 1);
  expect(onPage()).toEqual(PAPER.slice(0, PAGE_SIZE * 2).map((f) => f.id));
});

it('a pull to refresh while the next page is on its way leaves the N NEW count free to be asked', async () => {
  await readThePaper();
  const { more } = await askTheNextPage();
  await readThePaper(1);
  await mockHeld.release('dispatch_posts');
  await more;

  const counted = useDispatch.getState().checkForNew();
  await waiting(1);
  await mockHeld.release('dispatch_posts');
  await counted;
  expect(countAsks()).toHaveLength(1);
  expect(useDispatch.getState().newCount).toBe(0);
});
