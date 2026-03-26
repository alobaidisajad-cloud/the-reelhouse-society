import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Video, DollarSign, Eye, Trash2, Film, BarChart3, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../store'
import { useVideoStore } from '../stores/video'
import VideoUploadModal from '../components/video/VideoUploadModal'
import { EmptyStudio } from '../components/EmptyStates'
import PageSEO from '../components/PageSEO'
import toast from 'react-hot-toast'

export default function StudioPage() {
    const navigate = useNavigate()
    const { user, isAuthenticated } = useAuthStore()
    const { myVideos, myEarnings, fetchMyVideos, fetchMyEarnings, deleteVideo } = useVideoStore()
    const [tab, setTab] = useState<'videos' | 'earnings'>('videos')
    const [uploadOpen, setUploadOpen] = useState(false)

    useEffect(() => {
        if (!isAuthenticated || !user) { navigate('/'); return }
        // Tier gate: only projectionist can access
        if (user.tier !== 'projectionist') {
            toast.error('The Studio is exclusive to Projectionist tier members.')
            navigate('/membership')
            return
        }
        fetchMyVideos(user.id)
        fetchMyEarnings(user.id)
    }, [isAuthenticated, user])

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this video permanently?')) return
        await deleteVideo(id)
        toast.success('Video removed from the Archive.')
    }

    return (
        <div style={{ minHeight: '100dvh', paddingTop: 80 }}>
            <PageSEO title="The Studio — The ReelHouse Society" description="Your creator dashboard for managing video reviews and earnings." />

            {/* Header */}
            <div style={{ background: 'var(--soot)', borderBottom: '1px solid var(--ash)', padding: '3rem 0' }}>
                <div className="container">
                    <Link to={`/user/${user?.username}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem' }}>
                        <ArrowLeft size={12} /> BACK TO PROFILE
                    </Link>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                                THE PROJECTIONIST'S STUDIO
                            </div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'var(--parchment)', lineHeight: 1 }}>
                                Your Screening Room
                            </h1>
                        </div>
                        <button className="btn btn-primary" onClick={() => setUploadOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', letterSpacing: '0.2em', padding: '0.8rem 1.5rem' }}>
                            <Upload size={14} /> UPLOAD VIDEO
                        </button>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                        {[
                            { icon: <Video size={14} />, label: 'VIDEOS', value: myVideos.length },
                            { icon: <Eye size={14} />, label: 'TOTAL VIEWS', value: myVideos.reduce((a, v) => a + (v.views || 0), 0) },
                            { icon: <DollarSign size={14} />, label: 'TOTAL EARNINGS', value: `$${myEarnings.total.toFixed(2)}` },
                        ].map((stat, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ color: 'var(--sepia)' }}>{stat.icon}</div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>{stat.label}</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--parchment)' }}>{stat.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2rem' }}>
                        {(['videos', 'earnings'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                style={{
                                    padding: '0.5rem 1.25rem', fontFamily: 'var(--font-ui)',
                                    fontSize: '0.6rem', letterSpacing: '0.2em', cursor: 'pointer',
                                    textTransform: 'uppercase', borderRadius: '2px', border: 'none',
                                    background: tab === t ? 'var(--sepia)' : 'transparent',
                                    color: tab === t ? 'var(--ink)' : 'var(--fog)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {t === 'videos' ? <><Video size={11} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />MY VIDEOS</> : <><BarChart3 size={11} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />EARNINGS</>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '6rem' }}>
                {tab === 'videos' && (
                    <>
                        {myVideos.length === 0 ? (
                            <EmptyStudio />
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {myVideos.map(video => (
                                    <motion.div
                                        key={video.id}
                                        layout
                                        style={{ background: 'var(--ink)', border: '1px solid var(--ash)', borderRadius: '2px', overflow: 'hidden' }}
                                    >
                                        {/* Thumbnail */}
                                        <div style={{ aspectRatio: '16/9', background: '#0a0705', position: 'relative' }}>
                                            {video.thumbnail_url ? (
                                                <img src={video.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6) sepia(0.2)' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0a0705, #1a140a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Film size={28} color="var(--sepia)" style={{ opacity: 0.3 }} />
                                                </div>
                                            )}
                                            <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(5,3,1,0.85)', padding: '2px 6px', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--parchment)', letterSpacing: '0.08em', borderRadius: '2px' }}>
                                                {formatDuration(video.duration_seconds)}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div style={{ padding: '1rem' }}>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)', marginBottom: '0.4rem', lineHeight: 1.3 }}>{video.title}</div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
                                                {video.film_title} · {new Date(video.created_at || '').toLocaleDateString()}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Eye size={10} />{video.views}</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--flicker)' }}><DollarSign size={10} />{video.tip_total.toFixed(2)}</span>
                                                </div>
                                                <button onClick={() => handleDelete(video.id)} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'earnings' && (
                    <div>
                        {/* Earnings Overview */}
                        <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', borderRadius: '2px', padding: '2rem', marginBottom: '2rem', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>TOTAL EARNINGS</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--flicker)' }}>${myEarnings.total.toFixed(2)}</div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginTop: '0.5rem' }}>CREATORS KEEP 100% OF SUPPORT REVENUES · ZERO PLATFORM FEES</div>
                        </div>

                        {/* Tip History */}
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                            SUPPORT HISTORY ({myEarnings.tips.length})
                        </div>
                        {myEarnings.tips.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--ash)', borderRadius: '2px', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                                NO SUPPORT PLEDGES RECEIVED YET. KEEP CREATING.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {myEarnings.tips.map((tip: any) => (
                                    <div key={tip.id} style={{ background: 'var(--ink)', border: '1px solid var(--ash)', borderLeft: '2px solid var(--flicker)', padding: '1rem', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>
                                                @{tip.from_username || 'anonymous'} supported you with <span style={{ color: 'var(--flicker)' }}>${tip.amount.toFixed(2)}</span>
                                            </div>
                                            {tip.message && (
                                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                                                    "{tip.message}"
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                                            {new Date(tip.created_at || '').toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Upload Modal */}
            <AnimatePresence>
                {uploadOpen && (
                    <VideoUploadModal
                        onClose={() => setUploadOpen(false)}
                        onSuccess={() => user && fetchMyVideos(user.id)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
