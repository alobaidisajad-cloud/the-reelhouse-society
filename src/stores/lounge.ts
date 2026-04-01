import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'

// ── TYPES ──
export interface Lounge {
    id: string
    name: string
    description: string
    creator_id: string
    creator_username?: string
    is_private: boolean
    invite_code: string | null
    cover_image: string | null
    member_count: number
    max_members: number
    created_at: string
    last_message?: {
        content: string
        username: string
        created_at: string
    }
}

export interface LoungeMessage {
    id: string
    lounge_id: string
    user_id: string
    username: string
    avatar_url?: string
    content: string
    type: 'text' | 'film_share' | 'log_share' | 'person_share' | 'list_share'
    metadata: Record<string, any>
    created_at: string
    reply_to_id?: string | null
    reply_to_content?: string | null
    reply_to_username?: string | null
}

export interface LoungeStoreState {
    myLounges: Lounge[]
    publicLounges: Lounge[]
    activeLounge: Lounge | null
    messages: LoungeMessage[]
    unreadCounts: Record<string, number>
    isLoading: boolean
    isSending: boolean
    hasMoreMessages: boolean

    fetchMyLounges: () => Promise<void>
    fetchPublicLounges: () => Promise<void>
    createLounge: (data: { name: string; description: string; isPrivate: boolean; coverImage?: string }) => Promise<string | null>
    joinLounge: (loungeId: string) => Promise<void>
    joinByInviteCode: (code: string) => Promise<string | null>
    leaveLounge: (loungeId: string) => Promise<void>
    openLounge: (loungeId: string) => Promise<void>
    closeLounge: () => void
    sendMessage: (content: string, type?: LoungeMessage['type'], metadata?: Record<string, any>, replyTo?: { id: string; content: string; username: string } | null) => Promise<void>
    deleteMessage: (messageId: string) => Promise<void>
    markAsRead: (loungeId: string) => Promise<void>
    fetchUnreadCounts: () => Promise<void>
    loadMoreMessages: () => Promise<void>
    updateLounge: (loungeId: string, updates: { name?: string; description?: string; is_private?: boolean }) => Promise<void>
    kickMember: (loungeId: string, userId: string) => Promise<void>
    fetchMembers: (loungeId: string) => Promise<Array<{ user_id: string; username: string; avatar_url: string | null; joined_at: string }>>
    subscribeToGlobalNotifications: () => () => void
}

// ── Realtime channel reference ──
let _activeChannel: any = null
const PAGE_SIZE = 50

function generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
}

export const useLoungeStore = create<LoungeStoreState>()((set, get) => ({
    myLounges: [],
    publicLounges: [],
    activeLounge: null,
    messages: [],
    unreadCounts: {},
    isLoading: false,
    isSending: false,
    hasMoreMessages: true,

    fetchMyLounges: async () => {
        const user = useAuthStore.getState().user
        if (!user) return

        const { data: memberships } = await supabase
            .from('lounge_members')
            .select('lounge_id, last_read_at')
            .eq('user_id', user.id)

        if (!memberships?.length) { set({ myLounges: [] }); return }

        const loungeIds = memberships.map(m => m.lounge_id)
        const { data: lounges } = await supabase
            .from('lounges')
            .select('*, profiles!lounges_creator_id_fkey(username)')
            .in('id', loungeIds)
            .order('created_at', { ascending: false })

        if (!lounges) return

        // Fetch latest message for each lounge
        const enriched = await Promise.all(lounges.map(async (l: any) => {
            const { data: lastMsg } = await supabase
                .from('lounge_messages')
                .select('content, created_at, profiles!lounge_messages_user_id_fkey(username)')
                .eq('lounge_id', l.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            return {
                ...l,
                creator_username: l.profiles?.username,
                last_message: lastMsg ? {
                    content: lastMsg.content,
                    username: (lastMsg as any).profiles?.username || 'Unknown',
                    created_at: lastMsg.created_at,
                } : undefined,
            }
        }))

        // Sort by last message time (most recent first)
        enriched.sort((a, b) => {
            const aTime = a.last_message?.created_at || a.created_at
            const bTime = b.last_message?.created_at || b.created_at
            return new Date(bTime).getTime() - new Date(aTime).getTime()
        })

        set({ myLounges: enriched })
    },

    fetchPublicLounges: async () => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Get user's joined lounge IDs to exclude them
        const { data: memberships } = await supabase
            .from('lounge_members')
            .select('lounge_id')
            .eq('user_id', user.id)

        const joinedIds = memberships?.map(m => m.lounge_id) || []

        let query = supabase
            .from('lounges')
            .select('*, profiles!lounges_creator_id_fkey(username)')
            .eq('is_private', false)
            .order('member_count', { ascending: false })
            .limit(50)

        if (joinedIds.length > 0) {
            // Filter out already-joined lounges
            // Supabase doesn't support NOT IN directly, we'll filter client-side
        }

        const { data } = await query
        if (!data) return

        const filtered = data.filter((l: any) => !joinedIds.includes(l.id))
        set({
            publicLounges: filtered.map((l: any) => ({
                ...l,
                creator_username: l.profiles?.username,
            }))
        })
    },

    createLounge: async ({ name, description, isPrivate, coverImage }) => {
        const user = useAuthStore.getState().user
        if (!user) return null

        const invite_code = isPrivate ? generateInviteCode() : null

        const { data, error } = await supabase
            .from('lounges')
            .insert([{
                name,
                description,
                creator_id: user.id,
                is_private: isPrivate,
                invite_code,
                cover_image: coverImage || null,
                member_count: 1,
            }])
            .select()
            .single()

        if (error || !data) return null

        // Auto-join the creator
        await supabase.from('lounge_members').insert([{
            lounge_id: data.id,
            user_id: user.id,
        }])

        // Refresh lists
        await get().fetchMyLounges()

        return data.id
    },

    joinLounge: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        await supabase.from('lounge_members').insert([{
            lounge_id: loungeId,
            user_id: user.id,
        }])

        // Increment member count
        const { data: currentLounge } = await supabase
            .from('lounges')
            .select('member_count')
            .eq('id', loungeId)
            .single()

        if (currentLounge) {
            await supabase.from('lounges')
                .update({ member_count: (currentLounge.member_count || 0) + 1 })
                .eq('id', loungeId)
        }

        await get().fetchMyLounges()
        await get().fetchPublicLounges()
    },

    joinByInviteCode: async (code) => {
        const { data: lounge } = await supabase
            .from('lounges')
            .select('id')
            .eq('invite_code', code.toUpperCase())
            .single()

        if (!lounge) return null

        await get().joinLounge(lounge.id)
        return lounge.id
    },

    leaveLounge: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Silent leave — no system message
        await supabase.from('lounge_members')
            .delete()
            .eq('lounge_id', loungeId)
            .eq('user_id', user.id)

        // Decrement member count
        const { data: lounge } = await supabase
            .from('lounges')
            .select('member_count')
            .eq('id', loungeId)
            .single()

        if (lounge) {
            await supabase.from('lounges')
                .update({ member_count: Math.max(0, (lounge.member_count || 1) - 1) })
                .eq('id', loungeId)
        }

        // Remove from local state
        set(s => ({
            myLounges: s.myLounges.filter(l => l.id !== loungeId),
            activeLounge: s.activeLounge?.id === loungeId ? null : s.activeLounge,
        }))
    },

    openLounge: async (loungeId) => {
        set({ isLoading: true, messages: [], hasMoreMessages: true })

        // Fetch lounge details
        const { data: lounge } = await supabase
            .from('lounges')
            .select('*, profiles!lounges_creator_id_fkey(username)')
            .eq('id', loungeId)
            .single()

        if (!lounge) { set({ isLoading: false }); return }

        // Fetch initial messages
        const { data: msgs } = await supabase
            .from('lounge_messages')
            .select('*, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', loungeId)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

        const messages: LoungeMessage[] = (msgs || []).reverse().map((m: any) => ({
            id: m.id,
            lounge_id: m.lounge_id,
            user_id: m.user_id,
            username: m.profiles?.username || 'Unknown',
            avatar_url: m.profiles?.avatar_url,
            content: m.content,
            type: m.type || 'text',
            metadata: m.metadata || {},
            created_at: m.created_at,
            reply_to_id: m.reply_to_id || null,
            reply_to_content: m.reply_to_content || null,
            reply_to_username: m.reply_to_username || null,
        }))

        set({
            activeLounge: { ...lounge, creator_username: (lounge as any).profiles?.username },
            messages,
            isLoading: false,
            hasMoreMessages: (msgs || []).length === PAGE_SIZE,
        })

        // Mark as read
        get().markAsRead(loungeId)

        // ── Subscribe to Realtime ──
        if (_activeChannel) {
            supabase.removeChannel(_activeChannel)
            _activeChannel = null
        }

        _activeChannel = supabase
            .channel(`lounge:${loungeId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'lounge_messages',
                filter: `lounge_id=eq.${loungeId}`,
            }, async (payload: any) => {
                const currentUserId = useAuthStore.getState().user?.id
                // Fetch the profile for the new message
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', payload.new.user_id)
                    .single()

                const newMsg: LoungeMessage = {
                    id: payload.new.id,
                    lounge_id: payload.new.lounge_id,
                    user_id: payload.new.user_id,
                    username: profile?.username || 'Unknown',
                    avatar_url: profile?.avatar_url,
                    content: payload.new.content,
                    type: payload.new.type || 'text',
                    metadata: payload.new.metadata || {},
                    created_at: payload.new.created_at,
                    reply_to_id: payload.new.reply_to_id || null,
                    reply_to_content: payload.new.reply_to_content || null,
                    reply_to_username: payload.new.reply_to_username || null,
                }

                // Don't duplicate messages we sent ourselves (optimistic)
                set(s => {
                    if (s.messages.some(m => m.id === newMsg.id)) return s
                    return { messages: [...s.messages, newMsg] }
                })

                // Auto mark as read since we're in the lounge
                if (payload.new.user_id !== currentUserId) {
                    get().markAsRead(loungeId)
                }
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'lounge_messages',
                filter: `lounge_id=eq.${loungeId}`,
            }, (payload: any) => {
                set(s => ({
                    messages: s.messages.filter(m => m.id !== payload.old.id)
                }))
            })
            .subscribe()
    },

    closeLounge: () => {
        if (_activeChannel) {
            supabase.removeChannel(_activeChannel)
            _activeChannel = null
        }
        set({ activeLounge: null, messages: [] })
    },

    sendMessage: async (content, type = 'text', metadata = {}, replyTo = null) => {
        const user = useAuthStore.getState().user
        const loungeId = get().activeLounge?.id
        if (!user || !loungeId || !content.trim()) return

        set({ isSending: true })

        // Optimistic insert
        const optimisticId = `temp-${Date.now()}`
        const optimistic: LoungeMessage = {
            id: optimisticId,
            lounge_id: loungeId,
            user_id: user.id,
            username: user.username || 'You',
            avatar_url: user.avatar_url,
            content: content.trim(),
            type,
            metadata,
            created_at: new Date().toISOString(),
            reply_to_id: replyTo?.id || null,
            reply_to_content: replyTo?.content || null,
            reply_to_username: replyTo?.username || null,
        }
        set(s => ({ messages: [...s.messages, optimistic] }))

        const { data, error } = await supabase
            .from('lounge_messages')
            .insert([{
                lounge_id: loungeId,
                user_id: user.id,
                content: content.trim(),
                type,
                metadata,
                reply_to_id: replyTo?.id || null,
                reply_to_content: replyTo?.content?.slice(0, 200) || null,
                reply_to_username: replyTo?.username || null,
            }])
            .select()
            .single()

        if (error) {
            // Remove optimistic on failure
            set(s => ({ messages: s.messages.filter(m => m.id !== optimisticId) }))
        } else if (data) {
            // Replace optimistic with real message
            set(s => ({
                messages: s.messages.map(m => m.id === optimisticId ? { ...optimistic, id: data.id, created_at: data.created_at } : m)
            }))
        }

        set({ isSending: false })
    },

    deleteMessage: async (messageId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Optimistic removal
        set(s => ({ messages: s.messages.filter(m => m.id !== messageId) }))

        await supabase
            .from('lounge_messages')
            .delete()
            .eq('id', messageId)
            .eq('user_id', user.id) // Only delete own messages
    },

    markAsRead: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        await supabase
            .from('lounge_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('lounge_id', loungeId)
            .eq('user_id', user.id)

        set(s => ({
            unreadCounts: { ...s.unreadCounts, [loungeId]: 0 }
        }))
    },

    fetchUnreadCounts: async () => {
        const user = useAuthStore.getState().user
        if (!user) return

        const { data } = await supabase.rpc('get_lounge_unread_counts', {
            p_user_id: user.id,
        })

        if (data) {
            const counts: Record<string, number> = {}
            data.forEach((r: any) => { counts[r.lounge_id] = r.unread_count })
            set({ unreadCounts: counts })
        }
    },

    loadMoreMessages: async () => {
        const { activeLounge, messages, hasMoreMessages } = get()
        if (!activeLounge || !hasMoreMessages || messages.length === 0) return

        const oldestMessage = messages[0]

        const { data: olderMsgs } = await supabase
            .from('lounge_messages')
            .select('*, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', activeLounge.id)
            .lt('created_at', oldestMessage.created_at)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

        if (!olderMsgs || olderMsgs.length === 0) {
            set({ hasMoreMessages: false })
            return
        }

        const mapped: LoungeMessage[] = olderMsgs.reverse().map((m: any) => ({
            id: m.id,
            lounge_id: m.lounge_id,
            user_id: m.user_id,
            username: m.profiles?.username || 'Unknown',
            avatar_url: m.profiles?.avatar_url,
            content: m.content,
            type: m.type || 'text',
            metadata: m.metadata || {},
            created_at: m.created_at,
            reply_to_id: m.reply_to_id || null,
            reply_to_content: m.reply_to_content || null,
            reply_to_username: m.reply_to_username || null,
        }))

        set(s => ({
            messages: [...mapped, ...s.messages],
            hasMoreMessages: olderMsgs.length === PAGE_SIZE,
        }))
    },

    updateLounge: async (loungeId, updates) => {
        const user = useAuthStore.getState().user
        if (!user) return

        await supabase
            .from('lounges')
            .update(updates)
            .eq('id', loungeId)
            .eq('creator_id', user.id) // Only creator can update

        // If toggling private, generate invite code
        if (updates.is_private === true) {
            const { data: existing } = await supabase.from('lounges').select('invite_code').eq('id', loungeId).single()
            if (!existing?.invite_code) {
                await supabase.from('lounges').update({ invite_code: generateInviteCode() }).eq('id', loungeId)
            }
        } else if (updates.is_private === false) {
            await supabase.from('lounges').update({ invite_code: null }).eq('id', loungeId)
        }

        set(s => ({
            activeLounge: s.activeLounge?.id === loungeId
                ? { ...s.activeLounge, ...updates }
                : s.activeLounge,
            myLounges: s.myLounges.map(l => l.id === loungeId ? { ...l, ...updates } : l),
        }))
    },

    kickMember: async (loungeId, userId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Verify caller is creator
        const lounge = get().myLounges.find(l => l.id === loungeId) || get().activeLounge
        if (lounge?.creator_id !== user.id) return

        await supabase.from('lounge_members')
            .delete()
            .eq('lounge_id', loungeId)
            .eq('user_id', userId)

        // Decrement member count
        if (lounge) {
            await supabase.from('lounges')
                .update({ member_count: Math.max(0, (lounge.member_count || 1) - 1) })
                .eq('id', loungeId)
        }
    },

    fetchMembers: async (loungeId) => {
        const { data } = await supabase
            .from('lounge_members')
            .select('user_id, joined_at, profiles!lounge_members_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', loungeId)
            .order('joined_at', { ascending: true })

        if (!data) return []
        return data.map((m: any) => ({
            user_id: m.user_id,
            username: m.profiles?.username || 'Unknown',
            avatar_url: m.profiles?.avatar_url || null,
            joined_at: m.joined_at,
        }))
    },

    subscribeToGlobalNotifications: () => {
        const user = useAuthStore.getState().user
        if (!user) return () => {}

        // Subscribe to all messages across joined lounges
        const channel = supabase
            .channel('lounge-notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'lounge_messages',
            }, async (payload: any) => {
                // Skip own messages
                if (payload.new.user_id === user.id) return

                // Check if we're a member of this lounge
                const { activeLounge } = get()
                if (activeLounge?.id === payload.new.lounge_id) return // Already in the room

                // Update unread count
                set(s => ({
                    unreadCounts: {
                        ...s.unreadCounts,
                        [payload.new.lounge_id]: (s.unreadCounts[payload.new.lounge_id] || 0) + 1,
                    }
                }))

                // Browser notification if page not focused
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', payload.new.user_id)
                        .single()

                    const { data: lounge } = await supabase
                        .from('lounges')
                        .select('name')
                        .eq('id', payload.new.lounge_id)
                        .single()

                    new Notification(lounge?.name || 'The Lounge', {
                        body: `${profile?.username || 'Someone'}: ${payload.new.content?.slice(0, 80) || 'Shared something'}`,
                        icon: '/reelhouse-logo.svg',
                        tag: payload.new.lounge_id, // Deduplicate per lounge
                    })
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    },
}))
