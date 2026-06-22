import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { ProfileUpdateSchema } from '../schemas/profile.schema';
import type { User } from '../types';
import { withAbortSignal } from '../utils/withAbortSignal';

/**
 * Canonical column list for auth-bootstrap profile SELECT queries.
 * Used across auth.ts, useAuthFlow.ts, and profileService.ts.
 * This is the MINIMAL column set needed for session restore — keep it lean.
 *
 * @see {@link ./ProfileDataService.ts} for the full profile-page column sets
 *   (SELF_PROFILE_COLUMNS / PUBLIC_PROFILE_COLUMNS) which include additional
 *   display fields like tier, followers_count, favorite_films, etc.
 *
 * When adding new profile columns, update ONLY the constant that matches
 * the column's use case (auth bootstrap vs. profile display).
 */
export const PROFILE_SELECT_COLUMNS = 'id, username, role, tier, is_founding, bio, avatar_url, display_name, is_social_private, preferences, persona, created_at, is_banned' as const;

/**
 * Service Layer: Profile & User Operations
 * ─────────────────────────────────────────────────────────────
 * Isolates all database operations regarding users/profiles away from
 * the Zustand state store.
 */
export const ProfileService = {
  /**
   * Updates user profile fields in the database.
   * Enforces Zod schema validation and explicit session authorization.
   * NOTE: The `role` column is intentionally excluded from ProfileUpdateSchema
   * to prevent client-side privilege escalation. Ensure Supabase RLS blocks this as well.
   */
  async updateProfile(userId: string, updates: Partial<User>) {
    // 1. Explicit Session Authorization
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      throw new Error('Unauthorized: No active session found.');
    }
    if (session.user.id !== userId) {
      throw new Error('Unauthorized: Session mismatch.');
    }

    const dbUpdates: Record<string, unknown> = {};

    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
    if (updates.display_name !== undefined) dbUpdates.display_name = updates.display_name;
    if (updates.persona !== undefined) dbUpdates.persona = updates.persona;
    if (updates.social_links !== undefined) dbUpdates.social_links = updates.social_links;
    if (updates.preferences !== undefined) dbUpdates.preferences = updates.preferences;
    
    // Handle camelCase vs snake_case mapping
    if ('isSocialPrivate' in updates) {
      dbUpdates.is_social_private = updates.isSocialPrivate;
    } else if ('is_social_private' in updates) {
      dbUpdates.is_social_private = updates.is_social_private;
    }

    if (Object.keys(dbUpdates).length === 0) return;

    // 2. Strict Zod Schema Validation
    const validatedData = ProfileUpdateSchema.parse(dbUpdates);

    // 3. Database Sync
    const { error } = await supabase.from('profiles').update(validatedData).eq('id', userId);
    if (error) throw error;
  },

  /**
   * Checks if a username is available.
   * Returns true if available, false if taken.
   */
  async checkUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return !data;
  },

  async uploadAvatar(userId: string, base64Str: string): Promise<string> {
    // Guard against oversized payloads before decode().
    // 10MB raw ≈ 13.3MB base64. Prevents JS thread OOM on malicious input.
    const MAX_AVATAR_BASE64_LENGTH = 13_300_000;
    if (base64Str.length > MAX_AVATAR_BASE64_LENGTH) {
      throw new Error('Avatar image exceeds the 10MB size limit.');
    }

    // Detect image type from magic bytes to set the correct content type
    const pureBase64 = base64Str.replace(/^data:image\/\w+;base64,/, '');
    let mimeType = 'image/jpeg';
    let ext = 'jpg';
    
    if (pureBase64.startsWith('iVBORw0KGgo')) {
      mimeType = 'image/png';
      ext = 'png';
    } else if (pureBase64.startsWith('/9j/')) {
      mimeType = 'image/jpeg';
      ext = 'jpg';
    } else if (pureBase64.startsWith('UklGR')) {
      mimeType = 'image/webp';
      ext = 'webp';
    } else if (pureBase64.startsWith('R0lGOD')) {
      mimeType = 'image/gif';
      ext = 'gif';
    }
    
    // Upload the new file with a unique timestamp to prevent race conditions.
    // If the upload fails, the legacy avatar remains intact in the DB.
    // We intentionally DO NOT purge legacy files here to prevent Avatar Desync.
    const newFileName = `${Date.now()}.${ext}`;
    const filePath = `${userId}/${newFileName}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, decode(pureBase64), {
      contentType: mimeType,
    });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  },

  /**
   * Asynchronously purges old avatars only after the DB write commits.
   * Includes Chronological Race Protection to prevent destroying concurrent uploads.
   */
  async purgeLegacyAvatars(userId: string, currentAvatarUrl: string | null): Promise<void> {
    const { data: files } = await supabase.storage.from('avatars').list(userId);
    if (!files || files.length === 0) return;

    let currentFileName: string | null = null;
    let targetFileDate: Date | null = null;

    if (currentAvatarUrl) {
      const parts = currentAvatarUrl.split('/');
      currentFileName = parts[parts.length - 1];
      const targetFile = files.find(f => f.name === currentFileName);
      if (targetFile?.created_at) {
        targetFileDate = new Date(targetFile.created_at);
      } else {
        // FAIL-SAFE: we were given a current avatar but cannot resolve its file (or its
        // timestamp) in the listing. Without a valid chronological anchor, the race
        // protection below would no-op and this purge could delete a concurrent in-flight
        // upload. Refuse to purge rather than risk destroying the live avatar.
        return;
      }
    }

    const pathsToDelete = files
      .filter(f => {
        if (currentFileName && f.name === currentFileName) return false;
        // Never delete a file newer than the target file, to protect concurrent uploads.
        // This guarantees concurrent rapid uploads won't destroy each other's files.
        if (targetFileDate && f.created_at) {
          const fDate = new Date(f.created_at);
          if (fDate > targetFileDate) return false;
        }
        return true;
      })
      .map(f => `${userId}/${f.name}`);

    if (pathsToDelete.length > 0) {
      await supabase.storage.from('avatars').remove(pathsToDelete);
    }
  },

  /**
   * Cursor-based keyset pagination replaces hardcoded .limit(100).
   * Returns { profiles, hasMore } so the UI can show a "Load More" indicator
   * instead of silently truncating the list.
   */
  async getSocialConnections(
    userId: string,
    type: 'followers' | 'following',
    { cursor, limit = 50, signal }: { cursor?: string; limit?: number; signal?: AbortSignal } = {}
  ): Promise<{ profiles: { id: string; username: string; avatar_url: string | null; role: string; tier?: string | null }[]; hasMore: boolean; nextCursor?: string }> {
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore
    let ids: string[] = [];
    let rows: any[] = [];


    if (type === 'followers') {
        let query = supabase
            .from('interactions')
            .select('user_id, created_at')
            .eq('target_user_id', userId)
            .eq('type', 'follow')
            .order('created_at', { ascending: false })
            .order('user_id', { ascending: false })
            .limit(fetchLimit);
            
        if (cursor) {
            if (cursor.includes('|')) {
                const [cursorDate, cursorId] = cursor.split('|');
                const safeId = /^\d+$/.test(String(cursorId)) ? cursorId : `"${cursorId}"`;
                query = query.or(`created_at.lt."${cursorDate}",and(created_at.eq."${cursorDate}",user_id.lt.${safeId})`);
            } else {
                query = query.lt('created_at', cursor);
            }
        }
        
        query = withAbortSignal(query, signal);
        const { data } = await query;
        rows = data || [];
        ids = rows.map((r: { user_id: string }) => r.user_id);

    } else {
        let query = supabase
            .from('interactions')
            .select('target_user_id, created_at')
            .eq('user_id', userId)
            .eq('type', 'follow')
            .order('created_at', { ascending: false })
            .order('target_user_id', { ascending: false })
            .limit(fetchLimit);
            
        if (cursor) {
            if (cursor.includes('|')) {
                const [cursorDate, cursorId] = cursor.split('|');
                const safeId = /^\d+$/.test(String(cursorId)) ? cursorId : `"${cursorId}"`;
                query = query.or(`created_at.lt."${cursorDate}",and(created_at.eq."${cursorDate}",target_user_id.lt.${safeId})`);
            } else {
                query = query.lt('created_at', cursor);
            }
        }
        
        query = withAbortSignal(query, signal);
        const { data } = await query;
        rows = data || [];
        ids = rows.map((r: { target_user_id: string }) => r.target_user_id);
    }

    const hasMore = ids.length > limit;
    if (hasMore) ids = ids.slice(0, limit); // Trim the extra detection row

    if (ids.length === 0) return { profiles: [], hasMore: false };

    let profQuery = supabase
        .from('profiles')
        .select('id, username, avatar_url, role, tier')
        .in('id', ids);
    profQuery = withAbortSignal(profQuery, signal);

    const { data: profs, error } = await profQuery;

    if (error) throw error;

    // Re-sort profiles to match the original interaction query order.
    // .in('id', ids) returns arbitrary PK order, losing the created_at DESC
    // chronological ordering from the interaction query above.
    const idOrder = new Map(ids.map((id, i) => [id, i]));
    const sorted = (profs ?? []).sort(
      (a: { id: string }, b: { id: string }) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0)
    );

    let nextCursor: string | undefined = undefined;
    if (hasMore && rows.length > limit) {
        const lastRow = rows[limit - 1]; // The last item of the valid page
        const lastId = type === 'followers' ? lastRow.user_id : lastRow.target_user_id;
        nextCursor = `${lastRow.created_at}|${lastId}`;
    }

    return { profiles: sorted, hasMore, nextCursor };
  }
};

