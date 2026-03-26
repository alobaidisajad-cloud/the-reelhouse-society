import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ActivityCard from '../components/feed/ActivityCard'
import { ArrowLeft } from 'lucide-react'
import PageSEO from '../components/PageSEO'

export default function LogDetailPage() {
    const { logId } = useParams()
    const navigate = useNavigate()
    const [log, setLog] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        window.scrollTo(0, 0)
        fetchLog()
    }, [logId])

    const fetchLog = async () => {
        if (!logId) return
        setLoading(true)
        setError(false)
        try {
            // Fixed query to perfectly match ReelHouse's schema (no pseudo-columns or missing foreign keys)
            const { data, error } = await supabase
                .from('logs')
                .select(`
                    id, rating, review, pull_quote, drop_cap, is_spoiler, is_autopsied, autopsy, created_at,
                    user_id, film_id, film_title, poster_path, year, status,
                    profiles!logs_user_id_fkey ( username, role, preferences )
                `)
                .eq('id', logId)
                .single()

            if (error || !data) throw new Error('Dossier not found.')

            // Need to get endorsement count efficiently
            const { count } = await supabase.from('interactions').select('id', { count: 'exact', head: true })
                .eq('target_log_id', logId).eq('type', 'endorse_log')

            const profileData: any = data.profiles

            // Map data to match ActivityCard's expected log object shape
            const formattedLog = {
                id: data.id,
                user: profileData?.username || 'anonymous',
                userRole: profileData?.role || 'cinephile',
                privacyEndorsements: profileData?.preferences?.privacy_endorsements || 'everyone',
                privacyAnnotations: profileData?.preferences?.privacy_annotations || 'everyone',
                film: {
                    id: data.film_id,
                    title: data.film_title,
                    poster: data.poster_path, // TMDB path handled by Card
                    year: data.year || '',
                },
                rating: data.rating,
                review: data.review,
                tags: [], // Deprecated concept
                pullQuote: data.pull_quote || '',
                dropCap: data.drop_cap || false,
                isSpoiler: data.is_spoiler || false,
                timestamp: new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
                endorsementCount: count || 0,
                isAutopsied: data.is_autopsied,
                autopsy: data.autopsy,
            }

            setLog(formattedLog)
        } catch (err) {
            console.error('Error fetching log:', err)
            setError(true)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--ash)', display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--fog)' }}><ArrowLeft size={18} /></button>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>RETRIEVING OVERRIDE...</div>
                </div>
            </div>
        )
    }

    if (error || !log) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--ash)', display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--fog)' }}><ArrowLeft size={18} /></button>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.15em', color: 'var(--blood-reel)' }}>SIGNAL LOST</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)' }}>This transmission could not be deciphered or has been scrubbed from the archive.</p>
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
            <PageSEO title={`Log details by ${log.user} on ${log.film?.title || 'Unknown Film'}`} />
            
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--ash)', display: 'flex', alignItems: 'center', position: 'sticky', top: 0, background: 'rgba(10,7,3,0.9)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--fog)' }} aria-label="Go back">
                    <ArrowLeft size={18} />
                </button>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--bone)', marginLeft: '1rem' }}>
                    TRANSMISSION LOG
                </div>
            </div>

            <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', padding: '1rem' }}>
                <ActivityCard log={log} isExpandedView={true} />
            </div>
        </div>
    )
}
