import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import { authSessionStorage } from './authSessionStorage';

// The Supabase anon key is intentionally exposed in
// the JS bundle — this is Supabase's design. All data security is enforced by
// Row Level Security (RLS) policies on every table. The anon key only grants
// access to operations explicitly permitted by RLS. The session is kept
// encrypted on the device (authSessionStorage).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: authSessionStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Email links come back with ?code=, which auth-callback exchanges for a session.
    flowType: 'pkce',
  },
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
