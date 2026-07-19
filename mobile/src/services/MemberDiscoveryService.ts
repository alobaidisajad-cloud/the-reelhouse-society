/**
 * MemberDiscoveryService — "The Member Registry".
 * ─────────────────────────────────────────────────────────────
 * Surfaces notable public members for a newcomer whose following
 * feed is empty. Mirrors the proven direct-profiles query the
 * People search already runs (RLS filters private rows server-side;
 * we also gate is_social_private explicitly). Ranked by follower
 * count — the House's most-followed patrons.
 *
 * Over-fetches (24) so the client can exclude self / already-followed /
 * blocked and still fill the 6 shown rows.
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
  async getNotableMembers(signal?: AbortSignal): Promise<NotableMember[]> {
    try {
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
        return [];
      }
      return (data ?? []) as NotableMember[];
    } catch (err: unknown) {
      // Any failure degrades to "no registry" — the empty state stays as-is.
      logger.warn('[MemberDiscoveryService] getNotableMembers crash:', err instanceof Error ? err.message : String(err));
      return [];
    }
  },
};
