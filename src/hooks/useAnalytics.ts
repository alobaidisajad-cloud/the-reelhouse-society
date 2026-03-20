/**
 * useAnalytics — Lightweight analytics hook.
 * Tracks page views, user actions, and key events.
 * Batches events and flushes every 30 seconds to Supabase.
 * Only fires for authenticated users (RLS requires valid session).
 * Respects Do Not Track (DNT) browser setting.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { useAuthStore } from '../stores/auth'

interface AnalyticsEvent {
  event_name: string
  properties?: Record<string, unknown>
  created_at: string
}

const FLUSH_INTERVAL = 30000 // 30 seconds
const MAX_BATCH_SIZE = 50

// Respect DNT
const isDNT = typeof navigator !== 'undefined' && (navigator as any).doNotTrack === '1'

export function useAnalytics() {
  const buffer = useRef<AnalyticsEvent[]>([])
  const location = useLocation()

  // Flush buffer to Supabase — triple-guarded against unauthenticated inserts
  const flush = useCallback(async () => {
    if (isDNT || !isSupabaseConfigured || buffer.current.length === 0) return

    // Guard 1: Check Zustand auth store
    const currentUser = useAuthStore.getState().user
    if (!currentUser?.id) return

    // Guard 2: Verify live Supabase session exists
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
    } catch {
      return // No session — skip silently
    }

    const events = buffer.current.splice(0, MAX_BATCH_SIZE)
    const rows = events.map(e => ({
      user_id: currentUser.id,
      event_name: e.event_name,
      properties: e.properties || {},
      created_at: e.created_at,
    }))

    try {
      const { error } = await supabase.from('analytics_events').insert(rows)
      if (error) {
        // Re-queue events on failure (but cap buffer to prevent memory bloat)
        if (buffer.current.length < MAX_BATCH_SIZE * 2) {
          buffer.current.unshift(...events)
        }
      }
    } catch {
      // Silently fail — analytics should never break the app
    }
  }, [])

  // Auto-flush on interval — NO cleanup flush to avoid stale-closure issues
  useEffect(() => {
    const timer = setInterval(flush, FLUSH_INTERVAL)
    return () => clearInterval(timer)
  }, [flush])

  // Track page views automatically
  useEffect(() => {
    if (isDNT) return
    buffer.current.push({
      event_name: 'page_view',
      properties: { path: location.pathname },
      created_at: new Date().toISOString(),
    })
  }, [location.pathname])

  // Manual event tracking
  const trackEvent = useCallback((name: string, properties?: Record<string, unknown>) => {
    if (isDNT) return
    buffer.current.push({
      event_name: name,
      properties,
      created_at: new Date().toISOString(),
    })
  }, [])

  return { trackEvent }
}

