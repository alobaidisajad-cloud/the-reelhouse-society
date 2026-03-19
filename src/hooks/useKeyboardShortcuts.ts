/**
 * useKeyboardShortcuts — Global keyboard shortcuts for power users.
 * Registers key combos and dispatches actions. Respects input focus.
 */
import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [showHelp, setShowHelp] = useState(false)
  const pendingKey = useRef<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handler = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    // Don't capture when user is typing in inputs
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if ((e.target as HTMLElement)?.contentEditable === 'true') return

    const key = e.key.toLowerCase()

    // Two-key combos (G+H, G+F, G+D, G+P)
    if (pendingKey.current === 'g') {
      pendingKey.current = null
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      e.preventDefault()
      switch (key) {
        case 'h': navigate('/'); break
        case 'f': navigate('/feed'); break
        case 'd': navigate('/discover'); break
        case 'p': if (user?.username) navigate(`/user/${user.username}`); break
        case 's': navigate('/settings'); break
      }
      return
    }

    // Single key shortcuts
    switch (key) {
      case '?':
        e.preventDefault()
        setShowHelp(prev => !prev)
        break
      case 'g':
        e.preventDefault()
        pendingKey.current = 'g'
        pendingTimer.current = setTimeout(() => { pendingKey.current = null }, 800)
        break
      case 'l':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          // Dispatch custom event to open log modal
          window.dispatchEvent(new CustomEvent('reelhouse:openLogModal'))
        }
        break
      case 'escape':
        setShowHelp(false)
        window.dispatchEvent(new CustomEvent('reelhouse:closeAllModals'))
        break
    }
  }, [navigate, user?.username])

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])

  return { showHelp, setShowHelp }
}

export const SHORTCUT_LIST = [
  { keys: ['Ctrl', 'K'], description: 'Command palette' },
  { keys: ['L'], description: 'Log a film' },
  { keys: ['G', 'H'], description: 'Go to Home' },
  { keys: ['G', 'F'], description: 'Go to Feed' },
  { keys: ['G', 'D'], description: 'Go to Discover' },
  { keys: ['G', 'P'], description: 'Go to Profile' },
  { keys: ['G', 'S'], description: 'Go to Settings' },
  { keys: ['?'], description: 'Show shortcuts' },
  { keys: ['Esc'], description: 'Close modal' },
]
