/**
 * useStreak — Tracks consecutive days of logging films.
 * Calculates current streak and longest streak from log dates.
 * Updates Supabase profiles on each log.
 */
import { useMemo } from 'react'
import type { FilmLog } from '../types'

interface StreakResult {
  currentStreak: number
  longestStreak: number
  isActive: boolean  // logged today
  lastLogDate: string | null
}

export function useStreak(logs: FilmLog[]): StreakResult {
  return useMemo(() => {
    if (logs.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false, lastLogDate: null }

    // Get unique log dates
    const dateSet = new Set<string>()
    logs.forEach(log => {
      const d = (log.watchedDate || log.created_at || log.loggedAt || '').slice(0, 10)
      if (d && d.length === 10) dateSet.add(d)
    })

    // #8 AUDIT FIX: Single sort pass — compute both streaks from one ascending array
    const sorted = Array.from(dateSet).sort()
    if (sorted.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false, lastLogDate: null }

    // Use local date string to avoid UTC/timezone confusion
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`

    /** String-safe diff: returns number of days between two YYYY-MM-DD strings */
    const daysBetween = (a: string, b: string): number => {
      // Parse as noon local to avoid DST edge cases entirely
      const da = new Date(a + 'T12:00:00')
      const db = new Date(b + 'T12:00:00')
      return Math.round((da.getTime() - db.getTime()) / 86400000)
    }

    // Compute all streak segments in a single forward pass
    let longestStreak = 1
    let streak = 1
    // Track the end index + length of the streak that reaches the most recent date
    let tailStreak = 1
    for (let i = 1; i < sorted.length; i++) {
      const diff = daysBetween(sorted[i], sorted[i - 1])
      if (diff === 1) {
        streak++
        longestStreak = Math.max(longestStreak, streak)
      } else {
        streak = 1
      }
      // If this is the last element, capture the tail streak
      if (i === sorted.length - 1) tailStreak = streak
    }

    const lastDate = sorted[sorted.length - 1]
    const isActive = lastDate === today

    // Current streak is the tail streak only if it touches today or yesterday
    const currentStreak = (lastDate === today || lastDate === yesterday) ? tailStreak : 0

    return {
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      isActive,
      lastLogDate: lastDate || null,
    }
  }, [logs])
}
