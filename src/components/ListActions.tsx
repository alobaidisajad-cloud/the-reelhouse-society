import { useState } from 'react'
import { Award, MessageCircle, Send } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuthStore, useUIStore, useFilmStore } from '../store'
import reelToast from '../utils/reelToast'

export default function ListActions({ listId, certifyCount: initialCertifyCount, isCertified: initialIsCertified, commentCount: initialCommentCount }: {
    listId: string; certifyCount: number; isCertified: boolean; commentCount: number
}) {
    const { isAuthenticated, user } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const queryClient = useQueryClient()
    const [certifyCount, setCertifyCount] = useState(initialCertifyCount)
    const [isCertified, setIsCertified] = useState(initialIsCertified)
    const [showComments, setShowComments] = useState(false)
    const [commentText, setCommentText] = useState('')
    const [submittingComment, setSubmittingComment] = useState(false)
    const [localCommentCount, setLocalCommentCount] = useState(initialCommentCount)

    const { toggleListEndorse } = useFilmStore()

    // Fetch comments for this list
    const { data: comments = [] } = useQuery({
        queryKey: ['list-comments', listId],
        queryFn: async () => {
            const { data } = await supabase
                .from('list_comments')
                .select('id, user_id, content, created_at')
                .eq('list_id', listId)
                .order('created_at', { ascending: true })
                .limit(30)
            if (!data || data.length === 0) return []
            // Resolve usernames
            const uids = [...new Set(data.map((c: any) => c.user_id))]
            const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', uids)
            const umap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.username]))
            return data.map((c: any) => ({ ...c, username: umap[c.user_id] || 'anon' }))
        },
        enabled: showComments,
        staleTime: 1000 * 60 * 1,
    })

    const handleCertify = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isAuthenticated) { openSignupModal(); return }
        // Optimistic
        if (isCertified) {
            setCertifyCount(c => Math.max(0, c - 1))
            setIsCertified(false)
        } else {
            setCertifyCount(c => c + 1)
            setIsCertified(true)
            reelToast.success('Certified!')
        }
        await toggleListEndorse(listId)
    }

    const handleSubmitComment = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!commentText.trim() || submittingComment) return
        setSubmittingComment(true)
        try {
            await supabase.from('list_comments').insert([{
                user_id: user!.id, list_id: listId, content: commentText.trim()
            }])
            reelToast.success('Comment added!')
            setCommentText('')
            setLocalCommentCount(c => c + 1)
            queryClient.invalidateQueries({ queryKey: ['list-comments', listId] })

            // ── Notify the list owner about the critic (background, non-blocking) ──
            supabase.from('lists').select('user_id, title').eq('id', listId).single()
                .then(({ data: listInfo }) => {
                    if (listInfo && String(listInfo.user_id) !== String(user!.id)) {
                        supabase.from('notifications').insert({
                            user_id: listInfo.user_id,
                            type: 'comment',
                            from_username: user!.username,
                            message: `@${user!.username} critiqued your stack "${listInfo.title || 'Untitled'}"`,
                            read: false,
                        })
                    }
                })
        } catch { reelToast.error('Failed to comment') }
        setSubmittingComment(false)
    }

    const toggleComments = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isAuthenticated) { openSignupModal(); return }
        setShowComments(!showComments)
    }

    return (
        <div style={{ marginTop: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid rgba(139,105,20,0.1)', paddingTop: '0.6rem', marginTop: '0.5rem' }}>
                {/* Certify button */}
                <button
                    onClick={handleCertify}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        color: isCertified ? 'var(--sepia)' : 'var(--fog)',
                        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                        transition: 'color 0.2s', padding: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                    onMouseLeave={e => { if (!isCertified) e.currentTarget.style.color = 'var(--fog)' }}
                >
                    <Award size={13} style={{ fill: isCertified ? 'var(--sepia)' : 'none', transition: 'fill 0.2s' }} />
                    {certifyCount > 0 ? certifyCount : ''} {isCertified ? 'CERTIFIED' : 'CERTIFY'}
                </button>

                {/* Comment button */}
                <button
                    onClick={toggleComments}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        color: showComments ? 'var(--sepia)' : 'var(--fog)',
                        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em',
                        transition: 'color 0.2s', padding: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--bone)'}
                    onMouseLeave={e => { if (!showComments) e.currentTarget.style.color = 'var(--fog)' }}
                >
                    <MessageCircle size={12} />
                    {localCommentCount > 0 ? `${localCommentCount} ` : ''}CRITIC
                </button>
            </div>

            {/* Comments panel */}
            {showComments && (
                <div style={{
                    marginTop: '0.5rem',
                    background: 'rgba(10,7,3,0.8)',
                    border: '1px solid rgba(139,105,20,0.1)',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    maxHeight: 180, overflowY: 'auto',
                }}>
                    {comments.length === 0 && (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', textAlign: 'center', padding: '0.5rem 0', opacity: 0.7 }}>
                            No remarks yet. Be the first to speak.
                        </div>
                    )}
                    {comments.map((c: any) => (
                        <div key={c.id} style={{ marginBottom: '0.4rem', display: 'flex', gap: '0.4rem', alignItems: 'baseline' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', letterSpacing: '0.05em', flexShrink: 0 }}>@{c.username}</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)', lineHeight: 1.4, opacity: 0.8 }}>{c.content}</span>
                        </div>
                    ))}
                    {/* Comment input */}
                    {isAuthenticated && (
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', borderTop: '1px solid rgba(139,105,20,0.08)', paddingTop: '0.5rem' }}>
                            <input
                                className="input"
                                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: 'rgba(10,7,3,0.6)', borderColor: 'rgba(139,105,20,0.1)', borderRadius: '3px' }}
                                placeholder="Leave a remark..."
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Enter') handleSubmitComment(e as any) }}
                            />
                            <button
                                onClick={handleSubmitComment}
                                disabled={submittingComment || !commentText.trim()}
                                style={{
                                    background: 'none', border: '1px solid rgba(139,105,20,0.2)', borderRadius: '3px',
                                    padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'var(--sepia)',
                                    display: 'flex', alignItems: 'center', opacity: commentText.trim() ? 1 : 0.4,
                                }}
                            >
                                <Send size={12} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
