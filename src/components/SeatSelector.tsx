// Interactive cinema seating map component — premium cinema room feel
// Screen at top, VIP rows A-B in gold, Standard rows below, aisle in middle

import { X, Check } from 'lucide-react'
import { useState, useEffect } from 'react'

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

interface SeatTooltip {
    id: string
    isVip: boolean
    isBooked: boolean
}

const SCREEN_GLOW_STYLE = `
@keyframes screenPulse {
  0%, 100% { box-shadow: 0 0 28px 6px rgba(242,232,160,0.35), 0 0 60px 8px rgba(242,232,160,0.1); }
  50% { box-shadow: 0 0 38px 10px rgba(242,232,160,0.55), 0 0 80px 14px rgba(242,232,160,0.18); }
}
@keyframes seatPop {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1.2); }
}
@keyframes vipShimmer {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}
`

export default function SeatSelector({ slot, seatLayout = {}, selectedSeat, onSeatSelect }: { slot?: any; seatLayout?: any; selectedSeat?: string | null; onSeatSelect?: (seatId: string, kind: string) => void }) {
    const { rows = 10, cols = 15, vipRows = 2, aisleAfterCol = 7 } = seatLayout
    const rowLabels = ROW_LABELS.slice(0, rows)
    const colNums = Array.from({ length: cols }, (_, i) => i + 1)
    const vipRowSet = new Set(ROW_LABELS.slice(0, vipRows))
    const bookedSet = new Set(slot?.bookedSeats || [])
    const [tooltip, setTooltip] = useState<SeatTooltip | null>(null)
    const [justSelected, setJustSelected] = useState<string | null>(null)

    // Inject animation keyframes
    useEffect(() => {
        const styleId = 'seat-selector-styles'
        if (!document.getElementById(styleId)) {
            const s = document.createElement('style')
            s.id = styleId
            s.textContent = SCREEN_GLOW_STYLE
            document.head.appendChild(s)
        }
    }, [])

    const handleSelect = (seatId: string, kind: string) => {
        onSeatSelect?.(seatId, kind)
        setJustSelected(seatId)
        setTimeout(() => setJustSelected(null), 500)
    }

    const getSeatStyle = (seatId: string, isVip: boolean, isBooked: boolean, isSelected: boolean): any => {
        const isPopping = justSelected === seatId
        let bg, border, boxShadow = 'none'
        if (isBooked) {
            bg = 'rgba(80,20,8,0.9)'
            border = 'rgba(120,30,15,0.5)'
        } else if (isSelected) {
            bg = 'linear-gradient(160deg, #1d6e34, #27913f)'
            border = '#3dba5a'
            boxShadow = '0 0 10px 3px rgba(39,145,63,0.5), 0 0 20px 4px rgba(39,145,63,0.2)'
        } else if (isVip) {
            bg = 'linear-gradient(160deg, rgba(139,105,20,0.3), rgba(200,160,40,0.18))'
            border = '#a07820'
        } else {
            bg = 'linear-gradient(160deg, #1e1a14, #161210)'
            border = '#3a3328'
        }
        return {
            width: 26,
            height: 22,
            background: bg,
            border: `1.5px solid ${border}`,
            borderRadius: '4px 4px 2px 2px',
            cursor: isBooked ? 'not-allowed' : 'pointer',
            transition: isPopping ? 'none' : 'all 0.15s ease',
            animation: isPopping ? 'seatPop 0.4s ease forwards' : 'none',
            flexShrink: 0,
            boxShadow,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }
    }

    const totalSeats = rowLabels.length * cols
    const bookedCount = bookedSet.size
    const availableCount = totalSeats - bookedCount
    const pct = Math.round((bookedCount / totalSeats) * 100)

    return (
        <div style={{ userSelect: 'none' }}>
            {/* Availability bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: availableCount < 20 ? 'var(--blood-reel)' : 'var(--flicker)', lineHeight: 1 }}>
                        {availableCount}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.44rem', color: 'var(--fog)', letterSpacing: '0.15em', marginTop: 2 }}>SEATS AVAILABLE</div>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ height: 5, background: 'var(--ash)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--blood-reel)' : 'var(--sepia)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.42rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: 3, textAlign: 'right' }}>{pct}% BOOKED</div>
                </div>
            </div>

            {/* Screen */}
            <div style={{ padding: '0 2.5rem', marginBottom: '1rem' }}>
                <div style={{
                    height: 6,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(242,232,160,0.4) 15%, var(--flicker) 35%, #fff8e7 50%, var(--flicker) 65%, rgba(242,232,160,0.4) 85%, transparent 100%)',
                    borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
                    animation: 'screenPulse 3s ease-in-out infinite',
                }} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.42rem', letterSpacing: '0.6em', color: 'var(--sepia)', marginTop: '0.4rem', opacity: 0.7 }}>
                    ── SCREEN ──
                </div>
            </div>

            {/* VIP Zone Badge */}
            <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: '0.44rem', letterSpacing: '0.25em',
                    color: 'var(--flicker)', border: '1px solid rgba(139,105,20,0.5)',
                    padding: '3px 12px', background: 'rgba(139,105,20,0.08)',
                    animation: 'vipShimmer 2.5s ease-in-out infinite',
                    display: 'inline-block',
                }}>
                    ✦ VIP ZONE — ROWS {ROW_LABELS[0]}–{ROW_LABELS[vipRows - 1]}
                </span>
            </div>

            {/* Seat Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', padding: '0.75rem 0' }}>
                {rowLabels.map((row, rowIdx) => {
                    const isVipRow = vipRowSet.has(row)
                    const isFirstStandardRow = rowIdx === vipRows
                    return (
                        <div key={row}>
                            {isFirstStandardRow && (
                                <div style={{ textAlign: 'center', marginBottom: '0.5rem', padding: '2px 0' }}>
                                    <div style={{ height: 1, background: 'var(--ash)', margin: '0 auto 4px', width: '70%', opacity: 0.4 }} />
                                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.38rem', letterSpacing: '0.2em', color: 'var(--fog)', opacity: 0.5 }}>STANDARD SEATING</span>
                                    <div style={{ height: 1, background: 'var(--ash)', margin: '4px auto 0', width: '70%', opacity: 0.4 }} />
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                <span style={{
                                    width: 22, textAlign: 'right', paddingRight: 7,
                                    fontFamily: 'var(--font-ui)', fontSize: '0.44rem',
                                    color: isVipRow ? 'var(--flicker)' : 'var(--fog)',
                                    fontWeight: isVipRow ? '700' : '400',
                                    letterSpacing: '0.05em',
                                }}>
                                    {row}
                                </span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {colNums.map(col => {
                                        const seatId = `${row}${col}`
                                        const isBooked = bookedSet.has(seatId)
                                        const isSelected = seatId === selectedSeat
                                        const afterAisle = col === aisleAfterCol + 1
                                        return (
                                            <div key={seatId} style={{ marginLeft: afterAisle ? 16 : 0, position: 'relative' }}>
                                                <div
                                                    style={getSeatStyle(seatId, isVipRow, isBooked, isSelected)}
                                                    onClick={() => { if (!isBooked) handleSelect(seatId, isVipRow ? 'VIP' : 'Standard') }}
                                                    onMouseEnter={e => {
                                                        setTooltip({ id: seatId, isVip: isVipRow, isBooked })
                                                        if (!isBooked && !isSelected) {
                                                            e.currentTarget.style.background = isVipRow
                                                                ? 'linear-gradient(160deg, rgba(200,160,40,0.45), rgba(242,220,80,0.25))'
                                                                : 'linear-gradient(160deg, #2a261e, #1e1a14)'
                                                            e.currentTarget.style.borderColor = isVipRow ? '#c89a28' : '#5a5040'
                                                            e.currentTarget.style.transform = 'scale(1.15) translateY(-1px)'
                                                            e.currentTarget.style.boxShadow = isVipRow
                                                                ? '0 3px 8px rgba(139,105,20,0.4)'
                                                                : '0 3px 6px rgba(0,0,0,0.5)'
                                                        }
                                                    }}
                                                    onMouseLeave={e => {
                                                        setTooltip(null)
                                                        if (!isBooked && !isSelected) {
                                                            const origStyle = getSeatStyle(seatId, isVipRow, false, false)
                                                            e.currentTarget.style.background = origStyle.background
                                                            e.currentTarget.style.borderColor = origStyle.border?.replace('1.5px solid ', '') || origStyle.border
                                                            e.currentTarget.style.transform = 'scale(1) translateY(0)'
                                                            e.currentTarget.style.boxShadow = 'none'
                                                        }
                                                    }}
                                                >
                                                    {isBooked && (
                                                        <span style={{ fontSize: '0.45rem', color: 'rgba(200,80,60,0.6)', lineHeight: 1, pointerEvents: 'none' }}><X size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
                                                    )}
                                                    {isSelected && (
                                                        <span style={{ fontSize: '0.55rem', color: '#3dba5a', lineHeight: 1, pointerEvents: 'none' }}><Check size={12} style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <span style={{ width: 22, paddingLeft: 7, fontFamily: 'var(--font-ui)', fontSize: '0.44rem', color: isVipRow ? 'var(--flicker)' : 'var(--fog)' }}>
                                    {row}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Column numbers */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingLeft: 29, marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {colNums.map(col => (
                        <div key={col} style={{ marginLeft: col === aisleAfterCol + 1 ? 16 : 0 }}>
                            <div style={{ width: 26, textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.36rem', color: 'var(--ash)', opacity: 0.6 }}>
                                {col}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div style={{
                    textAlign: 'center', marginTop: '0.75rem',
                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.12em',
                    color: tooltip.isVip ? 'var(--flicker)' : tooltip.isBooked ? 'var(--blood-reel)' : 'var(--fog)',
                }}>
                    {tooltip.id} · {tooltip.isVip ? '✦ VIP' : 'STANDARD'}{tooltip.isBooked ? ' · OCCUPIED' : ' · AVAILABLE'}
                </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', marginTop: tooltip ? '0.5rem' : '1.25rem', flexWrap: 'wrap' }}>
                {[
                    { bg: 'linear-gradient(160deg, #1e1a14, #161210)', border: '#3a3328', label: 'Available' },
                    { bg: 'linear-gradient(160deg, rgba(139,105,20,0.3), rgba(200,160,40,0.18))', border: '#a07820', label: 'VIP' },
                    { bg: 'rgba(80,20,8,0.9)', border: 'rgba(120,30,15,0.5)', label: 'Taken' },
                    { bg: 'linear-gradient(160deg, #1d6e34, #27913f)', border: '#3dba5a', label: 'Your Seat' },
                ].map(({ bg, border, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: 16, height: 13, background: bg, border: `1.5px solid ${border}`, borderRadius: '3px 3px 1px 1px' }} />
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>{label.toUpperCase()}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
