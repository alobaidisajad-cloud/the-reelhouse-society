import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'
import { cutChars } from '../utils/cutChars'
import reelToast from '../utils/reelToast'

/**
 * The author of a message, when the author may be gone.
 *
 * Deleting an account nulls user_id on shared content and keeps the words — so a
 * lounge message can outlive the person who wrote it. Two different situations
 * used to collapse into the same word:
 *
 *   user_id null        -> they deleted their account. A settled fact.
 *   user_id set, no row -> the profile did not load. Transient.
 *
 * Both rendered as "Unknown", which reads like a bug in the second case and like
 * a lie in the first. Worse, the name is wrapped in a link, so clicking a
 * departed member sent you to /user/Unknown — a broken profile page presented as
 * a working one. `linkable` is false when there is nobody to link to.
 */
export function authorOf(userId: string | null | undefined, username?: string | null) {
    if (!userId) return { username: '[deleted]', linkable: false };
    return { username: username || 'Unknown', linkable: Boolean(username) };
}


// ── TYPES ──
export type MembershipStatus = 'approved' | 'pending' | 'muted' | 'banned'

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
    /** True only for an approved seat: the one the house lets post. */
    is_member?: boolean
    /** The member's row in the room, as the house keeps it; null when they have none. */
    membership_status?: MembershipStatus | null
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
    type: 'text' | 'film_share' | 'log_share' | 'person_share' | 'list_share' | 'dossier_share'
    metadata: Record<string, unknown>
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
    searchQuery: string
    /** The last read of each list failed: an empty list then is unknown, not empty. */
    myLoungesFailed: boolean
    publicLoungesFailed: boolean
    /** The last open failed: no room is shown, and it is not "not found". */
    openFailed: boolean

    setSearchQuery: (query: string) => void
    fetchMyLounges: () => Promise<void>
    fetchPublicLounges: () => Promise<void>
    createLounge: (data: { name: string; description: string; isPrivate: boolean }) => Promise<string | null>
    joinLounge: (loungeId: string) => Promise<void>
    joinByInviteCode: (code: string) => Promise<string | null>
    leaveLounge: (loungeId: string) => Promise<void>
    openLounge: (loungeId: string) => Promise<void>
    closeLounge: () => void
    _subscribeToLounge: (loungeId: string) => void
    pauseRealtime: () => void
    resumeRealtime: () => Promise<void>
    sendMessage: (content: string, type?: LoungeMessage['type'], metadata?: Record<string, unknown>, replyTo?: { id: string; content: string; username: string } | null) => Promise<void>
    deleteMessage: (messageId: string) => Promise<void>
    markAsRead: (loungeId: string) => Promise<void>
    fetchUnreadCounts: () => Promise<void>
    loadMoreMessages: () => Promise<void>
    updateLounge: (loungeId: string, updates: { name?: string; description?: string; is_private?: boolean }) => Promise<void>
    kickMember: (loungeId: string, userId: string) => Promise<void>
    fetchMembers: (loungeId: string) => Promise<Array<{ user_id: string; username: string; avatar_url: string | null; joined_at: string }>>
    subscribeToGlobalNotifications: () => () => void
    deleteLounge: (loungeId: string) => Promise<void>
}

// ── Realtime channel reference ──
let _activeChannel: ReturnType<typeof supabase.channel> | null = null
const _messageThrottles = new Map<string, number>()
const PAGE_SIZE = 50

/**
 * Tells the member a read or write failed. supabase-js resolves a failure as
 * `{ error }` rather than throwing, so each caller reads it and keeps what the
 * screen already shows: a failed read is never taken for "none".
 */
function reportFailure(message: string, error: unknown) {
    console.error(`[Lounge] ${message}`, error)
    reelToast.error(message, { id: message })
}

// generateInviteCode() removed with the invite-code feature.
//
// Mobile retired codes in the Editorial Salon overhaul — a private room is
// gated by the request/admit flow, not a shared secret — and web was the only
// caller still minting them. They were a second, weaker door that bypassed the
// host's approval, and `secure_invite_codes` (the server-side validation that
// would have made them safe) was scoped as Phase 5.3 and never built.
//
// They were also readable by anyone holding the app's public anon key until the
// lounges SELECT policy was scoped from {public} to {authenticated}.

export const useLoungeStore = create<LoungeStoreState>()((set, get) => ({
    myLounges: [],
    publicLounges: [],
    activeLounge: null,
    messages: [],
    unreadCounts: {},
    isLoading: false,
    isSending: false,
    hasMoreMessages: true,
    searchQuery: '',
    myLoungesFailed: false,
    publicLoungesFailed: false,
    openFailed: false,

    setSearchQuery: (query) => set({ searchQuery: query }),

    fetchMyLounges: async () => {
        const user = useAuthStore.getState().user
        if (!user) return

        const { data: memberships, error: membershipsError } = await supabase
            .from('lounge_members')
            .select('lounge_id, last_read_at, status')
            .eq('user_id', user.id)

        if (membershipsError) { set({ myLoungesFailed: true }); reportFailure('Your lounges could not be loaded. Please try again.', membershipsError); return }
        if (!memberships?.length) { set({ myLounges: [], myLoungesFailed: false }); return }

        const loungeIds = memberships.map(m => m.lounge_id)
        const { data: lounges, error: loungesError } = await supabase
            .from('lounges')
            .select('*, profiles!lounges_creator_id_fkey(username)')
            .in('id', loungeIds)
            .order('created_at', { ascending: false })

        if (loungesError) { set({ myLoungesFailed: true }); reportFailure('Your lounges could not be loaded. Please try again.', loungesError); return }
        if (!lounges) return

        // Each room carries the member's seat: a request still with the host is not a room they are in
        const statusOf = new Map(memberships.map(m => [m.lounge_id, (m.status as MembershipStatus | null) ?? null]))
        const seat = (id: string) => {
            const membership_status = statusOf.get(id) ?? null
            return { membership_status, is_member: membership_status === 'approved' }
        }

        // Fetch latest message for each lounge; one that fails keeps the one already shown
        const held = get().myLounges
        let previewError: unknown = null
        const enriched = await Promise.all(lounges.map(async (l) => {
            const { data: lastMsg, error: lastMsgError } = await supabase
                .from('lounge_messages')
                .select('content, created_at, profiles!lounge_messages_user_id_fkey(username)')
                .eq('lounge_id', l.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (lastMsgError) {
                previewError = lastMsgError
                return { ...l, ...seat(l.id), creator_username: l.profiles?.username, last_message: held.find(h => h.id === l.id)?.last_message }
            }

            const parsedLastMsg = lastMsg as { content: string; created_at: string; profiles?: { username: string } } | null

            return {
                ...l,
                ...seat(l.id),
                creator_username: l.profiles?.username,
                last_message: parsedLastMsg ? {
                    content: parsedLastMsg.content,
                    username: parsedLastMsg.profiles?.username || 'Unknown',
                    created_at: parsedLastMsg.created_at,
                } : undefined,
            }
        }))
        if (previewError) reportFailure('The latest messages could not be loaded. Please try again.', previewError)

        // Sort by last message time (most recent first)
        enriched.sort((a, b) => {
            const aTime = a.last_message?.created_at || a.created_at
            const bTime = b.last_message?.created_at || b.created_at
            return new Date(bTime).getTime() - new Date(aTime).getTime()
        })

        set({ myLounges: enriched, myLoungesFailed: false })
    },

    fetchPublicLounges: async () => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Get user's joined lounge IDs to exclude them
        const { data: memberships, error: membershipsError } = await supabase
            .from('lounge_members')
            .select('lounge_id')
            .eq('user_id', user.id)

        // without them, every lounge already joined would be offered again
        if (membershipsError) { set({ publicLoungesFailed: true }); reportFailure('Public lounges could not be loaded. Please try again.', membershipsError); return }

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

        const { data, error } = await query
        if (error) { set({ publicLoungesFailed: true }); reportFailure('Public lounges could not be loaded. Please try again.', error); return }
        if (!data) return

        const filtered = data.filter((l) => !joinedIds.includes(l.id))
        set({
            publicLounges: filtered.map((l) => ({
                ...l,
                creator_username: l.profiles?.username,
            })),
            publicLoungesFailed: false,
        })
    },

    createLounge: async ({ name, description, isPrivate }) => {
        const user = useAuthStore.getState().user
        if (!user) return null

        // The house opens the room and seats its creator in one step, as the app
        // does: a member may not write a seat into lounge_members directly.
        const { data: loungeId, error } = await supabase.rpc('create_lounge', {
            p_name: name,
            p_description: description,
            p_is_private: isPrivate,
        })

        if (error || !loungeId) {
            console.error('[Lounge] Create failed:', error)
            return null
        }

        // Refresh lists
        await get().fetchMyLounges()

        return loungeId as string
    },

    joinLounge: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // A public room seats the member; a private one sends their request to the host.
        const { activeLounge, publicLounges, myLounges } = get()
        const room = [activeLounge, ...publicLounges, ...myLounges].find(l => l?.id === loungeId)
        const { error } = room?.is_private
            ? await supabase.rpc('request_lounge_membership', { p_lounge_id: loungeId })
            : await supabase.rpc('join_public_lounge', { p_lounge_id: loungeId })
        if (error) {
            reportFailure(room?.is_private ? 'Could not send your request. Please try again.' : 'Could not take a seat. Please try again.', error)
            throw error
        }

        // Rely on trigger_sync_lounge_member_count for member_count

        await get().fetchMyLounges()
        await get().fetchPublicLounges()
    },

    // Retired. This was the redemption half of the invite-code feature: look a
    // salon up by its shared secret and join it, bypassing the host's approval
    // entirely. Kept as a no-op rather than deleted from the interface so any
    // caller still wired to it fails closed — returning null, which its callers
    // already handle as "no such code" — instead of throwing.
    joinByInviteCode: async (_code) => {
        return null
    },

    leaveLounge: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Silent leave — no system message
        const { error } = await supabase.from('lounge_members')
            .delete()
            .eq('lounge_id', loungeId)
            .eq('user_id', user.id)
        if (error) { reportFailure('Could not leave this lounge. Please try again.', error); throw error }

        // Rely on trigger_sync_lounge_member_count for member_count

        // Remove from local state
        set(s => ({
            myLounges: s.myLounges.filter(l => l.id !== loungeId),
            activeLounge: s.activeLounge?.id === loungeId ? null : s.activeLounge,
        }))
    },

    openLounge: async (loungeId) => {
        // A failed open puts back what was shown and throws, so a caller never
        // goes on to act in a room that did not open.
        const { messages: shown, hasMoreMessages: hadMore } = get()
        const failed = (error: unknown) => {
            set({ isLoading: false, messages: shown, hasMoreMessages: hadMore, openFailed: true })
            reportFailure('This lounge could not be opened. Please try again.', error)
            return error
        }
        set({ isLoading: true, messages: [], hasMoreMessages: true, openFailed: false })

        // Fetch lounge details
        const { data: lounge, error: loungeError } = await supabase
            .from('lounges')
            .select('*, profiles!lounges_creator_id_fkey(username)')
            .eq('id', loungeId)
            .maybeSingle()

        if (loungeError) throw failed(loungeError)
        if (!lounge) { set({ isLoading: false }); return }

        // The member's seat: only an approved one may post (the house's send rule)
        const user = useAuthStore.getState().user
        let membership_status: MembershipStatus | null = null
        if (user) {
            const { data: memberCheck, error: memberError } = await supabase
                .from('lounge_members')
                .select('status')
                .eq('lounge_id', loungeId)
                .eq('user_id', user.id)
                .maybeSingle()
            if (memberError) throw failed(memberError)
            membership_status = (memberCheck?.status as MembershipStatus | undefined) ?? null
        }
        const is_member = membership_status === 'approved'

        // Fetch initial messages
        const { data: msgs, error: msgsError } = await supabase
            .from('lounge_messages')
            .select('*, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', loungeId)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

        if (msgsError) throw failed(msgsError)

        const messages: LoungeMessage[] = (msgs || []).reverse().map((m: { id: string, lounge_id: string, user_id: string, content: string, type: LoungeMessage['type'], metadata: Record<string, unknown>, created_at: string, reply_to_id: string | null, reply_to_content: string | null, reply_to_username: string | null, profiles?: { username: string, avatar_url: string } }) => ({
            id: m.id,
            lounge_id: m.lounge_id,
            user_id: m.user_id,
            username: authorOf(m.user_id, m.profiles?.username).username,
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
            activeLounge: { ...lounge, creator_username: (lounge as { profiles?: { username?: string } }).profiles?.username, is_member, membership_status },
            messages,
            isLoading: false,
            hasMoreMessages: (msgs || []).length === PAGE_SIZE,
        })

        // Mark as read
        get().markAsRead(loungeId)

        get()._subscribeToLounge(loungeId)
    },

    _subscribeToLounge: (loungeId) => {
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
            }, async (payload: { new: { id: string, lounge_id: string, user_id: string, content: string, type?: LoungeMessage['type'], metadata?: Record<string, unknown>, created_at: string, reply_to_id?: string | null, reply_to_content?: string | null, reply_to_username?: string | null } }) => {
                const currentUserId = useAuthStore.getState().user?.id
                // Fetch the profile for the new message
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', payload.new.user_id)
                    .single()
                // A profile that did not load takes the name this author already shows in the room
                const known = profileError ? get().messages.find(m => m.user_id === payload.new.user_id) : undefined

                const newMsg: LoungeMessage = {
                    id: payload.new.id,
                    lounge_id: payload.new.lounge_id,
                    user_id: payload.new.user_id,
                    username: authorOf(payload.new.user_id, profile?.username ?? known?.username).username,
                    avatar_url: profile?.avatar_url ?? known?.avatar_url,
                    content: payload.new.content,
                    type: payload.new.type || 'text',
                    metadata: payload.new.metadata || {},
                    created_at: payload.new.created_at,
                    reply_to_id: payload.new.reply_to_id || null,
                    reply_to_content: payload.new.reply_to_content || null,
                    reply_to_username: payload.new.reply_to_username || null,
                }

                // Bi-directional deterministic sync (solves race conditions)
                set(s => {
                    // If REST arrived first, it's already here
                    if (s.messages.some(m => m.id === newMsg.id)) return s
                    
                    // If WS arrives first, replace the optimistic "temp" payload
                    const filtered = s.messages.filter(m => 
                        !(m.id.startsWith('temp-') && m.user_id === newMsg.user_id && m.content === newMsg.content && m.type === newMsg.type)
                    )
                    
                    const next = [...filtered, newMsg]
                    // Cap in-memory messages to prevent unbounded growth
                    return { messages: next.length > 500 ? next.slice(-500) : next }
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
        set({ activeLounge: null, messages: [], openFailed: false })
    },

    pauseRealtime: () => {
        if (_activeChannel) {
            supabase.removeChannel(_activeChannel)
            _activeChannel = null
            console.log('[Lounge] Realtime paused to conserve bandwidth.')
        }
    },

    resumeRealtime: async () => {
        const { activeLounge, messages } = get()
        if (!activeLounge) return

        console.log('[Lounge] Resuming Realtime...')
        
        // Fetch any messages we missed while asleep
        const lastKnownMessageDate = messages.length > 0 ? messages[messages.length - 1].created_at : new Date(0).toISOString()
        
        const { data: missedMsgs, error: missedError } = await supabase
            .from('lounge_messages')
            .select('*, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', activeLounge.id)
            .gt('created_at', lastKnownMessageDate)
            .order('created_at', { ascending: true })

        if (missedError) reportFailure('Messages sent while you were away could not be loaded. Reopen the lounge to see them.', missedError)

        if (missedMsgs && missedMsgs.length > 0) {
            const mappedMissed: LoungeMessage[] = missedMsgs.map((m: { id: string, lounge_id: string, user_id: string, content: string, type: LoungeMessage['type'], metadata: Record<string, unknown>, created_at: string, reply_to_id: string | null, reply_to_content: string | null, reply_to_username: string | null, profiles?: { username: string, avatar_url: string } }) => ({
                id: m.id,
                lounge_id: m.lounge_id,
                user_id: m.user_id,
                username: authorOf(m.user_id, m.profiles?.username).username,
                avatar_url: m.profiles?.avatar_url,
                content: m.content,
                type: m.type || 'text',
                metadata: m.metadata || {},
                created_at: m.created_at,
                reply_to_id: m.reply_to_id || null,
                reply_to_content: m.reply_to_content || null,
                reply_to_username: m.reply_to_username || null,
            }))
            
            // Append and cap to 500
            set(s => {
                const next = [...s.messages, ...mappedMissed]
                return { messages: next.length > 500 ? next.slice(-500) : next }
            })
        }

        // Re-subscribe
        get()._subscribeToLounge(activeLounge.id)
    },

    sendMessage: async (content, type = 'text', metadata = {}, replyTo = null) => {
        const user = useAuthStore.getState().user
        const loungeId = get().activeLounge?.id
        if (!user || !loungeId || !content.trim()) return

        // ── Security: Chat Throttle to prevent Webhook/Realtime DoS ──
        const throttleKey = `lounge_send_${user.id}`
        const now = Date.now()
        const lastCall = _messageThrottles.get(throttleKey) || 0
        if (now - lastCall < 800) {
            return // Silently drop spam without triggering UI toast loops
        }
        _messageThrottles.set(throttleKey, now)
        // Occasional prune to prevent _messageThrottles map bloat over days of uptime
        if (_messageThrottles.size > 200) _messageThrottles.clear()

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
                reply_to_content: replyTo?.content ? cutChars(replyTo.content, 200) : null,
                reply_to_username: replyTo?.username || null,
            }])
            .select()
            .single()

        if (error) {
            // Remove optimistic on failure, and say so: a caller must not report it sent
            set(s => ({ messages: s.messages.filter(m => m.id !== optimisticId) }))
            set({ isSending: false })
            reportFailure('Your message could not be sent. Please try again.', error)
            throw error
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
        const removed = get().messages.find(m => m.id === messageId)
        set(s => ({ messages: s.messages.filter(m => m.id !== messageId) }))

        const { error } = await supabase
            .from('lounge_messages')
            .delete()
            .eq('id', messageId)
            .eq('user_id', user.id) // Only delete own messages

        if (error) {
            // Put it back in its place in time
            if (removed) {
                set(s => {
                    if (s.messages.some(m => m.id === messageId)) return s
                    const at = s.messages.findIndex(m => m.created_at > removed.created_at)
                    return { messages: at === -1 ? [...s.messages, removed] : [...s.messages.slice(0, at), removed, ...s.messages.slice(at)] }
                })
            }
            reportFailure('The message could not be deleted. Please try again.', error)
        }
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

        // The function takes no arguments: the member is the session. Asked with a
        // `p_user_id` it does not have, it was refused on every call, so the website
        // never showed a salon's unread count.
        const { data, error } = await supabase.rpc('get_lounge_unread_counts')
        // a read that failed keeps the counts already shown
        if (error || !data) return

        const counts: Record<string, number> = {}
        data.forEach((r: { lounge_id: string; unread_count: number | string }) => { counts[r.lounge_id] = Number(r.unread_count) || 0 })
        set({ unreadCounts: counts })
    },

    loadMoreMessages: async () => {
        const { activeLounge, messages, hasMoreMessages } = get()
        if (!activeLounge || !hasMoreMessages || messages.length === 0) return

        const oldestMessage = messages[0]

        const { data: olderMsgs, error } = await supabase
            .from('lounge_messages')
            .select('*, profiles!lounge_messages_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', activeLounge.id)
            .lt('created_at', oldestMessage.created_at)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE)

        // a failed read is not the beginning of the room: there may be more
        if (error) { reportFailure('Earlier messages could not be loaded. Please try again.', error); return }

        if (!olderMsgs || olderMsgs.length === 0) {
            set({ hasMoreMessages: false })
            return
        }

        const mapped: LoungeMessage[] = olderMsgs.reverse().map((m: { id: string, lounge_id: string, user_id: string, content: string, type: LoungeMessage['type'], metadata: Record<string, unknown>, created_at: string, reply_to_id: string | null, reply_to_content: string | null, reply_to_username: string | null, profiles?: { username: string, avatar_url: string } }) => ({
            id: m.id,
            lounge_id: m.lounge_id,
            user_id: m.user_id,
            username: authorOf(m.user_id, m.profiles?.username).username,
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

        const { error } = await supabase
            .from('lounges')
            .update(updates)
            .eq('id', loungeId)
            .eq('creator_id', user.id) // Only creator can update

        if (error) { reportFailure('The lounge could not be updated. Please try again.', error); throw error }

        set(s => {
            const newActive = s.activeLounge?.id === loungeId
                ? { ...s.activeLounge, ...updates }
                : s.activeLounge

            // Turning a salon private no longer mints a code. It used to
            // generate one here AND fire a second, unawaited write to
            // persist it — so a room could become private and hand out a
            // shared secret in the same action, with no error path if that
            // write failed. Privacy is the request/admit flow now.
            if (newActive) {
                newActive.invite_code = null
            }

            return {
                activeLounge: newActive as Lounge,
                myLounges: s.myLounges.map(l => l.id === loungeId ? { ...l, ...updates } : l),
                publicLounges: s.publicLounges.map(l => l.id === loungeId ? { ...l, ...updates } : l)
            }
        })
    },

    kickMember: async (loungeId, userId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Verify caller is creator
        const lounge = get().myLounges.find(l => l.id === loungeId) || get().activeLounge
        if (lounge?.creator_id !== user.id) return

        const { error } = await supabase.from('lounge_members')
            .delete()
            .eq('lounge_id', loungeId)
            .eq('user_id', userId)
        if (error) { reportFailure('Could not remove this member. Please try again.', error); throw error }

        // Rely on trigger_sync_lounge_member_count for member_count
    },

    deleteLounge: async (loungeId) => {
        const user = useAuthStore.getState().user
        if (!user) return

        // Verify caller is creator
        const lounge = get().myLounges.find(l => l.id === loungeId) || get().activeLounge
        if (lounge?.creator_id !== user.id) return

        const { error } = await supabase.from('lounges')
            .delete()
            .eq('id', loungeId)
        if (error) { reportFailure('The lounge could not be deleted. Please try again.', error); throw error }

        set(s => ({
            myLounges: s.myLounges.filter(l => l.id !== loungeId),
            publicLounges: s.publicLounges.filter(l => l.id !== loungeId),
            activeLounge: s.activeLounge?.id === loungeId ? null : s.activeLounge,
            messages: s.activeLounge?.id === loungeId ? [] : s.messages
        }))
    },

    fetchMembers: async (loungeId) => {
        const { data, error } = await supabase
            .from('lounge_members')
            .select('user_id, joined_at, profiles!lounge_members_user_id_fkey(username, avatar_url)')
            .eq('lounge_id', loungeId)
            .order('joined_at', { ascending: true })

        // a failed read is not an empty roster
        if (error) { reportFailure('Members could not be loaded. Please try again.', error); throw error }
        if (!data) return []
        return data.map((m: any) => ({
            user_id: m.user_id,
            username: authorOf(m.user_id, m.profiles?.username).username,
            avatar_url: m.profiles?.avatar_url || null,
            joined_at: m.joined_at,
        }))
    },

    subscribeToGlobalNotifications: () => {
        const user = useAuthStore.getState().user
        if (!user) return () => {}

        // Subscribe to messages — filtered client-side to user's joined lounges
        const channel = supabase
            .channel('lounge-notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'lounge_messages',
            }, async (payload: { new: { user_id: string; lounge_id: string; content?: string } }) => {
                // Skip own messages
                if (payload.new.user_id === user.id) return

                // Only process messages from lounges the user has joined
                const { myLounges, activeLounge } = get()
                const isJoinedLounge = myLounges.some(l => l.id === payload.new.lounge_id)
                if (!isJoinedLounge) return

                // Skip if user is already in the room viewing messages
                if (activeLounge?.id === payload.new.lounge_id) return

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

                    const { data: lounge, error: loungeError } = await supabase
                        .from('lounges')
                        .select('name')
                        .eq('id', payload.new.lounge_id)
                        .single()
                    // a name that did not load is the one already in the member's list
                    const heldName = loungeError ? myLounges.find(l => l.id === payload.new.lounge_id)?.name : undefined

                    new Notification(lounge?.name || heldName || 'The Lounge', {
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
