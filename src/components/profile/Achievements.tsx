/**
 * Achievements — SOCIETY HONORS, earned from the member's whole record (the
 * server's counts, constants/honours.ts), never from the logs that loaded.
 * Until the record is read the case says so.
 */
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HONOURS, stampsOf, type ProfileAnalytics } from '../../constants/honours'
import { RecordNotRead } from './RecordNotRead'

export default function Achievements({ analytics, failed }: { analytics?: ProfileAnalytics | null; failed?: boolean }) {
  const stamps = stampsOf(analytics)
  const earned = useMemo(() =>
    stamps ? HONOURS.map(b => ({ ...b, unlocked: b.check(stamps) })) : [],
    [stamps]
  )

  if (!stamps) return <RecordNotRead analytics={analytics} failed={failed} />

  const unlockedCount = earned.filter(b => b.unlocked).length

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div className="section-title">SOCIETY HONORS</div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em',
          color: 'var(--sepia)', opacity: 0.7,
        }}>
          {unlockedCount}/{HONOURS.length} EARNED
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

