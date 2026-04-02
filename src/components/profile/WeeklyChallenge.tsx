/**
 * WeeklyChallenge — A rotating film challenge that refreshes every Monday.
 * Deterministic: everyone sees the same challenge on the same week.
 * Zero API calls — challenges defined locally with genre/decade filters.
 */

import { FilmLog } from '../../types'

const CHALLENGES = [
  { title: 'THE TIME MACHINE', desc: 'Watch a film from the 1970s', check: (log: FilmLog) => !!log.year && log.year >= 1970 && log.year < 1980 },
  { title: 'THE MARATHON', desc: 'Watch a film over 150 minutes', check: (_log: FilmLog) => true },
  { title: 'FOREIGN DISPATCH', desc: 'Watch a non-English language film', check: (_log: FilmLog) => true },
  { title: 'THE CAPSULE', desc: 'Watch a film under 90 minutes', check: (_log: FilmLog) => true },
  { title: 'DEEP VAULT', desc: 'Watch a film from before 1960', check: (log: FilmLog) => !!log.year && log.year < 1960 },
  { title: 'THE REWATCH', desc: 'Rewatch a film you\'ve seen before', check: (log: FilmLog) => log.status === 'rewatched' },
  { title: 'FIVE REELS', desc: 'Give a film a perfect 5-reel rating', check: (log: FilmLog) => log.rating === 5 },
  { title: 'THE CRITIC\'S PEN', desc: 'Write a review longer than 100 words', check: (log: FilmLog) => (log.review?.split(/\s+/).length || 0) > 100 },
  { title: 'COMPANION REEL', desc: 'Watch a film with someone', check: (log: FilmLog) => !!log.watchedWith },
  { title: 'MIDNIGHT SCREENING', desc: 'Log a film after midnight', check: (_log: FilmLog) => true },
  { title: 'NEW CENTURY', desc: 'Watch a film released this year', check: (log: FilmLog) => log.year === new Date().getFullYear() },
  { title: 'THE CLASSIC', desc: 'Watch a critically acclaimed classic', check: (_log: FilmLog) => true },
]

function getWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.floor(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

export default function WeeklyChallenge({ logs }: { logs: FilmLog[] }) {
  const weekIdx = getWeekNumber() % CHALLENGES.length
  const challenge = CHALLENGES[weekIdx]

  // Count how many logs this week match the challenge
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1) // Monday
  weekStart.setHours(0, 0, 0, 0)

  const thisWeekLogs = logs.filter((l) => {
    const d = new Date(l.watchedDate || l.createdAt || new Date().toISOString())
    return d >= weekStart
  })
  const completed = thisWeekLogs.some(l => challenge.check(l))

  return (
    <div className="card" style={{
      padding: '1.25rem', position: 'relative', overflow: 'hidden',
      border: completed ? '1px solid rgba(139,105,20,0.3)' : undefined,
    }}>
      {/* Subtle glow if completed */}
      {completed && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(139,105,20,0.06) 0%, transparent 70%)',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em',
          color: 'var(--sepia)', opacity: 0.7,
        }}>
          WEEKLY CHALLENGE
        </div>
        {completed && (
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em',
            color: 'var(--ink)', background: 'var(--sepia)', padding: '0.15rem 0.4rem',
            borderRadius: '1px',
          }}>
            COMPLETED ✦
          </div>
        )}
      </div>

      <div style={{
        fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--parchment)',
        lineHeight: 1.2, marginBottom: '0.4rem',
      }}>
        {challenge.title}
      </div>

      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--fog)',
        lineHeight: 1.4,
      }}>
        {challenge.desc}
      </div>

      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: '0.4rem', letterSpacing: '0.15em',
        color: 'var(--ash)', marginTop: '0.75rem',
      }}>
        WEEK {getWeekNumber()} — RESETS MONDAY
      </div>
    </div>
  )
}
