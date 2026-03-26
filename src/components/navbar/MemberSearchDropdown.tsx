import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, X, Loader, UserPlus, UserCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'
import Buster from '../Buster'

export default function MemberSearchDropdown({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const navigate = useNavigate()
    const user = useAuthStore(state => state.user)
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [followingLoading, setFollowingLoading] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (!isOpen) { setQuery(''); setSuggestions([]) }
    }, [isOpen])

    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([])
            setSearching(false)
            return
        }
        setSearching(true)
        const timer = setTimeout(async () => {
            try {
                if (!isSupabaseConfigured) { setSearching(false); return }
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, role, bio, avatar_url')
                    .or(`username.ilike.%${query}%,bio.ilike.%${query}%`)
                    .order('username', { ascending: true })
                    .limit(8)
                if (!error && data) setSuggestions(data)
            } catch (e) {
                console.error('People search error:', e)
            } finally {
                setSearching(false)
            }
        }, 250)
        return () => clearTimeout(timer)
    }, [query])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim() && suggestions.length > 0) {
            navigate(`/user/${suggestions[0].username}`)
            onClose()
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="search-bar"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{ flexDirection: 'column', gap: 0 }}
                >
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                        <Users size={16} style={{ color: 'var(--sepia)', alignSelf: 'center', flexShrink: 0 }} />
                        <input
                            className="input"
                            placeholder="Search members of The Society..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoFocus
                        />
                        <button type="button" className="nav-icon-btn" onClick={onClose}>
                            <X size={16} />
                        </button>
                    </form>

                    <AnimatePresence>
                        {(searching || suggestions.length > 0 || (query.trim() && !searching)) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="glass-panel"
                                style={{ marginTop: '0.5rem', borderTop: '1px solid var(--sepia)', maxHeight: '300px', overflowY: 'auto', borderRadius: 'var(--radius-card)', width: '100%' }}
                            >
                                {searching && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                        <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                        SEARCHING MEMBERS...
                                    </div>
                                )}
                                {!searching && suggestions.length === 0 && query.trim() && (
                                    <div style={{ padding: '1rem 1.25rem', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em' }}>
                                        NO MEMBERS FOUND
                                    </div>
                                )}
                                {!searching && suggestions.map((member: any) => (
                                    <Link
                                        key={member.username}
                                        to={`/user/${member.username}`}
                                        onClick={onClose}
                                        style={{ display: 'flex', alignItems: 'center', padding: '0.9rem 1.25rem', gap: '1.25rem', textDecoration: 'none', borderBottom: '1px solid rgba(139,105,20,0.1)', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(242,232,160,0.03)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: 'var(--ink)', border: '2px solid rgba(139,105,20,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Buster size={32} mood="smiling" />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--parchment)', lineHeight: 1 }}>@{member.username.toUpperCase()}</div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--sepia)', letterSpacing: '0.15em', marginTop: '0.35rem' }}>{(member.role || 'cinephile').toUpperCase()}</div>
                                            {member.bio && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>"{member.bio}"</div>}
                                        </div>
                                        {user && member.username !== user.username && (
                                            <button
                                                className={`btn ${(user.following || []).includes(member.username) ? 'btn-ghost' : 'btn-primary'}`}
                                                onClick={async (e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    if (followingLoading[member.username]) return
                                                    setFollowingLoading(prev => ({ ...prev, [member.username]: true }))
                                                    const alreadyFollowing = (user.following || []).includes(member.username)
                                                    try {
                                                        if (alreadyFollowing) {
                                                            useAuthStore.getState().updateUser({ following: (user.following || []).filter((u: string) => u !== member.username) })
                                                            toast.success(`Unfollowed @${member.username}`)
                                                            await supabase.from('interactions').delete()
                                                                .eq('user_id', user.id)
                                                                .eq('target_user_id', member.id)
                                                                .eq('type', 'follow')
                                                        } else {
                                                            useAuthStore.getState().updateUser({ following: [...(user.following || []), member.username] })
                                                            toast.success(`Now following @${member.username} ✦`)
                                                            await supabase.from('interactions').insert({
                                                                user_id: user.id,
                                                                target_user_id: member.id,
                                                                type: 'follow'
                                                            })
                                                            // DB Trigger dynamically creates notification
                                                        }
                                                    } catch { toast.error('Something went wrong.') }
                                                    finally { setFollowingLoading(prev => ({ ...prev, [member.username]: false })) }
                                                }}
                                                style={{ flexShrink: 0, fontSize: '0.5rem', padding: '0.35rem 0.7rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 'auto' }}
                                                disabled={followingLoading[member.username]}
                                            >
                                                {followingLoading[member.username] ? '...' : (user.following || []).includes(member.username) ? <><UserCheck size={11} /> FOLLOWING</> : <><UserPlus size={11} /> FOLLOW</>}
                                            </button>
                                        )}
                                    </Link>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
