import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Check, Film, Maximize2 } from 'lucide-react'
import html2canvas from 'html2canvas'

export default function TicketStubGallery({ stub, onClose }) {
    const stubRef = useRef(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloaded, setDownloaded] = useState(false)

    // Generate random stylized barcode string length
    const barcodeStr = Array.from({ length: 45 }).map(() => Math.random() > 0.5 ? '|' : 'I').join('')

    const handleDownload = async () => {
        if (!stubRef.current || isDownloading) return
        setIsDownloading(true)

        try {
            const canvas = await html2canvas(stubRef.current, {
                scale: 3, // High-res export for Instagram Story
                backgroundColor: '#0E0B08', // Ink background
                useCORS: true,
                logging: false,
            })

            const image = canvas.toDataURL('image/png')
            const a = document.createElement('a')
            a.href = image
            a.download = `Society-Stub-${stub.title.replace(/\s+/g, '-')}.png`
            a.click()
            setDownloaded(true)
            setTimeout(() => setDownloaded(false), 3000)
        } catch (error) {
            console.error("Failed to generate ticket stub", error)
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
            {/* Downloadable Area (9:16 aspect ratio roughly enforced by padding) */}
            <div
                ref={stubRef}
                style={{
                    background: 'var(--ink)',
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    maxWidth: '400px', // Mobile/Story bounds
                    position: 'relative'
                }}
            >
                {/* Physical Ticket Element */}
                <motion.div
                    initial={{ y: 20, opacity: 0, rotate: -2 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 15 }}
                    style={{
                        background: 'linear-gradient(170deg, var(--parchment) 0%, var(--bone) 100%)',
                        width: '100%',
                        borderRadius: '4px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(0,0,0,0.1)',
                        position: 'relative',
                        overflow: 'hidden',
                        filter: 'sepia(0.2) contrast(1.1)',
                    }}
                >
                    {/* Top edge perforations */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', position: 'absolute', top: -4, left: 0, right: 0 }}>
                        {Array.from({ length: 15 }).map((_, i) => (
                            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }} />
                        ))}
                    </div>

                    <div style={{ padding: '2.5rem 1.5rem 2rem', borderBottom: '2px dashed var(--fog)', position: 'relative' }}>

                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.3em', color: 'var(--soot)', textAlign: 'center', marginBottom: '1.5rem' }}>
                            REELHOUSE SOCIETY
                        </div>

                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--ink)', lineHeight: 1.1, textAlign: 'center', marginBottom: '0.5rem' }}>
                            {stub.title}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--ash)', border: '1px solid var(--ash)', padding: '2px 6px', borderRadius: 2 }}>
                                {stub.format}
                            </span>
                            {stub.ticketType === 'VIP' && (
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', background: 'var(--ink)', color: 'var(--flicker)', padding: '2px 6px', borderRadius: 2 }}>
                                    VIP
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.15em' }}>DATE</div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--ink)', fontWeight: 'bold' }}>{stub.date}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.15em' }}>TIME</div>
                                <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--ink)', fontWeight: 'bold' }}>{stub.time}</div>
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.15em' }}>SEAT</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--blood-reel)' }}>{stub.seat}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.15em' }}>VENUE</div>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--ink)', fontWeight: 'bold' }}>{stub.venue}</div>
                            </div>
                            {stub.screen && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.15em' }}>SCREEN</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--ink)', fontWeight: 'bold' }}>{stub.screen}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.03)' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', display: 'flex', justifyContent: 'space-between', color: 'var(--fog)', marginBottom: '0.5rem' }}>
                            <span>NO. {Math.floor(Math.random() * 900000) + 100000}</span>
                            <span>ADMIT ONE</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '1.5rem', letterSpacing: '-1px', color: 'var(--ash)', overflow: 'hidden', whiteSpace: 'nowrap', opacity: 0.7 }}>
                            {barcodeStr}
                        </div>
                    </div>

                    {/* Bottom edge perforations */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', position: 'absolute', bottom: -4, left: 0, right: 0 }}>
                        {Array.from({ length: 15 }).map((_, i) => (
                            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink)', boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.5)' }} />
                        ))}
                    </div>
                </motion.div>

                {/* Branding strictly for the exported image context */}
                <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.5 }}>
                    <Film size={14} color="var(--sepia)" />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.8rem', color: 'var(--parchment)' }}>The ReelHouse Society</span>
                </div>
            </div>

            {/* User Action Area */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: '400px', flexDirection: 'column' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleDownload}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}
                >
                    {isDownloading ? (
                        <span style={{ animation: 'flicker-text 1s infinite' }}>PROCESSING...</span>
                    ) : downloaded ? (
                        <><Check size={16} /> SAVED TO DEVICE</>
                    ) : (
                        <><Download size={16} /> SAVE DIGITAL STUB</>
                    )}
                </button>
                <button
                    className="btn btn-ghost"
                    onClick={onClose}
                    style={{ width: '100%', justifyContent: 'center' }}
                >
                    Return to Lobby
                </button>
            </div>

        </div>
    )
}
