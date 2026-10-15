/**
 * aSessionEndedElsewhereKeepsTheirWork.test.ts — a sign-out the member did not
 * make (a refused refresh, a deleted account, signed out everywhere) keeps what
 * they had not yet sent and what they had not finished, for them alone.
 *
 * Driven through the real auth store, the real queue and the real drafts, with
 * the event answered as the app's listener answers it (answerAuthEvent). Only
 * the network is stood in for: each write "sent" is recorded with the member
 * whose session it was sent under.
 */
import type { User as AuthUser } from '@supabase/supabase-js';
import { useAuthStore } from '../auth';
import { answerAuthEvent } from '../authEvents';
import { authSessionStorage } from '@/src/lib/authSessionStorage';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import { __resetStampForTests } from '@/src/utils/queueOwnership';
import { readDraft, writeDraft } from '@/src/utils/memberDrafts';
import reelToast from '@/src/utils/reelToast';

const mockDisk = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockDisk.get(k),
    set: (k: string, v: string) => { mockDisk.set(k, String(v)); },
    delete: (k: string) => { mockDisk.delete(k); },
    getAllKeys: () => [...mockDisk.keys()],
    contains: (k: string) => mockDisk.has(k),
    clearAll: () => mockDisk.clear(),
  },
  setSensitive: (k: string, v: string) => { mockDisk.set(k, v); },
  isStorageEncrypted: () => true,
  storageReady: () => Promise.resolve(),
  zustandMMKVStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
}));

/** Whose session the phone holds now; null once it has ended. */
let mockSession: { user: { id: string } } | null = null;
jest.mock('@/src/lib/supabase', () => {
  const answer = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete', 'upsert']) {
      chain[k] = () => chain;
    }
    chain.single = () => Promise.resolve({ data, error: null });
    chain.maybeSingle = () => Promise.resolve({ data, error: null });
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: mockSession }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
      },
      from: (table: string) => answer(table === 'profiles'
        ? { id: mockSession?.user.id, username: 'member', is_banned: false, suspended_until: null }
        : null),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

/** Every write that reached the "server", with the member it was sent as. */
const mockSent: { type: string; as: string | null; owner?: string }[] = [];
jest.mock('@/src/utils/mutationExecutor', () => ({
  executeMutation: (m: { type: string; owner?: string }) => {
    mockSent.push({ type: m.type, as: mockSession?.user.id ?? null, owner: m.owner });
    return Promise.resolve({});
  },
  applyIdMapToPayload: (p: Record<string, unknown>) => p,
}));
jest.mock('@/src/utils/reelToast', () => {
  const t = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/src/lib/revenueCat', () => ({ identifyUser: jest.fn(), logoutRevenueCat: jest.fn() }));
jest.mock('@/src/lib/pushNotifications', () => ({ removePushToken: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/src/lib/sentry', () => ({ setSentryUser: jest.fn(), addBreadcrumb: jest.fn(), captureError: jest.fn(), captureWarning: jest.fn() }));
jest.mock('@/src/lib/queryClient', () => ({ queryClient: { clear: jest.fn(), invalidateQueries: jest.fn() } }));
jest.mock('@/src/stores/notificationStore', () => ({ teardownNotificationRealtime: jest.fn() }));
jest.mock('@/src/stores/domain/socialSlice', () => ({ hydrateFollowing: jest.fn() }));
jest.mock('@/src/services/ProfileWriteService', () => ({ PROFILE_SELECT_COLUMNS: 'id', ProfileService: { updateProfile: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const SESSION_KEY = 'sb-project-auth-token';

const told = () => (reelToast as unknown as jest.Mock).mock.calls.map((c) => String(c[0]));
const toldError = () => (reelToast.error as jest.Mock).mock.calls.map((c) => String(c[0]));
/** Lets a flush the store started on its own run to its end. */
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

/** A member signs in on this phone, by the one door every sign-in takes. */
async function signIn(id: string) {
  mockSession = { user: { id } };
  useAuthStore.getState().adoptSession({ id } as AuthUser, { id, username: id === ANA ? 'ana' : 'ben' });
  await settle();
}

/** The session ends without the member's hand, and the app's listener answers. */
async function sessionEndsElsewhere() {
  mockSession = null;
  await answerAuthEvent('SIGNED_OUT', false);
  await settle();
}

const CRITIQUE = {
  type: 'add_critique' as const,
  payload: { _tempId: 'c-tmp-1', post_id: 'post-1', user_id: ANA, body: 'The last reel earns the first.' },
};

beforeEach(() => {
  mockDisk.clear();
  mockSent.length = 0;
  mockSession = null;
  __resetStampForTests();
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, loading: false });
});

describe('SIGNED_OUT from elsewhere, with a critique queued', () => {
  it('keeps it and her drafts, tells her, sends none of it as the next member, and gives it back to her', async () => {
    await signIn(ANA);
    // Offline: the critique waits in the queue; a compose draft and a critique draft wait too.
    enqueueMutation(CRITIQUE);
    expect(writeDraft(ANA, 'dossier', { title: 'On Ozu', content: 'Half an essay.' })).toBe(true);
    expect(writeDraft(ANA, 'critique', { body: 'Unfinished.' }, 'post-2')).toBe(true);

    await sessionEndsElsewhere();

    // She is told, and nothing was erased or sent.
    expect(told()).toContain(
      'You were signed out. Kept on this phone until you sign in again: 1 change not yet sent and 2 drafts.');
    expect(mockSent).toEqual([]);
    expect(readDraft(ANA, 'dossier')?.data).toEqual({ title: 'On Ozu', content: 'Half an essay.' });
    expect(readDraft(ANA, 'critique', 'post-2')?.data).toEqual({ body: 'Unfinished.' });

    // Ben signs in on the same phone: none of hers is sent, shown or spoken of.
    (reelToast as unknown as jest.Mock).mockClear();
    await signIn(BEN);
    await flushOfflineQueue();
    expect(mockSent).toEqual([]);
    expect(getOfflineQueue()).toEqual([]);
    expect(told()).toEqual([]);
    expect(readDraft(BEN, 'dossier')).toBeNull();
    expect(readDraft(BEN, 'critique', 'post-2')).toBeNull();

    // Ben's own sign-out erases his, never hers.
    await useAuthStore.getState().logout();
    expect(readDraft(ANA, 'dossier')).not.toBeNull();

    // Ana signs in again: her critique is in her queue, she is told where it is,
    // and it is sent under her session and no other.
    mockSession = { user: { id: ANA } };
    useAuthStore.getState().adoptSession({ id: ANA } as AuthUser, { id: ANA, username: 'ana' });
    expect(getOfflineQueue().map((m) => [m.type, m.owner, m.payload.body]))
      .toEqual([['add_critique', ANA, 'The last reel earns the first.']]);
    expect(told()).toContain('Kept for you from before you were signed out: 1 critique, waiting on this phone to be sent.');
    await settle();
    expect(mockSent).toEqual([{ type: 'add_critique', as: ANA, owner: ANA }]);
    expect(readDraft(ANA, 'dossier')?.data).toEqual({ title: 'On Ozu', content: 'Half an essay.' });
  });

  it('lets only a toggle lapse, and says so', async () => {
    await signIn(ANA);
    enqueueMutation({ type: 'certify_filing', payload: { post_id: 'post-9' } });
    enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'l-1', film_id: 550 } });

    await sessionEndsElsewhere();
    expect(told()).toContain('You were signed out. Kept on this phone until you sign in again: '
      + '1 change not yet sent. A small mark (a certify, an endorsement, a follow, a save) was not kept.');

    await signIn(ANA);
    expect(mockSent).toEqual([{ type: 'add_film_to_list', as: ANA, owner: ANA }]);
  });

  it('writes no ownerless write: every one queued carries the member signed in', async () => {
    await signIn(ANA);
    // The two that named no member in their payload.
    enqueueMutation({ type: 'certify_filing', payload: { post_id: 'post-9' } });
    enqueueMutation({ type: 'add_film_to_list', payload: { list_id: 'l-1', film_id: 550 } });
    expect(getOfflineQueue().map((m) => m.owner)).toEqual([ANA, ANA]);

    // With nobody signed in, there is nobody to send it as: nothing is queued.
    await useAuthStore.getState().logout();
    enqueueMutation({ type: 'certify_filing', payload: { post_id: 'post-9' } });
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('a queue an older build wrote, with no owner on any write', () => {
  /** The TestFlight build's shape: no `owner`, and two types that name no member. */
  const oldQueue = () => [
    { id: 'o1', type: 'add_critique', timestamp: Date.now(), payload: { ...CRITIQUE.payload } },
    { id: 'o2', type: 'certify_filing', timestamp: Date.now(), payload: { post_id: 'post-9' } },
    { id: 'o3', type: 'add_film_to_list', timestamp: Date.now(), payload: { list_id: 'l-1', film_id: 550 } },
  ];
  const oldDeadLetter = () => [
    { id: 'd1', type: 'add_critique', timestamp: Date.now(), payload: { post_id: 'p', body: 'x', _failReason: 'schema' } },
  ];

  /** The new build's first launch: the client reads the stored session before anything else. */
  async function launch() {
    await authSessionStorage.getItem(SESSION_KEY);
    useAuthStore.getState().hydrateFromCache();
  }

  function oldPhone(withSession: boolean) {
    mockDisk.set('reelhouse-offline-mutations', JSON.stringify(oldQueue()));
    mockDisk.set('reelhouse-offline-mutations_dead_letter', JSON.stringify(oldDeadLetter()));
    if (withSession) {
      mockDisk.set(SESSION_KEY, JSON.stringify({ access_token: 't', user: { id: ANA } }));
      mockDisk.set('last_user_id', ANA);
      mockDisk.set(`ironvault_user_cache_${ANA}`, JSON.stringify({ id: ANA, username: 'ana' }));
    }
  }

  it('is stamped with the stored session\'s member, then SIGNED_OUT, then a second member: none of it is sent as him', async () => {
    oldPhone(true);
    await launch();
    expect(useAuthStore.getState().user?.id).toBe(ANA);
    expect(JSON.parse(mockDisk.get('reelhouse-offline-mutations')!).map((m: { owner: string }) => m.owner))
      .toEqual([ANA, ANA, ANA]);
    expect(JSON.parse(mockDisk.get('reelhouse-offline-mutations_dead_letter')!)[0].owner).toBe(ANA);

    await sessionEndsElsewhere();
    await signIn(BEN);
    await flushOfflineQueue();
    expect(mockSent).toEqual([]);

    // Ana's return: her critique and her stack's film come back; the certify lapsed.
    await signIn(ANA);
    expect(mockSent).toEqual([
      { type: 'add_critique', as: ANA, owner: ANA },
      { type: 'add_film_to_list', as: ANA, owner: ANA },
    ]);
  });

  it('is never sent as whoever signs in next when the session vanished while the app was closed', async () => {
    oldPhone(true);
    mockDisk.delete(SESSION_KEY); // gone by the next launch; last_user_id still names her
    await launch();
    // restoreSession finds no session: the second way a session ends.
    await useAuthStore.getState().restoreSession();
    await signIn(BEN);
    await flushOfflineQueue();
    expect(mockSent).toEqual([]);
  });

  it('with no session and no last member stored, is erased unsent and that is said, unless it names its member', async () => {
    oldPhone(false);
    await launch();
    // The critique names Ana in its own payload: hers. The other two name no one.
    expect(JSON.parse(mockDisk.get('reelhouse-offline-mutations')!).map((m: { id: string; owner: string }) => [m.id, m.owner]))
      .toEqual([['o1', ANA]]);
    expect(toldError()).toContain(
      '2 changes made offline on an earlier version of the app named no member, and were not sent.');

    await signIn(BEN);
    await flushOfflineQueue();
    expect(mockSent).toEqual([]);
    await useAuthStore.getState().logout();

    await signIn(ANA);
    expect(mockSent).toEqual([{ type: 'add_critique', as: ANA, owner: ANA }]);
  });
});
