/**
 * theFollowListIsReadOnce.test.ts — one read of a member's follow list at a
 * time, and it writes only for the member it was read for.
 *
 * A member's cold start asked for the whole list twice — the bootstrapper as the
 * remembered member was restored, and sign-in as the session was confirmed —
 * every page of it each time. And a read that was still running when the member
 * signed out, or switched to another account, wrote its list into whoever was
 * signed in when it finished.
 */
import { hydrateFollowing } from '../domain/socialSlice';
import { resetAllStores } from '../resetAllStores';

const ANNA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
let mockUser: { id: string } | null = { id: ANNA };

/** Each read waits here until the test answers it. */
let pending: ((rows: unknown[]) => void)[] = [];
const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'in', 'order', 'limit', 'or'] as const) c[f] = () => self();
  c.then = (res: (v: unknown) => unknown) =>
    new Promise<unknown[]>((answer) => { pending.push(answer); }).then((rows) => res({ data: rows, error: null }));
  return c;
};
/** Lets a read that was just asked for reach the server. */
const started = () => new Promise((r) => setTimeout(r, 0));
const answerAll = async (rows: unknown[]) => {
  const now = pending;
  pending = [];
  now.forEach((a) => a(rows));
  await new Promise((r) => setTimeout(r, 0));
};

const mockSetFollowing = jest.fn();
const mockSetRequested = jest.fn();
const mockPersist = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { from: () => chain() } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../followStore', () => ({
  useSocialStore: {
    getState: () => ({ setFollowing: mockSetFollowing, setRequested: mockSetRequested, persistFollowing: mockPersist }),
    setState: jest.fn(),
  },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn() }));

const row = (name: string) => ({
  id: `r-${name}`, target_user_id: `t-${name}`, created_at: '2026-10-08T00:00:00.000Z', type: 'follow',
  profiles: { username: name },
});

beforeEach(async () => {
  mockUser = { id: ANNA };
  pending = [];
  await resetAllStores();
  jest.clearAllMocks();
});

it('asked twice while the first read runs, reads once — and both callers get its answer', async () => {
  const first = hydrateFollowing();
  const second = hydrateFollowing();
  expect(second).toBe(first);
  await started();
  expect(pending).toHaveLength(1);
  await answerAll([row('agnes')]);
  await Promise.all([first, second]);
  expect(mockSetFollowing).toHaveBeenCalledTimes(1);
  expect(mockSetFollowing).toHaveBeenCalledWith(['agnes']);
});

it('asked again after the read is done, reads again', async () => {
  const first = hydrateFollowing();
  await started();
  await answerAll([row('agnes')]);
  await first;
  const again = hydrateFollowing();
  expect(again).not.toBe(first);
  await started();
  expect(pending).toHaveLength(1);
  await answerAll([row('agnes'), row('varda')]);
  await again;
  expect(mockSetFollowing).toHaveBeenLastCalledWith(['agnes', 'varda']);
});

it('a read that finishes after its member switched accounts writes nothing — and the new member gets their own read', async () => {
  const annas = hydrateFollowing();
  mockUser = { id: BEN };
  const bens = hydrateFollowing();
  expect(bens).not.toBe(annas);
  await started();
  expect(pending).toHaveLength(2);
  const [forAnna, forBen] = pending;
  pending = [];
  forBen([row('kiarostami')]);
  await bens;
  forAnna([row('agnes')]);
  await annas;
  expect(mockSetFollowing).toHaveBeenCalledTimes(1);
  expect(mockSetFollowing).toHaveBeenCalledWith(['kiarostami']);
  expect(mockPersist).toHaveBeenCalledWith(BEN);
  expect(mockPersist).not.toHaveBeenCalledWith(ANNA);
});

it('a read that outlives a sign-out writes nothing, even when the same member signs back in', async () => {
  const before = hydrateFollowing();
  await resetAllStores();          // signed out: the read in flight lands nowhere
  const after = hydrateFollowing(); // and signed back in: a read of its own
  expect(after).not.toBe(before);
  await started();
  const [old, fresh] = pending;
  pending = [];
  fresh([row('agnes'), row('varda')]);
  await after;
  old([row('agnes')]);
  await before;
  expect(mockSetFollowing).toHaveBeenCalledTimes(1);
  expect(mockSetFollowing).toHaveBeenCalledWith(['agnes', 'varda']);
});

it('with nobody signed in, reads nothing', async () => {
  mockUser = null;
  await hydrateFollowing();
  await started();
  expect(pending).toHaveLength(0);
  expect(mockSetFollowing).not.toHaveBeenCalled();
});
