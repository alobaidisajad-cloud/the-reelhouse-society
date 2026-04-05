/**
 * useStableSubscription — Manages Supabase realtime subscriptions with automatic cleanup.
 * ─────────────────────────────────────────────────────────────────────────────
 * Prevents memory leaks from orphaned realtime channels by:
 * 1. Tracking the channel reference
 * 2. Automatically unsubscribing on component unmount
 * 3. Preventing duplicate subscriptions on re-render
 *
 * Usage:
 *   useStableSubscription(
 *       'lounge_messages',
 *       (channel) => channel
 *           .on('postgres_changes', { event: 'INSERT', ... }, handleInsert)
 *           .subscribe(),
 *       { enabled: !!loungeId }
 *   )
 */

import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface SubscriptionOptions {
    /** Whether the subscription is enabled (default true) */
    enabled?: boolean
    /** Dependencies array — re-subscribes when these change */
    deps?: unknown[]
}

export function useStableSubscription(
    channelName: string,
    setup: (channel: RealtimeChannel) => RealtimeChannel,
    options: SubscriptionOptions = {}
) {
    const { enabled = true, deps = [] } = options
    const channelRef = useRef<RealtimeChannel | null>(null)

    useEffect(() => {
        if (!enabled || !isSupabaseConfigured) return

        // Clean up any existing subscription first
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }

        // Create and configure new channel
        const channel = supabase.channel(channelName)
        channelRef.current = setup(channel)

        // Cleanup on unmount or dependency change
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelName, enabled, ...deps])
}
