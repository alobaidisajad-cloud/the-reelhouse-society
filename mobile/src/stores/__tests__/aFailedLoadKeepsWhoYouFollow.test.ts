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

type Answer = { data: unknown; error: { message: string } | null };
let answers: Answer[] = [];
let asked = 0;

const followList = () => {
  const answer = answers[asked] ?? { data: { following: [], requested: [] }, error: null };
  asked += 1;
  return Promise.resolve(answer);
};

const mockSetFollowing = jest.fn();
const mockSetRequested = jest.fn();
const mockPersist = jest.fn();
const mockCapture = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: () => followList() } }));
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
jest.mock('../../utils/offlineQueue', () => ({ getOfflineQueue: () => [], enqueueMutation: jest.fn(() => true) }));

const offline = { data: null, error: { message: 'TypeError: Network request failed' } };

beforeEach(() => {
  answers = [];
  asked = 0;
  jest.clearAllMocks();
});

describe('the follow list, read at launch', () => {
  it('is replaced by the server’s when the read succeeds', async () => {
    answers = [{ data: { following: ['member1'], requested: ['member2'] }, error: null }];
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
    answers = [{ data: null, error: { message: 'permission denied for function get_my_follows' } }];
    await hydrateFollowing();
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('is left as it was when the answer is not a follow list, and the answer is reported', async () => {
    answers = [{ data: { following: null }, error: null }];
    await hydrateFollowing();
    // Nothing read is not "following nobody": saving it would unfollow everyone on screen.
    expect(mockSetFollowing).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('is held whole however long it is', async () => {
    const many = Array.from({ length: 25_000 }, (_, i) => `member${i}`);
    answers = [{ data: { following: many, requested: [] }, error: null }];
    await hydrateFollowing();
    expect(asked).toBe(1);
    expect(mockSetFollowing).toHaveBeenCalledWith(many);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('asks once, with no second copy of the same question', async () => {
    answers = [offline];
    await hydrateFollowing();
    expect(asked).toBe(1);
  });
});
