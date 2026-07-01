import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      logger.error('Failed to get item from SecureStore (device might be locked)', e);
      return null;
    }
  },
  setItem: (key: string, value: string) => 
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// The Supabase anon key is intentionally exposed in
// the JS bundle — this is Supabase's design. All data security is enforced by
// Row Level Security (RLS) policies on every table. The anon key only grants
// access to operations explicitly permitted by RLS. Auth tokens are stored in
// expo-secure-store (see ExpoSecureStoreAdapter above), NOT in MMKV or AsyncStorage.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: ExpoSecureStoreAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// TOKEN_REFRESH_FAILED is emitted by @supabase/auth-js >=2.64.0
// but is not part of the public TypeScript enum. The cast is intentional.
// As a belt-and-suspenders approach, we also handle TOKEN_REFRESHED with an
// invalid session to catch edge cases across SDK versions.
supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        supabase.auth.signOut({ scope: 'local' }).catch((e) => { logger.warn('[supabase] SignOut on refresh failure error', e); });
    }
    // Fallback: if a token refresh fires but the session has no valid access token, force sign-out
    if (event === 'TOKEN_REFRESHED' && !session?.access_token) {
        supabase.auth.signOut({ scope: 'local' }).catch((e) => { logger.warn('[supabase] SignOut on invalid session error', e); });
    }
});

// Tells Supabase Auth to continuously refresh the session automatically if
// the app is in the foreground. When this is added, you will continue to receive
// `onAuthStateChange` events with the `TOKEN_REFRESHED` or `SIGNED_OUT` event
// if the user's session is terminated. This should only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
