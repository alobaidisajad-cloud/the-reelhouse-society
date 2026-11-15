/**
 * everyStoreStartsAgain.guard.test.ts — review round 3
 * ────────────────────────────────────────────────────
 * logoutLeavesNoTrace drives a real logout over the films store, every field soiled and every
 * field asked back. The other stores reset from lists written by hand, and nothing asked them:
 * the notices' list named six of its eleven values, so a read a sign-out cut short left
 * `_fetching` raised, and the next member on the phone opened a board that never read again.
 *
 * Here every store with a logout reset is soiled whole, field by field, and one real
 * resetAllStores must put back every one. The stores are found by sweeping the code, so a store
 * added tomorrow is asked the day it is added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { files as universe, rel } from '@/test-utils/universe';
import { resetAllStores } from '../resetAllStores';
import { useBlockStore } from '../blockStore';
import { useDiscoverStore } from '../discover';
import { useDispatch } from '../dispatch';
import { useFilmStore } from '../films';
import { useSocialStore } from '../followStore';
import { useLoungeStore } from '../lounge';
import { useMarkCounts } from '../markCounts';
import { useNotificationStore } from '../notificationStore';
import { useOfflineQueueStore } from '../offlineQueueStore';
import { useReportStore } from '../reportStore';
import { useSettingsStore } from '../settings';
import { useVaultStore } from '../vaultStore';

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(), set: jest.fn(), delete: jest.fn(),
    contains: jest.fn(() => false), getAllKeys: jest.fn(() => []),
  })),
}));
jest.mock('../mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
  storage: {
    getString: jest.fn(), set: jest.fn(), delete: jest.fn(),
    contains: jest.fn(() => false), getAllKeys: jest.fn(() => []), clearAll: jest.fn(),
  },
  zustandMMKVStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  zustandStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: jest.fn(() => ({ getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() })),
  getSecureStorage: jest.fn().mockResolvedValue({ getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false) }),
}));
jest.mock('../auth', () => ({
  useAuthStore: Object.assign(jest.fn(() => null), {
    getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile', role: 'member' } })),
    subscribe: jest.fn(() => () => {}),
  }),
}));

/** What no store starts with: whatever a field holds, this is not it. */
const LAST_MEMBERS = 'the last member was here';

/** Each store with a logout reset, by the file that makes it. */
const STORES: Record<string, { getState: () => object; setState: (s: never) => void }> = {
  'src/stores/blockStore.ts': useBlockStore,
  'src/stores/discover.ts': useDiscoverStore,
  'src/stores/dispatch.ts': useDispatch,
  'src/stores/films.ts': useFilmStore,
  'src/stores/followStore.ts': useSocialStore,
  'src/stores/lounge.ts': useLoungeStore,
  'src/stores/markCounts.ts': useMarkCounts,
  'src/stores/notificationStore.ts': useNotificationStore,
  'src/stores/offlineQueueStore.ts': useOfflineQueueStore,
  'src/stores/reportStore.ts': useReportStore,
  'src/stores/settings.ts': useSettingsStore,
  'src/stores/vaultStore.ts': useVaultStore,
};
/**
 * A store asked elsewhere: the moderation host's one value (which log is asked about) is not
 * exported, and aLogIsAskedOfTheScreenInFront drives its reset.
 */
const ASKED_ELSEWHERE = ['src/components/moderation/LogModerationHost.tsx'];

const ROOT = path.resolve(__dirname, '../../..');

/** A store's values, never its acts. */
const valuesOf = (s: object): string[] =>
  Object.entries(s).filter(([, v]) => typeof v !== 'function').map(([k]) => k);

describe('every store starts again whole when a member signs out', () => {
  it('every store with a logout reset is asked here, found by sweeping the code', () => {
    const made = universe('appCode').map(rel).filter((f) => {
      const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /(?:^|\n)\s*(?:export\s+)?const\s+\w+\s*=\s*create</.test(code) && code.includes('registerStoreReset(');
    }).sort();
    expect(made).toEqual([...Object.keys(STORES), ...ASKED_ELSEWHERE].sort());
  });

  it.each(Object.keys(STORES))('%s puts back every value it holds', async (file) => {
    const store = STORES[file];
    const keys = valuesOf(store.getState());
    expect(keys.length).toBeGreaterThan(0);

    store.setState(Object.fromEntries(keys.map((k) => [k, LAST_MEMBERS])) as never);
    // The soiling took, or this proves nothing.
    const soiled = store.getState() as Record<string, unknown>;
    expect(keys.filter((k) => soiled[k] !== LAST_MEMBERS)).toEqual([]);

    await resetAllStores('u1');

    const after = store.getState() as Record<string, unknown>;
    expect(keys.filter((k) => after[k] === LAST_MEMBERS)).toEqual([]);
  });

  it("the notices' reading flags come down, so the next member's first read runs", async () => {
    useNotificationStore.setState({ loading: true, _fetching: true, _fetchingMore: true } as never);
    await resetAllStores('u1');
    expect(useNotificationStore.getState()).toMatchObject({ loading: false, _fetching: false, _fetchingMore: false });
  });
});
