import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import {
    DossierCommentSchema,
    type DossierComment,
} from '@/src/schemas/dossier.schema';
import { z } from 'zod';

const CommentPayloadSchema = z.object({
  dossier_id: z.string().uuid(),
  user_id: z.string().uuid(),
  body: z.string().min(1),
});

export const DossierService = {
  /** Zod-validated read path */
  async getComments(dossierId: string): Promise<DossierComment[]> {
    const { data, error } = await supabase
      .from('dossier_comments')
      .select('id, user_id, body, created_at, profiles!inner(username, avatar_url)')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true });
      
    if (error) throw error;
    if (!data) return [];
    // Direct Zod parse replaces `as unknown as` cast.
    return z.array(DossierCommentSchema).parse(data);
  },

  async addComment(payload: unknown) {
    const safePayload = CommentPayloadSchema.parse(payload);
    // dossier_comments.username is NOT NULL and no trigger populates it — inject the
    // current user's username (denormalized column; display uses the profiles join).
    const username = useAuthStore.getState().user?.username ?? 'anonymous';
    const { data, error } = await supabase
      .from('dossier_comments')
      .insert({ ...safePayload, username })
      .select('id, user_id, body, created_at, profiles!inner(username, avatar_url)')
      .maybeSingle();
      
    if (error) throw error;
    if (!data) throw new Error('Failed to add comment');
    // Zod-validate the return — consistent with all other read paths
    return DossierCommentSchema.parse(data);
  },

  /**
   * Defense-in-depth ownership filter on comment deletion.
   * Matches LogService.deleteLogComment and mutationExecutor.remove_log_comment pattern.
   * Even if RLS enforces this server-side, the client filter prevents accidental
   * cross-user deletions from ever reaching the wire.
   */
  async deleteComment(commentId: string, userId?: string) {
    const resolvedUserId = userId ?? (await supabase.auth.getSession()).data.session?.user?.id;
    if (!resolvedUserId) throw new Error('Authentication required');
    
    const { error } = await supabase
      .from('dossier_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', resolvedUserId);
      
    if (error) throw error;
  },

  /**
   * Defense-in-depth ownership filter on comment updates.
   * Prevents any path from modifying comments belonging to other users.
   */
  async updateComment(commentId: string, body: string, userId?: string) {
    const resolvedUserId = userId ?? (await supabase.auth.getSession()).data.session?.user?.id;
    if (!resolvedUserId) throw new Error('Authentication required');
    
    const { error } = await supabase
      .from('dossier_comments')
      .update({ body })
      .eq('id', commentId)
      .eq('user_id', resolvedUserId);
      
    if (error) throw error;
  },

  async incrementViews(dossierId: string) {
    const { error } = await supabase.rpc('increment_dossier_views', { dossier_uuid: dossierId });
    if (error) throw error;
  },

  async getCertifications(dossierId: string) {
    const { data, error } = await supabase
      .from('dispatch_dossiers')
      .select('certifications')
      .eq('id', dossierId)
      .maybeSingle();
      
    if (error) throw error;
    return data;
  },

  async checkUserCertification(dossierId: string, userId: string) {
    const { data, error } = await supabase
      .from('dossier_certifications')
      .select('id')
      .eq('dossier_id', dossierId)
      .eq('user_id', userId)
      .maybeSingle();
      
    if (error) throw error;
    return !!data;
  },

  async toggleCertification(dossierId: string) {
    const { data, error } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: dossierId });
    if (error) throw error;
    return data;
  }
};
