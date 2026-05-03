import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import reelToast from '../utils/reelToast';
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
  created_at: string;
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
  sendMessage: (loungeId: string, content: string, type?: string, meta?: {
    reply_to_id?: string | null;
    reply_to_username?: string | null;
    reply_to_content?: string | null;
    film_id?: number | null;
    film_title?: string | null;
    film_poster?: string | null;
  }) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  createLounge: (name: string, description: string, isPrivate: boolean) => Promise<string | null>;
  joinLounge: (inviteCode: string) => Promise<boolean>;
  joinLoungeById: (loungeId: string) => Promise<boolean>;
  leaveLounge: (loungeId: string) => Promise<void>;
  deleteLounge: (loungeId: string) => Promise<void>;
  subscribeToLounge: (loungeId: string) => () => void;
  markRead: (loungeId: string) => Promise<void>;
}

// ── Throttle ── (800ms between sends, matching web)
let _lastSendAt = 0;
const SEND_THROTTLE = 800;

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
  created_at: string;
  profiles: { username: string; avatar_url?: string } | { username: string; avatar_url?: string }[] | null;
}

export const useLoungeStore = create<LoungeState>()((set, get) => ({
  lounges: [],
  currentMessages: [],
  currentLoungeId: null,
  loading: false,
  sending: false,

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
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, created_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
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
          created_at: m.created_at,
        }));
        set({ currentMessages: messages });
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
        .select('id, lounge_id, user_id, content, type, reply_to_id, reply_to_username, reply_to_content, film_id, film_title, film_poster, created_at, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
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
          created_at: m.created_at,
        }));
        
        // Prepend older messages
        set({ currentMessages: [...olderMessages, ...current] });
      }
    } catch {
      // FIX #10: Surface pagination failures instead of silently swallowing
      reelToast.error('Could not load older messages.');
    }
  },

  sendMessage: async (loungeId, content, type = 'text', meta = {}) => {
    const user = useAuthStore.getState().user;
    const ALLOWED_TYPES = ['text', 'film_share', 'log_share', 'system'] as const;
    const safeType = (ALLOWED_TYPES as readonly string[]).includes(type) ? type : 'text';
    if (!user || !content.trim()) return;

    // Throttle
    const now = Date.now();
    if (now - _lastSendAt < SEND_THROTTLE) return;
    _lastSendAt = now;

    set({ sending: true });

    // Optimistic insert
    const optimisticMsg: LoungeMessage = {
      id: `optimistic-${now}`,
      lounge_id: loungeId,
      user_id: user.id,
      username: user.username,
      content: content.trim().slice(0, 500),
      type: safeType as LoungeMessage['type'],
      created_at: new Date().toISOString(),
      ...meta,
    };

    set(s => ({
      currentMessages: [...s.currentMessages, optimisticMsg],
      sending: false,
    }));

    try {
      const { data, error } = await supabase.from('lounge_messages').insert([{
        lounge_id: loungeId,
        user_id: user.id,
        content: content.trim().slice(0, 500).replace(/<[^>]*>/g, ''),
        type: safeType,
        ...meta,
      }]).select('id, created_at').single();
      
      if (error) throw error;
      
      set(s => {
        const alreadyReplaced = s.currentMessages.some(m => m.id === data.id);
        if (alreadyReplaced) {
          return { currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id) };
        }
        return {
          currentMessages: s.currentMessages.map(m => 
            m.id === optimisticMsg.id 
              ? { ...m, id: data.id, created_at: data.created_at } 
              : m
          ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        };
      });
    } catch {
      // Remove optimistic message on failure
      set(s => ({
        currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id),
      }));
      reelToast.error('Failed to send message.');
    }
  },

  deleteMessage: async (messageId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    const prev = get().currentMessages;
    set(s => ({ currentMessages: s.currentMessages.filter(m => m.id !== messageId) }));
    
    const { error } = await supabase.from('lounge_messages').delete()
      .eq('id', messageId)
      .eq('user_id', user.id);
    
    if (error) {
      set({ currentMessages: prev });
    }
  },

  createLounge: async (name, description, isPrivate) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    // Rate-limit creation to prevent abuse
    const now = Date.now();
    if (now - _lastCreateAt < CREATE_COOLDOWN) {
        reelToast.error('Please wait before creating another lounge.');
        return null;
    }
    _lastCreateAt = now;
    
    const inviteCode = isPrivate
      ? Math.random().toString(36).slice(2, 10).toUpperCase()
      : null;
    
    const { data, error } = await supabase.from('lounges').insert([{
      name,
      description,
      is_private: isPrivate,
      invite_code: inviteCode,
      creator_id: user.id,
      member_count: 0, // Begins at 0; auto-join trigger increments to 1
    }]).select().single();
    
    if (error || !data) {
      reelToast.error('Failed to create lounge.');
      return null;
    }
    
    // Auto-join
    await supabase.from('lounge_members').insert([{
      lounge_id: data.id,
      user_id: user.id,
    }]);
    
    await get().fetchLounges();
    return data.id;
  },

  joinLounge: async (inviteCode) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    const { data: lounge } = await supabase
      .from('lounges')
      .select('id')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();
    
    if (!lounge) {
      reelToast.error('Invalid invite code.');
      return false;
    }
    
    const { error } = await supabase.from('lounge_members').insert([{
      lounge_id: lounge.id,
      user_id: user.id,
    }]);
    
    if (error && !error.message?.includes('duplicate')) {
      reelToast.error('Failed to join lounge.');
      return false;
    }
    
    await get().fetchLounges();
    return true;
  },

  joinLoungeById: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return false;
    
    const { error } = await supabase.from('lounge_members').insert([{
      lounge_id: loungeId,
      user_id: user.id,
    }]);
    
    if (error && !error.message?.includes('duplicate')) {
      reelToast.error('Failed to take a seat.');
      return false;
    }
    
    await get().fetchLounges();
    return true;
  },

  leaveLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    // Guard: Creator cannot leave their own lounge — they must delete it
    const lounge = get().lounges.find(l => l.id === loungeId);
    if (lounge && lounge.creator_id === user.id) {
        reelToast.error('You created this lounge. Delete it instead of leaving.');
        return;
    }

    // Optimistic removal
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));

    const { error } = await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id);

    if (error) {
      reelToast.error('Failed to leave — please try again.');
      await get().fetchLounges(); // Rollback by re-fetching
    }
  },

  deleteLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    // Optimistic removal
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    
    const { error } = await supabase.from('lounges').delete()
      .eq('id', loungeId)
      .eq('creator_id', user.id);
    
    if (error) {
      reelToast.error('Failed to incinerate lounge.');
      await get().fetchLounges(); // Revert
    }
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
          const msg = payload.new as RawLoungePayload;
          // Ignore our own optimistic messages (they're already rendered)
          const existing = get().currentMessages.find(m => m.id === msg.id);
          if (existing) return;

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
            created_at: msg.created_at,
          };

          // Find the exact optimistic message and replace it
          set(s => {
            const optMatch = s.currentMessages.find(
              m => m.id.startsWith('optimistic-') && m.user_id === msg.user_id && m.content === msg.content
            );
            
            const messagesWithoutOpt = s.currentMessages.filter(m => m.id !== optMatch?.id && m.id !== newMsg.id);
            
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
    await supabase
      .from('lounge_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id);
  },
}));

// F-10 FIX: Register cleanup handler for centralized logout
registerStoreReset(() => {
    useLoungeStore.setState({ lounges: [], currentMessages: [], currentLoungeId: null, loading: false, sending: false });
    // D-1 FIX: Purge profile cache to prevent cross-session PII leakage
    _profileCache.clear();
});
