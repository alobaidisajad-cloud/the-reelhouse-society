// Visual Seat Map Editor — Venue Dashboard component
// Allows venue owner to configure their actual auditorium layout:
// rows, columns, VIP zone, aisle position, blocked seats, up to 6 named screens

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, LayoutGrid, Armchair, Monitor, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'

const ROW_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']
const SCREEN_COLORS = ['#8B6914','#1d6e34','#5c1a0b','#1a3a6d','#5c3a0b','#2a0b5c']

function ScreenBadge({ name, color, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active ? `${color}22` : 'transparent',
                border: `1px solid ${active ? color : 'var(--ash)'}`,
                color: active ? color : 'var(--fog)',
                fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.12em',
                padding: '0.3rem 0.8rem', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
        >
            <Monitor size={10} />
            {name}
        </button>
    )
}

// Preview of the seat map based on current config
function SeatMapPreview({ config, screenColor }) {
    const { rows, cols, vipRows, aisleAfterCol, blockedSeats } = config
    const rowLabels = ROW_LABELS.slice(0, Math.min(rows, 20))
    const colNums = Array.from({ length: Math.min(cols, 20) }, (_, i) => i + 1)
    const vipSet = new Set(ROW_LABELS.slice(0, vipRows))
    const blocked = new Set(blockedSeats || [])

    // Scale seat size based on total seats — keep it within viewport
    const seatW = Math.max(10, Math.min(22, Math.floor(480 / cols)))
    const seatH = Math.max(8, Math.min(18, seatW * 0.85))
    const gap = Math.max(2, Math.min(4, seatW * 0.18))

    return (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420, padding: '0.5rem' }}>
            {/* Screen */}
            <div style={{ padding: '0 2rem', marginBottom: '0.75rem' }}>
                <div style={{
                    height: 4,
                    background: `linear-gradient(90deg, transparent, ${screenColor}99 20%, ${screenColor} 50%, ${screenColor}99 80%, transparent)`,
                    borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
                    boxShadow: `0 0 12px 3px ${screenColor}44`,
                }} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginTop: 3, opacity: 0.7 }}>
                    ── SCREEN ──
                </div>
            </div>

            {/* Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'center' }}>
                {rowLabels.map((row, ri) => {
                    const isVip = vipSet.has(row)
                    const isFirstStd = ri === vipRows
                    return (
                        <div key={row}>
                            {isFirstStd && (
                                <div style={{ textAlign: 'center', marginBottom: gap, opacity: 0.4 }}>
                                    <div style={{ height: 1, background: 'var(--ash)', width: '60%', margin: '0 auto' }} />
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                <span style={{ width: 16, textAlign: 'right', paddingRight: 4, fontFamily: 'var(--font-ui)', fontSize: '0.36rem', color: isVip ? screenColor : 'var(--fog)', opacity: 0.8 }}>{row}</span>
                                <div style={{ display: 'flex', gap }}>
                                    {colNums.map(col => {
                                        const seatId = `${row}${col}`
                                        const isBlocked = blocked.has(seatId)
                                        const afterAisle = aisleAfterCol > 0 && col === aisleAfterCol + 1
                                        const bg = isBlocked
                                            ? 'rgba(30,20,10,0.4)'
                                            : isVip
                                                ? `${screenColor}55`
                                                : 'rgba(30,26,20,0.9)'
                                        const border = isBlocked
                                            ? 'rgba(60,50,40,0.3)'
                                            : isVip ? screenColor : '#3a3328'
                                        return (
                                            <div key={seatId} style={{ marginLeft: afterAisle ? 10 : 0 }}>
                                                <div style={{
                                                    width: seatW, height: seatH,
                                                    background: bg,
                                                    border: `1px solid ${border}`,
                                                    borderRadius: '3px 3px 1px 1px',
                                                    opacity: isBlocked ? 0.25 : 1,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {isBlocked && <span style={{ fontSize: '0.4rem', color: 'var(--fog)', opacity: 0.5 }}>✕</span>}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Stats */}
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
                {[
                    ['TOTAL', rows * cols],
                    ['VIP', vipRows * cols],
                    ['STANDARD', (rows - vipRows) * cols],
                    ['BLOCKED', (blockedSeats || []).length],
                ].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--flicker)', lineHeight: 1 }}>{val}</div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 2 }}>{lbl}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// The seat grid editor — click to block/unblock seats
function BlockedSeatEditor({ config, onToggleBlock }) {
    const { rows, cols, vipRows, aisleAfterCol, blockedSeats } = config
    const rowLabels = ROW_LABELS.slice(0, Math.min(rows, 20))
    const colNums = Array.from({ length: Math.min(cols, 20) }, (_, i) => i + 1)
    const vipSet = new Set(ROW_LABELS.slice(0, vipRows))
    const blocked = new Set(blockedSeats || [])

    const seatW = Math.max(14, Math.min(28, Math.floor(560 / cols)))
    const seatH = Math.round(seatW * 0.82)
    const gap = 3

    return (
        <div style={{ overflowX: 'auto', padding: '0.5rem' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                Click any seat to mark it as blocked (wall, pillar, reserved space).
            </div>
            {/* Screen */}
            <div style={{ padding: '0 2rem', marginBottom: '0.75rem' }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.5) 30%, var(--flicker) 50%, rgba(139,105,20,0.5) 70%, transparent)', borderRadius: '50% 50% 0 0 / 100% 100% 0 0' }} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.5em', color: 'var(--sepia)', marginTop: 3, opacity: 0.7 }}>── SCREEN ──</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'center' }}>
                {rowLabels.map((row, ri) => {
                    const isVip = vipSet.has(row)
                    return (
                        <div key={row}>
                            {ri === vipRows && <div style={{ height: 1, background: 'var(--ash)', width: '70%', margin: `${gap}px auto`, opacity: 0.4 }} />}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                <span style={{ width: 18, textAlign: 'right', paddingRight: 5, fontFamily: 'var(--font-ui)', fontSize: '0.38rem', color: isVip ? 'var(--flicker)' : 'var(--fog)' }}>{row}</span>
                                <div style={{ display: 'flex', gap }}>
                                    {colNums.map(col => {
                                        const seatId = `${row}${col}`
                                        const isBlocked = blocked.has(seatId)
                                        const afterAisle = aisleAfterCol > 0 && col === aisleAfterCol + 1
                                        return (
                                            <div key={seatId} style={{ marginLeft: afterAisle ? 12 : 0 }}>
                                                <div
                                                    onClick={() => onToggleBlock(seatId)}
                                                    title={isBlocked ? `Unblock ${seatId}` : `Block ${seatId}`}
                                                    style={{
                                                        width: seatW, height: seatH,
                                                        background: isBlocked ? 'rgba(92,26,11,0.7)' : isVip ? 'rgba(139,105,20,0.25)' : 'rgba(30,26,20,0.9)',
                                                        border: `1.5px solid ${isBlocked ? 'var(--blood-reel)' : isVip ? 'var(--sepia)' : '#3a3328'}`,
                                                        borderRadius: '3px 3px 1px 1px',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.transform = 'scale(1.1)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}
                                                >
                                                    {isBlocked && <span style={{ fontSize: '0.5rem', color: 'var(--blood-reel)' }}>✕</span>}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Slider input with label
function SliderField({ label, value, min, max, onChange, hint }) {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.12em', color: 'var(--sepia)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--flicker)', lineHeight: 1 }}>{value}</span>
            </div>
            <input
                type="range" min={min} max={max} value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--sepia)' }}
            />
            {hint && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.2rem' }}>{hint}</div>}
        </div>
    )
}

export default function SeatMapEditor({ venue, onSave }) {
    const initScreens = venue.screens && venue.screens.length > 0
        ? venue.screens
        : [{ id: 'sc-1', name: 'Screen 1', seatLayout: { ...venue.seatLayout }, color: SCREEN_COLORS[0], blockedSeats: [] }]

    const [screens, setScreens] = useState(initScreens)
    const [activeScreenIdx, setActiveScreenIdx] = useState(0)
    const [editingScreenName, setEditingScreenName] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [mode, setMode] = useState('configure') // 'configure' | 'block'
    const [saved, setSaved] = useState(false)

    const activeScreen = screens[activeScreenIdx] || screens[0]
    const config = activeScreen.seatLayout

    const updateConfig = useCallback((key, val) => {
        setScreens(prev => prev.map((sc, i) => i === activeScreenIdx
            ? { ...sc, seatLayout: { ...sc.seatLayout, [key]: val } }
            : sc
        ))
    }, [activeScreenIdx])

    const toggleBlocked = useCallback((seatId) => {
        setScreens(prev => prev.map((sc, i) => {
            if (i !== activeScreenIdx) return sc
            const cur = sc.seatLayout.blockedSeats || []
            const next = cur.includes(seatId) ? cur.filter(s => s !== seatId) : [...cur, seatId]
            return { ...sc, seatLayout: { ...sc.seatLayout, blockedSeats: next } }
        }))
    }, [activeScreenIdx])

    const addScreen = () => {
        if (screens.length >= 6) { toast.error('Maximum 6 screens per venue'); return }
        const newScreen = {
            id: 'sc-' + Date.now(),
            name: `Screen ${screens.length + 1}`,
            color: SCREEN_COLORS[screens.length % SCREEN_COLORS.length],
            seatLayout: { rows: 8, cols: 12, vipRows: 2, aisleAfterCol: 6, blockedSeats: [] },
        }
        setScreens(prev => [...prev, newScreen])
        setActiveScreenIdx(screens.length)
    }

    const removeScreen = (idx) => {
        if (screens.length === 1) { toast.error('You need at least one screen'); return }
        setScreens(prev => prev.filter((_, i) => i !== idx))
        setActiveScreenIdx(Math.max(0, activeScreenIdx - 1))
    }

    const handleSave = () => {
        onSave({ screens, seatLayout: screens[0].seatLayout })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        toast.success('Seat map saved')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', color: 'var(--parchment)' }}>Seat Map Editor</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 3 }}>
                        Configure each screen's layout — rows, VIP zone, aisle position, and blocked seats
                    </div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    style={{ gap: '0.4rem', minWidth: 110 }}
                >
                    {saved ? <><Check size={12} /> Saved!</> : <><Check size={12} /> Save Map</>}
                </button>
            </div>

            {/* Screen Tabs */}
            <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.6rem' }}>YOUR SCREENS ({screens.length}/6)</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {screens.map((sc, i) => (
                        <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                            {editingScreenName && i === activeScreenIdx ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <input
                                        className="input"
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                if (nameDraft.trim()) {
                                                    setScreens(prev => prev.map((s, si) => si === i ? { ...s, name: nameDraft.trim() } : s))
                                                }
                                                setEditingScreenName(false)
                                            }
                                            if (e.key === 'Escape') setEditingScreenName(false)
                                        }}
                                        autoFocus
                                        style={{ width: 110, fontSize: '0.6rem', padding: '0.25rem 0.5rem' }}
                                    />
                                    <button
                                        onClick={() => {
                                            if (nameDraft.trim()) setScreens(prev => prev.map((s, si) => si === i ? { ...s, name: nameDraft.trim() } : s))
                                            setEditingScreenName(false)
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--sepia)', cursor: 'pointer', padding: '0.2rem' }}
                                    ><Check size={13} /></button>
                                </div>
                            ) : (
                                <ScreenBadge
                                    name={sc.name}
                                    color={sc.color}
                                    active={i === activeScreenIdx}
                                    onClick={() => {
                                        setActiveScreenIdx(i)
                                        setMode('configure')
                                        setEditingScreenName(false)
                                    }}
                                />
                            )}
                            {i === activeScreenIdx && !editingScreenName && (
                                <button
                                    onClick={() => { setNameDraft(sc.name); setEditingScreenName(true) }}
                                    style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: '0.2rem 0.3rem' }}
                                    title="Rename screen"
                                ><Edit2 size={11} /></button>
                            )}
                            {screens.length > 1 && i === activeScreenIdx && (
                                <button
                                    onClick={() => removeScreen(i)}
                                    style={{ background: 'none', border: 'none', color: 'var(--blood-reel)', cursor: 'pointer', padding: '0.2rem 0.25rem', opacity: 0.7 }}
                                    title="Remove screen"
                                ><Trash2 size={11} /></button>
                            )}
                        </div>
                    ))}
                    {screens.length < 6 && (
                        <button
                            onClick={addScreen}
                            className="btn btn-ghost"
                            style={{ fontSize: '0.52rem', padding: '0.25rem 0.65rem', gap: '0.25rem' }}
                        >
                            <Plus size={11} /> Add Screen
                        </button>
                    )}
                </div>
            </div>

            {/* Mode Toggle */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[
                    { id: 'configure', label: 'Configure Layout', icon: LayoutGrid },
                    { id: 'block', label: 'Mark Blocked Seats', icon: Armchair },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setMode(id)}
                        style={{
                            background: mode === id ? 'rgba(139,105,20,0.15)' : 'transparent',
                            border: `1px solid ${mode === id ? 'var(--sepia)' : 'var(--ash)'}`,
                            color: mode === id ? 'var(--parchment)' : 'var(--fog)',
                            fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.1em',
                            padding: '0.4rem 0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', gap: '0.35rem',
                        }}
                    >
                        <Icon size={12} />{label.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Main Grid: Controls + Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Left: Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {mode === 'configure' ? (
                        <>
                            <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>DIMENSIONS</div>
                                <SliderField label="ROWS" value={config.rows || 10} min={3} max={20} onChange={v => updateConfig('rows', v)} hint={`Rows ${ROW_LABELS[0]}–${ROW_LABELS[(config.rows || 10) - 1]}`} />
                                <SliderField label="SEATS PER ROW" value={config.cols || 15} min={5} max={30} onChange={v => updateConfig('cols', v)} />
                            </div>
                            <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>ZONES</div>
                                <SliderField
                                    label="VIP ROWS"
                                    value={Math.min(config.vipRows || 2, config.rows - 1)}
                                    min={0} max={Math.min(5, (config.rows || 10) - 1)}
                                    onChange={v => updateConfig('vipRows', v)}
                                    hint={v => `Gold rows ${ROW_LABELS[0]}–${ROW_LABELS[(config.vipRows || 2) - 1] || ROW_LABELS[0]}`}
                                />
                                <SliderField
                                    label="AISLE AFTER COL"
                                    value={config.aisleAfterCol || 0}
                                    min={0} max={Math.max(0, (config.cols || 15) - 1)}
                                    onChange={v => updateConfig('aisleAfterCol', v)}
                                    hint={config.aisleAfterCol === 0 ? 'No centre aisle' : `Gap after seat ${config.aisleAfterCol}`}
                                />
                            </div>
                        </>
                    ) : (
                        <div style={{ background: 'var(--soot)', border: '1px solid var(--ash)', padding: '1.25rem' }}>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: 'var(--sepia)', marginBottom: '0.75rem' }}>BLOCKED SEATS</div>
                            {(config.blockedSeats || []).length === 0 ? (
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', fontStyle: 'italic', lineHeight: 1.6 }}>
                                    No blocked seats. Click seats on the map to block them.
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.75rem' }}>
                                        {(config.blockedSeats || []).map(s => (
                                            <span
                                                key={s}
                                                onClick={() => toggleBlocked(s)}
                                                style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', border: '1px solid var(--blood-reel)', color: 'var(--blood-reel)', padding: '2px 6px', cursor: 'pointer' }}
                                                title="Click to unblock"
                                            >
                                                {s} ✕
                                            </span>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setScreens(prev => prev.map((sc, i) => i === activeScreenIdx ? { ...sc, seatLayout: { ...sc.seatLayout, blockedSeats: [] } } : sc))}
                                        className="btn btn-ghost"
                                        style={{ fontSize: '0.52rem' }}
                                    >
                                        Clear All Blocks
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Totals */}
                    <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        {[
                            ['TOTAL SEATS', (config.rows || 10) * (config.cols || 15) - (config.blockedSeats?.length || 0)],
                            ['VIP SEATS', (config.vipRows || 2) * (config.cols || 15)],
                            ['STANDARD', ((config.rows || 10) - (config.vipRows || 2)) * (config.cols || 15)],
                            ['BLOCKED', config.blockedSeats?.length || 0],
                        ].map(([lbl, val]) => (
                            <div key={lbl}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--flicker)', lineHeight: 1 }}>{val}</div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 2 }}>{lbl}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Preview or Block Editor */}
                <div style={{ background: 'var(--soot)', border: `2px solid ${activeScreen.color}44`, padding: '1.25rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.52rem', letterSpacing: '0.18em', color: activeScreen.color || 'var(--sepia)', marginBottom: '0.75rem' }}>
                        {mode === 'block' ? `${activeScreen.name.toUpperCase()} — CLICK TO BLOCK/UNBLOCK` : `${activeScreen.name.toUpperCase()} — LIVE PREVIEW`}
                    </div>
                    <AnimatePresence mode="wait">
                        <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            {mode === 'configure' ? (
                                <SeatMapPreview config={config} screenColor={activeScreen.color} />
                            ) : (
                                <BlockedSeatEditor config={config} onToggleBlock={toggleBlocked} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
