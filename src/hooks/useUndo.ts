/**
 * useUndo — Delayed destructive action pattern with undo capability.
 * Shows a toast for 5 seconds. If user clicks undo, the action is cancelled.
 * If timer expires, the action executes.
 */
import { useState, useCallback, useRef } from 'react'

interface UndoItem {
  id: string
  message: string
  onExecute: () => void
  timeoutId: ReturnType<typeof setTimeout>
}

export function useUndo() {
  const [pending, setPending] = useState<UndoItem[]>([])
  const counterRef = useRef(0)

  const showUndo = useCallback((message: string, onExecute: () => void, delayMs = 5000) => {
    const id = `undo-${++counterRef.current}`

    const timeoutId = setTimeout(() => {
      onExecute()
      setPending(prev => prev.filter(p => p.id !== id))
    }, delayMs)

    const item: UndoItem = { id, message, onExecute, timeoutId }
    setPending(prev => [...prev, item])

    return id
  }, [])

  const cancelUndo = useCallback((id: string) => {
    setPending(prev => {
      const item = prev.find(p => p.id === id)
      if (item) clearTimeout(item.timeoutId)
      return prev.filter(p => p.id !== id)
    })
  }, [])

  const executeNow = useCallback((id: string) => {
    setPending(prev => {
      const item = prev.find(p => p.id === id)
      if (item) {
        clearTimeout(item.timeoutId)
        item.onExecute()
      }
      return prev.filter(p => p.id !== id)
    })
  }, [])

  return { pending, showUndo, cancelUndo, executeNow }
}
