import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { useFilmStore, useAuthStore } from '../../store'
import { ReelRating, SectionHeader } from '../UI'

/** Community Reviews — fetches and displays reviews for a film from Supabase */
export default function CommunityReviews({ filmId }: { filmId: string | number }) {
    const { logs } = useFilmStore()
    const { user: authUser } = useAuthStore()
    // isPending, not isLoading: a read paused offline has not answered either.
    const { data: dbReviews, isError, isPending } = useQuery({
        queryKey: ['film-reviews', filmId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('logs')
                .select('user_id, review, rating, created_at')
                .eq('film_id', filmId)
                .not('review', 'is', null)
                .neq('review', '')
                .order('created_at', { ascending: false })
                .limit(6)
            // A failed read throws, so it is never shown as a film nobody reviewed.
            if (error) throw error
            if (!data || data.length === 0) return []
            const userIds = [...new Set(data.map((l: any) => l.user_id).filter(Boolean))]
            let usernameMap: Record<string, { username: string; role: string }> = {}
            if (userIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles').select('id, username, role').in('id', userIds)
                // Unread names would sign every review "anonymous".
                if (profilesError) throw profilesError
                if (profilesData) usernameMap = Object.fromEntries(profilesData.map((p: any) => [p.id, p]))
            }
            return data.map((r: any) => ({ ...r, profiles: usernameMap[r.user_id] || { username: 'anonymous', role: 'cinephile' } }))
        },
        staleTime: 1000 * 60 * 5,
    })

    const localReview = logs.find((l: any) => (l.filmId === filmId || String(l.filmId) === String(filmId)) && l.review)
    const currentUsername = authUser?.username || null

    const reviews: { author: string; authorDisplay: string; persona: string; rating: number; text: string; isLocal?: boolean }[] = []
    if (localReview) {
        reviews.push({
            author: currentUsername || 'you',
            authorDisplay: currentUsername || 'you',
            persona: 'Your Review',
            rating: localReview.rating, text: localReview.review || '', isLocal: true,
        })
    }
    if (dbReviews) {
        dbReviews.forEach((r: any) => {
            const dbUsername = r.profiles?.username
            if (localReview && currentUsername && dbUsername === currentUsername) return
            reviews.push({
                author: dbUsername || 'anonymous',
                authorDisplay: dbUsername || 'anonymous',
                persona: r.profiles?.role === 'auteur' ? 'Auteur' : r.profiles?.role === 'archivist' ? 'Archivist' : 'Cinephile',
                rating: r.rating, text: r.review,
            })
        })
    }

    const noReviews = reviews.length === 0
    // Failed with nothing read before it: the room's reviews are unknown, not absent.
    const unread = isError && !dbReviews

    return (
        <div>
            <SectionHeader label="FROM THE CRITICS" title="Community Reviews" />
            {unread && !noReviews && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic', marginBottom: '1rem' }}>The other reviews could not be retrieved just now.</div>
            )}
            {noReviews && isPending ? (
                <div style={{ padding: '2rem', border: '1px dashed rgba(139,105,20,0.2)', borderRadius: '2px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>RETRIEVING REVIEWS...</div>
                </div>
            ) : noReviews && unread ? (
                <div style={{ padding: '2rem', border: '1px dashed rgba(139,105,20,0.2)', borderRadius: '2px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic' }}>The reviews could not be retrieved just now. Try again shortly.</div>
                </div>
            ) : noReviews ? (
                <div style={{ padding: '2rem', border: '1px dashed rgba(139,105,20,0.2)', borderRadius: '2px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>The projection box awaits.</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic' }}>No transmissions yet. Log this film to be the first voice in the archive.</div>
                </div>
            ) : reviews.map((r, i) => (
                <div key={r.author + i} className="review-manuscript" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                            <Link to={r.isLocal ? '#' : `/user/${r.author}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>@{r.authorDisplay}</Link>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.08em', color: 'var(--fog)', marginTop: '0.15rem' }}>{r.persona}</div>
                        </div>
                        {r.rating > 0 && <ReelRating value={r.rating} size="sm" />}
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--bone)', lineHeight: 1.7, position: 'relative', zIndex: 1 }}>{r.text}</p>
                </div>
            ))}
        </div>
    )
}
