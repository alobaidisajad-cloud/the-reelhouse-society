import { useState, useEffect, useSyncExternalStore } from 'react';

// ── Singleton viewport observer ──
// All useViewport() consumers share ONE ResizeObserver + matchMedia listener
// instead of each component spawning its own. This prevents observer thrashing
// on complex pages with 20+ components using useViewport.

type ViewportState = { isTouch: boolean; isMobile: boolean }

let _state: ViewportState = {
    isTouch: typeof window !== 'undefined' ? window.matchMedia('(any-pointer: coarse)').matches : false,
    isMobile: typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
}

const _listeners = new Set<() => void>()
let _initialized = false

function _notifyAll() {
    _listeners.forEach(fn => fn())
}

function _initObserver() {
    if (_initialized || typeof window === 'undefined') return
    _initialized = true

    let frameId: number

    const checkViewport = () => {
        const touchMatch = window.matchMedia('(any-pointer: coarse)').matches
        const mobileMatch = window.matchMedia('(max-width: 768px)').matches

        if (touchMatch !== _state.isTouch || mobileMatch !== _state.isMobile) {
            _state = { isTouch: touchMatch, isMobile: mobileMatch }
            _notifyAll()
        }
    }

    const resizeObserver = new ResizeObserver(() => {
        if (frameId) window.cancelAnimationFrame(frameId)
        frameId = window.requestAnimationFrame(checkViewport)
    })
    resizeObserver.observe(document.body)

    const handleChange = () => {
        if (frameId) window.cancelAnimationFrame(frameId)
        frameId = window.requestAnimationFrame(checkViewport)
    }

    window.matchMedia('(any-pointer: coarse)').addEventListener('change', handleChange)
    window.matchMedia('(max-width: 768px)').addEventListener('change', handleChange)
}

function subscribe(callback: () => void) {
    _initObserver()
    _listeners.add(callback)
    return () => { _listeners.delete(callback) }
}

function getSnapshot(): ViewportState {
    return _state
}

/**
 * Singleton viewport hook — all consumers share ONE observer.
 * Returns { isTouch, isMobile } that updates reactively.
 */
export function useViewport(): ViewportState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
