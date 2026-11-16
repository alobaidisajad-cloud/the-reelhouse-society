/**
 * aFilmMountedOfflineStaysMounted.test.tsx — review round 7
 * ─────────────────────────────────────────────────────────────────────────────
 * The altarpiece and the backdrop switch sent their key live and, offline, queued it apart from
 * the member's other preferences. The profile read at the next launch knew nothing of the queue:
 * a film mounted offline was read back as the old one, and the next mount sent the old wings over
 * it. Both now go the preferences' own way (savePreferences): offline the change stays pending on
 * the phone and is laid over every read of the profile until it is sent; a refusal takes back
 * that change alone, and says so. Driven through the real auth store; the network stands in.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProfileTriptych } from '../ProfileTriptych';
import { EditProfileScreen } from '@/src/features/profile/EditProfileScreen';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { getOfflineQueue } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
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
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));
jest.mock('expo-router', () => ({ ...require('@/test-utils/expoRouterMock').expoRouterMock(), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() }) }));
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('expo-router/react-navigation', () => ({ ...jest.requireActual('expo-router/react-navigation'), useIsFocused: () => true }));
jest.mock('@/src/hooks/useAskBeforeLeaving', () => ({ useAskBeforeLeaving: () => {} }));

const MEMBER_ID = '77777777-7777-4777-8777-777777777777';
const FILMS = [
  { id: 11, title: 'Stalker', poster_path: '/s.jpg' },
  { id: 22, title: 'Persona', poster_path: '/p.jpg' },
  { id: 33, title: 'In the Mood for Love', poster_path: '/i.jpg' },
];
const MEMBER = {
  id: MEMBER_ID, username: 'tomas', display_name: '', bio: '', social_links: [], role: 'auteur',
  created_at: '2026-01-01T00:00:00Z', preferences: { theme: 'light', favorites: FILMS, backdrop: true },
};
const PENDING = `dirty_prefs_${MEMBER_ID}`;
const OFFLINE = { data: null, error: { message: 'TypeError: Network request failed' } };
const REFUSED = { data: null, error: { message: 'permission denied', code: '42501' } };
const TAKEN = { data: null, error: null };

const prefs = () => (useAuthStore.getState().user as unknown as { preferences: Record<string, unknown> }).preferences;
const pending = () => { const s = mockStore.get(PENDING); return s ? JSON.parse(s) as Record<string, unknown> : null; };
const queuedProfileWrites = () => getOfflineQueue().filter((m) => m.type === 'update_profile');
const titles = (v: unknown) => (v as ({ title: string } | null)[]).map((f) => f?.title ?? null);

/** The house's copy of the profile, as a read of it answers. */
function theHouseHolds(preferences: Record<string, unknown>) {
  jest.spyOn(supabase, 'from').mockReturnValue({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { ...MEMBER, preferences }, error: null }) }) }),
  } as never);
}

async function takeTheCentreDown() {
  const r = render(<ProfileTriptych user={{ id: MEMBER_ID, preferences: { favorites: FILMS } as never }} isOwnProfile userRole="cinephile" />);
  await act(async () => { await fireEvent.press(r.getByLabelText(/Stalker, the centre/)); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Remove from the altarpiece')); });
  return r;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockStore.clear();
  useAuthStore.setState({ user: { ...MEMBER, preferences: { ...MEMBER.preferences } }, isAuthenticated: true, loading: false } as never);
});

afterEach(async () => {
  await jest.runOnlyPendingTimersAsync();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('a film taken down offline stays down, kept to be sent, and the next read of the profile keeps it so', async () => {
  const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
  await takeTheCentreDown();
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });

  expect(rpc).toHaveBeenCalledWith('update_my_preferences', { p_preferences: { favorites: [null, FILMS[1], FILMS[2]] } });
  expect(titles(prefs().favorites)).toEqual([null, 'Persona', 'In the Mood for Love']);
  // Kept with the member's other preferences, never queued apart where the next read cannot see it.
  expect(titles(pending()?.favorites)).toEqual([null, 'Persona', 'In the Mood for Love']);
  expect(queuedProfileWrites()).toEqual([]);
  expect(reelToast.error).not.toHaveBeenCalled();

  // The next read of the profile still holds the old altarpiece: the change waiting is laid over it.
  theHouseHolds({ theme: 'light', favorites: FILMS, backdrop: true });
  await act(async () => { await useAuthStore.getState().rereadProfile(); });
  expect(titles(prefs().favorites)).toEqual([null, 'Persona', 'In the Mood for Love']);
});

it('a film change the house refuses is taken back and said, and a setting changed while it was away stays', async () => {
  let refuse: () => void = () => {};
  jest.spyOn(supabase, 'rpc')
    .mockImplementationOnce((() => new Promise((res) => { refuse = () => res(REFUSED); })) as never)
    .mockResolvedValue(TAKEN as never);
  await takeTheCentreDown();
  expect(titles(prefs().favorites)).toEqual([null, 'Persona', 'In the Mood for Love']);

  // While the change is away, another setting is changed on the phone.
  await act(async () => { await useAuthStore.getState().setPreference('theme', 'dark'); });
  await act(async () => { refuse(); await jest.advanceTimersByTimeAsync(0); });

  expect(reelToast.error).toHaveBeenCalledWith('Your favourites could not be changed. They are as they were.');
  expect(titles(prefs().favorites)).toEqual(['Stalker', 'Persona', 'In the Mood for Love']);
  expect(prefs().theme).toBe('dark');
  expect(pending()).toEqual({ theme: 'dark' });
});

it('the backdrop switched offline stays switched, kept to be sent, and the next read of the profile keeps it so', async () => {
  const rpc = jest.spyOn(supabase, 'rpc').mockResolvedValue(OFFLINE as never);
  const r = render(<EditProfileScreen />);
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  await act(async () => { await fireEvent(r.getByLabelText('Film backdrop on your profile'), 'valueChange', false); });
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });

  expect(rpc).toHaveBeenCalledWith('update_my_preferences', { p_preferences: { backdrop: false } });
  expect(prefs().backdrop).toBe(false);
  expect(pending()).toEqual({ backdrop: false });
  expect(queuedProfileWrites()).toEqual([]);
  expect(reelToast.error).not.toHaveBeenCalled();

  theHouseHolds({ theme: 'light', favorites: FILMS, backdrop: true });
  await act(async () => { await useAuthStore.getState().rereadProfile(); });
  expect(prefs().backdrop).toBe(false);
});
