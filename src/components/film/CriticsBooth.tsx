import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, DollarSign, Play, X } from 'lucide-react'
import { useVideoStore } from '../../stores/video'
import VideoPlayer from '../video/VideoPlayer'
import VideoUploadModal from '../video/VideoUploadModal'
import SupportButton from '../video/SupportButton'
import { supabase } from '../../supabaseClient'

interface CriticsBoothProps {
    filmId: number
}

export default function CriticsBooth({ filmId }: CriticsBoothProps) {
    const { videosByFilm, fetchVideosByFilm, incrementViews } = useVideoStore()
    const videos = videosByFilm[filmId] || []
    const [activeVideo, setActiveVideo] = useState<any>(null)

    useEffect(() => {
        fetchVideosByFilm(filmId)
    }, [filmId])

    if (videos.length === 0) return null

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    return (
        <div style={{ marginTop: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>
                        THE SCREENING ROOM
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>
                        Video Reviews
                    </h3>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                    {videos.length} REVIEW{videos.length !== 1 ? 'S' : ''}
                </div>
            </div>

            {/* Video Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {videos.map((video: any) => (
                    <motion.div
                        key={video.id}
                        whileHover={{ y: -4 }}
                        transition={{ type: 'spring', damping: 20 }}
                        style={{
                            background: 'var(--ink)', border: '1px solid var(--ash)',
                            borderRadius: '2px', overflow: 'hidden', cursor: 'pointer',
                            transition: 'border-color 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
                        onClick={() => {
                            setActiveVideo(video)
                            incrementViews(video.id)
                        }}
                    >
                        {/* Thumbnail */}
                        <div style={{ aspectRatio: '16/9', background: '#0a0705', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {video.thumbnail_url ? (
                                <img src={video.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6) sepia(0.2)' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0a0705, #1a140a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Play size={32} color="var(--sepia)" style={{ opacity: 0.4 }} />
                                </div>
                            )}
                            {/* Duration badge */}
                            <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(5,3,1,0.85)', padding: '2px 6px', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--parchment)', letterSpacing: '0.08em', borderRadius: '2px' }}>
                                {formatDuration(video.duration_seconds)}
                            </div>
                            {/* Play overlay */}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.8 }}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(139,105,20,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
                                    <Play size={18} fill="var(--parchment)" color="transparent" />
                                </div>
                            </div>
                        </div>

                        {/* Info */}
                        <div style={{ padding: '0.9rem' }}>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', marginBottom: '0.4rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {video.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                <Link to={`/user/${video.username}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--sepia)', textDecoration: 'none' }}>@{video.username}</Link>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Eye size={9} />{video.views || 0}</span>
                                {video.tip_total > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--flicker)' }}><DollarSign size={9} />{video.tip_total.toFixed(0)}</span>}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Video Modal */}
            <AnimatePresence>
                {activeVideo && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,3,1,0.97)', padding: '1rem' }} onClick={() => setActiveVideo(null)}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', maxWidth: 800, display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: '0.3rem' }}>{activeVideo.title}</div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                        by <Link to={`/user/${activeVideo.username}`} style={{ color: 'var(--sepia)', textDecoration: 'none' }}>@{activeVideo.username}</Link> · {activeVideo.views || 0} views
                                    </div>
                                </div>
                                <button onClick={() => setActiveVideo(null)} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={22} /></button>
                            </div>

                            <VideoPlayer src={activeVideo.video_url} title={activeVideo.title} />

                            <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
                                <SupportButton videoId={activeVideo.id} creatorUserId={activeVideo.user_id} creatorUsername={activeVideo.username} />
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                                Reviewing: <span style={{ color: 'var(--sepia)' }}>{activeVideo.film_title}</span>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
