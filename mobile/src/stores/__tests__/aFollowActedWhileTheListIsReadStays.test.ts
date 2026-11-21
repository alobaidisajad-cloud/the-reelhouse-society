/**
 * aFollowActedWhileTheListIsReadStays.test.ts — review round 8
 * ─────────────────────────────────────────────────────────────────────────────
 * The follow list's read (hydrateFollowing) set the lists whole from an answer asked before an
 * act landed: a request withdrawn meanwhile read REQUESTED again, a follow made meanwhile read
 * FOLLOW, and a second FOLLOW found the row there and counted the member's file one follower
 * more. The acts made on this phone (_actedHere) are now laid over a read asked before they
 * landed, matched whatever the handle's case; one the house refused is not, a read asked after
 * an act landed is the house's word, and a sign-out forgets them all.
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { followUser, hydrateFollowing, unfollowUser } from '../domain/socialSlice';
import { useSocialStore } from '../followStore';
import { useAuthStore } from '../auth';
import { resetAllStores } from '../resetAllStores';
import { storage } from '../mmkv-storage';

jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/TactileEngine', () => ({
  __esModule: true,
  default: { warn: jest.fn(), navigate: jest.fn(), success: jest.fn(), mutate: jest.fn() },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

const ME = { id: '11111111-1111-4111-8111-111111111111', username: 'first' };
const NEXT = { id: '66666666-6666-4666-8666-666666666666', username: 'second' };
const KANE = '22222222-2222-4222-8222-222222222222';
const AGNES = '44444444-4444-4444-8444-444444444444';
const rowId = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;

type Row = Record<string, unknown>;
/** The house's follows and requests. */
let mockFollows: Row[] = [];
/** Members whose follow or request the house refuses to withdraw. */
let mockRefused = new Set<string>();
let mockMade = 0;

const where = (ask: Ask) => (r: Row) => ask.filters.every(([op, col, val]) =>
  op === 'eq' ? r[col] === val : op === 'in' ? (val as unknown[]).includes(r[col]) : true);
/** The member's follow list as get_my_follows answers it from the house's rows, in the order made. */
const handleOf: Record<string, string> = { [KANE]: 'kane', [AGNES]: 'agnes' };
const listOf = (member: string) => {
  const mine = (type: string) => mockFollows
    .filter((r) => r.user_id === member && r.type === type)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => handleOf[r.target_user_id as string]);
  return { following: mine('follow'), requested: mine('follow_request') };
};
const mockHouse = supabaseFake({
  rpc: { get_my_follows: () => listOf(useAuthStore.getState().user?.id ?? '') },
  rows: {
    profiles: [
      { id: KANE, username: 'kane', is_social_private: true },
      { id: AGNES, username: 'agnes', is_social_private: false },
    ],
  },
  answer: {
    interactions: (ask) => {
      const hit = mockFollows.filter(where(ask));
      if (ask.op === 'insert') {
        for (const v of ask.values ?? []) {
          mockMade += 1;
          mockFollows.push({ id: rowId(mockMade), created_at: `2026-11-17T00:00:${String(mockMade).padStart(2, '0')}Z`, ...v });
        }
        return [];
      }
      if (ask.op === 'delete') {
        if (hit.some((r) => mockRefused.has(r.target_user_id as string))) return { code: '42501', message: 'permission denied for table interactions' };
        mockFollows = mockFollows.filter((r) => !hit.includes(r));
        return [];
      }
      return hit.map((r) => ({ ...r }));
    },
  },
});
// Every answer is worked out when it is asked (the house as it stood then) and held until let go.
const mockHeld = heldClient(mockHouse.client, { rpcs: ['get_my_follows'] });
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

const follow = (who: string, target: string, type: 'follow' | 'follow_request'): Row => {
  mockMade += 1;
  return { id: rowId(mockMade), user_id: who, target_user_id: target, type, created_at: `2026-11-10T00:00:${String(mockMade).padStart(2, '0')}Z` };
};
const shown = () => ({ following: useSocialStore.getState().following, requested: useSocialStore.getState().requested });
const turns = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** The follow list's read, asked now and held. */
const askTheList = async () => {
  const read = hydrateFollowing();
  await turns();
  expect(mockHeld.count('get_my_follows')).toBe(1);
  // Inside an object: an async function handing back the promise itself would wait on it.
  return { read };
};
/** The follow list's read let go: the oldest answer waiting on get_my_follows. */
const answerTheList = async (read: Promise<void>) => {
  await mockHeld.release('get_my_follows', 0);
  await read;
};
/** An act's answers let go one by one until it has landed, the `behind` answers older than it kept waiting. */
const land = async (act: Promise<boolean>, behind = 0): Promise<boolean> => {
  let done = false;
  const out = act.then((v) => { done = true; return v; });
  for (let i = 0; i < 6 && !done; i++) {
    await turns();
    if (done) break;
    if (mockHeld.count('profiles') > 0) await mockHeld.release('profiles');
    else if (mockHeld.count('interactions') > behind) await mockHeld.release('interactions', behind);
  }
  return out;
};
const signIn = async (member: { id: string; username: string }, previous: string) => {
  useAuthStore.setState({ user: null, isAuthenticated: false } as never);
  await resetAllStores(previous);
  storage.clearAll();
  useAuthStore.setState({ user: member, isAuthenticated: true } as never);
};

let clock = 1_000_000;
beforeEach(async () => {
  clock += 1_000_000;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  mockRefused = new Set();
  // The member asked to follow the private kane; agnes they do not follow.
  mockFollows = [follow(ME.id, KANE, 'follow_request')];
  await signIn(ME, ME.id);
  useSocialStore.getState().setFollowing([]);
  useSocialStore.getState().setRequested(['kane']);
});

afterEach(() => {
  expect(mockHeld.count()).toBe(0);
  jest.restoreAllMocks();
});

it('a request withdrawn while the follow list was being read stays withdrawn when that read lands', async () => {
  const { read } = await askTheList();                      // asked: kane requested, as the house holds it
  clock += 1;
  expect(await land(unfollowUser('kane'))).toBe(true);      // the withdrawal lands first
  expect(mockFollows).toEqual([]);
  await answerTheList(read);                                // the read, asked before it, lands after

  expect(shown()).toEqual({ following: [], requested: [] });
});

it('a member followed while the follow list was being read stays FOLLOWING when that read lands without them', async () => {
  const { read } = await askTheList();                      // asked: agnes not followed
  clock += 1;
  expect(await land(followUser('agnes', { id: AGNES, isPrivate: false }))).toBe(true);
  await answerTheList(read);

  expect(shown()).toEqual({ following: ['agnes'], requested: ['kane'] });
});

it('a withdrawal the house refused is not laid over the read: the request reads REQUESTED again, the follow taken stays', async () => {
  mockRefused = new Set([KANE]);
  const { read } = await askTheList();
  clock += 1;
  expect(await land(unfollowUser('kane'))).toBe(false);     // refused: put back
  expect(await land(followUser('agnes', { id: AGNES, isPrivate: false }))).toBe(true);
  await answerTheList(read);

  expect(shown()).toEqual({ following: ['agnes'], requested: ['kane'] });
});

it('once a read asked after the follow landed has answered, the list is what the house holds', async () => {
  const { read: first } = await askTheList();
  clock += 1;
  expect(await land(followUser('agnes', { id: AGNES, isPrivate: false }))).toBe(true);
  await answerTheList(first);
  expect(shown()).toEqual({ following: ['agnes'], requested: ['kane'] });

  // The follow ended in the house since (a block severs it); asked later, a read is the house's word.
  mockFollows = mockFollows.filter((r) => r.target_user_id !== AGNES);
  clock += 1_000;
  const { read: second } = await askTheList();
  await answerTheList(second);
  expect(shown()).toEqual({ following: [], requested: ['kane'] });
});

it('a member unfollowed as @AGNES is gone from a read that answers @agnes: the handle\'s case does not matter', async () => {
  // Followed as the screen spelled it, before any read was out.
  expect(await land(followUser('AGNES', { id: AGNES, isPrivate: false }))).toBe(true);
  clock += 1_000;
  const { read } = await askTheList();                      // asked: the house spells her agnes
  clock += 1;
  expect(await land(unfollowUser('AGNES'))).toBe(true);
  await answerTheList(read);

  expect(shown()).toEqual({ following: [], requested: ['kane'] });
});

it('a sign-out forgets the acts on their way: the next member\'s list is read as the house holds it', async () => {
  const { read } = await askTheList();
  clock += 1;
  const withdrawn = unfollowUser('kane');
  await mockHeld.release('profiles');                       // the withdrawal asked, its answer still on its way
  await turns();
  expect(mockHeld.count('interactions')).toBe(1);
  await answerTheList(read);
  expect(shown()).toEqual({ following: [], requested: [] });

  // Signed out with the withdrawal still on its way; the next member asked to follow kane too.
  mockFollows.push(follow(NEXT.id, KANE, 'follow_request'));
  await signIn(NEXT, ME.id);
  clock += 1;
  const next = hydrateFollowing();
  await turns();
  await mockHeld.release('get_my_follows');                 // the next member's read, ahead of the old withdrawal
  await next;
  expect(shown()).toEqual({ following: [], requested: ['kane'] });

  // The old withdrawal lands for the member who left.
  await mockHeld.release('interactions', 0);
  await withdrawn;
});
