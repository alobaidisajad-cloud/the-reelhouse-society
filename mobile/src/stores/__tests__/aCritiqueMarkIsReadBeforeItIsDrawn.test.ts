/**
 * aCritiqueMarkIsReadBeforeItIsDrawn.test.ts — the Dispatch's critiques, and whether this member
 * certified each (src/stores/dispatch.ts), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * The critiques come first; whether this member certified each is a second read, after them, and
 * it may fail. Every heart was drawn "not certified" until then, and for good when it failed, and
 * a press filed a certification the member may already have given. The store now knows which
 * critiques' marks the house answered:
 *   - answered, each critique asked about is known, certified or not;
 *   - failed, none is known: unknown, never "not certified";
 *   - a critique the member files here is known at once: nobody has certified it.
 */
import { act } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '@/src/stores/dispatch';
import { useAuthStore } from '@/src/stores/auth';

const ME = '33333333-3333-4333-8333-333333333333';
const POST = '44444444-4444-4444-8444-444444444444';
const C1 = '55555555-5555-4555-8555-555555555555';
const C2 = '66666666-6666-4666-8666-666666666666';
const NETWORK = { message: 'Failed to fetch', code: '' };

const critique = (id: string, minutes: number) => ({
  id, post_id: POST, user_id: '77777777-7777-4777-8777-777777777777', author_username: 'mara',
  body: 'A second look.', certify_count: 1, created_at: new Date(Date.now() - minutes * 60000).toISOString(), edited_at: null,
});

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

beforeEach(() => {
  useAuthStore.setState({ user: { id: ME, username: 'me', is_social_private: false } as never, isAuthenticated: true } as never);
  useDispatch.setState({ critiques: {}, certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set() } as never);
});

it('answered, knows each critique asked about: certified or not', async () => {
  mockHouse = supabaseFake({ rows: {
    dispatch_comments: [critique(C1, 5), critique(C2, 10)],
    dispatch_certifications: [{ id: '88888888-8888-4888-8888-888888888888', user_id: ME, comment_id: C1, post_id: null, created_at: '2026-10-01T00:00:00Z' }],
  } });
  await act(async () => { await useDispatch.getState().fetchCritiques(POST, 'NEWEST'); });
  const st = useDispatch.getState();
  expect([st.critiqueMarksKnown.has(C1), st.critiqueMarksKnown.has(C2)]).toEqual([true, true]);
  expect([st.certifiedCritiqueIds.has(C1), st.certifiedCritiqueIds.has(C2)]).toEqual([true, false]);
});

it('failed, knows none of them: unknown, never "not certified"', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [critique(C1, 5), critique(C2, 10)], dispatch_certifications: [] }, fail: { dispatch_certifications: NETWORK } });
  await act(async () => { await useDispatch.getState().fetchCritiques(POST, 'NEWEST'); });
  const st = useDispatch.getState();
  // Anchored: the critiques themselves were read.
  expect((st.critiques[POST] ?? []).map((c) => c.id)).toEqual([C1, C2]);
  expect([st.critiqueMarksKnown.has(C1), st.critiqueMarksKnown.has(C2)]).toEqual([false, false]);
});

it('knows a critique the member files here at once: nobody has certified it', async () => {
  mockHouse = supabaseFake({ rows: { dispatch_comments: [], dispatch_certifications: [] } });
  await act(async () => { await useDispatch.getState().addCritique(POST, 'Mine, just now.'); });
  const mine = useDispatch.getState().critiques[POST]?.[0];
  expect(mine?.body).toBe('Mine, just now.');
  expect(useDispatch.getState().critiqueMarksKnown.has(mine?.id ?? '')).toBe(true);
});
