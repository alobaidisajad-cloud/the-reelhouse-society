/**
 * vaultStore.test.ts — the Vault on the phone, run rather than read.
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's private notes are the most sensitive thing this app holds. These
 * pin what the store DOES, with the network mocked:
 *
 *   · a log's notes are rebuilt from the server, so a note removed on another
 *     device does not live on here — and only that log's notes are touched;
 *   · an answer that arrives after the member signed out writes NOTHING, so one
 *     member's writing can never land in the next member's store;
 *   · a note written or removed with no signal is queued by name, and a
 *     refused note is put back exactly as it was;
 *   · signing out empties the store AND the key on disk.
 */
import { useAuthStore } from '../auth';

const mockFetch = jest.fn();
const mockSet = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../services/VaultService', () => ({
  VaultService: {
    fetchNotesForLog: (...a: unknown[]) => mockFetch(...a),
    setNote: (...a: unknown[]) => mockSet(...a),
    removeNote: (...a: unknown[]) => mockRemove(...a),
    addViewing: jest.fn(),
    removeViewing: jest.fn(),
  },
}));

const mockEnqueue = jest.fn();
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  getOfflineQueue: () => [],
}));

const mockRemoveItem = jest.fn();
jest.mock('../mmkv-storage', () => ({
  storage: { set: jest.fn(), getString: () => undefined, delete: jest.fn(), contains: () => false, getAllKeys: () => [], clearAll: jest.fn() },
  setSensitive: jest.fn(),
  isStorageEncrypted: () => true,
  initEncryptedStorage: jest.fn().mockResolvedValue(undefined),
  zustandMMKVStorage: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
  zustandMMKVStorageSensitive: { getItem: () => null, setItem: jest.fn(), removeItem: (k: string) => mockRemoveItem(k) },
  createAsyncMMKVStorage: () => ({ getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() }),
}));

import { useVaultStore } from '../vaultStore';
import { resetAllStores } from '../resetAllStores';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const LOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const V2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
const V9 = 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9';

const signIn = (id: string | null) =>
  useAuthStore.setState({ user: id ? ({ id, username: id.slice(0, 4) } as any) : null } as any);

const networkError = () => Object.assign(new TypeError('Network request failed'), {});

beforeEach(() => {
  jest.clearAllMocks();
  useVaultStore.getState().clear();
  signIn(ALICE);
});

describe('loading a log', () => {
  it('holds each note by the viewing it belongs to', async () => {
    mockFetch.mockResolvedValueOnce([
      { viewing_id: V1, log_id: LOG_A, notes: 'the first night' },
      { viewing_id: V2, log_id: LOG_A, notes: 'the second night' },
    ]);
    await useVaultStore.getState().loadForLog(LOG_A);
    const s = useVaultStore.getState();
    expect(s.noteFor(V1)).toBe('the first night');
    expect(s.noteFor(V2)).toBe('the second night');
    expect(s.isLoaded(LOG_A)).toBe(true);
  });

  it('a note removed on another device does not live on here', async () => {
    mockFetch.mockResolvedValueOnce([{ viewing_id: V1, log_id: LOG_A, notes: 'kept' }, { viewing_id: V2, log_id: LOG_A, notes: 'removed later' }]);
    await useVaultStore.getState().loadForLog(LOG_A);
    mockFetch.mockResolvedValueOnce([{ viewing_id: V1, log_id: LOG_A, notes: 'kept' }]);
    await useVaultStore.getState().loadForLog(LOG_A, { force: true });
    expect(useVaultStore.getState().noteFor(V2)).toBe('');
    expect(useVaultStore.getState().noteFor(V1)).toBe('kept');
  });

  it('reloading one log leaves every other log’s notes alone', async () => {
    mockFetch.mockResolvedValueOnce([{ viewing_id: V9, log_id: LOG_B, notes: 'another film' }]);
    await useVaultStore.getState().loadForLog(LOG_B);
    mockFetch.mockResolvedValueOnce([]);
    await useVaultStore.getState().loadForLog(LOG_A, { force: true });
    expect(useVaultStore.getState().noteFor(V9)).toBe('another film');
  });

  it('an unreachable Vault is said, not mistaken for an empty one', async () => {
    mockFetch.mockRejectedValueOnce(networkError());
    await useVaultStore.getState().loadForLog(LOG_A);
    const s = useVaultStore.getState();
    expect(s.isLoaded(LOG_A)).toBe(false);
    expect(s.isUnreachable(LOG_A)).toBe(true);
  });
});

describe('a sign-out in the middle of a request', () => {
  it('writes NOTHING when the answer arrives for a member who has left', async () => {
    let release: (rows: unknown[]) => void = () => {};
    mockFetch.mockReturnValueOnce(new Promise((r) => { release = r as any; }));
    const pending = useVaultStore.getState().loadForLog(LOG_A);
    // Alice signs out and Bob signs in while her request is still in the air.
    signIn(BOB);
    release([{ viewing_id: V1, log_id: LOG_A, notes: 'Alice’s private writing' }]);
    await pending;
    expect(useVaultStore.getState().noteFor(V1)).toBe('');
    expect(useVaultStore.getState().isLoaded(LOG_A)).toBe(false);
  });
});

describe('writing and taking back', () => {
  it('shows the note at once and writes it by viewing', async () => {
    mockSet.mockResolvedValueOnce(undefined);
    const res = await useVaultStore.getState().saveNote(LOG_A, V1, '  a quiet note  ');
    expect(res.queuedOffline).toBe(false);
    expect(mockSet).toHaveBeenCalledWith(LOG_A, V1, 'a quiet note');
    expect(useVaultStore.getState().noteFor(V1)).toBe('a quiet note');
  });

  it('with no signal, queues the note by name — never as a blank', async () => {
    mockSet.mockRejectedValueOnce(networkError());
    const res = await useVaultStore.getState().saveNote(LOG_A, V1, 'written on a train');
    expect(res.queuedOffline).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith({
      type: 'set_viewing_note',
      payload: { log_id: LOG_A, viewing_id: V1, notes: 'written on a train' },
    });
    expect(useVaultStore.getState().noteFor(V1)).toBe('written on a train');
  });

  it('a refused note is put back exactly as it was', async () => {
    useVaultStore.getState().rememberNote(V1, 'what was there', LOG_A);
    mockSet.mockRejectedValueOnce({ message: 'The Vault is an Archivist feature' });
    await expect(useVaultStore.getState().saveNote(LOG_A, V1, 'a lapsed edit')).rejects.toBeTruthy();
    expect(useVaultStore.getState().noteFor(V1)).toBe('what was there');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('clearing with no signal queues a REMOVE, not an empty write', async () => {
    useVaultStore.getState().rememberNote(V1, 'to go', LOG_A);
    mockSet.mockRejectedValueOnce(networkError());
    await useVaultStore.getState().saveNote(LOG_A, V1, '   ');
    expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_viewing_note', payload: { viewing_id: V1 } });
    expect(useVaultStore.getState().noteFor(V1)).toBe('');
  });

  it('removing works offline too, by name', async () => {
    useVaultStore.getState().rememberNote(V1, 'to go', LOG_A);
    mockRemove.mockRejectedValueOnce(networkError());
    const res = await useVaultStore.getState().dropNote(LOG_A, V1);
    expect(res.queuedOffline).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith({ type: 'remove_viewing_note', payload: { viewing_id: V1 } });
  });

  it('a removal that fails for any other reason puts the note back', async () => {
    useVaultStore.getState().rememberNote(V1, 'still mine', LOG_A);
    mockRemove.mockRejectedValueOnce({ message: 'something else' });
    await expect(useVaultStore.getState().dropNote(LOG_A, V1)).rejects.toBeTruthy();
    expect(useVaultStore.getState().noteFor(V1)).toBe('still mine');
  });
});

describe('signing out', () => {
  it('empties the Vault and deletes its key on disk', async () => {
    useVaultStore.getState().rememberNote(V1, 'private', LOG_A);
    // The same call logout makes — so this proves the Vault is registered with
    // it, not merely that `clear()` works when someone remembers to call it.
    await resetAllStores(ALICE);
    expect(useVaultStore.getState().noteFor(V1)).toBe('');
    expect(mockRemoveItem).toHaveBeenCalledWith('reelhouse-vault');
  });
});
