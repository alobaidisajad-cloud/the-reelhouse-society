/**
 * authEvents.ts — what the app does with each Supabase auth event. Run only
 * after the listener has let go of auth-js's lock: AppBootstrapper defers every
 * event and chains them, so a `supabase.auth.*` call made here cannot deadlock.
 */
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { storage, useAuthStore } from './auth';

export async function answerAuthEvent(event: AuthChangeEvent, hasSessionUser: boolean): Promise<void> {
  if (event === 'SIGNED_OUT') {
    // Still signed in here, so not by the member's own hand: their own sign-out
    // clears the store before it ends the session.
    if (useAuthStore.getState().isAuthenticated) {
      await useAuthStore.getState().logout({ endedElsewhere: true });
    }
  } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
    // A recovery link mints a full session before the user has set a new
    // password: not signed in here until the reset screen clears the pending
    // flag (or the abandon path destroys the session).
    const recoveryPending = storage.getString('recovery_pending') === 'true';
    if (hasSessionUser && !recoveryPending && !useAuthStore.getState().isAuthenticated) {
      await useAuthStore.getState().restoreSession();
    }
  }
}
