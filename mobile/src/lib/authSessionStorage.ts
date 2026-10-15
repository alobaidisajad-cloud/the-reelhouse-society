/**
 * Where Supabase keeps the signed-in session.
 *
 * A member's session is ~2.4 KB; SecureStore holds 2,048 bytes and says larger
 * values may not be stored. So the session lives in the encrypted MMKV store,
 * whose key SecureStore holds, as Supabase advises for Expo. A session kept in
 * SecureStore by an earlier build is moved on first read, so nobody is signed out.
 *
 * With no encrypted store (a broken keystore), SecureStore is used as before.
 */
import * as SecureStore from 'expo-secure-store';
import { storage, storageReady, isStorageEncrypted } from '@/src/stores/mmkv-storage';
import { logger } from '@/src/utils/logger';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { stampOwnerlessWrites } from '@/src/utils/queueOwnership';

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    logger.error('Failed to get item from SecureStore (device might be locked)', e);
    return null;
  }
}

async function forgetSecure(key: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(key); } catch { /* nothing there to keep */ }
}

/** The member a stored session belongs to, or null. */
function memberOf(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as { user?: { id?: unknown }; currentSession?: { user?: { id?: unknown } } };
    const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

// Traced for the E2E by kind, store and size alone: never a token.
async function readItem(key: string): Promise<string | null> {
  await storageReady();
  const kind = key.endsWith('-code-verifier') ? 'verifier' : 'session';
  if (!isStorageEncrypted()) {
    const secured = await readSecure(key);
    e2eTrace('auth.storage.read', { kind, from: secured === null ? 'none' : 'secure', encrypted: false });
    return secured;
  }
  const kept = storage.getString(key);
  if (kept !== undefined) {
    e2eTrace('auth.storage.read', { kind, from: 'mmkv', encrypted: true });
    return kept;
  }
  const earlier = await readSecure(key);
  if (earlier !== null) {
    storage.set(key, earlier);
    await forgetSecure(key);
  }
  e2eTrace('auth.storage.read', { kind, from: earlier === null ? 'none' : 'moved', encrypted: true });
  return earlier;
}

export const authSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await readItem(key);
    // The client reads the stored session before it may refresh (and so end)
    // it: an older build's ownerless writes take that session's member first.
    if (!key.endsWith('-code-verifier')) {
      try { stampOwnerlessWrites(memberOf(value)); } catch (e) {
        logger.warn('[auth.storage] could not stamp the queue with its member', e);
      }
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await storageReady();
    const kind = key.endsWith('-code-verifier') ? 'verifier' : 'session';
    if (!isStorageEncrypted()) {
      await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
      e2eTrace('auth.storage.write', { kind, to: 'secure', bytes: value.length });
      return;
    }
    storage.set(key, value);
    e2eTrace('auth.storage.write', { kind, to: 'mmkv', bytes: value.length, held: storage.getString(key) === value });
  },

  async removeItem(key: string): Promise<void> {
    await storageReady();
    if (isStorageEncrypted()) storage.delete(key);
    await forgetSecure(key);
    e2eTrace('auth.storage.remove', { kind: key.endsWith('-code-verifier') ? 'verifier' : 'session' });
  },
};
