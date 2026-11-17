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

  /**
   * Deletes the member's account. `eraseWriting` takes down what they wrote for other members as
   * well (critiques, filings, salon messages); without it those stay, unsigned. The choice is sent
   * only when it is taken: the plain call is the one every client has always made, so it is
   * answered the same by the house before and after it learned the choice.
   */
  async requestAccountDeletion(eraseWriting = false): Promise<void> {
    const { error } = eraseWriting
      ? await supabase.rpc('request_account_deletion', { p_erase_writing: true })
      : await supabase.rpc('request_account_deletion');
    if (error) throw error;
  },
};
