/**
 * aCritiqueIsCountedWhereverItsFilingIsHeld.test.ts — review round 8
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's room and a film's Dispatch archive hold their own copy of each filing, read once.
 * A critique written from either moved the paper's count and left theirs as it was read. The
 * store now keeps what the member has moved on each filing (`critiqued`, src/stores/dispatch.ts),
 * which those lists move their counts by: one up for a critique written, one down for one taken
 * back, and back again when the house refused it.
 */
import { act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '@/src/stores/dispatch';
import { useAuthStore } from '@/src/stores/auth';
import type { Critique } from '@/src/stores/dispatchTypes';

const ME = '33333333-3333-4333-8333-333333333333';
const POST = '44444444-4444-4444-8444-444444444444';
const MINE = '55555555-5555-4555-8555-555555555555';
const REFUSED = { code: '42501', message: 'permission denied for table dispatch_comments' };

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

/** The member's own critique, as the reader holds it. */
const mine: Critique = {
  id: MINE, postId: POST, authorId: ME, author: { name: 'me', memberNo: 1, tier: 'free', avatar: null },
  body: 'Mine.', certifyCount: 0, createdAt: '2026-11-01T00:00:00Z', editedAt: null,
};
const row = {
  id: MINE, post_id: POST, user_id: ME, author_username: 'me', body: 'Mine.', certify_count: 0,
  created_at: '2026-11-01T00:00:00Z', edited_at: null,
};
const moved = () => useDispatch.getState().critiqued[POST];

beforeEach(() => {
  useAuthStore.setState({ user: { id: ME, username: 'me', is_social_private: false } as never, isAuthenticated: true } as never);
  useDispatch.setState({ critiques: {}, critiquesRead: {}, critiqued: {}, critiqueMarksKnown: new Set() } as never);
});

it('a critique written moves its filing\'s count by one wherever it is held, and a second by one more', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [] } });
  await act(async () => { await useDispatch.getState().addCritique(POST, 'First.'); });
  expect(moved()).toBe(1);
  await act(async () => { await useDispatch.getState().addCritique(POST, 'Second.'); });
  expect(moved()).toBe(2);
});

it('a critique the house refused moves the count back', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [] }, fail: { dispatch_comments: REFUSED } });
  let refused: unknown = null;
  await act(async () => { await useDispatch.getState().addCritique(POST, 'Refused.').catch((e: unknown) => { refused = e; }); });
  expect(refused).toBe(REFUSED);
  // Moved up and back: the lists print the count they read.
  expect(moved()).toBe(0);
});

it('a critique taken back moves the count down by one', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [row] } });
  useDispatch.setState({ critiques: { [POST]: [mine] } } as never);
  await act(async () => { await useDispatch.getState().removeCritique(MINE, POST); });
  expect(useDispatch.getState().critiques[POST]).toEqual([]);
  expect(moved()).toBe(-1);
});

it('a critique the house would not take back moves the count up again', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [row] }, fail: { dispatch_comments: REFUSED } });
  useDispatch.setState({ critiques: { [POST]: [mine] } } as never);
  let refused: unknown = null;
  await act(async () => { await useDispatch.getState().removeCritique(MINE, POST).catch((e: unknown) => { refused = e; }); });
  expect(refused).toBe(REFUSED);
  expect(useDispatch.getState().critiques[POST]).toEqual([mine]);
  expect(moved()).toBe(0);
});
