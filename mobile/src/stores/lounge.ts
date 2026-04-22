import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import { Alert } from 'react-native';

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
  type: 'text' | 'film_share' | 'log_share' | 'system';
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
  sendMessage: (loungeId: string, content: string, type?: string, meta?: Record<string, unknown>) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  createLounge: (name: string, description: string, isPrivate: boolean) => Promise<string | null>;
  joinLounge: (inviteCode: string) => Promise<boolean>;
  leaveLounge: (loungeId: string) => Promise<void>;
  subscribeToLounge: (loungeId: string) => () => void;
  markRead: (loungeId: string) => Promise<void>;
}

// ── Throttle ── (800ms between sends, matching web)
let _lastSendAt = 0;
const SEND_THROTTLE = 800;

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
        .select('lounge_id')
        .eq('user_id', user.id)
        .limit(100);

      const myLoungeIds = (memberRows ?? []).map(r => r.lounge_id);

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
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; description: string; is_private: boolean; invite_code: string | null; creator_id: string; created_at: string; member_count: number }> });

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

      const loungesList = Array.from(allLoungesMap.values());
      loungesList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Enrich — rooms the user owns or joined get unread_count = 0 (shows in "YOUR SCREENING ROOMS")
      const enriched: LoungeRoom[] = loungesList.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? '',
        is_private: l.is_private ?? false,
        invite_code: l.invite_code ?? null,
        creator_id: l.creator_id,
        created_at: l.created_at,
        member_count: l.member_count ?? 0,
        unread_count: ownedOrJoinedIds.has(l.id) ? 0 : undefined,
      }));

      set({ lounges: enriched, loading: false });
    } catch {
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
        .order('created_at', { ascending: true })
        .limit(100);

      if (data && !error) {
        const messages: LoungeMessage[] = data.map((m) => ({
          id: m.id,
          lounge_id: m.lounge_id,
          user_id: m.user_id,
          username: Array.isArray(m.profiles) ? m.profiles[0]?.username : m.profiles?.username ?? 'unknown',
          avatar_url: Array.isArray(m.profiles) ? m.profiles[0]?.avatar_url : m.profiles?.avatar_url,
          content: m.content,
          type: m.type ?? 'text',
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
    } catch { /* silent */ }
    set({ loading: false });
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
      const { error } = await supabase.from('lounge_messages').insert([{
        lounge_id: loungeId,
        user_id: user.id,
        content: content.trim().slice(0, 500).replace(/<[^>]*>/g, ''),
        type: safeType,
        ...meta,
      }]);
      if (error) throw error;
    } catch {
      // Remove optimistic message on failure
      set(s => ({
        currentMessages: s.currentMessages.filter(m => m.id !== optimisticMsg.id),
      }));
      Alert.alert('Error', 'Failed to send message.');
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
    
    const inviteCode = isPrivate
      ? Math.random().toString(36).slice(2, 8).toUpperCase()
      : null;
    
    const { data, error } = await supabase.from('lounges').insert([{
      name,
      description,
      is_private: isPrivate,
      invite_code: inviteCode,
      creator_id: user.id,
      member_count: 1,
    }]).select().single();
    
    if (error || !data) {
      Alert.alert('Error', 'Failed to create lounge.');
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
      Alert.alert('Error', 'Invalid invite code.');
      return false;
    }
    
    const { error } = await supabase.from('lounge_members').insert([{
      lounge_id: lounge.id,
      user_id: user.id,
    }]);
    
    if (error && !error.message?.includes('duplicate')) {
      Alert.alert('Error', 'Failed to join lounge.');
      return false;
    }
    
    await get().fetchLounges();
    return true;
  },

  leaveLounge: async (loungeId) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    await supabase.from('lounge_members').delete()
      .eq('lounge_id', loungeId)
      .eq('user_id', user.id);
    
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
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
          const msg = payload.new as Record<string, unknown>;
          // Ignore our own optimistic messages (they're already rendered)
          const existing = get().currentMessages.find(m => m.id === msg.id);
          if (existing) return;

          // Fetch username
          let username = 'unknown';
          let avatar_url: string | undefined;
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', msg.user_id)
            .single();
          if (profile) {
            username = profile.username;
            avatar_url = profile.avatar_url;
          }

          const newMsg: LoungeMessage = {
            id: msg.id,
            lounge_id: msg.lounge_id,
            user_id: msg.user_id,
            username,
            avatar_url,
            content: msg.content,
            type: msg.type ?? 'text',
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
            return {
              currentMessages: [
                ...s.currentMessages.filter(m => m.id !== optMatch?.id),
                newMsg,
              ],
            };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lounge_messages', filter: `lounge_id=eq.${loungeId}` },
        (payload) => {
          const deletedId = (payload.old as Record<string, unknown>)?.id as string | undefined;
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
