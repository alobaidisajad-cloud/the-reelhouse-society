/**
 * aFailedLoadKeepsWhoYouFollow.test.ts — a follow list that could not be read is
 * not an empty one.
 *
 * hydrateFollowing replaces the phone's list of who the member follows with the
 * server's. supabase-js hands back a failure (no signal included) as `error`
 * rather than throwing, so a failed read must leave the list as it was: saving
 * "nothing" in its place shows every member as unfollowed, and keeps saying so
 * from the phone's cache until a read succeeds.
 */
import { hydrateFollowing } from '../domain/socialSlice';

const ME = '55555555-5555-4555-8555-555555555555';

type Answer = { data: unknown[] | null; error: { message: string } | null };
let answers: Answer[] = [];
let asked = 0;

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'in', 'order', 'limit', 'or'] as const) c[f] = () => self();
  c.then = (res: (v: unknown) => unknown) => {
    const answer = answers[asked] ?? { data: [], error: null };
    asked += 1;
    return Promise.resolve(answer).then(res);
  };
  return c;
};

const mockSetFollowing = jest.fn();
const mockSetRequested = jest.fn();
const mockPersist = jest.fn();
const mockCapture = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { from: () => chain() } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: ME, username: 'me' } }) },
}));
jest.mock('../followStore', () => ({
  useSocialStore: {
    getState: () => ({
      setFollowing: mockSetFollowing,
      setRequested: mockSetRequested,
      persistFollowing: mockPersist,
    }),
    setState: jest.fn(),
  },
}));
jest.mock('../../lib/sentry', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn() }));

const row = (i: number, type = 'follow') => ({
  id: `r${i}`, target_user_id: `t${i}`, created_at: `2026-09-10T00:00:00.${String(i).padStart(3, '0')}Z`, type,
  profiles: { username: `member${i}` },
});
const fullPage = () => Array.from({ length: 1000 }, (_, i) => row(i));
const offline = { data: null, error: { message: 'TypeError: Network request failed' } };

beforeEach(() => {
  answers = [];
  asked = 0;
  jest.clearAllMocks();
});

describe('the follow list, read at launch', () => {
  it('is replaced by the server’s when the read succeeds', async () => {
    answers = [{ data: [row(1), row(2, 'follow_request')], error: null }];
    await hydrateFollowing();
    expect(mockSetFollowing).toHaveBeenCalledWith(['member1']);
    expect(mockSetRequested).toHaveBeenCalledWith(['member2']);
    expect(mockPersist).toHaveBeenCalledWith(ME);
  });

  it('is left as it was when the phone is offline', async () => {
    answers = [offline, offline, offline];
    await hydrateFollowing();
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockSetRequested).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled(); // no signal is not a defect
  });

  it('is left as it was when the server refuses, and the refusal is reported', async () => {
    answers = [{ data: null, error: { message: 'permission denied for table interactions' } }];
    await hydrateFollowing();
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('is not cut short by a page that fails after one that did not', async () => {
    answers = [{ data: fullPage(), error: null }, offline];
    await hydrateFollowing();
    // A thousand of however many: saving that would unfollow the rest on screen.
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('is left as it was past the ten-page cap, where it could only be part-read', async () => {
    answers = Array.from({ length: 10 }, () => ({ data: fullPage(), error: null }));
    await hydrateFollowing();
    expect(asked).toBe(10);
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1); // an account this large is worth knowing about
  });

  it('asks once per page, with no second copy of the same question', async () => {
    answers = [offline];
    await hydrateFollowing();
    expect(asked).toBe(1);
  });
});
