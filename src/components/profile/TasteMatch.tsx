/**
 * TasteMatch — how alike the viewer and a member are, over both whole records.
 *
 * It compared the logs the page happened to hold: the viewer's loaded page and
 * the member's first page. get_taste_match answers, for both, how many films
 * each rated every whole reel and logged from each decade: the same comparison,
 * on everything. A record the viewer may not read gives no card; a comparison
 * that could not be read says so, and is asked again on a press.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store'

interface TasteShape { logs: number; ratings: number[]; decades: Record<string, number> }

/** Under this many logs on either side, there is too little to compare. */
const TASTE_FLOOR = 5

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

/** 0–100: how they rate, half; which decades they watch, half. Null under the floor. */
export function tasteMatchOf(mine: TasteShape, theirs: TasteShape): number | null {
  if (mine.logs < TASTE_FLOOR || theirs.logs < TASTE_FLOOR) return null
  const share = (counts: number[]) => {
    const total = counts.reduce((a, b) => a + b, 0) || 1
    return counts.map(c => c / total)
  }
  const ratingMatch = cosineSimilarity(share(mine.ratings), share(theirs.ratings))
  const decades = [...new Set([...Object.keys(mine.decades), ...Object.keys(theirs.decades)])]
  const decadeMatch = cosineSimilarity(decades.map(d => mine.decades[d] ?? 0), decades.map(d => theirs.decades[d] ?? 0))
  return Math.round((ratingMatch * 0.5 + decadeMatch * 0.5) * 100)
}

/** Both shapes, or null when the viewer may not read this member's record. A failed read is thrown. */
export async function readTasteMatch(userId: string): Promise<{ mine: TasteShape; theirs: TasteShape } | null> {
  const { data, error } = await supabase.rpc('get_taste_match', { p_user_id: userId })
  if (error) throw error
  if (!data || typeof data !== 'object' || 'error' in data) return null
  return data as { mine: TasteShape; theirs: TasteShape }
}

const frame = { padding: '1.25rem', textAlign: 'center' as const }
const caption = { fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--fog)', marginBottom: '0.75rem' }
const line = { fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--fog)', lineHeight: 1.4 }

export default function TasteMatch({ userId, theirUsername }: { userId: string; theirUsername: string }) {
  const signedIn = useAuthStore(s => s.isAuthenticated)
  const read = useQuery({
    queryKey: ['tasteMatch', userId],
    queryFn: () => readTasteMatch(userId),
    enabled: signedIn && !!userId,
    staleTime: 10 * 60 * 1000,
  })

  if (read.isLoading || read.isError) {
    return (
      <div className="card" style={frame}>
        <div style={caption}>TASTE COMPATIBILITY</div>
        <div style={line}>{read.isError ? 'Your records could not be compared just now.' : 'Comparing your records…'}</div>
        {read.isError && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem' }} onClick={() => { void read.refetch() }}>
            TRY AGAIN
          </button>
        )}
      </div>
    )
  }
  // A record the viewer may not read, or too little on either side: nothing to compare.
  const match = read.data ? tasteMatchOf(read.data.mine, read.data.theirs) : null
  if (match === null) return null

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
