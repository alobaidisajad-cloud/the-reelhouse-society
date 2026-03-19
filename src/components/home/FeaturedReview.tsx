import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { ReelRating } from '../UI'
import Buster from '../Buster'

const FeaturedReview = memo(function FeaturedReview({ film }: { film: any }) {
    const { data: communityReview } = useQuery({
        queryKey: ['featured-review', film?.id],
        queryFn: async () => {
            if (!film?.id) return null
            const { data } = await supabase
                .from('logs')
                .select('review, rating')
                .eq('film_id', String(film.id))
                .not('review', 'is', null)
                .neq('review', '')
                .gt('rating', 0)
                .order('rating', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (!data) return null
            return { ...data, username: null }
        },
        enabled: !!film?.id,
        staleTime: 1000 * 60 * 5,
    })

    if (!film) return null

    // Top community review for this film, or a thematic invite placeholder
    const displayReview = communityReview
        ? { text: communityReview.review, author: (communityReview.username || 'ANONYMOUS').toUpperCase(), rating: communityReview.rating || 0 }
        : { text: 'The projection box awaits. Be the first to file a dispatch on this title and claim this space in the archive.', author: 'THE SOCIETY', rating: 0 }

    return (
        <div style={{
            position: 'relative',
            padding: '2rem 2.5rem',
            background: 'rgba(18,14,9,0.95)',
            borderLeft: '2px solid var(--sepia)',
            borderTop: '1px solid rgba(139,105,20,0.1)',
            borderBottom: '1px solid rgba(139,105,20,0.05)',
            borderRight: '1px solid rgba(139,105,20,0.05)',
            borderRadius: '0 8px 8px 0',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5), inset 0 1px 0 rgba(242,232,160,0.05)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ position: 'absolute', top: '1.5rem', left: '-1.5rem', color: 'var(--sepia)', fontSize: '3.5rem', lineHeight: 0, opacity: 0.25, fontFamily: 'var(--font-display)' }}>"</div>
            <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1.15rem',
                fontStyle: 'italic',
                color: 'var(--parchment)',
                lineHeight: 1.8,
                position: 'relative',
                zIndex: 1,
                textShadow: '0 1px 2px var(--ink)',
                marginBottom: '1.5rem'
            }}>
                {displayReview.text.length > 280 ? displayReview.text.slice(0, 280) + '…' : displayReview.text}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ash)', border: '1px solid var(--sepia)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                        <Buster size={16} mood="smiling" />
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--bone)' }}>
                        {displayReview.author.toUpperCase()}
                    </div>
                </div>
                {displayReview.rating > 0 && <ReelRating value={displayReview.rating} size="sm" />}
            </div>
        </div>
    )
})

export default FeaturedReview
