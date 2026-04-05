/**
 * useBatchReactions — Batch-fetches reactions for multiple logs in a single query.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the N+1 query pattern where each ReactionBar independently fetches
 * its own reactions. Instead, the parent component fetches all reactions for
 * all visible logs in ONE query, and each ReactionBar reads from the cache.
 *
 * Before: 20 logs on feed → 40 Supabase queries (20 interactions + 20 profiles)
 * After:  20 logs on feed → 2 Supabase queries (1 interactions + 1 profiles)
 *
 * Usage:
 *   const { reactionsMap, refreshReactions } = useBatchReactions(logIds)
 *   // Pass to each ReactionBar:
 *   <ReactionBar logId={log.id} cachedReactions={reactionsMap[log.id]} ... />
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

export type ReactionMap = Record<string, Record<string, string[]>>
// { logId: { emoji: [username, ...] } }

export function useBatchReactions(logIds: string[]) {
    const [reactionsMap, setReactionsMap] = useState<ReactionMap>({})
    const [loading, setLoading] = useState(false)
    const prevIdsRef = useRef<string>('')

    const fetchAll = useCallback(async (ids: string[]) => {
        if (!isSupabaseConfigured || ids.length === 0) return

        setLoading(true)
        try {
            // 1. Single query for ALL reactions across all visible logs
            const { data: interactionsData, error } = await supabase
                .from('interactions')
                .select('target_log_id, type, user_id')
                .in('target_log_id', ids)
                .like('type', 'react_%')

            if (error || !interactionsData) {
                setLoading(false)
                return
            }

            // 2. Single query to resolve ALL unique usernames
            const userIds = [...new Set(interactionsData.map(r => r.user_id).filter(Boolean))]
            let usernameMap: Record<string, string> = {}
            if (userIds.length > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', userIds)
                if (profilesData) {
                    usernameMap = Object.fromEntries(
                        profilesData.map((p: any) => [p.id, p.username])
                    )
                }
            }

            // 3. Group by logId → emoji → usernames
            const map: ReactionMap = {}
            // Initialize empty records for all requested IDs
            for (const id of ids) {
                map[id] = {}
            }
            for (const row of interactionsData) {
                const logId = row.target_log_id
                const emoji = row.type.replace('react_', '')
                const username = usernameMap[row.user_id] || 'anon'
                if (!map[logId]) map[logId] = {}
                if (!map[logId][emoji]) map[logId][emoji] = []
                map[logId][emoji].push(username)
            }

            setReactionsMap(map)
        } catch {
            // Non-critical — reactions will appear empty
        } finally {
            setLoading(false)
        }
    }, [])

    // Refetch when the set of visible logIds changes
    useEffect(() => {
        const key = logIds.sort().join(',')
        if (key === prevIdsRef.current || logIds.length === 0) return
        prevIdsRef.current = key
        fetchAll(logIds)
    }, [logIds, fetchAll])

    // Manual refresh (e.g., after adding a reaction)
    const refreshReactions = useCallback(() => {
        if (logIds.length > 0) fetchAll(logIds)
    }, [logIds, fetchAll])

    return { reactionsMap, loading, refreshReactions }
}
