/**
 * Web Vitals — Lightweight Core Web Vitals collection using native PerformanceObserver.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reports LCP, FID, CLS, FCP, and TTFB without any external dependencies.
 * Sends metrics to the analytics buffer for periodic flush to Supabase.
 *
 * Why native instead of web-vitals package?
 *   - Zero bytes added to bundle (saves ~3KB gzip)
 *   - Good enough for our monitoring needs
 *   - PerformanceObserver is supported by 95%+ of browsers
 *
 * Usage: Call once in main.tsx or App.tsx
 *   import { reportWebVitals } from './utils/webVitals'
 *   reportWebVitals((metric) => console.log(metric))
 */

export interface WebVitalMetric {
    name: 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTFB'
    value: number
    rating: 'good' | 'needs-improvement' | 'poor'
}

// Thresholds per Google's Web Vitals guidelines
const THRESHOLDS: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
}

function rate(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const [good, poor] = THRESHOLDS[name] || [Infinity, Infinity]
    if (value <= good) return 'good'
    if (value <= poor) return 'needs-improvement'
    return 'poor'
}

export function reportWebVitals(onReport: (metric: WebVitalMetric) => void): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    // ── LCP (Largest Contentful Paint) ──
    try {
        const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const last = entries[entries.length - 1]
            if (last) {
                const value = last.startTime
                onReport({ name: 'LCP', value, rating: rate('LCP', value) })
            }
        })
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch { /* Not supported */ }

    // ── FID (First Input Delay) ──
    try {
        const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            if (entries[0]) {
                const entry = entries[0] as PerformanceEventTiming
                const value = entry.processingStart - entry.startTime
                onReport({ name: 'FID', value, rating: rate('FID', value) })
            }
        })
        fidObserver.observe({ type: 'first-input', buffered: true })
    } catch { /* Not supported */ }

    // ── CLS (Cumulative Layout Shift) ──
    try {
        let clsValue = 0
        const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!(entry as any).hadRecentInput) {
                    clsValue += (entry as any).value || 0
                }
            }
        })
        clsObserver.observe({ type: 'layout-shift', buffered: true })

        // Report CLS on page hide (when user leaves)
        const reportCLS = () => {
            onReport({ name: 'CLS', value: clsValue, rating: rate('CLS', clsValue) })
        }
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') reportCLS()
        }, { once: true })
    } catch { /* Not supported */ }

    // ── FCP (First Contentful Paint) ──
    try {
        const fcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const fcp = entries.find(e => e.name === 'first-contentful-paint')
            if (fcp) {
                onReport({ name: 'FCP', value: fcp.startTime, rating: rate('FCP', fcp.startTime) })
            }
        })
        fcpObserver.observe({ type: 'paint', buffered: true })
    } catch { /* Not supported */ }

    // ── TTFB (Time to First Byte) ──
    try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        if (nav) {
            const ttfb = nav.responseStart - nav.requestStart
            onReport({ name: 'TTFB', value: ttfb, rating: rate('TTFB', ttfb) })
        }
    } catch { /* Not supported */ }
}
