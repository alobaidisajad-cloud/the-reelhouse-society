import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store'
import { Shield, Trash2, Ban, CheckCircle, XCircle, AlertTriangle, Clock, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import PageSEO from '../components/PageSEO'

// ── Admin check — hardcoded for security ──
const ADMIN_ID = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755'

type FilterTab = 'pending' | 'resolved' | 'all'

export default function TribunalPage() {
    const { user } = useAuthStore()
    const queryClient = useQueryClient()
    const [filter, setFilter] = useState<FilterTab>('pending')
    const [actionInProgress, setActionInProgress] = useState<string | null>(null)

    const isAdmin = user?.id === ADMIN_ID

    // ── Fetch reports ──
    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['tribunal-reports', filter],
        queryFn: async () => {
            let q = supabase.from('reports').select('*').order('created_at', { ascending: false })
            if (filter === 'pending') q = q.eq('status', 'pending')
            else if (filter === 'resolved') q = q.in('status', ['resolved', 'dismissed'])
            const { data, error } = await q.limit(200)
            if (error) throw error

            // Enrich with reporter usernames
            const reporterIds = [...new Set((data || []).map((r: any) => r.reporter_id).filter(Boolean))]
            let reporterMap: Record<string, string> = {}
            if (reporterIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', reporterIds)
                reporterMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.username]))
            }

            return (data || []).map((r: any) => ({
                ...r,
                reporter_username: reporterMap[r.reporter_id] || 'unknown',
            }))
        },
        enabled: isAdmin,
        staleTime: 1000 * 30,
    })

    // ── Access denied for non-admins ──
    if (!isAdmin) {
        return (
            <div style={{ paddingTop: 100, minHeight: '100dvh', background: 'var(--ink)', textAlign: 'center' }}>
                <Shield size={48} style={{ color: 'var(--sepia)', marginBottom: '1rem' }} />
                <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--parchment)', fontSize: '2rem' }}>Access Denied</h1>
                <p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)', marginTop: '1rem' }}>
                    Only Society administrators may enter The Tribunal.
                </p>
            </div>
        )
    }

    // ── Actions ──
    const dismissReport = async (reportId: string) => {
        setActionInProgress(reportId)
        try {
            await supabase.from('reports').update({
                status: 'dismissed',
                resolution: 'dismissed',
                resolved_by: user!.id,
                resolved_at: new Date().toISOString(),
            }).eq('id', reportId)
            toast.success('Report dismissed.')
            queryClient.invalidateQueries({ queryKey: ['tribunal-reports'] })
        } catch { toast.error('Failed to dismiss.') }
        finally { setActionInProgress(null) }
    }

    const deleteContent = async (report: any) => {
        setActionInProgress(report.id)
        try {
            // Delete the actual content
            const typeMap: Record<string, string> = {
                log: 'logs',
                list: 'lists',
                list_comment: 'list_comments',
            }
            const table = typeMap[report.content_type]
            if (table) {
                // Delete list items first if it's a list
                if (report.content_type === 'list') {
                    await supabase.from('list_items').delete().eq('list_id', report.content_id)
                }
                await supabase.from(table).delete().eq('id', report.content_id)
            }

            // Mark report as resolved
            await supabase.from('reports').update({
                status: 'resolved',
                resolution: 'content_removed',
                resolved_by: user!.id,
                resolved_at: new Date().toISOString(),
            }).eq('id', report.id)

            toast.success('Content destroyed and report resolved.')
            queryClient.invalidateQueries({ queryKey: ['tribunal-reports'] })
        } catch { toast.error('Failed to delete content.') }
        finally { setActionInProgress(null) }
    }

    const banUser = async (report: any) => {
        setActionInProgress(report.id)
        try {
            // Find the content owner's user_id
            let targetUserId: string | null = null

            if (report.content_type === 'user') {
                // Direct user report — content_id IS the user_id
                const { data: p } = await supabase.from('profiles').select('id').eq('username', report.content_id).maybeSingle()
                targetUserId = p?.id || report.content_id
            } else if (report.content_type === 'log') {
                const { data: log } = await supabase.from('logs').select('user_id').eq('id', report.content_id).maybeSingle()
                targetUserId = log?.user_id
            } else if (report.content_type === 'list') {
                const { data: list } = await supabase.from('lists').select('user_id').eq('id', report.content_id).maybeSingle()
                targetUserId = list?.user_id
            } else if (report.content_type === 'list_comment') {
                const { data: comment } = await supabase.from('list_comments').select('user_id').eq('id', report.content_id).maybeSingle()
                targetUserId = comment?.user_id
            }

            if (!targetUserId) {
                toast.error('Could not identify the user to ban.')
                return
            }

            // Ban the user
            await supabase.from('profiles').update({
                is_banned: true,
                ban_reason: `Banned for: ${report.reason}. Report details: ${report.details || 'N/A'}`,
            }).eq('id', targetUserId)

            // Resolve the report
            await supabase.from('reports').update({
                status: 'resolved',
                resolution: 'user_banned',
                resolved_by: user!.id,
                resolved_at: new Date().toISOString(),
            }).eq('id', report.id)

            toast.success('User has been silenced from The Society.')
            queryClient.invalidateQueries({ queryKey: ['tribunal-reports'] })
        } catch { toast.error('Failed to ban user.') }
        finally { setActionInProgress(null) }
    }

    const pendingCount = reports.filter((r: any) => r.status === 'pending').length

    const REASON_COLORS: Record<string, string> = {
        spam: '#e67e22',
        harassment: '#e74c3c',
        spoilers: '#3498db',
        offensive: '#c0392b',
        other: '#95a5a6',
    }

    return (
        <div style={{ paddingTop: 70, minHeight: '100dvh', background: 'var(--ink)' }}>
            <PageSEO title="The Tribunal" description="Content moderation dashboard" />

            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem' }}>
                {/* Header */}
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.6rem',
                        letterSpacing: '0.4em',
                        color: 'var(--sepia)',
                        marginBottom: '1rem',
                    }}>
                        ADMINISTRATION
                    </div>
                    <h1 style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
                        color: 'var(--parchment)',
                        lineHeight: 1.1,
                        marginBottom: '1rem',
                    }}>
                        The Tribunal
                    </h1>
                    <p style={{
                        fontFamily: 'var(--font-sub)',
                        fontSize: '1rem',
                        color: 'var(--fog)',
                        maxWidth: 600,
                    }}>
                        Review reports filed by Society members. Protect the community.
                    </p>
                </div>

                {/* Filter Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginBottom: '2rem',
                    borderBottom: '1px solid rgba(139,105,20,0.2)',
                    paddingBottom: '1rem',
                }}>
                    {(['pending', 'resolved', 'all'] as FilterTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: '0.6rem',
                                letterSpacing: '0.15em',
                                padding: '0.5rem 1rem',
                                background: filter === tab ? 'rgba(139,105,20,0.15)' : 'transparent',
                                border: filter === tab ? '1px solid var(--sepia)' : '1px solid transparent',
                                borderRadius: '3px',
                                color: filter === tab ? 'var(--sepia)' : 'var(--fog)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                            }}
                        >
                            {tab === 'pending' && <Clock size={12} />}
                            {tab === 'resolved' && <CheckCircle size={12} />}
                            {tab === 'all' && <Eye size={12} />}
                            {tab.toUpperCase()}
                            {tab === 'pending' && pendingCount > 0 && (
                                <span style={{
                                    background: 'var(--danger, #c0392b)',
                                    color: '#fff',
                                    borderRadius: '50%',
                                    width: 18,
                                    height: 18,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.5rem',
                                    fontWeight: 'bold',
                                }}>
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Reports List */}
                {isLoading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <div className="shimmer" style={{ height: 60, borderRadius: '3px', marginBottom: '1rem' }} />
                        <div className="shimmer" style={{ height: 60, borderRadius: '3px', marginBottom: '1rem' }} />
                        <div className="shimmer" style={{ height: 60, borderRadius: '3px' }} />
                    </div>
                ) : reports.length === 0 ? (
                    <div style={{
                        padding: '4rem 2rem',
                        textAlign: 'center',
                        background: 'rgba(22,18,12,0.4)',
                        border: '1px dashed rgba(139,105,20,0.2)',
                        borderRadius: '3px',
                    }}>
                        <Shield size={40} style={{ color: 'var(--sepia)', marginBottom: '1rem' }} />
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--parchment)', marginBottom: '0.5rem' }}>
                            All Clear
                        </div>
                        <div style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)' }}>
                            No {filter === 'all' ? '' : filter} reports to review.
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {reports.map((report: any) => (
                            <div
                                key={report.id}
                                style={{
                                    background: 'rgba(22,18,12,0.5)',
                                    border: report.status === 'pending'
                                        ? '1px solid rgba(231,76,60,0.3)'
                                        : '1px solid rgba(139,105,20,0.15)',
                                    borderRadius: '4px',
                                    padding: '1.25rem',
                                    transition: 'border-color 0.2s',
                                }}
                            >
                                {/* Top row: type badge + reason + timestamp */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '0.5rem',
                                    marginBottom: '0.75rem',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {/* Content type badge */}
                                        <span style={{
                                            fontFamily: 'var(--font-ui)',
                                            fontSize: '0.5rem',
                                            letterSpacing: '0.15em',
                                            padding: '0.2rem 0.5rem',
                                            background: 'rgba(139,105,20,0.15)',
                                            border: '1px solid rgba(139,105,20,0.25)',
                                            borderRadius: '2px',
                                            color: 'var(--sepia)',
                                        }}>
                                            {report.content_type.toUpperCase().replace('_', ' ')}
                                        </span>

                                        {/* Reason badge */}
                                        <span style={{
                                            fontFamily: 'var(--font-ui)',
                                            fontSize: '0.5rem',
                                            letterSpacing: '0.1em',
                                            padding: '0.2rem 0.5rem',
                                            background: `${REASON_COLORS[report.reason] || '#666'}22`,
                                            border: `1px solid ${REASON_COLORS[report.reason] || '#666'}44`,
                                            borderRadius: '2px',
                                            color: REASON_COLORS[report.reason] || 'var(--fog)',
                                        }}>
                                            {report.reason.toUpperCase()}
                                        </span>

                                        {/* Status badge */}
                                        {report.status !== 'pending' && (
                                            <span style={{
                                                fontFamily: 'var(--font-ui)',
                                                fontSize: '0.5rem',
                                                letterSpacing: '0.1em',
                                                padding: '0.2rem 0.5rem',
                                                background: report.status === 'resolved' ? 'rgba(46,204,113,0.15)' : 'rgba(149,165,166,0.15)',
                                                border: `1px solid ${report.status === 'resolved' ? 'rgba(46,204,113,0.3)' : 'rgba(149,165,166,0.3)'}`,
                                                borderRadius: '2px',
                                                color: report.status === 'resolved' ? '#2ecc71' : '#95a5a6',
                                            }}>
                                                {report.resolution?.toUpperCase().replace('_', ' ') || report.status.toUpperCase()}
                                            </span>
                                        )}
                                    </div>

                                    <div style={{
                                        fontFamily: 'var(--font-ui)',
                                        fontSize: '0.5rem',
                                        letterSpacing: '0.1em',
                                        color: 'var(--fog)',
                                    }}>
                                        {new Date(report.created_at).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        })}
                                    </div>
                                </div>

                                {/* Reporter + content info */}
                                <div style={{
                                    fontFamily: 'var(--font-sub)',
                                    fontSize: '0.85rem',
                                    color: 'var(--bone, #c9b89d)',
                                    marginBottom: '0.5rem',
                                }}>
                                    Reported by <span style={{ color: 'var(--sepia)' }}>@{report.reporter_username}</span>
                                    <span style={{ color: 'var(--fog)', margin: '0 0.5rem' }}>·</span>
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)' }}>
                                        ID: {report.content_id.slice(0, 8)}...
                                    </span>
                                </div>

                                {/* Details */}
                                {report.details && (
                                    <div style={{
                                        fontFamily: 'var(--font-sub)',
                                        fontSize: '0.85rem',
                                        color: 'var(--fog)',
                                        fontStyle: 'italic',
                                        marginBottom: '0.75rem',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(10,7,3,0.5)',
                                        borderLeft: '2px solid rgba(139,105,20,0.3)',
                                        borderRadius: '0 3px 3px 0',
                                    }}>
                                        "{report.details}"
                                    </div>
                                )}

                                {/* Action buttons (only for pending) */}
                                {report.status === 'pending' && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        marginTop: '0.75rem',
                                        flexWrap: 'wrap',
                                    }}>
                                        <button
                                            onClick={() => dismissReport(report.id)}
                                            disabled={actionInProgress === report.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                padding: '0.4rem 0.75rem',
                                                fontFamily: 'var(--font-ui)',
                                                fontSize: '0.55rem',
                                                letterSpacing: '0.1em',
                                                background: 'rgba(149,165,166,0.1)',
                                                border: '1px solid rgba(149,165,166,0.25)',
                                                color: '#95a5a6',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <XCircle size={12} /> DISMISS
                                        </button>

                                        {report.content_type !== 'user' && (
                                            <button
                                                onClick={() => deleteContent(report)}
                                                disabled={actionInProgress === report.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    padding: '0.4rem 0.75rem',
                                                    fontFamily: 'var(--font-ui)',
                                                    fontSize: '0.55rem',
                                                    letterSpacing: '0.1em',
                                                    background: 'rgba(231,76,60,0.1)',
                                                    border: '1px solid rgba(231,76,60,0.3)',
                                                    color: '#e74c3c',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <Trash2 size={12} /> DELETE CONTENT
                                            </button>
                                        )}

                                        <button
                                            onClick={() => banUser(report)}
                                            disabled={actionInProgress === report.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                padding: '0.4rem 0.75rem',
                                                fontFamily: 'var(--font-ui)',
                                                fontSize: '0.55rem',
                                                letterSpacing: '0.1em',
                                                background: 'rgba(192,57,43,0.15)',
                                                border: '1px solid rgba(192,57,43,0.4)',
                                                color: '#c0392b',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            <Ban size={12} /> BAN USER
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
