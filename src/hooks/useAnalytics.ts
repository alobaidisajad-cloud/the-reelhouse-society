/**
 * useAnalytics — Lightweight analytics hook.
 * Tracks page views, user actions, and key events.
 * Batches events and flushes every 10 seconds to Supabase.
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

const FLUSH_INTERVAL = 10000 // 10 seconds
const MAX_BATCH_SIZE = 50

// Respect DNT
const isDNT = typeof navigator !== 'undefined' && (navigator as any).doNotTrack === '1'

export function useAnalytics() {
  const { user } = useAuthStore()
  const buffer = useRef<AnalyticsEvent[]>([])
  const location = useLocation()

  // Flush buffer to Supabase
  const flush = useCallback(async () => {
    if (isDNT || !isSupabaseConfigured || buffer.current.length === 0) return

    const events = buffer.current.splice(0, MAX_BATCH_SIZE)
    const rows = events.map(e => ({
      user_id: user?.id || null,
      event_name: e.event_name,
      properties: e.properties || {},
      created_at: e.created_at,
    }))

    try {
      await supabase.from('analytics_events').insert(rows)
    } catch {
      // Silently fail — analytics should never break the app
    }
  }, [user?.id])

  // Auto-flush on interval
  useEffect(() => {
    const timer = setInterval(flush, FLUSH_INTERVAL)
    return () => { clearInterval(timer); flush() }
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
