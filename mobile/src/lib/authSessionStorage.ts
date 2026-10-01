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

export const authSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    await storageReady();
    if (!isStorageEncrypted()) return readSecure(key);
    const kept = storage.getString(key);
    if (kept !== undefined) return kept;
    const earlier = await readSecure(key);
    if (earlier !== null) {
      storage.set(key, earlier);
      await forgetSecure(key);
    }
    return earlier;
  },

  async setItem(key: string, value: string): Promise<void> {
    await storageReady();
    if (!isStorageEncrypted()) {
      await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
      return;
    }
    storage.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    await storageReady();
    if (isStorageEncrypted()) storage.delete(key);
    await forgetSecure(key);
  },
};
