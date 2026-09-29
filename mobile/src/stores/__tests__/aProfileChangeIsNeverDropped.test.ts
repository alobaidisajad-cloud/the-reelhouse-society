/**
 * aProfileChangeIsNeverDropped.test.ts — every change to the member's own
 * profile reaches the screen, a refused one is undone alone, and a change made
 * offline is kept until the server has it.
 */
import { useAuthStore } from '../auth';
import { supabase } from '../../lib/supabase';
import { ProfileService } from '../../services/ProfileWriteService';

const mockStore = new Map<string, string>();
jest.mock('../mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
    contains: (k: string) => mockStore.has(k),
    getAllKeys: () => [...mockStore.keys()],
    clearAll: () => { mockStore.clear(); },
  },
  setSensitive: jest.fn(),
  isStorageEncrypted: () => true,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const MEMBER = {
  id: '77777777-7777-4777-8777-777777777777',
  username: 'member',
  bio: 'first',
  role: 'cinephile',
  preferences: { favorites: [] as unknown[] },
};

type Member = typeof MEMBER;
const me = () => useAuthStore.getState().user as unknown as Member;

// Each test at its own moment, with the clock still inside it: a change made
// "at once" is made at once, and nothing a test did lingers into the next.
let clock = 1_000_000;
beforeEach(() => {
  clock += 60_000;
  jest.spyOn(Date, 'now').mockReturnValue(clock);
  mockStore.clear();
  useAuthStore.setState({ user: { ...MEMBER, preferences: { favorites: [] } }, isAuthenticated: true, loading: false } as never);
});
afterEach(() => jest.restoreAllMocks());

describe('the member changing their own profile', () => {
  it('shows a second change made at once (two favourites set in a row)', async () => {
    jest.spyOn(ProfileService, 'updateProfile').mockResolvedValue(undefined as never);
    await useAuthStore.getState().updateUser({ preferences: { favorites: ['a'] } } as never);
    await useAuthStore.getState().updateUser({ preferences: { favorites: ['a', 'b'] } } as never);
    expect(me().preferences.favorites).toEqual(['a', 'b']);
  });

  it("applies a caller's undo at once (a refused favourite comes off the screen)", async () => {
    jest.spyOn(ProfileService, 'updateProfile').mockResolvedValue(undefined as never);
    await useAuthStore.getState().updateUser({ preferences: { favorites: ['a'] } } as never);
    expect(me().preferences.favorites).toEqual(['a']);
    // The server refused it a moment later; the caller puts back what was there.
    await useAuthStore.getState().updateUser({ preferences: { favorites: [] } } as never);
    expect(me().preferences.favorites).toEqual([]);
  });

  it('undoes a refused change alone, never a later one', async () => {
    let refuse: (e: Error) => void = () => {};
    jest.spyOn(ProfileService, 'updateProfile')
      .mockImplementationOnce(() => new Promise((_, rej) => { refuse = rej; }))
      .mockResolvedValue(undefined as never);
    const first = useAuthStore.getState().updateUser({ bio: 'second' } as never);
    await useAuthStore.getState().updateUser({ preferences: { favorites: ['c'] } } as never);
    refuse(new Error('refused'));
    await first;
    expect(me().bio).toBe('first');                  // its own change, undone
    expect(me().preferences.favorites).toEqual(['c']); // the later one, kept
  });

  it('keeps its undo off a field changed again since', async () => {
    let refuse: (e: Error) => void = () => {};
    jest.spyOn(ProfileService, 'updateProfile')
      .mockImplementationOnce(() => new Promise((_, rej) => { refuse = rej; }))
      .mockResolvedValue(undefined as never);
    const first = useAuthStore.getState().updateUser({ bio: 'second' } as never);
    await useAuthStore.getState().updateUser({ bio: 'third' } as never);
    refuse(new Error('refused'));
    await first;
    expect(me().bio).toBe('third');
  });
});

describe('a preference changed offline, at the next launch', () => {
  const PENDING = `dirty_prefs_${MEMBER.id}`;
  const session = () => jest.spyOn(supabase.auth, 'getSession')
    .mockResolvedValue({ data: { session: { user: { id: MEMBER.id } } }, error: null } as never);

  it('is kept on the phone when the server does not take it', async () => {
    session();
    mockStore.set(PENDING, JSON.stringify({ theme: 'dark' }));
    // supabase-js answers a failure (offline, refused), it does not throw one.
    jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } } as never);
    await useAuthStore.getState().restoreSession();
    expect(mockStore.get(PENDING)).toContain('dark');
  });

  it('is let go once the server has it', async () => {
    session();
    mockStore.set(PENDING, JSON.stringify({ theme: 'dark' }));
    jest.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as never);
    await useAuthStore.getState().restoreSession();
    expect(mockStore.has(PENDING)).toBe(false);
  });
});
