/**
 * useProfileAnalytics — a member's whole record, as the server counts it
 * (get_public_profile_analytics): the film count, the honours' and stamps'
 * counts, the DNA. The one source for every figure the profile prints about
 * a member's history; nothing is counted from the logs that happen to be loaded.
 *
 * `version` asks again when it changes: the member's own film count, so a film
 * just logged is in the next reading.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { ProfileAnalytics } from '../constants/honours'

export function useProfileAnalytics(userId: string | undefined, version?: number) {
    return useQuery({
        queryKey: ['profile-analytics', userId, version ?? 0],
        queryFn: async (): Promise<ProfileAnalytics> => {
            const { data, error } = await supabase.rpc('get_public_profile_analytics', { p_user_id: userId })
            if (error) throw error
            return (data ?? {}) as ProfileAnalytics
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5,
        // A new film keeps the last reading on screen until the next one lands;
        // another member's page never starts from this one's.
        placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === userId ? previous : undefined),
    })
}
