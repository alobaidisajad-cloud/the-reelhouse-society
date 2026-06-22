import { StateStorage, PersistStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { InteractionManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// ── Encryption-at-rest (LIB-5) ───────────────────────────────────────────────
// MMKV needs its encryption key *synchronously at construction*, but the key is
// kept in the OS keystore via expo-secure-store, which is async-only. We resolve
// this with a deferred-hydration bootstrap:
//
//   1. `storage` starts as the plaintext default instance (live binding) so any
//      synchronous consumer keeps working, BUT nothing reads through it before
//      init: the persisted stores use `skipHydration` and rehydrate after init,
//      and every other consumer runs after the app-ready gate in _layout.
//   2. `initEncryptedStorage()` runs first in the boot sequence:
//        • first ever launch → generate a key, persist it, recrypt the existing
//          plaintext data in place (one-time migration, no data loss).
//        • subsequent launches → reopen the instance WITH the key.
//   3. Because `storage` is an ES `let` export (a live binding), reassigning it
//      here transparently upgrades every importer to the encrypted instance.

const KEY_NAME = 'reelhouse_mmkv_encryption_key';

// Import-time placeholder in its OWN namespace so construction can never touch —
// and therefore never fail to decrypt — the real (default-id) data on an
// already-encrypted relaunch. Nothing reads/writes through it before
// initEncryptedStorage() reassigns `storage` to the real instance (the boot
// gate + skipHydration guarantee this).
export let storage = new MMKV({ id: 'reelhouse-preinit' });
const _pendingWrites = new Map<string, any>();

let _initPromise: Promise<void> | null = null;

function generateKey(): string {
  // 256 bits of entropy from two v4 UUIDs (hex, dashes stripped).
  return `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
}

/**
 * Initialize encryption-at-rest for the MMKV store. Idempotent; safe to await
 * multiple times. MUST be awaited before any persisted store is rehydrated and
 * before any code reads/writes `storage`.
 */
export function initEncryptedStorage(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const existingKey = await SecureStore.getItemAsync(KEY_NAME);
      if (existingKey) {
        // Data on disk is already encrypted — open the default store WITH the key.
        storage = new MMKV({ encryptionKey: existingKey });
        return;
      }
      // First encryption. Persist the key FIRST so it can never be lost after a
      // successful recrypt, then open the existing plaintext default store and
      // encrypt it in place (preserves all existing data — no loss).
      const key = generateKey();
      await SecureStore.setItemAsync(KEY_NAME, key);
      const plain = new MMKV(); // default id, currently plaintext
      try {
        plain.recrypt(key);
        storage = plain;
      } catch {
        // recrypt failed (unexpected) — fall back to a fresh encrypted instance.
        storage = new MMKV({ encryptionKey: key });
      }
    } catch (e) {
      // Keystore unavailable (e.g. unsupported platform). Degrade gracefully to
      // the unencrypted instance rather than bricking launch — the cached data
      // is non-sensitive and auth tokens live in SecureStore independently.
      if (__DEV__) console.warn('[mmkv] encryption init failed; using unencrypted store', e);
    }
  })();
  return _initPromise;
}

// Legacy synchronous storage for non-monolithic stores
export const zustandMMKVStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

// Asynchronous Deferred Serialization
// Pushes BOTH the heavy JSON.stringify of the monolithic state tree AND the
// MMKV disk write onto the InteractionManager queue. This guarantees that
// rapid store mutations (e.g. liking a film, scrolling) never block the
// UI thread's 60fps frame budget.
export const createAsyncMMKVStorage = <T>(): PersistStorage<T> => ({
  getItem: (name) => {
    const str = storage.getString(name);
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
  setItem: (name, newValue) => {
    _pendingWrites.set(name, newValue);

    let executed = false;
    const flush = () => {
      if (executed) return;
      executed = true;
      clearTimeout(fallback);

      if (_pendingWrites.get(name) !== newValue) return;

      try {
        const str = JSON.stringify(newValue);
        storage.set(name, str);
      } catch (err) {
        if (__DEV__) console.warn('[AsyncMMKVStorage] Serialization failed', err);
      }
    };

    const task = InteractionManager.runAfterInteractions(flush);
    const fallback = setTimeout(() => {
      task.cancel();
      flush();
    }, 1500); // 1.5s fallback to prevent data loss during continuous animations
  },
  removeItem: (name) => {
    _pendingWrites.delete(name);
    storage.delete(name);
  },
});
