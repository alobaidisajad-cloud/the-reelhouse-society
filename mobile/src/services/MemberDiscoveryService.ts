/**
 * MemberDiscoveryService — "The Member Registry": the most-followed public members,
 * for a newcomer whose following feed is empty.
 *
 * The is_social_private filter here is the ONLY thing keeping private members out:
 * every profile row is readable by everyone ("Public profiles are viewable by
 * everyone.", USING (true)). Asks for 24 so the 6 shown survive the client dropping
 * self, the already-followed and the blocked.
 */
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';

export interface NotableMember {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string | null;
  member_no: number | null;
  is_founding: boolean | null;
  is_social_private: boolean | null;
}

export const MemberDiscoveryService = {
  /** A failed read throws, so it is retried: an [] would be cached as the answer for 10 minutes. */
  async getNotableMembers(signal?: AbortSignal): Promise<NotableMember[]> {
    let query = supabase
      .from('profiles')
      .select('id, username, avatar_url, role, member_no, is_founding, is_social_private')
      .eq('is_social_private', false)
      .eq('is_banned', false)
      .not('username', 'is', null)
      .order('followers_count', { ascending: false, nullsFirst: false })
      .limit(24);
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    if (error) {
      logger.warn('[MemberDiscoveryService] getNotableMembers error:', error.message);
      throw error;
    }
    return (data ?? []) as NotableMember[];
  },
};
