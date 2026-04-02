import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Send, ChevronDown } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import reelToast from '../../utils/reelToast'

/**
 * DossierCritiquePanel — mirrors AnnotationPanel but for dossier_comments table.
 * Consistent UX with the log critique system.
 */
export default function DossierCritiquePanel({ dossierId, open }: { dossierId: string; open: boolean }) {
    const { user: currentUser } = useAuthStore()
    const [text, setText] = useState('')
    const [comments, setComments] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [showAll, setShowAll] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editBody, setEditBody] = useState('')
    const [isUpdating, setIsUpdating] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (open && comments.length === 0) loadComments()
    }, [open])

    const loadComments = async () => {
        if (!isSupabaseConfigured || !dossierId) return
        setLoading(true)
        const { data } = await supabase
            .from('dossier_comments')
            .select('id, username, body, created_at')
            .eq('dossier_id', dossierId)
            .order('created_at', { ascending: true })
            .limit(50)
        setComments(data || [])
        setLoading(false)
    }

    const handleSubmit = async () => {
        if (!text.trim() || !currentUser || submitting) return
        setSubmitting(true)
        const { error, data } = await supabase.from('dossier_comments').insert({
            dossier_id: dossierId,
            user_id: currentUser.id,
            username: currentUser.username,
            body: text.trim(),
        }).select().single()

        if (!error && data) {
            setComments(prev => [...prev, { id: data.id, username: currentUser.username, body: text.trim(), created_at: new Date().toISOString() }])
            setText('')
            if (textareaRef.current) textareaRef.current.style.height = 'auto'
            reelToast.success('Critique filed.')
        } else {
            reelToast.error('Could not save critique.')
        }
        setSubmitting(false)
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this critique?')) return
        const { error } = await supabase.from('dossier_comments').delete().eq('id', id)
        if (!error) {
            setComments(prev => prev.filter(c => c.id !== id))
            reelToast.success('Critique deleted.')
        } else reelToast.error('Could not delete critique.')
    }

    const handleUpdate = async (id: string) => {
        if (!editBody.trim()) return
        setIsUpdating(true)
        const { error } = await supabase.from('dossier_comments').update({ body: editBody.trim() }).eq('id', id)
        if (!error) {
            setComments(prev => prev.map(c => c.id === id ? { ...c, body: editBody.trim() } : c))
            setEditingId(null)
            reelToast.success('Critique updated.')
        } else reelToast.error('Could not update critique.')
        setIsUpdating(false)
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value)
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
        }
    }

    if (!open) return null

    const visibleComments = showAll ? comments : comments.slice(-3)

    return (
        <div style={{ marginTop: '1.5rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>
                CRITIQUES ({comments.length})
            </div>

            {loading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>RETRIEVING CRITIQUES…</div>}

            {comments.length > 3 && !showAll && (
                <button
                    onClick={() => setShowAll(true)}
                    style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', cursor: 'pointer', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                    <ChevronDown size={10} /> VIEW ALL CRITIQUES ({comments.length})
                </button>
            )}

            <div style={{ maxHeight: showAll ? '40vh' : 'auto', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingRight: showAll ? '0.5rem' : 0 }}>
                {visibleComments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                        <Link to={`/user/${c.username}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>@{c.username}</Link>

                        {editingId === c.id ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <textarea
                                    value={editBody}
                                    onChange={e => setEditBody(e.target.value)}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--sepia)', borderRadius: '2px', color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', padding: '0.4rem', outline: 'none', resize: 'vertical', minHeight: '60px' }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid rgba(139,105,20,0.2)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', padding: '0.3rem 0.6rem', cursor: 'pointer' }}>CANCEL</button>
                                    <button onClick={() => handleUpdate(c.id)} disabled={isUpdating || !editBody.trim()} style={{ background: 'rgba(139,105,20,0.2)', border: '1px solid rgba(139,105,20,0.3)', color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', padding: '0.3rem 0.6rem', cursor: 'pointer', opacity: (isUpdating || !editBody.trim()) ? 0.5 : 1 }}>UPDATE</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.body}</span>
                                {currentUser?.username === c.username && (
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem' }}>
                                        <button onClick={() => { setEditingId(c.id); setEditBody(c.body) }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>EDIT</button>
                                        <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#8b2020'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>DELETE</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {currentUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleInput}
                        placeholder="File a critique on this dossier…"
                        rows={2}
                        style={{
                            width: '100%', background: 'rgba(10,7,3,0.5)', border: '1px solid var(--ash)',
                            borderRadius: '4px', color: 'var(--bone)', fontFamily: 'var(--font-sub)',
                            fontSize: '0.95rem', padding: '0.75rem', outline: 'none', resize: 'none',
                            lineHeight: 1.5, minHeight: '70px', transition: 'border 0.2s, background 0.2s',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.background = 'rgba(10,7,3,0.5)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !text.trim()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(139,105,20,0.9), rgba(180,140,20,0.9))',
                                border: 'none', color: 'var(--ink)', fontFamily: 'var(--font-ui)',
                                fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em',
                                padding: '0.6rem 1.5rem', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: '0.5rem', opacity: (submitting || !text.trim()) ? 0.4 : 1,
                                transition: 'all 0.3s',
                            }}
                        >
                            SUBMIT CRITIQUE <Send size={12} />
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.5rem' }}>SIGN IN TO CRITIQUE</div>
            )}
        </div>
    )
}
