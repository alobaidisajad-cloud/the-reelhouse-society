import React from 'react'
import { tmdb } from '../../tmdb'
import { ReelRating, RadarChart } from '../UI'

export const DossierExportHTML = React.forwardRef<HTMLDivElement, { log: any, isExporting: boolean }>(
    ({ log, isExporting }, ref) => {
        return (
            <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none', userSelect: 'none' }}>
                <div id={`dossier-${log.id}`} ref={ref} style={{
                    width: '1080px', height: '1920px', background: 'var(--ink)',
                    display: isExporting ? 'flex' : 'none', flexDirection: 'column', padding: '120px 80px',
                    position: 'relative', overflow: 'hidden', boxSizing: 'border-box'
                }}>
                    {/* Texture Overlay */}
                    <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(139,105,20,0.03) 3px)', zIndex: 0 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%)', zIndex: 0 }} />

                    <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '4px solid var(--sepia)', paddingBottom: '30px', marginBottom: '80px' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', color: 'var(--parchment)' }}>The Society Record</div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '10px' }}>ARCHIVE DEPT // NO. {log.id.substring(0, 6)}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.1em', color: 'var(--sepia)' }}>DATE: {log.timestamp || 'CURRENT'}</div>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ display: 'flex', flex: 1, gap: '60px' }}>
                            {/* Left Col - Poster */}
                            <div style={{ width: '400px', flexShrink: 0 }}>
                                {log.film?.poster && (
                                    <div style={{ padding: '20px', border: '2px dashed var(--ash)', background: 'var(--soot)' }}>
                                        <img src={tmdb.poster(log.film.poster, 'w500')} alt={log.film?.title} loading="lazy" decoding="async" style={{ width: '100%', border: '1px solid var(--soot)' }} />
                                    </div>
                                )}
                                <div style={{ marginTop: '40px', fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--bone)', lineHeight: 1.1 }}>
                                    {log.film?.title.toUpperCase()}
                                </div>
                                {log.film?.year && (
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '2rem', letterSpacing: '0.1em', color: 'var(--sepia)', marginTop: '10px' }}>
                                        {log.film.year}
                                    </div>
                                )}
                                {log.rating > 0 && (
                                    <div style={{ marginTop: '30px', transform: 'scale(2)', transformOrigin: 'top left' }}>
                                        <ReelRating value={log.rating} size="lg" />
                                    </div>
                                )}
                            </div>

                            {/* Right Col - Autopsy */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ transform: 'scale(1.4)', transformOrigin: 'top left', width: '70%' }}>
                                    <RadarChart autopsy={log.autopsy} />
                                </div>
                                {log.pullQuote && (
                                    <div style={{
                                        marginTop: 'auto', marginBottom: '60px', paddingLeft: '40px', borderLeft: '8px solid var(--sepia)',
                                        fontFamily: 'var(--font-display)', fontSize: '3.5rem', color: 'var(--sepia)', fontStyle: 'italic',
                                        lineHeight: 1.2
                                    }}>
                                        "{log.pullQuote}"
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Signature */}
                        <div style={{ borderTop: '2px dashed var(--ash)', paddingTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.2rem', letterSpacing: '0.3em', color: 'var(--fog)', marginBottom: '10px' }}>SUBMITTING AGENT</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--blood-reel)', fontStyle: 'italic' }}>@{log.user.toUpperCase()}</div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '1.5rem', letterSpacing: '0.5em', color: 'var(--fog)', opacity: 0.5 }}>
                                THE REELHOUSE SOCIETY
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
)
