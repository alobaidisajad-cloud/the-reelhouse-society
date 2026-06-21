import { supabase } from '@/src/lib/supabase';
import {
    DispatchLogSchema,
    DossierCommentSchema,
    DossierDetailSchema,
    DossierFeedItemSchema,
    type DispatchLog,
    type DossierComment,
    type DossierDetail,
    type DossierFeedItem,
} from '@/src/schemas/dossier.schema';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { z } from 'zod';

const CommentPayloadSchema = z.object({
  dossier_id: z.string().uuid(),
  user_id: z.string().uuid(),
  body: z.string().min(1),
});

export const DossierService = {
  /** Zod-validated read path. AbortSignal support. */
  async getFeed(signal?: AbortSignal): Promise<DossierFeedItem[]> {
    let query = supabase
      .from('dispatch_dossiers')
      .select('id, title, subtitle, cover_url, author_id, published_at, read_time, is_featured, profiles!inner(username, avatar_url, role)')
      .eq('published', true)
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false });

    query = withAbortSignal(query, signal);
    const { data, error } = await query;
      
    if (error) throw error;
    if (!data) return [];
    // Direct Zod parse replaces `as unknown as` cast — schemas handle coercion.
    return z.array(DossierFeedItemSchema).parse(data);
  },

  /** Zod-validated read path */
  async getDispatchLogs(): Promise<DispatchLog[]> {
    const { data, error } = await supabase
      .from('logs')
      .select('id, film_title, review, created_at, profiles!logs_user_id_fkey(username, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (error) throw error;
    if (!data) return [];
    // Direct Zod parse replaces `as unknown as` cast.
    return z.array(DispatchLogSchema).parse(data);
  },

  /** Zod-validated read path. AbortSignal support. */
  async getDossierDetails(dossierId: string, signal?: AbortSignal): Promise<DossierDetail> {
    let query = supabase
      .from('dispatch_dossiers')
      .select('*, profiles!inner(username, avatar_url, role)')
      .eq('id', dossierId)
      .maybeSingle();

    query = withAbortSignal(query, signal);
    const { data, error } = await query;
      
    if (error) throw error;
    if (!data) throw new Error('Dossier not found');
    return DossierDetailSchema.parse(data);
  },

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
    const { data, error } = await supabase
      .from('dossier_comments')
      .insert(safePayload)
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
