import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';
import { LoungeMessagePayloadSchema } from '../services/LoungeService';
import { logger } from '../utils/logger';
import { isNetworkError } from '../utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { sanitizeInput } from '../utils/sanitizeInput';
import { useAuthStore } from './auth';
import { useBlockStore } from './blockStore';
import { registerStoreReset } from './resetAllStores';

// ── Types ──
export interface LoungeRoom {
  id: string;
  name: string;
  description: string;
  is_private: boolean;
  invite_code: string | null;
  creator_id: string;
  created_at: string;
  cover_image?: string | null;
  member_count?: number;
  unread_count?: number;
  last_message?: string;
  last_message_at?: string;
  is_member?: boolean;
}

export interface LoungeMessage {
  id: string;
  lounge_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  content: string;
  type: 'text' | 'film_share' | 'log_share' | 'system' | string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface LoungeMessageMeta {
  film_id?: number;
  film_title?: string;
  film_poster?: string;
  reply_to_id?: string;
  reply_to_username?: string;
  reply_to_content?: string;
  [key: string]: unknown;
}

export interface LoungeState {
  lounges: LoungeRoom[];
  currentMessages: LoungeMessage[];
  currentLoungeId: string | null;
  loading: boolean;
  sending: boolean;

  fetchLounges: () => Promise<void>;
  fetchMessages: (loungeId: string) => Promise<void>;
  loadMoreMessages: (loungeId: string) => Promise<void>;
  sendMessage: (loungeId: string, content: string, type?: string, meta?: LoungeMessageMeta) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<void>;
  createLounge: (name: string, description: string, isPrivate: boolean) => Promise<string | null>;
  joinLounge: (inviteCode: string) => Promise<boolean>;
  joinLoungeById: (loungeId: string) => Promise<boolean>;
  leaveLounge: (loungeId: string) => Promise<void>;
  deleteLounge: (loungeId: string) => Promise<boolean>;
  subscribeToLounge: (loungeId: string) => () => void;
  markRead: (loungeId: string) => Promise<void>;
  clearMessages: (loungeId?: string) => void;
  canSendMessage: (loungeId?: string) => boolean;
  syncGlobalAvatar: (userId: string, avatarUrl: string | null) => void;
  _pendingLeaveLoungeIds: Set<string>;
  _lastMarkReadMap: Record<string, number>;
}

// ── Throttle ── (800ms between sends, matching web)
let _lastSendAt = 0;
const SEND_THROTTLE = 800;
const MESSAGE_DEDUP_CAP = 100;

// ── Create lounge cooldown — prevents spam-creation ──
let _lastCreateAt = 0;
const CREATE_COOLDOWN = 30000; // 30s between lounge creations

// ── Username cache for Realtime messages — prevents N+1 profile queries ──
const _profileCache = new Map<string, { username: string; avatar_url?: string; ts: number }>();
const _PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _PROFILE_CACHE_MAX = 100;
async function resolveProfile(userId: string): Promise<{ username: string; avatar_url?: string }> {
  const cached = _profileCache.get(userId);
  if (cached && Date.now() - cached.ts < _PROFILE_CACHE_TTL) return cached;
  if (cached) _profileCache.delete(userId);
  const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId).single();
  const result = { username: profile?.username ?? 'unknown', avatar_url: profile?.avatar_url };
  if (_profileCache.size >= _PROFILE_CACHE_MAX) {
    const oldest = _profileCache.keys().next().value;
    if (oldest !== undefined) _profileCache.delete(oldest);
  }
  _profileCache.set(userId, { ...result, ts: Date.now() });
  return result;
}

// ── Raw Realtime payload shape ──
interface RawLoungePayload {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ── Supabase join result shape for lounge_messages + profiles ──
interface LoungeMessageRow {
  id: string;
  lounge_id: string;
  user_id: string;
  content: string;
  type: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  film_id?: number | null;
  film_title?: string | null;
  film_poster?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  profiles: { username: string; avatar_url?: string } | { username: string; avatar_url?: string }[] | null;
}

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  lounges: [],
  currentMessages: [],
  currentLoungeId: null,
  loading: false,
  sending: false,
  _pendingLeaveLoungeIds: new Set(),
  _lastMarkReadMap: {},

  fetchLounges: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ loading: true });
    try {
      // Fetch lounges where user is a member
      const { data: memberRows } = await supabase
        .from('lounge_members')
        .select('lounge_id, last_read_at')
        .eq('user_id', user.id)
        .limit(100);

      const memberships = memberRows ?? [];
      const myLoungeIds = memberships.map(r => r.lounge_id);

      // Fetch from three sources to guarantee visibility:
      // 1) Public lounges (browsable by anyone)
      // 2) Lounges user has explicitly joined (via lounge_members)
      // 3) Lounges user created (fallback if lounge_members insert failed)
      // Fetch ALL browsable lounges (public + private — both are visible, private just needs approval)
      const browsablePromise = supabase.from('lounges')
        .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
        .order('created_at', { ascending: false })
        .limit(50);

      const myJoinedPromise = myLoungeIds.length > 0 
        ? supabase.from('lounges')
            .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
            .in('id', myLoungeIds)
        : Promise.resolve({ data: [] as { id: string; name: string; description: string; is_private: boolean; invite_code: string | null; creator_id: string; created_at: string; member_count: number }[] });

      const myCreatedPromise = supabase.from('lounges')
        .select('id, name, description, is_private, invite_code, creator_id, created_at, member_count')
        .eq('creator_id', user.id);

      const [browsableRes, myJoinedRes, myCreatedRes] = await Promise.all([
        browsablePromise, myJoinedPromise, myCreatedPromise,
      ]);

      // Merge all three, deduplicating by id
      const allLoungesMap = new Map<string, { id: string; name: string; description: string; is_private: boolean; invite_code: string | null; creator_id: string; created_at: string; member_count: number }>();
      if (browsableRes.data) browsableRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myJoinedRes.data) myJoinedRes.data.forEach(l => allLoungesMap.set(l.id, l));
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => allLoungesMap.set(l.id, l));

      // Build the combined set of IDs the user "owns or joined"
      const ownedOrJoinedIds = new Set(myLoungeIds);
      if (myCreatedRes.data) myCreatedRes.data.forEach(l => ownedOrJoinedIds.add(l.id));

      // Calculate unread counts and last message timestamps — BATCHED (no N+1)
      const unreadCounts: Record<string, number> = {};
      const lastMessageTimestamps: Record<string, string> = {};

      const loungeIds = memberships.map(m => m.lounge_id);
      if (loungeIds.length > 0) {
        // Batch 1: Get last message per lounge in a single query
        const { data: lastMsgs } = await supabase
          .from('lounge_messages')
          .select('lounge_id, created_at')
          .in('lounge_id', loungeIds)
          .order('created_at', { ascending: false });
        
        if (lastMsgs) {
          // Keep only the latest per lounge_id
          for (const msg of lastMsgs) {
            if (!lastMessageTimestamps[msg.lounge_id]) {
              lastMessageTimestamps[msg.lounge_id] = msg.created_at;
            }
          }
        }

        // Batch 2: Count unread per lounge — fetch messages newer than last_read_at
        // Build a map of last_read_at per lounge for comparison
        const lastReadMap = new Map(memberships.map(m => [m.lounge_id, m.last_read_at]));
        const oldestLastRead = memberships
          .filter(m => m.last_read_at)
          .map(m => m.last_read_at!)
          .sort()[0];
        
        // Single query: fetch all recent messages across all lounges
        let unreadQuery = supabase
          .from('lounge_messages')
          .select('lounge_id, created_at')
          .in('lounge_id', loungeIds);
        if (oldestLastRead) {
          unreadQuery = unreadQuery.gt('created_at', oldestLastRead);
        }
        const { data: recentMsgs } = await unreadQuery;
        
        // Count per lounge, respecting each membership's last_read_at
        if (recentMsgs) {
          for (const msg of recentMsgs) {
            const memberLastRead = lastReadMap.get(msg.lounge_id);
            if (!memberLastRead || msg.created_at > memberLastRead) {
              unreadCounts[msg.lounge_id] = (unreadCounts[msg.lounge_id] || 0) + 1;
            }
          }
        }
        // Ensure all lounges have an entry
        for (const id of loungeIds) {
          if (!(id in unreadCounts)) unreadCounts[id] = 0;
        }
      }

      // Sort by recent activity
      const loungesList = Array.from(allLoungesMap.values());
      loungesList.sort((a, b) => {
        const aTime = lastMessageTimestamps[a.id] || a.created_at;
        const bTime = lastMessageTimestamps[b.id] || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      // Enrich — rooms the user owns or joined get unread_count and last_message_at
      const enriched: LoungeRoom[] = loungesList.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? '',
        is_private: l.is_private ?? false,
        invite_code: l.invite_code ?? null,
        creator_id: l.creator_id,
        created_at: l.created_at,
        member_count: l.member_count ?? 0,
        unread_count: ownedOrJoinedIds.has(l.id) ? (unreadCounts[l.id] || 0) : undefined,
        last_message_at: lastMessageTimestamps[l.id],
      }));

      set({ lounges: enriched, loading: false });
    } catch (err) {
      if (__DEV__) console.warn('[Lounge] fetchLounges failed:', err);
      reelToast.error('Could not retrieve salons — check your connection.');
      set({ loading: false });
    }
  },

  fetchMessages: async (loungeId: string) => {
    set({ currentLoungeId: loungeId, loading: true });
    try {
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && !error) {
        const messages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(m.profiles) ? m.profiles[0]?.avatar_url : m.profiles?.avatar_url,
          content: m.content,
          type: (m.type as LoungeMessage['type']) ?? 'text',
          reply_to_id: m.reply_to_id,
          reply_to_username: m.reply_to_username,
          reply_to_content: m.reply_to_content,
          film_id: m.film_id,
          film_title: m.film_title,
          film_poster: m.film_poster,
          metadata: m.metadata,
          created_at: m.created_at,
        }));
        // Offline Queue Stitching
        const queue = getOfflineQueue();
        const pendingMessages = queue.filter(q => q.type === 'send_lounge_message' && q.payload.lounge_id === loungeId);
        
        let finalMessages = [...messages];
        for (const pa of pendingMessages) {
            const p = pa.payload;
            // Prepend offline messages (at the end of the array, since UI likely renders from end)
            // Wait, fetchMessages maps and reverses them. Let's see. The fetch order is 'created_at' descending, so newest first.
            // Then it does `.reverse()`, so oldest first. UI renders from bottom.
            // So we need to append offline messages to the end of finalMessages.
            finalMessages.push({
                id: p._tempId || `offline-${Date.now()}-${Math.random()}`,
                lounge_id: p.lounge_id,
                user_id: p.user_id,
                username: useAuthStore.getState().user?.username || 'anonymous',
                content: p.content,
                type: p.type || 'text',
                reply_to_id: p.reply_to_id,
                reply_to_username: p.reply_to_username,
                reply_to_content: p.reply_to_content,
                film_id: p.film_id,
                film_title: p.film_title,
                film_poster: p.film_poster,
                metadata: p.metadata,
                created_at: new Date().toISOString(),
            } as unknown as LoungeMessage);
        }
        set({ currentMessages: finalMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id)) });
      }
    } catch {
      reelToast.error('Could not load messages — check your connection.');
    }
    set({ loading: false });
  },

  loadMoreMessages: async (loungeId: string) => {
    const current = get().currentMessages;
    if (current.length === 0) return;
    
    // The oldest message is at index 0 because fetchMessages reverses the chronological array
    const oldestMessage = current[0];
    if (oldestMessage.id.startsWith('optimistic')) return; // Safety

    try {
      const { data, error } = await supabase
        .from('lounge_messages')
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, metadata, created_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
        .eq('lounge_id', loungeId)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && data.length > 0 && !error) {
        const olderMessages: LoungeMessage[] = (data as LoungeMessageRow[]).reverse().map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(m.profiles) ? m.profiles[0]?.avatar_url : m.profiles?.avatar_url,
          content: m.content,
          type: (m.type as LoungeMessage['type']) ?? 'text',
          reply_to_id: m.reply_to_id,
          reply_to_username: m.reply_to_username,
          reply_to_content: m.reply_to_content,
          film_id: m.film_id,
          film_title: m.film_title,
          film_poster: m.film_poster,
          metadata: m.metadata,
          created_at: m.created_at,
        }));
        
        // Prepend older messages (filter blocked/muted)
        const filteredOlder = olderMessages.filter(m => !useBlockStore.getState().isHidden(m.user_id));
        set({ currentMessages: [...filteredOlder, ...current] });
      }
    } catch {
      // FIX #10: Surface pagination failures instead of silently swallowing
      reelToast.error('Could not load older messages.');
    }
  },

  clearMessages: () => set({ currentMessages: [] }),

  canSendMessage: (loungeId) => {
    const s = get();
    const targetId = loungeId || s.currentLoungeId;
    return s.currentLoungeId === targetId && !s.sending;
  },

  syncGlobalAvatar: (userId, avatarUrl) => {
    set(state => ({
      currentMessages: state.currentMessages.map(msg =>
        msg.user_id === userId ? { ...msg, avatar_url: avatarUrl ?? undefined } : msg
      ),
    }));
  },

  sendMessage: async (loungeId: string, content: string, type = 'text', meta: LoungeMessageMeta = {}) => {
    const user = useAuthStore.getState().user;
    const ALLOWED_TYPES = ['text', 'film_share', 'log_share', 'list_share', 'system'] as const;
    const safeType = (ALLOWED_TYPES as readonly string[]).includes(type) ? type : 'text';
    
    // Parity with the offline mutationExecutor path: strip zero-width/control
    // chars and length-cap via the shared sanitizer (was a bare trim+slice).
    const cleanContent = sanitizeInput(content.slice(0, 500), 'loungeMessage');
    if (!user || (!cleanContent && type === 'text')) return false;

    const now = Date.now();
    if (now - _lastSendAt < SEND_THROTTLE) return false;
    _lastSendAt = now;

    set({ sending: true });

    // Smart schema boundary validation & metadata packaging
    const explicitMetaKeys = ['film_id', 'film_title', 'film_poster', 'reply_to_id', 'reply_to_username', 'reply_to_content'];
    const explicitMeta: Record<string, unknown> = {};
    const nestedMeta: Record<string, unknown> = {};
    
    for (const key in meta) {
      if (explicitMetaKeys.includes(key)) {
        explicitMeta[key] = meta[key];
      } else if (key !== 'metadata') {
        nestedMeta[key] = meta[key];
      }
    }
    
    if (meta.metadata) {
      Object.assign(nestedMeta, meta.metadata);
    }

    const messageId = Crypto.randomUUID();
    const rawPayload = {
      id: messageId,
      lounge_id: loungeId,
      user_id: user.id,
      content: cleanContent,
      type: safeType,
      ...explicitMeta,
      metadata: Object.keys(nestedMeta).length > 0 ? nestedMeta : undefined,
    };
    
    const parseResult = LoungeMessagePayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      logger.warn('[LoungeStore.sendMessage] Payload failed schema validation:', parseResult.error.message);
      set({ sending: false });
      reelToast.error('Message could not be sent.');
      return false;
    }
    const payload = parseResult.data;

    const optimisticMsg = {
      id: messageId,
      username: user.username,
      avatar_url: user.avatar_url,
      created_at: new Date().toISOString(),
      ...payload,
    } as unknown as LoungeMessage;

    set(s => {
      if (s.currentLoungeId === loungeId) {
        return {
          currentMessages: [...s.currentMessages, optimisticMsg].slice(0, Math.max(MESSAGE_DEDUP_CAP, s.currentMessages.length + 1)),
          sending: false,
        };
      }
      return { sending: false };
    });

    try {
      const { data, error } = await supabase.from('lounge_messages')
        .upsert([payload], { onConflict: 'id' })
        .select('id, created_at')
        .single();
      
      if (error) throw error;
      
      set(s => {
        if (s.currentLoungeId !== loungeId) return s;
        const alreadyReplaced = s.currentMessages.some(m => m.id === data.id);
        if (alreadyReplaced) {
          return { currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id) };
        }
        return {
          currentMessages: s.currentMessages.map(m => 
            m.id === optimisticMsg.id 
              ? { ...m, id: data.id, created_at: data.created_at } 
              : m
          ).sort((a, b) => {
            const diff = (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0);
            return diff !== 0 ? diff : a.id.localeCompare(b.id);
          })
        };
      });
      return true;
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        enqueueMutation({
          type: 'send_lounge_message',
          payload: { ...payload, _tempId: payload.id }
        });
        flushOfflineQueue();
        reelToast('Message queued for offline network transmission.');
        return true;
      }
      set(s => {
        if (s.currentLoungeId !== loungeId) return s;
        return {
          currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id),
        };
      });
      reelToast.error('Failed to send message.');
      return false;
    }
  },

  deleteMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    const targetMessage = get().currentMessages.find(m => m.id === messageId);
    set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== messageId) }));
    
    try {
      const { error } = await supabase.from('lounge_messages').delete()
        .eq('id', messageId)
        .eq('user_id', user.id);
        
      if (error) throw error;
    } catch (e) {
      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'delete_lounge_message',
          payload: { message_id: messageId, user_id: user.id },
        });
        flushOfflineQueue();
        return;
      }
      if (targetMessage) {
        set(s => ({ 
          currentMessages: [...s.currentMessages, targetMessage].sort(
            (a, b) => {
              const diff = (new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0);
              return diff !== 0 ? diff : a.id.localeCompare(b.id);
            }
          )
        }));
      }
      reelToast.error('Failed to delete message.');
    }
  },

  createLounge: async (name, description, isPrivate) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    const trimmedName = sanitizeInput(name, 'loungeName');
    const trimmedDesc = sanitizeInput(description, 'listDescription');
    if (!trimmedName || trimmedName.length < 2) {
      reelToast.error('Lounge name must be at least 2 characters.');
      return null;
    }
    if (trimmedName.length > 50) {
      reelToast.error('Lounge name cannot exceed 50 characters.');
      return null;
    }

    const now = Date.now();
    if (now - _lastCreateAt < CREATE_COOLDOWN) {
        reelToast.error('Please wait before creating another lounge.');
        return null;
    }
    _lastCreateAt = now;
    
    const inviteCode = isPrivate
      ? Crypto.randomUUID().slice(0, 8).toUpperCase()
      : null;
    
    try {
      const { data: loungeId, error } = await supabase.rpc('create_lounge_with_member', {
        p_name: trimmedName,
        p_description: trimmedDesc,
        p_is_private: isPrivate,
        p_invite_code: inviteCode
      });

      if (error || !loungeId) {
        logger.error('[LoungeStore.createLounge] RPC failed:', error);
        reelToast.error('Failed to create lounge.');
        return null;
      }

      const newLounge: LoungeRoom = {
        id: loungeId,
        name: trimmedName,
        description: trimmedDesc,
        is_private: isPrivate,
        invite_code: inviteCode,
        creator_id: user.id,
        created_at: new Date().toISOString(),
        member_count: 1,
        unread_count: 0,
        is_member: true,
      };

      set(s => ({ lounges: [newLounge, ...s.lounges] }));

      get().fetchLounges();
      return loungeId;
    } catch (e) {
      logger.error('[LoungeStore.createLounge] Unhandled error:', e);
      reelToast.error('Could not create lounge. Check your connection and try again.');
      return null;
    }
  },

  joinLounge: async (inviteCode) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    try {
      // Resolve by exact invite code. RLS already hides private lounges from
      // non-members, so a direct lookup can't enumerate private-lounge metadata
      // (the broad enumeration policy the repo worried about isn't present on
      // this DB — verified WAVE 0). invite_code is stored uppercase.
      const { data: lounge, error: fetchError } = await supabase
        .from('lounges')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (!lounge) {
        reelToast.error('Invalid invite code.');
        return false;
      }
      
      const { error } = await supabase.from('lounge_members').insert([{
        lounge_id: lounge.id,
        user_id: user.id,
      }]);
      
      const isDuplicate = error?.code === '23505';
      if (error && !isDuplicate) {
        logger.error('[LoungeStore.joinLounge] Insert failed:', error);
        reelToast.error('Could not join lounge. Please check your connection.');
        return false;
      }
      
      set(s => ({
        lounges: s.lounges.some(l => l.id === lounge.id)
          ? s.lounges.map(l => l.id === lounge.id ? { 
              ...l, 
              is_member: true, 
              member_count: isDuplicate ? l.member_count : (l.member_count || 0) + 1 
            } : l)
          : [...s.lounges, {
              id: lounge.id,
              name: lounge.name,
              description: lounge.description || '',
              is_private: lounge.is_private,
              invite_code: lounge.invite_code,
              creator_id: lounge.creator_id,
              created_at: lounge.created_at,
              member_count: isDuplicate ? (lounge.member_count || 0) : (lounge.member_count || 0) + 1,
              unread_count: 0,
              is_member: true,
            }]
      }));

      await get().fetchLounges();
      queryClient.invalidateQueries({ queryKey: ['lounge_membership', lounge.id] });
      queryClient.invalidateQueries({ queryKey: ['lounge_members', lounge.id] });
      return true;
    } catch (e) {
      logger.error('[LoungeStore.joinLounge] Unhandled error:', e);
      reelToast.error('Could not join lounge. Check your connection and try again.');
      return false;
    }
  },

  joinLoungeById: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    try {
      const { error } = await supabase.from('lounge_members').insert([{
        lounge_id: loungeId,
        user_id: user.id,
      }]);
      
      const isDuplicate = error?.code === '23505';
      if (error && !isDuplicate) {
        reelToast.error('Failed to take a seat.');
        return false;
      }
      
      set(s => ({
        lounges: s.lounges.map(l => l.id === loungeId ? { 
          ...l, 
          is_member: true, 
          member_count: isDuplicate ? l.member_count : (l.member_count || 0) + 1 
        } : l)
      }));

      await get().fetchLounges();
      queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
      queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
      return true;
    } catch (e) {
      logger.error('[LoungeStore.joinLoungeById] Unhandled error:', e);
      reelToast.error('Could not join lounge. Check your connection and try again.');
      return false;
    }
  },

  leaveLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const lounge = get().lounges.find(l => l.id === loungeId);
    if (lounge && lounge.creator_id === user.id) {
        reelToast.error('You created this lounge. Delete it instead of leaving.');
        return;
    }

    set(s => {
      const newSet = new Set(s._pendingLeaveLoungeIds);
      newSet.add(loungeId);
      return { _pendingLeaveLoungeIds: newSet };
    });
    const timeoutId = setTimeout(() => {
      if (get()._pendingLeaveLoungeIds.has(loungeId)) {
        set(s => {
          const newSet = new Set(s._pendingLeaveLoungeIds);
          newSet.delete(loungeId);
          return { _pendingLeaveLoungeIds: newSet };
        });
      }
    }, 5000);

    set(s => {
      const target = s.lounges.find(l => l.id === loungeId);
      if (!target || !target.is_member) return s;
      if (target.is_private) {
        return { lounges: s.lounges.filter(l => l.id !== loungeId) };
      }
      return { 
        lounges: s.lounges.map(l => l.id === loungeId ? { 
          ...l, 
          is_member: false,
          member_count: Math.max(0, (l.member_count || 1) - 1)
        } : l) 
      };
    });

    const { error } = await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id);

    if (error) {
      set(s => {
        const newSet = new Set(s._pendingLeaveLoungeIds);
        newSet.delete(loungeId);
        return { _pendingLeaveLoungeIds: newSet };
      });
      clearTimeout(timeoutId);
      reelToast.error('Failed to leave — please try again.');
      await get().fetchLounges();
    } else {
      queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
      queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
    }
  },

  deleteLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    // Optimistic removal
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    
    const { error } = await supabase.from('lounges').delete()
      .eq('id', loungeId)
      .eq('creator_id', user.id);
    
    if (error) {
      reelToast.error('Failed to incinerate lounge.');
      await get().fetchLounges(); // Revert
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ['lounge_membership', loungeId] });
    queryClient.invalidateQueries({ queryKey: ['lounge_members', loungeId] });
    return true;
  },

  subscribeToLounge: (loungeId: string) => {
    const channel = supabase
      .channel(`lounge-${loungeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lounge_messages',
          filter: `lounge_id=eq.${loungeId}`,
        },
        async (payload) => {
          if (!payload.new) return;
          const msg = payload.new as RawLoungePayload;
          // Ignore our own optimistic messages (they're already rendered)
          const existing = get().currentMessages.find(m => m.id === msg.id);
          if (existing) return;

          // Filter messages from blocked/muted users
          if (useBlockStore.getState().isHidden(msg.user_id)) return;

          // Resolve username via cache — prevents N+1 queries in busy lounges
          const { username, avatar_url } = await resolveProfile(msg.user_id);

          const newMsg: LoungeMessage = {
            id: msg.id,
            lounge_id: msg.lounge_id,
            user_id: msg.user_id,
            username,
            avatar_url,
            content: msg.content?.replace(/<[^>]*>/g, '') ?? '',
            type: (msg.type ?? 'text') as LoungeMessage['type'],
            reply_to_id: msg.reply_to_id,
            reply_to_username: msg.reply_to_username,
            reply_to_content: msg.reply_to_content,
            film_id: msg.film_id,
            film_title: msg.film_title,
            film_poster: msg.film_poster,
            metadata: msg.metadata,
            created_at: msg.created_at,
          };

          // Dedup incoming message and re-sort
          set(s => {
            const messagesWithoutOpt = s.currentMessages.filter(m => m.id !== newMsg.id);
            
            return {
              currentMessages: [...messagesWithoutOpt, newMsg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lounge_messages', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const deletedId = (payload.old as RawLoungePayload)?.id;
          if (deletedId) {
            set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== deletedId) }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },

  markRead: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    set(s => ({
      lounges: s.lounges.map(l => l.id === loungeId ? { ...l, unread_count: 0 } : l),
      _lastMarkReadMap: { ...s._lastMarkReadMap, [loungeId]: Date.now() }
    }));

    try {
      const { error } = await supabase
        .from('lounge_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('lounge_id', loungeId)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } catch (e) {
      logger.warn('[Lounge] markRead failed:', e);
    }
  },
}));

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    useLoungeStore.setState({ lounges: [], currentMessages: [], currentLoungeId: null, loading: false, sending: false, _pendingLeaveLoungeIds: new Set(), _lastMarkReadMap: {} });
    _lastCreateAt = 0;
    // Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
