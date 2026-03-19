import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

/**
 * VirtualLogGrid — Lightweight virtual scrolling for large film log collections.
 * Only renders items visible in the viewport + a buffer zone.
 * Uses IntersectionObserver for efficient scroll detection.
 * Activates only when items.length > threshold (default: 60).
 */
interface VirtualLogGridProps {
    items: any[]
    renderItem: (item: any, index: number) => React.ReactNode
    threshold?: number
    rowHeight?: number
    columns?: string
    gap?: string
}

export default function VirtualLogGrid({ items, renderItem, threshold = 60, rowHeight = 230, columns = 'repeat(auto-fill, minmax(140px, 1fr))', gap = '1rem' }: VirtualLogGridProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 40 })
    const BUFFER = 12 // extra items above/below viewport

    // If below threshold, render all items normally
    if (items.length <= threshold) {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: columns, gridAutoRows: `minmax(${rowHeight}px, auto)`, gap }}>
                {items.map((item, index) => renderItem(item, index))}
            </div>
        )
    }

    // Calculate visible range based on scroll position
    const updateVisibleRange = useCallback(() => {
        if (!containerRef.current) return
        const container = containerRef.current
        const rect = container.getBoundingClientRect()
        const viewportTop = -rect.top
        const viewportBottom = viewportTop + window.innerHeight

        // Estimate items per row
        const containerWidth = container.offsetWidth
        const gapPx = parseFloat(getComputedStyle(container).gap) || 16
        const minItemWidth = 140
        const perRow = Math.max(1, Math.floor((containerWidth + gapPx) / (minItemWidth + gapPx)))
        const rowHeightWithGap = rowHeight + gapPx

        const startRow = Math.max(0, Math.floor(viewportTop / rowHeightWithGap) - 1)
        const endRow = Math.ceil(viewportBottom / rowHeightWithGap) + 1
        const start = Math.max(0, startRow * perRow - BUFFER)
        const end = Math.min(items.length, endRow * perRow + BUFFER)

        setVisibleRange(prev => {
            if (prev.start === start && prev.end === end) return prev
            return { start, end }
        })
    }, [items.length, rowHeight])

    useEffect(() => {
        updateVisibleRange()
        const onScroll = () => requestAnimationFrame(updateVisibleRange)
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
        }
    }, [updateVisibleRange])

    // Calculate total grid height for spacer
    const containerWidth = containerRef.current?.offsetWidth || 800
    const gapPx = 16
    const minItemWidth = 140
    const perRow = Math.max(1, Math.floor((containerWidth + gapPx) / (minItemWidth + gapPx)))
    const totalRows = Math.ceil(items.length / perRow)
    const totalHeight = totalRows * (rowHeight + gapPx)

    // Top spacer height
    const topSpacerRow = Math.floor(visibleRange.start / perRow)
    const topSpacerHeight = topSpacerRow * (rowHeight + gapPx)

    const visibleItems = items.slice(visibleRange.start, visibleRange.end)

    return (
        <div ref={containerRef} style={{ position: 'relative', minHeight: totalHeight }}>
            {/* Top spacer */}
            <div style={{ height: topSpacerHeight }} />
            {/* Visible items grid */}
            <div style={{ display: 'grid', gridTemplateColumns: columns, gridAutoRows: `minmax(${rowHeight}px, auto)`, gap }}>
                {visibleItems.map((item, i) => renderItem(item, visibleRange.start + i))}
            </div>
        </div>
    )
}
