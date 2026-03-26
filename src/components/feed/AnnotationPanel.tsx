import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Send, ChevronDown } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'

export default function AnnotationPanel({ logId, open }: { logId: string, open: boolean }) {
    const { user: currentUser } = useAuthStore()
    const [annotateText, setAnnotateText] = useState('')
    const [comments, setComments] = useState<any[]>([])
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [submittingComment, setSubmittingComment] = useState(false)
    const [showAllComments, setShowAllComments] = useState(false)
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
        const { error } = await supabase.from('log_comments').insert({
            log_id: logId,
            user_id: currentUser.id,
            username: currentUser.username,
            body: annotateText.trim(),
        })
        if (!error) {
            setComments(prev => [...prev, { id: Date.now(), username: currentUser.username, body: annotateText.trim(), created_at: new Date().toISOString() }])
            setAnnotateText('')
            if (textareaRef.current) textareaRef.current.style.height = 'auto'
            toast.success('Annotation filed.')
        } else {
            toast.error('Could not save annotation.')
        }
        setSubmittingComment(false)
    }

    if (!open) return null

    const visibleComments = showAllComments ? comments : comments.slice(-1)

    return (
        <div style={{ marginTop: '1rem', borderTop: '1px dashed rgba(139,105,20,0.2)', paddingTop: '1rem' }}>
            {commentsLoading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>RETRIEVING ANNOTATIONS...</div>}
            
            {comments.length > 1 && !showAllComments && (
                <button 
                    onClick={() => setShowAllComments(true)}
                    style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em', cursor: 'pointer', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                    <ChevronDown size={10} /> VIEW PREVIOUS ANNOTATIONS ({comments.length - 1})
                </button>
            )}

            <div style={{ maxHeight: showAllComments ? '250px' : 'auto', overflowY: 'auto', paddingRight: showAllComments ? '0.5rem' : 0 }}>
                {visibleComments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                        <Link to={`/user/${c.username}`} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', color: 'var(--sepia)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>@{c.username}</Link>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--bone)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</span>
                    </div>
                ))}
            </div>

            {currentUser ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', width: '100%', alignItems: 'flex-start' }}>
                    <textarea
                        ref={textareaRef}
                        value={annotateText}
                        onChange={handleInput}
                        placeholder="File an annotation..."
                        rows={1}
                        style={{ 
                            flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ash)', borderRadius: '2px', 
                            color: 'var(--bone)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', padding: '0.4rem 0.6rem', outline: 'none',
                            resize: 'none', overflowY: 'auto', lineHeight: 1.5
                        }}
                    />
                    <button onClick={handleAnnotateSubmit} disabled={submittingComment || !annotateText.trim()} className="btn btn-primary" style={{ padding: '0.4rem 0.7rem', height: '32px', fontSize: '0.5rem', opacity: submittingComment ? 0.5 : 1, flexShrink: 0 }}>
                        <Send size={10} />
                    </button>
                </div>
            ) : (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>SIGN IN TO ANNOTATE</div>
            )}
        </div>
    )
}
