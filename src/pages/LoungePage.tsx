import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Plus, Lock, Users, Copy, Check, Search, Info, X } from 'lucide-react'
import { useLoungeStore } from '../stores/lounge'
import { useAuthStore } from '../stores/auth'
import { tmdb } from '../tmdb'
import toast from 'react-hot-toast'
import PageSEO from '../components/PageSEO'
import '../styles/lounge.css'

// ── Gate for non-archivists ──
function LoungeGate() {
    const navigate = useNavigate()
    return (
        <div className="lounge-gate">
            <div className="lounge-gate-card">
                <div className="lounge-gate-icon">
                    <Lock size={48} strokeWidth={1} />
                </div>
                <h1 className="lounge-gate-title">The Lounge</h1>
                <div className="lounge-gate-sub">ARCHIVIST MEMBERS ONLY</div>
                <p className="lounge-gate-desc">
                    Beyond this door lies The Lounge — intimate cinema salons where the devoted gather to discuss,
                    debate, and discover. Private screening rooms. Whispered critiques. 
                    A place where cinema lives between the frames, and every conversation 
                    is a love letter to the art.
                </p>
                <button
                    className="btn btn-primary"
                    style={{ letterSpacing: '0.2em', padding: '0.9em 2.5em' }}
                    onClick={() => navigate('/patronage')}
                >
                    BECOME AN ARCHIVIST
                </button>
            </div>
        </div>
    )
}

// ── Create Lounge Modal ──
function CreateLoungeModal({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const [creating, setCreating] = useState(false)
    const createLounge = useLoungeStore(s => s.createLounge)
    const navigate = useNavigate()

    const handleCreate = async () => {
        if (!name.trim()) return
        setCreating(true)
        const id = await createLounge({ name: name.trim(), description: description.trim(), isPrivate })
        if (id) {
            toast.success(isPrivate ? 'Private screening room opened.' : 'Public salon opened.')
            onClose()
            navigate(`/lounge/${id}`)
        } else {
            toast.error('Failed to open lounge.')
        }
        setCreating(false)
    }

    return (
        <div className="lounge-create-modal">
            <div className="lounge-create-backdrop" onClick={onClose} />
            <motion.div
                className="lounge-create-card"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
                <h2 className="lounge-create-title">Open a Lounge</h2>
                <div className="lounge-create-subtitle">CURATE YOUR CINEMA CIRCLE</div>

                <div className="lounge-create-field">
                    <label className="lounge-create-label">LOUNGE NAME</label>
                    <input
                        className="lounge-create-input"
                        placeholder="e.g., The Noir Corner, Asian Cinema Obsessives..."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        maxLength={60}
                        autoFocus
                    />
                </div>

                <div className="lounge-create-field">
                    <label className="lounge-create-label">DESCRIPTION</label>
                    <textarea
                        className="lounge-create-input lounge-create-textarea"
                        placeholder="What's this lounge about? What kind of cinema lovers belong here?"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        maxLength={300}
                    />
                </div>

                <div className="lounge-create-field">
                    <div className="lounge-create-toggle" onClick={() => setIsPrivate(!isPrivate)}>
                        <div className={`lounge-create-toggle-track ${isPrivate ? 'active' : ''}`}>
                            <div className="lounge-create-toggle-knob" />
                        </div>
                        <div>
                            <div className="lounge-create-toggle-label">
                                {isPrivate ? 'PRIVATE SCREENING ROOM' : 'PUBLIC SALON'}
                            </div>
                            <div className="lounge-create-toggle-hint">
                                {isPrivate ? 'Invite-only via code' : 'Anyone with Archivist+ can join'}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }} disabled={creating}>
                        CANCEL
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreate}
                        disabled={!name.trim() || creating}
                        style={{ flex: 1, letterSpacing: '0.15em' }}
                    >
                        {creating ? 'OPENING...' : 'OPEN LOUNGE'}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ── Joined Lounge Card ──
function JoinedLoungeCard({ lounge, unread }: { lounge: any; unread: number }) {
    const navigate = useNavigate()
    const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w300') : null
    const [showInfo, setShowInfo] = useState(false)

    const handleInfoClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setShowInfo(true)
    }

    return (
        <>
            <div
                className="lounge-card"
                onClick={() => navigate(`/lounge/${lounge.id}`)}
                role="button"
                tabIndex={0}
            >
                {coverUrl && <img src={coverUrl} alt="" className="lounge-card-cover" loading="lazy" decoding="async" />}

                <button className="lounge-info-btn-overlay" onClick={handleInfoClick}>
                    <Info size={14} />
                </button>

                {unread > 0 && (
                    <div className="lounge-unread-badge">{unread > 99 ? '99+' : unread}</div>
                )}

                <div className="lounge-card-content">
                    <div className="lounge-card-name">{lounge.name}</div>
                    {lounge.last_message && (
                        <div className="lounge-card-preview">
                            <strong>{lounge.last_message.username}:</strong> {lounge.last_message.content}
                        </div>
                    )}
                    <div className="lounge-card-meta">{lounge.member_count} MEMBER{lounge.member_count !== 1 ? 'S' : ''}</div>
                </div>
            </div>

            <AnimatePresence>
                {showInfo && <LoungeInfoModal lounge={lounge} onClose={() => setShowInfo(false)} />}
            </AnimatePresence>
        </>
    )
}

// ── Lounge Info Modal ──
function LoungeInfoModal({ lounge, onClose }: { lounge: any; onClose: () => void }) {
    const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w780') : null

    return createPortal(
        <div className="lounge-info-modal-wrapper">
            <div className="lounge-create-backdrop" onClick={onClose} style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.7)' }} />
            <motion.div
                className="lounge-info-card-premium"
                initial={{ opacity: 0, scale: 0.95, y: 30, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, y: 20, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
                <button className="lounge-settings-close" onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 50 }}><X size={16} /></button>
                
                {coverUrl && (
                    <div className="lounge-info-premium-bg" style={{ backgroundImage: `url(${coverUrl})` }} />
                )}
                <div className={`lounge-info-premium-overlay ${!coverUrl ? 'no-cover' : ''}`} />

                <div className="lounge-info-premium-content">
                    <div className="lounge-info-premium-badge">
                        ✦ CINEMA SALON ✦
                    </div>
                    
                    <h2 className="lounge-info-premium-title">{lounge.name}</h2>
                    
                    <div className="lounge-info-premium-founder">
                        EST. {new Date(lounge.created_at).getFullYear()} / BY {lounge.creator_username?.toUpperCase() || 'FOUNDER'}
                    </div>

                    <div className="lounge-info-premium-divider" />
                    
                    <p className="lounge-info-premium-desc">
                        {lounge.description || 'Step out of the noise. A quiet, exclusive space for true cinephiles to dissect the frame.'}
                    </p>

                    <div className="lounge-info-premium-footer">
                        <div className="lounge-info-premium-stat">
                            <Users size={12} strokeWidth={1.5} />
                            <span>{lounge.member_count} / {lounge.max_members} SEATING</span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body
    )
}

// ── Public Lounge Card ──
function PublicLoungeCard({ lounge }: { lounge: any }) {
    const navigate = useNavigate()
    const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w300') : null
    const [showInfo, setShowInfo] = useState(false)

    const handleInfoClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setShowInfo(true)
    }

    return (
        <>
            <div className="lounge-public-card" onClick={() => navigate(`/lounge/${lounge.id}`)}>
                {coverUrl ? (
                    <img src={coverUrl} alt="" className="lounge-public-card-cover" loading="lazy" decoding="async" />
                ) : (
                    <div className="lounge-public-card-cover" style={{ background: 'linear-gradient(135deg, rgba(28,23,16,0.8), rgba(139,105,20,0.05))' }} />
                )}
                
                <button className="lounge-info-btn-overlay" onClick={handleInfoClick}>
                    <Info size={14} />
                </button>

                <div className="lounge-public-card-body">
                    <div className="lounge-public-card-name">{lounge.name}</div>
                    {lounge.description && (
                        <div className="lounge-public-card-desc">{lounge.description}</div>
                    )}
                    <div className="lounge-public-card-footer">
                        <div className="lounge-public-card-members">
                            <Users size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            {lounge.member_count} / {lounge.max_members}
                        </div>
                        <div className="lounge-public-card-preview-txt">PREVIEW</div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showInfo && <LoungeInfoModal lounge={lounge} onClose={() => setShowInfo(false)} />}
            </AnimatePresence>
        </>
    )
}

// ── Join by Invite Code ──
function InviteCodeInput() {
    const [code, setCode] = useState('')
    const [joining, setJoining] = useState(false)
    const joinByInviteCode = useLoungeStore(s => s.joinByInviteCode)
    const navigate = useNavigate()

    const handleJoin = async () => {
        if (!code.trim()) return
        setJoining(true)
        const loungeId = await joinByInviteCode(code.trim())
        if (loungeId) {
            toast.success('You took a seat.')
            navigate(`/lounge/${loungeId}`)
        } else {
            toast.error('Invalid invite code.')
        }
        setJoining(false)
        setCode('')
    }

    return (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
                className="lounge-create-input"
                placeholder="INVITE CODE"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                style={{ width: 140, textAlign: 'center', letterSpacing: '0.3em', fontFamily: 'var(--font-ui)', fontSize: '0.65rem' }}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button className="lounge-join-btn" onClick={handleJoin} disabled={joining || !code.trim()}>
                {joining ? '...' : 'JOIN'}
            </button>
        </div>
    )
}

// ════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════
export default function LoungePage() {
    const user = useAuthStore(s => s.user)
    const isAuthenticated = useAuthStore(s => s.isAuthenticated)
    const { myLounges, publicLounges, unreadCounts, fetchMyLounges, fetchPublicLounges, fetchUnreadCounts, searchQuery, setSearchQuery } = useLoungeStore()
    const [showCreate, setShowCreate] = useState(false)

    const isArchivist = user?.role === 'archivist' || user?.role === 'auteur'

    // Gate for non-archivists
    if (!isAuthenticated || !isArchivist) {
        return (
            <>
                <PageSEO title="The Lounge — The ReelHouse Society" description="Exclusive cinema chat rooms for Archivist members." />
                <LoungeGate />
            </>
        )
    }

    useEffect(() => {
        fetchMyLounges()
        fetchPublicLounges()
        fetchUnreadCounts()

        // Refresh unread counts periodically
        const interval = setInterval(fetchUnreadCounts, 30000)

        // Subscribe to global notifications for real-time unread updates
        const unsubscribe = useLoungeStore.getState().subscribeToGlobalNotifications()

        return () => {
            clearInterval(interval)
            unsubscribe()
        }
    }, [])

    const query = searchQuery.toLowerCase().trim()
    const filteredMyLounges = myLounges.filter(l => 
        l.name.toLowerCase().includes(query) || 
        l.description?.toLowerCase().includes(query) ||
        l.creator_username?.toLowerCase().includes(query)
    )
    const filteredPublicLounges = publicLounges.filter(l => 
        l.name.toLowerCase().includes(query) || 
        l.description?.toLowerCase().includes(query) ||
        l.creator_username?.toLowerCase().includes(query)
    )

    return (
        <>
            <PageSEO title="The Lounge — The ReelHouse Society" description="Cinema chat rooms for Archivist members." />

            <div className="lounge-page">
                {/* ── Header ── */}
                <div className="lounge-page-header">
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '0.75rem', opacity: 0.6 }}>
                        ARCHIVIST EXCLUSIVE
                    </div>
                    <h1 className="lounge-title">The Lounge</h1>
                    <p className="lounge-subtitle">Where cinema lives between the frames.</p>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.3em', color: 'var(--fog)', marginTop: '0.75rem', opacity: 0.4 }}>
                        ✦ PRIVATE SCREENING ROOMS · PUBLIC SALONS · CINEMA DISCOURSE ✦
                    </div>
                </div>

                <div className="lounge-search-container" style={{ marginBottom: '2.5rem' }}>
                    <div className="lounge-search-input-wrapper">
                        <Search size={16} className="lounge-search-icon" />
                        <input
                            className="lounge-search-input"
                            placeholder="SEARCH SCREENING ROOMS & SALONS..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="lounge-search-clear" onClick={() => setSearchQuery('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Actions Row ── */}
                <div className="lounge-actions-row">
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowCreate(true)}
                        style={{ letterSpacing: '0.15em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 20px rgba(139,105,20,0.15)' }}
                    >
                        <Plus size={14} /> OPEN A LOUNGE
                    </button>
                    <InviteCodeInput />
                </div>

                {/* ── YOUR SCREENING ROOMS (Joined) ── */}
                {filteredMyLounges.length > 0 && (
                    <section style={{ marginBottom: '4rem' }}>
                        <div className="lounge-section-label">YOUR PRIVATE SCREENING ROOMS</div>
                        <div className="lounge-joined-strip">
                            {filteredMyLounges.map(lounge => (
                                <JoinedLoungeCard
                                    key={lounge.id}
                                    lounge={lounge}
                                    unread={unreadCounts[lounge.id] || 0}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {myLounges.length === 0 && !searchQuery && (
                    <div className="lounge-empty" style={{ marginBottom: '3rem' }}>
                        <div className="lounge-empty-icon"><MessageCircle size={48} strokeWidth={1} /></div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                            The Velvet Seats Await
                        </div>
                        <div className="lounge-empty-text">
                            Every great filmmaker started with a conversation. Open your own screening room or take a seat in a public salon below.
                        </div>
                    </div>
                )}

                {/* ── OPEN SALONS (Public) ── */}
                <section>
                    <div className="lounge-section-label">OPEN SALONS — TAKE A SEAT</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', opacity: 0.5, fontStyle: 'italic', marginBottom: '1.5rem', marginTop: '-0.5rem' }}>
                        Public conversations. Preview the discourse.
                    </div>
                    {filteredPublicLounges.length > 0 ? (
                        <div className="lounge-public-grid">
                            {filteredPublicLounges.map(lounge => (
                                <PublicLoungeCard
                                    key={lounge.id}
                                    lounge={lounge}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="lounge-empty">
                            <div className="lounge-empty-text">
                                No public salons yet. Be the first to open one.
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* ── Create Modal ── */}
            <AnimatePresence>
                {showCreate && <CreateLoungeModal onClose={() => setShowCreate(false)} />}
            </AnimatePresence>
        </>
    )
}
