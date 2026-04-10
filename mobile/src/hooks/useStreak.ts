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

    // Get unique log dates sorted descending
    const dateSet = new Set<string>()
    logs.forEach(log => {
      const d = (log.watchedDate || log.created_at || log.loggedAt || '').slice(0, 10)
      if (d && d.length === 10) dateSet.add(d)
    })

    const dates = Array.from(dateSet).sort().reverse()
    if (dates.length === 0) return { currentStreak: 0, longestStreak: 0, isActive: false, lastLogDate: null }

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    // Calculate current streak (must include today or yesterday)
    let currentStreak = 0
    const startDate = dates[0]
    const isActive = startDate === today

    if (startDate === today || startDate === yesterday) {
      currentStreak = 1
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1])
        const curr = new Date(dates[i])
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000)
        if (diffDays === 1) {
          currentStreak++
        } else {
          break
        }
      }
    }

    // Calculate longest streak
    let longestStreak = 1
    let streak = 1
    const sorted = Array.from(dateSet).sort()
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1])
      const curr = new Date(sorted[i])
      const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000)
      if (diff === 1) {
        streak++
        longestStreak = Math.max(longestStreak, streak)
      } else {
        streak = 1
      }
    }

    return {
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      isActive,
      lastLogDate: dates[0] || null,
    }
  }, [logs])
}
