import { useSyncExternalStore } from 'react'

/**
 * useOnlineStatus — reactive hook for navigator.onLine.
 * React re-renders when the user goes offline or comes back online.
 */
function subscribe(callback) {
    window.addEventListener('online', callback)
    window.addEventListener('offline', callback)
    return () => {
        window.removeEventListener('online', callback)
        window.removeEventListener('offline', callback)
    }
}

function getSnapshot() {
    return navigator.onLine
}

export function useOnlineStatus() {
    return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
