import { X } from 'lucide-react'
import Buster from '../Buster'
import { ReelRating, RadarChart } from '../UI'
import { tmdb } from '../../tmdb'

export function ShareCardOverlay({ log, onClose, user }: { log: any; onClose: () => void; user: any }) {
    if (!log) return null
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100005, background: 'rgba(10, 7, 3, 0.95)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem'
        }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 100006, width: 44, height: 44, padding: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={18} style={{ margin: 'auto' }} />
            </button>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', marginBottom: '1.5rem', textAlign: 'center' }}>
                SCREENSHOT TO SHARE TO INSTAGRAM STORY
            </div>

            <div id="share-card" style={{
                width: '100%', maxWidth: '360px', aspectRatio: '9/16',
                background: 'var(--ink)', position: 'relative', overflow: 'hidden',
                border: '1px solid var(--sepia)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column'
            }}>
                {(log.altPoster || log.poster) && (
                    <div style={{
                        position: 'absolute', inset: -40,
                        backgroundImage: `url(${tmdb.poster(log.altPoster || log.poster, 'w342')})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        filter: 'blur(30px) sepia(0.6) brightness(0.25)', zIndex: 0
                    }} />
                )}

                <div style={{ position: 'relative', zIndex: 1, padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: 'auto' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ash)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--sepia)' }}>
                            <Buster size={24} mood="smiling" />
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--parchment)' }}>
                            @{user.username}
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                        {(log.altPoster || log.poster) && (
                            <img
                                src={tmdb.poster(log.altPoster || log.poster, 'w342')}
                                alt={log.title}
                                style={{ width: '70%', aspectRatio: '2/3', objectFit: 'cover', borderRadius: '4px', filter: 'sepia(0.2) contrast(1.1)', marginBottom: '2rem', border: '1px solid var(--ash)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
                            />
                        )}
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem', textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                            {log.title}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <ReelRating value={log.rating} size="md" />
                            {log.watchedWith && (
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)', borderLeft: '1px solid var(--ash)', paddingLeft: '0.75rem' }}>
                                    ♡ W/ {log.watchedWith.toUpperCase()}
                                </span>
                            )}
                        </div>
                        {log.review && (
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--bone)', fontStyle: 'italic', lineHeight: 1.6, paddingBottom: '1rem', margin: 0 }}>
                                "{log.review}"
                            </p>
                        )}
                        {log.isAutopsied && log.autopsy && (
                            <div style={{ transform: 'scale(0.8)', margin: '-1rem 0' }}>
                                <RadarChart autopsy={log.autopsy} size={150} />
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--ash)', paddingTop: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--sepia)', opacity: 0.9 }}>
                            REELHOUSE
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
