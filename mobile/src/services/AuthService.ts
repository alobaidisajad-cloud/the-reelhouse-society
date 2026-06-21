import { supabase } from '../lib/supabase';
import type { EmailOtpType } from '@supabase/supabase-js';
import { PROFILE_SELECT_COLUMNS } from './ProfileWriteService';

/**
 * Service Layer: Authentication Operations
 * ─────────────────────────────────────────────────────────────
 * Isolates all direct Supabase auth operations and RPCs away from the UI.
 */
export const AuthService = {
  /**
   * Updates the user's password.
   */
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /**
   * Requests permanent account deletion via RPC.
   */
  async requestAccountDeletion(): Promise<void> {
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) throw error;
  },

  async getSession() {
    return supabase.auth.getSession();
  },

  async refreshSession() {
    return supabase.auth.refreshSession();
  },

  async verifyOtp(tokenHash: string, type: string) {
    return supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
  },

  /**
   * Hard 15s timeout prevents unbounded retry loops.
   * Uses canonical PROFILE_SELECT_COLUMNS from profileService.
   */
  async getSessionProfile(userId: string) {
    const maxAttempts = 15;
    const HARD_TIMEOUT_MS = 15_000;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - startTime > HARD_TIMEOUT_MS) {
        return null;
      }
      const { data: p } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
      if (p) return p;
      const delay = Math.min(500 * Math.pow(1.5, attempt), 5000);
      const remainingTime = HARD_TIMEOUT_MS - (Date.now() - startTime);
      if (remainingTime <= 0) return null;
      await new Promise(r => setTimeout(r, Math.min(delay, remainingTime)));
    }
    return null;
  }
};
