/**
 * useBatchReactions — Batch-fetches reactions for multiple logs in a single query (Mobile Parity).
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the N+1 query pattern where each ReactionBar independently fetches
 * its own reactions. Instead, the parent component fetches all reactions for
 * all visible logs in ONE query, and each ReactionBar reads from the cache.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type ReactionMap = Record<string, Record<string, string[]>>

export function useBatchReactions(logIds: string[]) {
    const [reactionsMap, setReactionsMap] = useState<ReactionMap>({})
    const [loading, setLoading] = useState(false)
    const prevIdsRef = useRef<string>('')

    const fetchAll = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return

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

    useEffect(() => {
        const key = logIds.sort().join(',')
        if (key === prevIdsRef.current || logIds.length === 0) return
        prevIdsRef.current = key
        fetchAll(logIds)
    }, [logIds, fetchAll])

    const refreshReactions = useCallback(() => {
        if (logIds.length > 0) fetchAll(logIds)
    }, [logIds, fetchAll])

    return { reactionsMap, loading, refreshReactions }
}
