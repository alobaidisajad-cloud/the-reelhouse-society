import { useEffect, useRef } from 'react'

/**
 * useAndroidHardwareBack
 * 
 * Specifically engineered for Android PWAs. 
 * Traps the physical/swipe "Back" button on Android when a modal is open.
 * Instead of navigating the browser back to the previous page (and leaving the modal open),
 * this hook consumes the back event and triggers the modal's close function, 
 * perfectly mimicking Native APK behavior.
 */
export function useAndroidHardwareBack(isOpen: boolean, closeFn: () => void) {
    const isTrapped = useRef(false)

    useEffect(() => {
        if (!isOpen) {
            // If the modal was closed via a normal UI button (like "X" or "Submit"),
            // and we still have our ghost state trapped in the history API, we must remove it.
            if (isTrapped.current) {
                isTrapped.current = false
                // Carefully pop the ghost state we injected
                if (window.history.state?.isAndroidModalTrap) {
                    window.history.go(-1)
                }
            }
            return
        }

        // 1. When the modal opens, push a ghost state onto the browser history stack.
        // We use the exact same URL so the address bar doesn't visually change.
        if (!isTrapped.current) {
            const state = { isAndroidModalTrap: true, id: Date.now() }
            window.history.pushState(state, '', window.location.href)
            isTrapped.current = true
        }

        // 2. Listen for the back button destroying the ghost state
        const handlePopState = (event: PopStateEvent) => {
            // The user pressed the hardware back button or gestured back.
            // This natively consumed our dummy state from the History API.
            if (isTrapped.current) {
                isTrapped.current = false
                closeFn() // Command the modal to securely close itself
            }
        }

        window.addEventListener('popstate', handlePopState)

        return () => {
            window.removeEventListener('popstate', handlePopState)
            // Cleanup on unmount is handled by the !isOpen block above if state changes,
            // or if the whole component unmounts unexpectedly, we ensure the ghost state is popped.
            if (isTrapped.current) {
                isTrapped.current = false
                if (window.history.state?.isAndroidModalTrap) {
                    window.history.go(-1)
                }
            }
        }
    }, [isOpen, closeFn])
}
