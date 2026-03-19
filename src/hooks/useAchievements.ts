/**
 * useAchievements — Persistent achievement badge system.
 * Calculates badges from user logs, compares with stored badges in Supabase,
 * detects new unlocks, and persists them.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../supabaseClient'
import type { FilmLog } from '../types'

// Badge definitions — must match Achievements.tsx glyphs
export interface Badge {
  key: string
  label: string
  glyph: string
  description: string
  check: (logs: FilmLog[]) => boolean
}

export const BADGE_DEFS: Badge[] = [
  { key: 'initiate', label: 'THE INITIATE', glyph: '✦', description: 'Log your first film', check: (l) => l.length >= 1 },
  { key: 'regular', label: 'THE REGULAR', glyph: '❖', description: 'Log 10 films', check: (l) => l.length >= 10 },
  { key: 'devotee', label: 'THE DEVOTEE', glyph: '◆', description: 'Log 25 films', check: (l) => l.length >= 25 },
  { key: 'oracle', label: 'THE ORACLE', glyph: '◈', description: 'Log 100 films', check: (l) => l.length >= 100 },
  { key: 'explorer', label: 'THE EXPLORER', glyph: '✧', description: 'Log films in 5+ genres', check: (l) => {
    const genres = new Set<number>()
    l.forEach(log => (log.genre_ids || []).forEach(g => genres.add(g)))
    return genres.size >= 5
  }},
  { key: 'drifter', label: 'THE DRIFTER', glyph: '§', description: 'Watch from 4+ decades', check: (l) => {
    const decades = new Set<number>()
    l.forEach(log => { const y = log.year || parseInt(log.release_date?.slice(0,4) || '0'); if (y) decades.add(Math.floor(y / 10)) })
    return decades.size >= 4
  }},
  { key: 'completionist', label: 'THE COMPLETIONIST', glyph: '⊕', description: 'Rate every logged film', check: (l) => l.length > 0 && l.every(log => log.rating > 0) },
  { key: 'nocturne', label: 'THE NOCTURNE', glyph: '⊗', description: 'Log 5 films after midnight', check: (l) => {
    const nightLogs = l.filter(log => { const h = new Date(log.created_at || log.loggedAt || '').getHours(); return h >= 0 && h < 5 })
    return nightLogs.length >= 5
  }},
  { key: 'marathon', label: 'THE MARATHON', glyph: '⟐', description: 'Log 3+ films in one day', check: (l) => {
    const byDay = new Map<string, number>()
    l.forEach(log => { const d = (log.watchedDate || log.created_at || '').slice(0, 10); if (d) byDay.set(d, (byDay.get(d) || 0) + 1) })
    return Array.from(byDay.values()).some(c => c >= 3)
  }},
  { key: 'critic', label: 'THE CRITIC', glyph: '⊛', description: 'Write 10+ reviews', check: (l) => l.filter(log => log.review && log.review.length > 20).length >= 10 },
]

export function useAchievements(userId: string | undefined, logs: FilmLog[]) {
  const [storedBadges, setStoredBadges] = useState<string[]>([])
  const [newBadges, setNewBadges] = useState<Badge[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load stored badges from Supabase
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return
    supabase.from('profiles').select('badges').eq('id', userId).single()
      .then(({ data }) => {
        const existing = (data?.badges as string[]) || []
        setStoredBadges(existing)
        setLoaded(true)
      })
  }, [userId])

  // Calculate earned badges and detect new unlocks
  useEffect(() => {
    if (!loaded || logs.length === 0) return

    const earned = BADGE_DEFS.filter(b => b.check(logs)).map(b => b.key)
    const fresh = earned.filter(k => !storedBadges.includes(k))

    if (fresh.length > 0) {
      const newBadgeObjects = BADGE_DEFS.filter(b => fresh.includes(b.key))
      setNewBadges(newBadgeObjects)
      setStoredBadges(earned)

      // Persist to Supabase
      if (userId && isSupabaseConfigured) {
        supabase.from('profiles').update({ badges: earned }).eq('id', userId).then(() => {})
      }
    }
  }, [loaded, logs, storedBadges, userId])

  const dismissNewBadge = useCallback((key: string) => {
    setNewBadges(prev => prev.filter(b => b.key !== key))
  }, [])

  const allEarned = BADGE_DEFS.filter(b => storedBadges.includes(b.key))

  return { badges: allEarned, newBadges, dismissNewBadge }
}
