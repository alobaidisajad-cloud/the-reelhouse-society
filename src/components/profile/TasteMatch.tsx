/**
 * TasteMatch — Shows taste compatibility percentage between two users.
 * Compares decade preferences, rating patterns, and genre overlap.
 * Pure client-side computation, no API calls.
 */

interface TasteMatchProps {
  myLogs: any[]
  theirLogs: any[]
  theirUsername: string
}

function getRatingVector(logs: any[]) {
  const counts = [0, 0, 0, 0, 0] // 1-5 stars
  logs.forEach((l: any) => {
    const r = Math.round(l.rating || 0)
    if (r >= 1 && r <= 5) counts[r - 1]++
  })
  const total = counts.reduce((a, b) => a + b, 0) || 1
  return counts.map(c => c / total)
}

function getDecadeVector(logs: any[]) {
  const decades: Record<number, number> = {}
  logs.forEach((l: any) => {
    if (l.year) {
      const d = Math.floor(l.year / 10) * 10
      decades[d] = (decades[d] || 0) + 1
    }
  })
  return decades
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export default function TasteMatch({ myLogs, theirLogs, theirUsername }: TasteMatchProps) {
  if (myLogs.length < 5 || theirLogs.length < 5) return null

  // Rating pattern similarity (how similarly do you rate films?)
  const myRatings = getRatingVector(myLogs)
  const theirRatings = getRatingVector(theirLogs)
  const ratingMatch = cosineSimilarity(myRatings, theirRatings)

  // Decade preference overlap (do you watch films from the same eras?)
  const myDecades = getDecadeVector(myLogs)
  const theirDecades = getDecadeVector(theirLogs)
  const allDecades = [...new Set([...Object.keys(myDecades), ...Object.keys(theirDecades)].map(Number))].sort()
  const myDecadeVec = allDecades.map(d => myDecades[d] || 0)
  const theirDecadeVec = allDecades.map(d => theirDecades[d] || 0)
  const decadeMatch = cosineSimilarity(myDecadeVec, theirDecadeVec)

  // Overall match (weighted average)
  const match = Math.round((ratingMatch * 0.5 + decadeMatch * 0.5) * 100)

  const label = match >= 80 ? 'KINDRED SPIRITS' : match >= 60 ? 'SIMILAR TASTES' : match >= 40 ? 'PARALLEL REELS' : 'DIVERGENT PATHS'
  const color = match >= 80 ? 'var(--sepia)' : match >= 60 ? 'var(--flicker)' : match >= 40 ? 'var(--bone)' : 'var(--fog)'

  return (
    <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em',
        color: 'var(--fog)', marginBottom: '0.75rem',
      }}>
        TASTE COMPATIBILITY
      </div>

      {/* Big percentage */}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: '2.5rem', color,
        lineHeight: 1, marginBottom: '0.3rem',
        textShadow: `0 0 20px ${color}30`,
      }}>
        {match}%
      </div>

      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em',
        color, marginBottom: '0.5rem',
      }}>
        {label}
      </div>

      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)',
        lineHeight: 1.4,
      }}>
        You and @{theirUsername} share a {match}% cinematic overlap
      </div>
    </div>
  )
}
