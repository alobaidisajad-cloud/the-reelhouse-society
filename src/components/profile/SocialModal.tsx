import { Link } from 'react-router-dom'
import Buster from '../Buster'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * Social modal — shows a list of followers or following.
 * @param {{ socialModal: object, socialLoading: boolean, onClose: Function }} props
 */
export default function SocialModal({ socialModal, socialLoading, onClose }: { socialModal: any; socialLoading: boolean; onClose: () => void }) {
    const focusTrapRef = useFocusTrap(!!socialModal, onClose)
    if (!socialModal) return null

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000000, background: 'rgba(10,7,3,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(10px)' }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={socialModal.title}
        >
            <div className="card" style={{ maxWidth: 440, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--sepia)', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--parchment)' }}>{socialModal.title.toUpperCase()}</h3>
                    <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {socialLoading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em' }}>✦ LOADING ✦</div>
                    ) : socialModal.list.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>This archive is empty.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {socialModal.list.map((member: any) => (
                                <Link key={member.username} to={`/user/${member.username}`} onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', textDecoration: 'none', borderRadius: '4px' }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--ash)', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {member.avatar_url?.startsWith('http') ? <img src={member.avatar_url} alt={member.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Buster size={20} mood={member.avatar_url || 'smiling'} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--parchment)', lineHeight: 1 }}>@{member.username.toUpperCase()}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--sepia)', letterSpacing: '0.1em', marginTop: '0.2rem' }}>{member.followers_count || 0} FOLLOWERS</div>
                                    </div>
                                    <div style={{ color: 'var(--fog)' }}>→</div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
