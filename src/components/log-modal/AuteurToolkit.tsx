import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ChevronLeft, ChevronRight } from 'lucide-react'
import { tmdb } from '../../tmdb'
import reelToast from '../../utils/reelToast'
import { RadarChart } from '../UI'

interface AuteurToolkitProps {
    isAuteur: boolean
    autopsyOpen: boolean
    setAutopsyOpen: (v: boolean) => void
    isAutopsied: boolean
    setIsAutopsied: (v: boolean) => void
    autopsy: Record<string, number>
    setAutopsy: (v: Record<string, number>) => void
    altPoster: string | null
    setAltPoster: (v: string | null) => void
    availablePosters: Array<{ file_path: string }>
    onUpgrade: () => void
}

const AUTOPSY_LABELS: Record<string, string> = {
    story: 'STORY', script: 'SCRIPT/DIALOGUE', acting: 'ACTING/CHAR',
    cinematography: 'CINEMATOGRAPHY', editing: 'EDITING/PACING', sound: 'SOUND DESIGN',
}

export default function AuteurToolkit({
    isAuteur, autopsyOpen, setAutopsyOpen, isAutopsied, setIsAutopsied,
    autopsy, setAutopsy, altPoster, setAltPoster, availablePosters, onUpgrade,
}: AuteurToolkitProps) {
    const posterScrollRef = useRef<HTMLDivElement>(null)

    return (
        <div style={{ padding: '1rem', border: '1px solid var(--blood-reel)', borderRadius: 'var(--radius-card)', background: 'rgba(162,36,36,0.05)', display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: isAuteur ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => { setAutopsyOpen(!autopsyOpen); setIsAutopsied(!autopsyOpen); }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--blood-reel)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {autopsyOpen ? '[-] HIDE DEEP AUTOPSY' : '[+] PERFORM DEEP AUTOPSY (Auteur Feature)'}
                </div>
                {!isAuteur && (
                    <button onClick={(e) => { e.stopPropagation(); onUpgrade() }} style={{ background: 'none', border: 'none', color: 'var(--blood-reel)', textDecoration: 'underline', fontSize: '0.6rem', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Lock size={10} /> UPGRADE
                    </button>
                )}
            </div>

            <AnimatePresence>
                {autopsyOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}
                    >
                        {/* Autopsy Engine */}
                        <div style={{ opacity: isAuteur ? 1 : 0.4, pointerEvents: isAuteur ? 'auto' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block' }}>
                                        THE AUTOPSY ENGINE (1-10)
                                    </label>
                                </div>
                                <button onClick={(e) => {
                                    e.preventDefault()
                                    reelToast("STORY: Narrative & Structure\nSCRIPT: Dialogue & Theme\nACTING: Micro-expressions & Presence\nCINEMATOGRAPHY: Light, Shadow & Framing\nEDITING: Rhythm & Pacing\nSOUND: Score & Silence", { duration: 8000, icon: '📖' })
                                }} className="btn btn-ghost" style={{ fontSize: '0.45rem', padding: '0.2rem 0.4rem', color: 'var(--fog)' }}>
                                    ✦ FIELD MANUAL
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {Object.keys(autopsy).map(axis => (
                                    <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '100px', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.05em', color: 'var(--fog)' }}>
                                            {AUTOPSY_LABELS[axis] || axis.toUpperCase()}
                                        </div>
                                        <input
                                            type="range"
                                            min="0" max="10" step="1"
                                            value={autopsy[axis]}
                                            onChange={(e) => setAutopsy({ ...autopsy, [axis]: parseInt(e.target.value) })}
                                            style={{ flex: 1, accentColor: 'var(--blood-reel)', height: '4px', background: 'var(--ash)', appearance: 'none', borderRadius: '2px', cursor: 'pointer' }}
                                        />
                                        <div style={{ width: '20px', textAlign: 'right', fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--bone)' }}>
                                            {autopsy[axis] || '-'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Live Target Preview */}
                            <div style={{ marginTop: '1.5rem', background: 'var(--ink)', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', padding: '1rem' }}>
                                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                                    LIVE DOSSIER PREVIEW
                                </label>
                                <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left', width: '117%' }}>
                                    <RadarChart autopsy={autopsy} />
                                </div>
                            </div>
                        </div>

                        {/* Curatorial Control */}
                        <div style={{ opacity: isAuteur ? 1 : 0.4, pointerEvents: isAuteur ? 'auto' : 'none' }}>
                            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--bone)', display: 'block', marginBottom: '0.75rem' }}>
                                CURATORIAL CONTROL (ALT POSTER)
                            </label>
                            {availablePosters.length > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <button onClick={(e) => {
                                        e.preventDefault()
                                        posterScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })
                                    }} style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                                        <ChevronLeft size={14} />
                                    </button>
                                    
                                    <div ref={posterScrollRef} style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', flex: 1 }}>
                                        <button
                                            onClick={(e) => { e.preventDefault(); setAltPoster(null); }}
                                            style={{ flexShrink: 0, width: 44, height: 66, background: altPoster === null ? 'var(--sepia)' : 'var(--ink)', border: altPoster === null ? '2px solid var(--sepia)' : '1px solid var(--ash)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: altPoster === null ? 'var(--ink)' : 'var(--fog)' }}
                                        >
                                            DEFAULT
                                        </button>
                                        {availablePosters.map(p => (
                                            <img
                                                key={p.file_path}
                                                src={tmdb.poster(p.file_path, 'w92')}
                                                onClick={(e) => { e.preventDefault(); setAltPoster(p.file_path); }}
                                                style={{
                                                    flexShrink: 0, width: 44, height: 66, objectFit: 'cover', borderRadius: '2px', cursor: 'pointer',
                                                    border: altPoster === p.file_path ? '2px solid var(--blood-reel)' : '1px solid transparent',
                                                    opacity: altPoster && altPoster !== p.file_path ? 0.4 : 1
                                                }}
                                            />
                                        ))}
                                    </div>

                                    <button onClick={(e) => {
                                        e.preventDefault()
                                        posterScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })
                                    }} style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fog)', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)' }}>
                                    No alternative active posters found on TMDB.
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
