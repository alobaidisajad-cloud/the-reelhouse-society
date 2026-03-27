import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FilmCard, SectionHeader } from '../UI'

import { useViewport } from '../../hooks/useViewport'

const FilmStripRow = memo(function FilmStripRow({ films = [], title, label, description }: { films?: any[]; title: string; label: string; description?: string }) {
    const { isTouch: IS_TOUCH } = useViewport()
    const navigate = useNavigate()
    return (
        <section style={{ position: 'relative', margin: '3rem 0 1rem', contain: 'layout style' }}>
            {/* Editorial Header Layout */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                padding: '0 1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Sleek vertical editorial indicator rather than a horizontal divider */}
                    <div style={{
                        width: '3px',
                        height: '1.8rem',
                        background: 'linear-gradient(to bottom, var(--sepia), var(--flicker))',
                        borderRadius: '2px',
                        boxShadow: '0 0 10px rgba(139,105,20,0.4)'
                    }} />
                    <SectionHeader label={label} title={title} style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }} />
                </div>

                {/* Ultra-minimal un-boxed button */}
                <button
                    className="btn btn-ghost"
                    style={{
                        fontSize: '0.65rem',
                        padding: '0.5em 0',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'transparent',
                        boxShadow: 'none',
                        color: 'var(--fog)',
                        letterSpacing: '0.25em',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--parchment)';
                        e.currentTarget.style.textShadow = '0 0 8px rgba(242,232,160,0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--fog)';
                        e.currentTarget.style.textShadow = 'none';
                    }}
                    onClick={() => navigate('/discover')}
                >
                    VIEW ALL <span style={{ fontSize: '1.2em', color: 'var(--sepia)', transition: 'transform 0.3s ease' }} className="arrow-icon">⟶</span>
                </button>
            </div>

            {/* Inset description for organic reading flow */}
            {description && (
                <div style={{ padding: '0 1rem 2rem 2.2rem' }}>
                    <p style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.95rem',
                        color: 'var(--bone)',
                        maxWidth: '700px',
                        lineHeight: 1.6,
                        opacity: 0.75,
                        margin: 0,
                        textShadow: '0 1px 2px var(--ink)'
                    }}>
                        {description}
                    </p>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                {/* Soft gradient masks — creates a seamless bleed into the edges instead of harsh cuts */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to right, var(--ink) 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to left, var(--ink) 0%, transparent 100%)', zIndex: 2, pointerEvents: 'none' }} />

                {/* Unbounded horizontal scroll */}
                <div className="film-strip-scroll" style={{
                    padding: '0.5rem 1.5rem 2rem',
                    display: 'flex',
                    gap: '1.5rem',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    scrollSnapType: 'x mandatory'
                }}>
                    {films.slice(0, 15).map((film, i) => (
                        IS_TOUCH ? (
                            // Mobile: plain div — no Framer Motion blur/filter that destroys GPU performance
                            <div
                                key={film.id}
                                className="scroll-item"
                                style={{
                                    scrollSnapAlign: 'start',
                                    flexShrink: 0,
                                    width: '130px',
                                }}
                            >
                                <FilmCard
                                    film={film}
                                    showRating
                                    onClick={() => navigate(`/film/${film.id}`)}
                                />
                            </div>
                        ) : (
                            // Desktop: cinematic reveal — opacity only (NO blur filter — it forces full GPU recomposition)
                            <motion.div
                                key={film.id}
                                className="scroll-item"
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true, margin: "100px" }}
                                transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.5, ease: "easeOut" }}
                                style={{
                                    scrollSnapAlign: 'start',
                                    flexShrink: 0,
                                    width: '170px',
                                    transformOrigin: 'bottom center',
                                }}
                            >
                                <FilmCard
                                    film={film}
                                    showRating
                                    onClick={() => navigate(`/film/${film.id}`)}
                                />
                            </motion.div>
                        )
                    ))}
                </div>
            </div>
        </section>
    )
})

export default FilmStripRow
