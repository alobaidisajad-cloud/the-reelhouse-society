import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Send, ChevronDown } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import reelToast from '../../utils/reelToast'

export default function AnnotationPanel({ logId, open, isExpandedView = false }: { logId: string, open: boolean, isExpandedView?: boolean }) {
    const { user: currentUser } = useAuthStore()
    const [annotateText, setAnnotateText] = useState('')
    const [comments, setComments] = useState<any[]>([])
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [submittingComment, setSubmittingComment] = useState(false)
    const [showAllComments, setShowAllComments] = useState(false)
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
    const [editBody, setEditBody] = useState('')
    const [isUpdating, setIsUpdating] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (open && comments.length === 0) {
            loadComments()
        }
    }, [open])

    const loadComments = async () => {
        if (!isSupabaseConfigured || !logId) return
        setCommentsLoading(true)
        const { data } = await supabase
            .from('log_comments')
            .select('id, username, body, created_at')
            .eq('log_id', logId)
            .order('created_at', { ascending: true })
            .limit(30)
        setComments(data || [])
        setCommentsLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this critique?")) return
        const { error } = await supabase.from('log_comments').delete().eq('id', id)
        if (!error) {
            setComments(prev => prev.filter(c => c.id !== id))
            reelToast.success('Critique deleted.')
        } else {
            reelToast.error('Could not delete critique.')
        }
    }

    const handleUpdate = async (id: string) => {
        if (!editBody.trim()) return
        setIsUpdating(true)
        const { error } = await supabase.from('log_comments').update({ body: editBody.trim() }).eq('id', id)
        if (!error) {
            setComments(prev => prev.map(c => c.id === id ? { ...c, body: editBody.trim() } : c))
            setEditingCommentId(null)
            reelToast.success('Critique updated.')
        } else {
            reelToast.error('Could not update critique.')
        }
        setIsUpdating(false)
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setAnnotateText(e.target.value)
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
        }
    }

    const handleAnnotateSubmit = async () => {
        if (!annotateText.trim() || !currentUser) return
        setSubmittingComment(true)
        const { error, data } = await supabase.from('log_comments').insert({
            log_id: logId,
            user_id: currentUser.id,
            username: currentUser.username,
            body: annotateText.trim(),
        }).select().single()
        
        if (!error) {
            // Using the actual returned ID prevents UI bugs if the user tries to edit a newly created comment
            setComments(prev => [...prev, { id: data.id, username: currentUser.username, body: annotateText.trim(), created_at: new Date().toISOString() }])
            setAnnotateText('')
            if (textareaRef.current) textareaRef.current.style.height = 'auto'
            reelToast.success('Critique filed.')
        } else {
            reelToast.error('Could not save critique.')
        }
        setSubmittingComment(false)
    }

    if (!open) return null

    const visibleComments = showAllComments ? comments : comments.slice(-1)

    return (
        <div style={{ marginTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1rem' }}>
            {commentsLoading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>RETRIEVING CRITIQUES...</div>}
            
            {comments.length > 1 && !showAllComments && (
                <button 
                    onClick={() => setShowAllComments(true)}
                    style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', cursor: 'pointer', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                    <ChevronDown size={10} /> VIEW PREVIOUS CRITIQUES ({comments.length - 1})
                </button>
            )}

            <div style={{ maxHeight: showAllComments ? '40vh' : 'auto', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingRight: showAllComments ? '0.5rem' : 0 }}>
                {visibleComments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                        <Link to={`/user/${c.username}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>@{c.username}</Link>
                        
                        {editingCommentId === c.id ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <textarea
                                    value={editBody}
                                    onChange={e => setEditBody(e.target.value)}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--sepia)', borderRadius: '2px', color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', padding: '0.4rem', outline: 'none', resize: 'vertical', minHeight: '60px' }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button onClick={() => setEditingCommentId(null)} className="btn btn-ghost" style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem' }}>CANCEL</button>
                                    <button onClick={() => handleUpdate(c.id)} disabled={isUpdating || !editBody.trim()} className="btn btn-primary" style={{ fontSize: '0.5rem', padding: '0.3rem 0.6rem', opacity: (isUpdating || !editBody.trim()) ? 0.5 : 1 }}>UPDATE</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</span>
                                {currentUser?.username === c.username && (
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem' }}>
                                        <button onClick={() => { setEditingCommentId(c.id); setEditBody(c.body) }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>EDIT</button>
                                        <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.1em', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--blood-reel)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>DELETE</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {currentUser ? (
                <div style={{ 
                    display: 'flex', 
                    flexDirection: isExpandedView ? 'column' : 'row', 
                    gap: isExpandedView ? '1rem' : '0.5rem', 
                    marginTop: '1rem', 
                    width: '100%', 
                    alignItems: isExpandedView ? 'stretch' : 'flex-start' 
                }}>
                    <textarea
                        ref={textareaRef}
                        value={annotateText}
                        onChange={handleInput}
                        placeholder={isExpandedView ? "File an enduring critique..." : "File a critique..."}
                        rows={isExpandedView ? 2 : 1}
                        style={{ 
                            flex: 1, minWidth: 0, 
                            background: isExpandedView ? 'rgba(10, 7, 3, 0.5)' : 'rgba(255,255,255,0.03)', 
                            border: '1px solid var(--ash)', 
                            borderRadius: '4px', 
                            color: 'var(--bone)', 
                            fontFamily: isExpandedView ? 'var(--font-sub)' : 'var(--font-body)', 
                            fontSize: isExpandedView ? '1.05rem' : '0.75rem', 
                            padding: isExpandedView ? '1rem' : '0.4rem 0.6rem', 
                            outline: 'none',
                            resize: 'none', 
                            overflowY: 'auto', 
                            lineHeight: 1.5,
                            minHeight: isExpandedView ? '88px' : '44px',
                            transition: 'border 0.2s, background 0.2s',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.background = isExpandedView ? 'rgba(10, 7, 3, 0.5)' : 'rgba(255,255,255,0.03)' }}
                    />
                    
                    {isExpandedView ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={handleAnnotateSubmit} 
                                disabled={submittingComment || !annotateText.trim()} 
                                className="btn btn-primary" 
                                style={{ 
                                    padding: '0.75rem 1.5rem', 
                                    fontSize: '0.75rem', 
                                    opacity: submittingComment ? 0.5 : 1, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem',
                                    borderRadius: '4px'
                                }}
                            >
                                SUBMIT CRITIQUE <Send size={14} />
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleAnnotateSubmit} 
                            disabled={submittingComment || !annotateText.trim()} 
                            className="btn btn-primary" 
                            style={{ 
                                padding: '0.4rem 0.7rem', 
                                height: '32px', 
                                fontSize: '0.5rem', 
                                opacity: submittingComment ? 0.5 : 1, 
                                flexShrink: 0 
                            }}
                        >
                            <Send size={10} />
                        </button>
                    )}
                </div>
            ) : (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>SIGN IN TO CRITIQUE</div>
            )}
        </div>
    )
}
