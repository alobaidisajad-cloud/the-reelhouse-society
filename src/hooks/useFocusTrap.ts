import { useEffect, useRef } from 'react'

let _modalLocks = 0

/**
 * useFocusTrap — traps keyboard focus within a container.
 * When the modal opens, focus moves to the container.
 * Tab cycles within focusable elements. Escape calls onClose.
 *
 * @param {boolean} isOpen - Whether the modal is currently open
 * @param {Function} onClose - Called when Escape is pressed
 * @returns {React.RefObject} - Attach to the modal container
 */
export function useFocusTrap(isOpen: boolean, onClose?: () => void) {
    const containerRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<Element | null>(null)

    useEffect(() => {
        if (!isOpen) return

        // Save the element that was focused before the modal opened
        previousFocusRef.current = document.activeElement as Element

        const container = containerRef.current
        if (!container) return

        // Focus the container after a short delay (let animation start)
        const focusTimer = setTimeout(() => {
            const first = getFocusable(container)[0]
            if (first) first.focus()
            else container.focus()
        }, 50)

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose?.()
                return
            }

            if (e.key !== 'Tab') return

            const focusable = getFocusable(container)
            if (focusable.length === 0) return

            const first = focusable[0]
            const last = focusable[focusable.length - 1]

            if (e.shiftKey) {
                // Shift+Tab: wrap from first to last
                if (document.activeElement === first || !container.contains(document.activeElement)) {
                    e.preventDefault()
                    last.focus()
                }
            } else {
                // Tab: wrap from last to first
                if (document.activeElement === last || !container.contains(document.activeElement)) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown, true)
        
        _modalLocks++
        if (_modalLocks === 1) {
            document.body.style.overflow = 'hidden'
        }

        return () => {
            clearTimeout(focusTimer)
            document.removeEventListener('keydown', handleKeyDown, true)
            
            _modalLocks--
            if (_modalLocks === 0) {
                document.body.style.overflow = ''
            }
            // Restore focus to the previously focused element
            if (previousFocusRef.current && typeof (previousFocusRef.current as HTMLElement).focus === 'function') {
                (previousFocusRef.current as HTMLElement).focus()
            }
        }
    }, [isOpen, onClose])

    return containerRef
}

function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => (el as HTMLElement).offsetParent !== null) as HTMLElement[]
}
