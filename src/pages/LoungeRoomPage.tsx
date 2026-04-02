import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, MoreVertical, Users, Copy, Check, LogOut, X, Trash2, Settings, MessageCircle, Reply, Lock, Globe, Crown, Shield } from 'lucide-react'
import { useLoungeStore, LoungeMessage } from '../stores/lounge'
import { useAuthStore } from '../stores/auth'
import { tmdb } from '../tmdb'
import reelToast from '../utils/reelToast'
import FilmStripLoader from '../components/FilmStripLoader'
import PageSEO from '../components/PageSEO'
import { useViewport } from '../hooks/useViewport'

// ── Time formatting ──
function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDay(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    if (isToday) return 'TODAY'
    if (isYesterday) return 'YESTERDAY'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
}

function shouldShowDay(messages: LoungeMessage[], index: number): boolean {
    if (index === 0) return true
    const prev = new Date(messages[index - 1].created_at).toDateString()
    const curr = new Date(messages[index].created_at).toDateString()
    return prev !== curr
}

function shouldShowAuthor(messages: LoungeMessage[], index: number): boolean {
    if (index === 0) return true
    const prev = messages[index - 1]
    const curr = messages[index]
    if (prev.user_id !== curr.user_id) return true
    const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
    return gap > 5 * 60 * 1000
}

// ── Shared Content Card ──
const SharedCard = memo(function SharedCard({ msg }: { msg: LoungeMessage }) {
    const meta = msg.metadata
    if (!meta?.title) return null

    const link = msg.type === 'film_share' ? `/film/${meta.filmId}`
        : msg.type === 'person_share' ? `/person/${meta.personId}`
        : msg.type === 'log_share' ? `/log/${meta.logId}`
        : msg.type === 'list_share' ? `/stacks/${meta.listId}`
        : null

    const typeLabel = msg.type === 'film_share' ? 'FILM'
        : msg.type === 'person_share' ? 'PERSON'
        : msg.type === 'log_share' ? 'LOG'
        : msg.type === 'list_share' ? 'STACK'
        : 'SHARED'

    const posterUrl = meta.poster_path ? tmdb.poster(meta.poster_path, 'w500') : meta.profile_path ? tmdb.profile(meta.profile_path, 'w500') : null
    const backdropUrl = meta.backdrop_path ? tmdb.backdrop(meta.backdrop_path, 'w780') : posterUrl

    const CardInner = (
        <div className="lounge-shared-card-cinematic" style={backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : {}}>
            <div className="lounge-shared-card-overlay" />
            
            {posterUrl && <img src={posterUrl} alt="" className="lounge-shared-poster" loading="lazy" />}
            
            <div className="lounge-shared-info">
                <div className="lounge-shared-type">✦ {typeLabel}</div>
                <div className="lounge-shared-title">{meta.title}</div>
                {meta.subtitle && <div className="lounge-shared-sub">{meta.subtitle}</div>}
            </div>
        </div>
    )

    return link ? <Link to={link} style={{ textDecoration: 'none' }}>{CardInner}</Link> : CardInner
})

// ── Single Message ──
const MessageBubble = memo(function MessageBubble({ msg, isSelf, showAuthor, onDelete, onReply, isTouch }: {
    msg: LoungeMessage; isSelf: boolean; showAuthor: boolean;
    onDelete?: () => void; onReply?: () => void; isTouch: boolean
}) {
    const [actionSheet, setActionSheet] = useState(false)
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleTouchStart = () => {
        if (!isTouch) return
        longPressTimer.current = setTimeout(() => {
            setActionSheet(true)
        }, 500)
    }

    const handleTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }

    return (
        <div className={`lounge-msg-wrapper ${isSelf ? 'msg-self' : 'msg-other'} ${showAuthor ? 'mt-author' : 'mt-compact'}`}>
            {showAuthor && (
                <Link to={`/user/${msg.username}`} className="lounge-msg-avatar" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                   {msg.avatar_url ? <img src={msg.avatar_url} alt="" /> : <div className="lounge-msg-avatar-fallback">{msg.username[0]?.toUpperCase()}</div>}
                </Link>
            )}
            
            <div className="lounge-msg-content-col">
                {showAuthor && (
                    <div className="lounge-msg-header">
                        <Link to={`/user/${msg.username}`} className="lounge-msg-author" style={{ textDecoration: 'none', cursor: 'pointer' }}>{isSelf ? 'You' : msg.username}</Link>
                        <span className="lounge-msg-time">{formatTime(msg.created_at)}</span>
                    </div>
                )}
                
                <div
                    className={`lounge-msg ${isSelf ? 'lounge-msg--self' : 'lounge-msg--other'}`}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchEnd}
                >
                    <div className="lounge-msg-body">
                        {/* Reply quote */}
                        {msg.reply_to_content && (
                            <div className="lounge-reply-quote">
                                <div className="lounge-reply-quote-author">
                                    ↩ {msg.reply_to_username || 'Unknown'}
                                </div>
                                {msg.reply_to_content}
                            </div>
                        )}

                        {msg.content && <div>{msg.content}</div>}
                        {msg.type !== 'text' && <SharedCard msg={msg} />}

                        <div className="lounge-msg-actions">
                            {onReply && (
                                <button className="lounge-msg-reply" onClick={(e) => { e.stopPropagation(); onReply() }} title="Reply">
                                    <Reply size={12} />
                                </button>
                            )}

                            {isSelf && onDelete && (
                                <button className="lounge-msg-delete" onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete message">
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Action Sheet */}
            {actionSheet && (
                <>
                    <div className="lounge-action-sheet-overlay" onClick={() => setActionSheet(false)} />
                    <div className="lounge-action-sheet">
                        <div className="lounge-action-sheet-handle" />
                        {onReply && (
                            <button className="lounge-action-sheet-item" onClick={() => { setActionSheet(false); onReply() }}>
                                <Reply size={16} /> REPLY
                            </button>
                        )}
                        <button className="lounge-action-sheet-item" onClick={() => { navigator.clipboard.writeText(msg.content); reelToast.success('Copied'); setActionSheet(false) }}>
                            <Copy size={16} /> COPY TEXT
                        </button>
                        {isSelf && onDelete && (
                            <button className="lounge-action-sheet-item lounge-action-sheet-item--danger" onClick={() => { setActionSheet(false); onDelete() }}>
                                <Trash2 size={16} /> DELETE FOR EVERYONE
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
})

// ── Settings Panel ──
function LoungeSettingsPanel({ lounge, onClose, isCreator }: { lounge: any; onClose: () => void; isCreator: boolean }) {
    const { updateLounge, kickMember, fetchMembers, leaveLounge } = useLoungeStore()
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const [name, setName] = useState(lounge.name)
    const [description, setDescription] = useState(lounge.description || '')
    const [isPrivate, setIsPrivate] = useState(lounge.is_private)
    const [members, setMembers] = useState<Array<{ user_id: string; username: string; avatar_url: string | null; joined_at: string }>>([])
    const [saving, setSaving] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        fetchMembers(lounge.id).then(setMembers)
    }, [lounge.id])

    const handleSave = async () => {
        setSaving(true)
        const updates: any = {}
        if (name.trim() !== lounge.name) updates.name = name.trim()
        if (description.trim() !== (lounge.description || '')) updates.description = description.trim()
        if (isPrivate !== lounge.is_private) updates.is_private = isPrivate
        
        if (Object.keys(updates).length > 0) {
            await updateLounge(lounge.id, updates)
            reelToast.success('Lounge updated.')
        }
        setSaving(false)
    }

    const handleKick = async (userId: string, username: string) => {
        if (!confirm(`Remove @${username} from this lounge?`)) return
        await kickMember(lounge.id, userId)
        setMembers(m => m.filter(member => member.user_id !== userId))
        reelToast.success(`@${username} removed.`)
    }

    const handleCopyCode = () => {
        if (lounge.invite_code) {
            navigator.clipboard.writeText(lounge.invite_code)
            setCopied(true)
            reelToast.success('Invite code copied.')
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleLeave = async () => {
        if (!confirm('Leave this lounge?')) return
        await leaveLounge(lounge.id)
        reelToast.success('You stepped out.')
        navigate('/lounge')
    }

    return (
        <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 140 }} onClick={onClose} />
            <div className="lounge-settings-panel">
                <div className="lounge-settings-header">
                    <div className="lounge-settings-title">✦ LOUNGE SETTINGS</div>
                    <button className="lounge-settings-close" onClick={onClose} aria-label="Close settings">
                        <X size={14} />
                    </button>
                </div>

                <div className="lounge-settings-body">
                    {/* Name & Privacy — Creator only */}
                    {isCreator && (
                        <>
                            <div className="lounge-settings-section">
                                <div className="lounge-settings-section-label">LOUNGE NAME</div>
                                <input
                                    className="lounge-settings-input"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    maxLength={60}
                                />
                            </div>
                            
                            <div className="lounge-settings-section">
                                <div className="lounge-settings-section-label">DESCRIPTION</div>
                                <textarea
                                    className="lounge-settings-input"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    maxLength={280}
                                    style={{ minHeight: '80px', resize: 'vertical' }}
                                    placeholder="What is this space about?"
                                />
                            </div>
                        </>
                    )}

                    {isCreator && (
                        <div className="lounge-settings-section">
                            <div className="lounge-settings-section-label">VISIBILITY</div>
                            <div
                                className="lounge-create-toggle"
                                onClick={() => setIsPrivate(!isPrivate)}
                            >
                                <div className={`lounge-create-toggle-track ${isPrivate ? 'active' : ''}`}>
                                    <div className="lounge-create-toggle-knob" />
                                </div>
                                <div>
                                    <div className="lounge-create-toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {isPrivate ? <><Lock size={11} /> PRIVATE SCREENING ROOM</> : <><Globe size={11} /> PUBLIC SALON</>}
                                    </div>
                                    <div className="lounge-create-toggle-hint">
                                        {isPrivate ? 'Invite-only via code' : 'Anyone with Archivist+ can join'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Invite Code */}
                    {isPrivate && lounge.invite_code && (
                        <div className="lounge-settings-section">
                            <div className="lounge-settings-section-label">INVITE CODE</div>
                            <button
                                onClick={handleCopyCode}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    fontFamily: 'var(--font-ui)', fontSize: '1rem', letterSpacing: '0.3em',
                                    color: 'var(--parchment)', background: 'rgba(139,105,20,0.06)',
                                    border: '1px dashed rgba(139,105,20,0.3)', padding: '0.8rem 1rem',
                                    borderRadius: '6px', cursor: 'pointer', width: '100%',
                                    justifyContent: 'center', transition: 'background 0.2s',
                                }}
                            >
                                {lounge.invite_code}
                                {copied ? <Check size={14} color="var(--sepia)" /> : <Copy size={14} color="var(--fog)" />}
                            </button>
                        </div>
                    )}

                    {isCreator && (name.trim() !== lounge.name || description.trim() !== (lounge.description || '') || isPrivate !== lounge.is_private) && (
                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving || !name.trim()}
                            style={{ letterSpacing: '0.15em' }}
                        >
                            {saving ? 'SAVING...' : 'SAVE CHANGES'}
                        </button>
                    )}

                    {/* Members */}
                    <div className="lounge-settings-section">
                        <div className="lounge-settings-section-label">MEMBERS ({members.length})</div>
                        {members.map(member => (
                            <div className="lounge-member-item" key={member.user_id}>
                                <div className="lounge-member-avatar">
                                    {member.avatar_url ? (
                                        <img src={member.avatar_url} alt={member.username} />
                                    ) : (
                                        <Users size={14} color="var(--fog)" />
                                    )}
                                </div>
                                <div className="lounge-member-name">@{member.username.toUpperCase()}</div>
                                {member.user_id === lounge.creator_id && (
                                    <span className="lounge-member-role"><Crown size={9} style={{ verticalAlign: 'middle' }} /> CREATOR</span>
                                )}
                                {isCreator && member.user_id !== lounge.creator_id && member.user_id !== user?.id && (
                                    <button className="lounge-member-kick" onClick={() => handleKick(member.user_id, member.username)}>
                                        REMOVE
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Leave / Danger Zone */}
                    <div className="lounge-settings-danger">
                        <button className="lounge-settings-danger-btn" onClick={handleLeave}>
                            <LogOut size={12} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                            STEP OUT OF LOUNGE
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}


// ════════════════════════════════════════════════════════════
// MAIN CHAT ROOM
// ════════════════════════════════════════════════════════════
export default function LoungeRoomPage() {
    const { loungeId } = useParams<{ loungeId: string }>()
    const navigate = useNavigate()
    const user = useAuthStore(s => s.user)
    const { isTouch } = useViewport()

    const {
        activeLounge, messages, isLoading, isSending,
        openLounge, closeLounge, sendMessage, deleteMessage,
        loadMoreMessages, hasMoreMessages,
    } = useLoungeStore()

    const [input, setInput] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [replyTo, setReplyTo] = useState<LoungeMessage | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const prevMessagesLength = useRef(0)

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            // Delay the request to not be intrusive
            const timer = setTimeout(() => {
                Notification.requestPermission()
            }, 5000)
            return () => clearTimeout(timer)
        }
    }, [])

    // Open lounge on mount, close on unmount
    useEffect(() => {
        if (loungeId) openLounge(loungeId)
        return () => closeLounge()
    }, [loungeId])

    // Auto-scroll on new messages
    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            const container = messagesContainerRef.current
            if (container) {
                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
                if (isNearBottom || messages.length - prevMessagesLength.current === 1) {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
            }
        }
        prevMessagesLength.current = messages.length
    }, [messages.length])

    // Infinite scroll up for history
    const handleScroll = useCallback(() => {
        const container = messagesContainerRef.current
        if (!container || !hasMoreMessages) return
        if (container.scrollTop < 100) {
            loadMoreMessages()
        }
    }, [hasMoreMessages, loadMoreMessages])

    const handleSend = () => {
        if (!input.trim()) return
        const reply = replyTo ? { id: replyTo.id, content: replyTo.content, username: replyTo.username } : null
        sendMessage(input.trim(), 'text', {}, reply)
        setInput('')
        setReplyTo(null)
        inputRef.current?.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
        if (e.key === 'Escape' && replyTo) {
            setReplyTo(null)
        }
    }

    const handleReply = (msg: LoungeMessage) => {
        setReplyTo(msg)
        inputRef.current?.focus()
    }

    const isCreator = activeLounge?.creator_id === user?.id

    if (isLoading) {
        return <FilmStripLoader message="ENTERING THE LOUNGE…" />
    }

    if (!activeLounge) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                        Lounge not found
                    </div>
                    <button className="btn btn-ghost" onClick={() => navigate('/lounge')}>← BACK TO THE LOUNGE</button>
                </div>
            </div>
        )
    }

    return (
        <>
            <PageSEO title={`${activeLounge.name} — The Lounge`} description="Cinema chat room." />

            <div className="lounge-room">
                {/* ── Header ── */}
                <div className="lounge-room-header">
                    <button className="lounge-room-back" onClick={() => navigate('/lounge')} aria-label="Back to lounges">
                        <ArrowLeft size={14} />
                    </button>
                    <div className="lounge-room-title">{activeLounge.name}</div>
                    <div className="lounge-room-members-count">
                        <Users size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {activeLounge.member_count}
                    </div>
                    <button
                        className="lounge-room-back"
                        onClick={() => setSettingsOpen(true)}
                        aria-label="Lounge settings"
                        title="Lounge Settings"
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {/* ── Messages ── */}
                <div
                    className="lounge-messages"
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                >
                    {/* Load more indicator */}
                    {hasMoreMessages && messages.length >= 50 && (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: '0.55rem', letterSpacing: '0.15em' }}
                                onClick={() => loadMoreMessages()}
                            >
                                LOAD EARLIER MESSAGES
                            </button>
                        </div>
                    )}

                    {messages.length === 0 && !isLoading && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <MessageCircle size={40} strokeWidth={1} style={{ color: 'var(--sepia)', marginBottom: '1rem' }} />
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                                    The Lounge Awaits
                                </div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--fog)', fontStyle: 'italic', maxWidth: 260, margin: '0 auto', lineHeight: 1.6 }}>
                                    Every great conversation starts with a single frame. Break the silence.
                                </div>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={msg.id}>
                            {shouldShowDay(messages, i) && (
                                <div className="lounge-day-separator">
                                    <span className="lounge-day-label">{formatDay(msg.created_at)}</span>
                                </div>
                            )}
                            <MessageBubble
                                msg={msg}
                                isSelf={msg.user_id === user?.id}
                                showAuthor={shouldShowAuthor(messages, i)}
                                onDelete={msg.user_id === user?.id ? () => deleteMessage(msg.id) : undefined}
                                onReply={() => handleReply(msg)}
                                isTouch={isTouch}
                            />
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input Bar or Preview Banner ── */}
                {activeLounge.is_member ? (
                    <>
                        <AnimatePresence>
                            {replyTo && (
                                <motion.div
                                    className="lounge-reply-bar"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Reply size={14} color="var(--sepia)" style={{ flexShrink: 0 }} />
                                    <div className="lounge-reply-bar-content">
                                        <div className="lounge-reply-bar-author">{replyTo.username}</div>
                                        <div className="lounge-reply-bar-text">{replyTo.content || 'Shared content'}</div>
                                    </div>
                                    <button
                                        className="lounge-reply-bar-close"
                                        onClick={() => setReplyTo(null)}
                                        aria-label="Cancel reply"
                                    >
                                        <X size={12} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="lounge-input-bar">
                            <textarea
                                ref={inputRef}
                                className="lounge-input"
                                placeholder="Say something about cinema..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                            />
                            <button
                                className="lounge-send-btn"
                                onClick={handleSend}
                                disabled={!input.trim() || isSending}
                                aria-label="Send message"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="lounge-preview-banner">
                        <div className="lounge-preview-banner-text">
                            You are previewing this salon.
                        </div>
                        <button 
                            className="btn btn-primary" 
                            style={{ letterSpacing: '0.15em', padding: '0.5rem 1rem', fontSize: '0.65rem' }}
                            onClick={async () => {
                                await useLoungeStore.getState().joinLounge(activeLounge.id)
                                // Trigger a re-fetch of openLounge to refresh membership state
                                await useLoungeStore.getState().openLounge(activeLounge.id)
                            }}
                        >
                            TAKE A SEAT
                        </button>
                    </div>
                )}
            </div>

            {/* ── Settings Panel ── */}
            <AnimatePresence>
                {settingsOpen && (
                    <LoungeSettingsPanel
                        lounge={activeLounge}
                        onClose={() => setSettingsOpen(false)}
                        isCreator={isCreator}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
