/**
 * Achievements — Nitrate Noir-themed unlockable badges.
 * Computed client-side from user's film logs.
 * Uses elegant SVG glyphs (no emojis) matching the cinema society aesthetic.
 */
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Badge Definitions — Film Society Honors ──
const BADGES = [
  {
    id: 'first-reel',
    title: 'FIRST REEL',
    desc: 'Log your first film',
    glyph: '✦',
    check: (logs: any[]) => logs.length >= 1,
  },
  {
    id: 'the-regular',
    title: 'THE REGULAR',
    desc: 'Log 10 films',
    glyph: '❖',
    check: (logs: any[]) => logs.length >= 10,
  },
  {
    id: 'midnight-devotee',
    title: 'MIDNIGHT DEVOTEE',
    desc: 'Log 25 films',
    glyph: '◆',
    check: (logs: any[]) => logs.length >= 25,
  },
  {
    id: 'the-oracle',
    title: 'THE ORACLE',
    desc: 'Log 100 films',
    glyph: '◈',
    check: (logs: any[]) => logs.length >= 100,
  },
  {
    id: 'the-connoisseur',
    title: 'THE CONNOISSEUR',
    desc: 'Rate 5 films with 5 reels',
    glyph: '✧',
    check: (logs: any[]) => logs.filter((l: any) => l.rating === 5).length >= 5,
  },
  {
    id: 'the-critic',
    title: 'THE CRITIC',
    desc: 'Write 10 reviews',
    glyph: '§',
    check: (logs: any[]) => logs.filter((l: any) => l.review?.length > 20).length >= 10,
  },
  {
    id: 'genre-explorer',
    title: 'GENRE EXPLORER',
    desc: 'Log films in 5+ genres',
    glyph: '⊕',
    check: (logs: any[]) => {
      const genres = new Set<string>()
      logs.forEach((l: any) => l.genres?.forEach((g: any) => genres.add(g)))
      return genres.size >= 5
    },
  },
  {
    id: 'decade-drifter',
    title: 'DECADE DRIFTER',
    desc: 'Watch films from 4+ decades',
    glyph: '⊗',
    check: (logs: any[]) => {
      const decades = new Set<number>()
      logs.forEach((l: any) => { if (l.year) decades.add(Math.floor(l.year / 10) * 10) })
      return decades.size >= 4
    },
  },
  {
    id: 'marathon-runner',
    title: 'MARATHON RUNNER',
    desc: 'Log 3+ films in one day',
    glyph: '⟐',
    check: (logs: any[]) => {
      const counts: Record<string, number> = {}
      logs.forEach((l: any) => {
        const d = (l.watchedDate || l.createdAt || '').slice(0, 10)
        if (d) counts[d] = (counts[d] || 0) + 1
      })
      return Object.values(counts).some(c => c >= 3)
    },
  },
  {
    id: 'the-completionist',
    title: 'THE COMPLETIONIST',
    desc: 'Rate every logged film',
    glyph: '⊛',
    check: (logs: any[]) => logs.length >= 5 && logs.every((l: any) => l.rating > 0),
  },
]

export default function Achievements({ logs }: { logs: any[] }) {
  const earned = useMemo(() =>
    BADGES.map(b => ({ ...b, unlocked: b.check(logs) })),
    [logs]
  )

  const unlockedCount = earned.filter(b => b.unlocked).length

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div className="section-title">SOCIETY HONORS</div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em',
          color: 'var(--sepia)', opacity: 0.7,
        }}>
          {unlockedCount}/{BADGES.length} EARNED
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '0.75rem',
      }}>
        <AnimatePresence>
          {earned.map((badge) => (
            <motion.div
              key={badge.id}
              initial={false}
              animate={{ opacity: badge.unlocked ? 1 : 0.25 }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '0.4rem', padding: '0.75rem 0.5rem',
                background: badge.unlocked
                  ? 'linear-gradient(135deg, rgba(139,105,20,0.08) 0%, rgba(242,232,160,0.04) 100%)'
                  : 'transparent',
                border: `1px solid ${badge.unlocked ? 'rgba(139,105,20,0.2)' : 'rgba(255,255,255,0.03)'}`,
                borderRadius: '3px',
                transition: 'all 0.3s ease',
                cursor: 'default',
              }}
              title={badge.unlocked ? `${badge.title} — ${badge.desc}` : `Locked: ${badge.desc}`}
            >
              {/* SVG Glyph — elegant monospace symbol */}
              <div style={{
                fontSize: '1.4rem',
                color: badge.unlocked ? 'var(--sepia)' : 'var(--ash)',
                textShadow: badge.unlocked ? '0 0 12px rgba(139,105,20,0.4)' : 'none',
                transition: 'color 0.3s, text-shadow 0.3s',
                lineHeight: 1,
              }}>
                {badge.glyph}
              </div>
              {/* Badge name */}
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: '0.4rem',
                letterSpacing: '0.12em', textAlign: 'center',
                color: badge.unlocked ? 'var(--flicker)' : 'var(--ash)',
                lineHeight: 1.3,
              }}>
                {badge.title}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
