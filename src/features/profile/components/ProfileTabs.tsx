import { useNavigate } from 'react-router-dom';
import { Archive, BookOpen, Bookmark, LayoutList, Disc, LineChart } from 'lucide-react';
import { useViewport } from '../../../hooks/useViewport';

interface ProfileTabsProps {
    profileUser: any;
    profileLogs: any[];
    profileWatchlist: any[];
    profileLists: any[];
    physicalArchive: any[];
    isArchivistPlus: boolean;
}

export function ProfileTabs({
    profileUser,
    profileLogs,
    profileWatchlist,
    profileLists,
    physicalArchive,
    isArchivistPlus
}: ProfileTabsProps) {
    const { isTouch: IS_TOUCH } = useViewport();
    const navigate = useNavigate();

    return (
        <div className="container" style={{ padding: IS_TOUCH ? '0 1rem' : '0 1rem', maxWidth: 900, margin: '0 auto', paddingBottom: '3rem' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.35em', color: 'var(--sepia)', textAlign: 'center', marginBottom: '1rem', marginTop: '2rem', textShadow: '0 0 15px rgba(139,105,20,0.3)' }}>✦ THE COLLECTION ✦</div>
            <div style={{ display: 'grid', gridTemplateColumns: IS_TOUCH ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: IS_TOUCH ? '0.5rem' : '0.75rem' }}>
                {[
                    { id: 'archive', label: 'Archive', count: profileLogs.length, icon: Archive, active: false, desc: 'Watched' },
                    { id: 'diary', label: 'The Ledger', count: profileLogs.filter((l: any) => l.rating > 0 || (l.review && l.review.length > 0)).length, icon: BookOpen, active: false, desc: 'Diary' },
                    { id: 'watchlist', label: 'Watchlist', count: profileWatchlist.length, icon: Bookmark, active: false, desc: 'To See' },
                    { id: 'lists', label: 'Stacks', count: profileLists.length, icon: LayoutList, active: false, desc: 'Lists' },
                    { id: 'physical', label: 'Physical Archive', count: isArchivistPlus ? (physicalArchive.length > 0 ? physicalArchive.length : '0') : 'LOCKED', icon: Disc, active: false, disabled: !isArchivistPlus, desc: 'Collection' },
                    { id: 'projector', label: 'Analytics', count: 'LIFETIME', icon: LineChart, active: false, highlight: true, desc: 'Projector' },
                ].map(item => (
                    <button
                        key={item.id}
                        disabled={item.disabled}
                        onClick={() => {
                            if (!item.disabled) navigate(`/user/${profileUser.username}/${item.id}`)
                        }}
                        style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            gap: '0.75rem',
                            padding: '1.25rem 0.5rem',
                            background: 'linear-gradient(135deg, rgba(20,15,10,0.8) 0%, rgba(10,5,0,0.9) 100%)',
                            border: '1px solid rgba(139,105,20,0.15)',
                            borderRadius: '2px',
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                            ...(item.disabled ? { opacity: 0.3 } : {})
                        }}
                        onMouseEnter={e => {
                            if (!item.disabled) {
                                e.currentTarget.style.border = '1px solid rgba(139,105,20,0.5)'
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30,22,15,0.9) 0%, rgba(15,10,5,0.95) 100%)'
                                e.currentTarget.style.transform = 'translateY(-2px)'
                                e.currentTarget.style.boxShadow = '0 8px 30px rgba(139,105,20,0.1)'
                            }
                        }}
                        onMouseLeave={e => {
                            if (!item.disabled) {
                                e.currentTarget.style.border = '1px solid rgba(139,105,20,0.15)'
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20,15,10,0.8) 0%, rgba(10,5,0,0.9) 100%)'
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
                            }
                        }}
                    >
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: item.highlight ? 'rgba(139,105,20,0.1)' : 'rgba(255,255,255,0.03)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            color: item.highlight ? 'var(--sepia)' : 'var(--bone)',
                        }}>
                            <item.icon size={16} strokeWidth={1.5} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: item.highlight ? 'var(--sepia)' : 'var(--parchment)', letterSpacing: '0.04em', lineHeight: 1.1, marginBottom: '0.3rem' }}>
                                {item.label}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em', color: 'var(--fog)', textTransform: 'uppercase' }}>
                                    {item.desc}
                                </span>
                                {item.count !== '' && (
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: item.highlight ? 'var(--sepia)' : 'var(--parchment)', textTransform: 'uppercase' }}>
                                        {item.count}
                                    </span>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
