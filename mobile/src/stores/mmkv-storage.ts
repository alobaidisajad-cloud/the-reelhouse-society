import { StateStorage, PersistStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { InteractionManager } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
// Safe to import here: neither module imports this one (no cycle), and
// initSentry() runs before initEncryptedStorage() in the boot sequence, so
// reporting from this file actually reaches Sentry rather than being dropped.
import { logger } from '@/src/utils/logger';
import { captureError } from '@/src/lib/sentry';

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

/**
 * Whether `storage` is actually encrypted.
 *
 * FAIL CLOSED — false until an init path proves otherwise. Before init this is
 * correct by construction (nothing writes through `storage` that early), and if
 * init fails it stays false, which is exactly what the callers below need.
 */
let _encrypted = false;

/** True only if member content may be written to disk. */
export function isStorageEncrypted(): boolean {
    return _encrypted;
}

/**
 * Write something that identifies or belongs to the member.
 *
 * Skips entirely when storage is not encrypted. A cache is a speed
 * optimisation; the server is the source of truth, so the cost of not writing
 * is a slower cold start on a device whose keystore is broken. The cost of
 * writing is the member's data readable on disk — and until now that included
 * their EMAIL, because the cached profile is `{ ...session.user, ...profile }`
 * and JSON.stringify keeps every property.
 *
 * Use `storage.set` directly only for values that are not about the member:
 * a bare user id, a launch flag, a recovery flag.
 */
export function setSensitive(key: string, value: string): void {
    if (!_encrypted) return;
    storage.set(key, value);
}

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
        _encrypted = true;
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
        _encrypted = true;
      } catch (recryptErr) {
        // recrypt failed. The plaintext data is STILL ON DISK, and walking away
        // left it there permanently — readable, including private notes. This is
        // the one path where clearing is provably safe: the data was plaintext a
        // moment ago, because encrypting it is what just failed.
        //
        // It also repairs the fallback. Opening this same file WITH a key while
        // it still holds plaintext yields a handle over bytes it cannot decrypt;
        // clearing first makes the new instance a clean, valid encrypted store.
        //
        // The cost is a cold cache, refetched from the server. The alternative
        // is the member's own writing left readable on their device forever.
        try { plain.clearAll(); } catch { /* best effort — see below */ }
        storage = new MMKV({ encryptionKey: key });
        _encrypted = true;

        logger.error('[mmkv] recrypt failed; cleared the plaintext store and started fresh');
        captureError(recryptErr, { scope: 'mmkv.recrypt', clearedPlaintext: true });
      }
    } catch (e) {
      // Keystore unavailable (e.g. unsupported platform). Launch continues
      // rather than bricking — but the old comment here was wrong twice, and
      // both errors mattered:
      //
      //  1. It said the cached data is "non-sensitive". It is not. The film
      //     store persists up to 150 logs with NO field filtering, and a log
      //     carries `privateNotes`. The profile cache is worse: it is
      //     `{ ...session.user, ...profile }`, so it carries the member's EMAIL.
      //  2. It said this degrades to "the unencrypted instance". It does not —
      //     nothing is assigned here, so `storage` stays the import-time
      //     placeholder, a SEPARATE store id. The member's existing cache is
      //     invisible and that session's writes are orphaned on next launch.
      //
      // The placeholder is kept deliberately: it is the safer of the two. We
      // cannot know whether the data on disk is plaintext or already encrypted,
      // so we neither read it nor clear it — unlike the recrypt path above,
      // which has proof. `_encrypted` stays false, so `setSensitive` and the
      // member-content stores write nothing at all while we are in this state.
      //
      // Reported rather than whispered: this used to be `if (__DEV__)`, which
      // meant a member could run permanently degraded and nobody would ever know.
      logger.error('[mmkv] encryption init failed; running on the isolated placeholder store');
      captureError(e, { scope: 'mmkv.initEncryptedStorage', degraded: true });
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

/**
 * The same adapter for stores holding MEMBER CONTENT.
 *
 * Notifications name who interacted with the member and about what — a readable
 * record of their social life. It is a cache; fetchNotifications repopulates it.
 */
export const zustandMMKVStorageSensitive: StateStorage = {
  setItem: (name, value) => { if (_encrypted) storage.set(name, value); },
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

// Asynchronous Deferred Serialization
// Pushes BOTH the heavy JSON.stringify of the monolithic state tree AND the
// MMKV disk write onto the InteractionManager queue. This guarantees that
// rapid store mutations (e.g. liking a film, scrolling) never block the
// UI thread's 60fps frame budget.
/**
 * `sensitive: true` means this store holds MEMBER CONTENT, and must not reach
 * disk unless storage is encrypted.
 *
 * Declared here, at the one line that decides where a store is written, rather
 * than inside each `partialize`. That placement matters: a store's partialize is
 * mocked in tests, so a gate there is both invisible to them and repeated per
 * store, while a gate here is stated once and cannot be forgotten by a store
 * that adds a new persisted field later.
 */
type StorageOptions = { sensitive?: boolean };

export const createAsyncMMKVStorage = <T>(opts: StorageOptions = {}): PersistStorage<T> => ({
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
    // The film store persists up to 150 logs with no field filtering, and a log
    // carries `privateNotes` — the very thing made owner-only at the database
    // level. Writing that in plaintext because a keystore failed, silently, is
    // the outcome worth losing a cold-start optimisation to avoid. The window
    // exists "purely for instant cold-start display", so the fallback is a
    // slower first paint while fetch* repopulates from the server.
    if (opts.sensitive && !_encrypted) return;

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
