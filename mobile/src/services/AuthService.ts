import { supabase } from '../lib/supabase';

/**
 * The two account acts Settings performs: a new password, and asking for the
 * account to be deleted. Each throws the refusal it is answered with.
 */
export const AuthService = {
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  async requestAccountDeletion(): Promise<void> {
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) throw error;
  },
};
