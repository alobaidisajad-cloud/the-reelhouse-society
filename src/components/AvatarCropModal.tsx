/**
 * AvatarCropModal — Interactive avatar editor with zoom + drag-to-position.
 * Renders the image on a canvas and lets users zoom (slider) and drag to reposition.
 * Outputs a cropped 400x400 square Blob on confirm.
 * Nitrate Noir themed.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, Move, Check } from 'lucide-react'
import { Portal } from './UI'

interface Props {
    imageSrc: string
    onConfirm: (croppedBlob: Blob) => void
    onCancel: () => void
}

const OUTPUT_SIZE = 400

export default function AvatarCropModal({ imageSrc, onConfirm, onCancel }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)

    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [imgLoaded, setImgLoaded] = useState(false)

    const CANVAS_DISPLAY = 280

    // Load image
    useEffect(() => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            imgRef.current = img
            setImgLoaded(true)
            // Auto-fit: zoom so the smaller dimension fills the canvas
            const scale = Math.max(CANVAS_DISPLAY / img.width, CANVAS_DISPLAY / img.height)
            setZoom(Math.max(1, scale))
            setOffset({ x: 0, y: 0 })
        }
        img.src = imageSrc
    }, [imageSrc])

    // Draw to canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current
        const img = imgRef.current
        if (!canvas || !img) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = CANVAS_DISPLAY * 2  // HiDPI
        canvas.height = CANVAS_DISPLAY * 2

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Calculate draw dimensions
        const drawW = img.width * zoom
        const drawH = img.height * zoom
        const dx = (canvas.width - drawW) / 2 + offset.x * 2
        const dy = (canvas.height - drawH) / 2 + offset.y * 2

        // Clip to circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()

        ctx.drawImage(img, dx, dy, drawW, drawH)
        ctx.restore()
    }, [zoom, offset, imgLoaded])

    useEffect(() => {
        if (imgLoaded) draw()
    }, [draw, imgLoaded])

    // Mouse/touch drag
    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true)
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return
        const img = imgRef.current
        if (!img) return

        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y

        // Limit drag so image always covers the circle
        const drawW = img.width * zoom
        const drawH = img.height * zoom
        const maxX = Math.max(0, (drawW - CANVAS_DISPLAY) / 2)
        const maxY = Math.max(0, (drawH - CANVAS_DISPLAY) / 2)

        setOffset({
            x: Math.max(-maxX, Math.min(maxX, newX)),
            y: Math.max(-maxY, Math.min(maxY, newY)),
        })
    }

    const handlePointerUp = () => {
        setIsDragging(false)
    }

    // Zoom limits
    const img = imgRef.current
    const minZoom = img ? Math.max(CANVAS_DISPLAY / img.width, CANVAS_DISPLAY / img.height) : 0.5
    const maxZoom = Math.max(minZoom * 4, 3)

    // After zoom changes, clamp offset
    useEffect(() => {
        if (!imgRef.current) return
        const drawW = imgRef.current.width * zoom
        const drawH = imgRef.current.height * zoom
        const maxX = Math.max(0, (drawW - CANVAS_DISPLAY) / 2)
        const maxY = Math.max(0, (drawH - CANVAS_DISPLAY) / 2)
        setOffset(prev => ({
            x: Math.max(-maxX, Math.min(maxX, prev.x)),
            y: Math.max(-maxY, Math.min(maxY, prev.y)),
        }))
    }, [zoom])

    // Export cropped image — must match exactly what the preview shows
    const handleConfirm = () => {
        const img = imgRef.current
        if (!img) return

        const outCanvas = document.createElement('canvas')
        outCanvas.width = OUTPUT_SIZE
        outCanvas.height = OUTPUT_SIZE
        const ctx = outCanvas.getContext('2d')
        if (!ctx) return

        // The preview canvas is 2x HiDPI (CANVAS_DISPLAY * 2 = 560px) 
        // but displayed at CANVAS_DISPLAY = 280px CSS. 
        // Image is drawn at img.width * zoom on the 560 canvas,
        // so in CSS space it appears at (img.width * zoom) / 2.
        // We need to map CSS display space → OUTPUT_SIZE.

        const scale = OUTPUT_SIZE / CANVAS_DISPLAY  // 400 / 280

        // Image size in CSS display space (divide by 2 for HiDPI)
        const cssW = (img.width * zoom) / 2
        const cssH = (img.height * zoom) / 2

        // Image position in CSS display space
        const cssDx = (CANVAS_DISPLAY - cssW) / 2 + offset.x
        const cssDy = (CANVAS_DISPLAY - cssH) / 2 + offset.y

        // Clip to circle
        ctx.beginPath()
        ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()

        // Draw at output scale — this now matches the preview exactly
        ctx.drawImage(img, cssDx * scale, cssDy * scale, cssW * scale, cssH * scale)

        outCanvas.toBlob((blob) => {
            if (blob) onConfirm(blob)
        }, 'image/png', 1)
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onCancel}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99999,
                        background: 'rgba(5,3,1,0.92)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1rem',
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--soot)',
                            border: '1px solid var(--sepia)',
                            borderRadius: '6px',
                            maxWidth: 420,
                            width: '100%',
                            overflow: 'hidden',
                            boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(139,105,20,0.3)',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid rgba(139,105,20,0.15)',
                            background: 'radial-gradient(ellipse at top, rgba(139,105,20,0.08), transparent 60%)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Move size={14} style={{ color: 'var(--sepia)' }} />
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--parchment)' }}>
                                    POSITION YOUR PORTRAIT
                                </span>
                            </div>
                            <button
                                onClick={onCancel}
                                style={{
                                    background: 'none', border: '1px solid var(--ash)', borderRadius: '4px',
                                    padding: '0.35rem', color: 'var(--fog)', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.color = 'var(--fog)' }}
                                aria-label="Cancel"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Canvas Area */}
                        <div
                            ref={containerRef}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                padding: '2rem 1.5rem 1.5rem',
                                background: 'var(--ink)',
                            }}
                        >
                            {/* Circular Preview */}
                            <div style={{
                                position: 'relative',
                                width: CANVAS_DISPLAY,
                                height: CANVAS_DISPLAY,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: '3px solid var(--sepia)',
                                boxShadow: '0 0 30px rgba(139,105,20,0.15), inset 0 0 20px rgba(0,0,0,0.3)',
                                cursor: isDragging ? 'grabbing' : 'grab',
                                touchAction: 'none',
                            }}>
                                <canvas
                                    ref={canvasRef}
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerLeave={handlePointerUp}
                                    style={{
                                        width: CANVAS_DISPLAY,
                                        height: CANVAS_DISPLAY,
                                        display: 'block',
                                    }}
                                />
                            </div>

                            {/* Drag hint */}
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.42rem',
                                letterSpacing: '0.15em', color: 'var(--fog)',
                                marginTop: '1rem', opacity: 0.6,
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}>
                                <Move size={10} /> DRAG TO REPOSITION
                            </div>
                        </div>

                        {/* Zoom Controls */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderTop: '1px solid rgba(139,105,20,0.1)',
                            background: 'var(--soot)',
                        }}>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.42rem',
                                letterSpacing: '0.2em', color: 'var(--sepia)',
                                marginBottom: '0.75rem',
                            }}>
                                ZOOM
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    onClick={() => setZoom(z => Math.max(minZoom, z - 0.1))}
                                    style={{
                                        background: 'none', border: '1px solid var(--ash)', borderRadius: '4px',
                                        padding: '0.4rem', color: 'var(--fog)', cursor: 'pointer',
                                        display: 'flex', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.color = 'var(--fog)' }}
                                >
                                    <ZoomOut size={14} />
                                </button>

                                <div style={{ flex: 1, position: 'relative', height: 24, display: 'flex', alignItems: 'center' }}>
                                    {/* Track */}
                                    <div style={{
                                        position: 'absolute', left: 0, right: 0, height: 3,
                                        background: 'var(--ash)', borderRadius: 2,
                                    }} />
                                    {/* Fill */}
                                    <div style={{
                                        position: 'absolute', left: 0, height: 3,
                                        width: `${((zoom - minZoom) / (maxZoom - minZoom)) * 100}%`,
                                        background: 'var(--sepia)', borderRadius: 2,
                                        transition: 'width 0.1s',
                                    }} />
                                    {/* Native range input styled to be invisible over the track */}
                                    <input
                                        type="range"
                                        min={minZoom}
                                        max={maxZoom}
                                        step={0.01}
                                        value={zoom}
                                        onChange={e => setZoom(parseFloat(e.target.value))}
                                        style={{
                                            position: 'absolute', left: 0, right: 0,
                                            width: '100%', height: 24,
                                            opacity: 0, cursor: 'pointer', margin: 0,
                                        }}
                                    />
                                    {/* Thumb visual */}
                                    <div style={{
                                        position: 'absolute',
                                        left: `calc(${((zoom - minZoom) / (maxZoom - minZoom)) * 100}% - 7px)`,
                                        width: 14, height: 14,
                                        borderRadius: '50%',
                                        background: 'var(--sepia)',
                                        boxShadow: '0 0 8px rgba(139,105,20,0.5)',
                                        pointerEvents: 'none',
                                        transition: 'left 0.1s',
                                    }} />
                                </div>

                                <button
                                    onClick={() => setZoom(z => Math.min(maxZoom, z + 0.1))}
                                    style={{
                                        background: 'none', border: '1px solid var(--ash)', borderRadius: '4px',
                                        padding: '0.4rem', color: 'var(--fog)', cursor: 'pointer',
                                        display: 'flex', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sepia)'; e.currentTarget.style.color = 'var(--sepia)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--ash)'; e.currentTarget.style.color = 'var(--fog)' }}
                                >
                                    <ZoomIn size={14} />
                                </button>
                            </div>

                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.4rem',
                                letterSpacing: '0.1em', color: 'var(--ash)',
                                marginTop: '0.5rem', textAlign: 'center',
                            }}>
                                {Math.round(zoom * 100)}%
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{
                            display: 'flex', gap: '0.75rem',
                            padding: '1.25rem 1.5rem',
                            borderTop: '1px solid rgba(139,105,20,0.1)',
                        }}>
                            <button
                                onClick={onCancel}
                                className="btn btn-ghost"
                                style={{ flex: 1, justifyContent: 'center', padding: '0.7rem', fontSize: '0.6rem' }}
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="btn btn-primary"
                                style={{
                                    flex: 2, justifyContent: 'center', padding: '0.7rem', fontSize: '0.6rem',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                }}
                            >
                                <Check size={14} /> APPLY PORTRAIT
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
