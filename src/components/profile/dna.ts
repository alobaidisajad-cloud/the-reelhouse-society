/**
 * dna.ts — the Cinema DNA's figures from the member's record, read once for
 * the profile's poster (TasteDNA) and the shareable card (CinemaDNACard).
 */
import type { ProfileAnalytics } from '../../constants/honours'

/** A reading needs this many films before it says anything, as in the app. */
export const DNA_FLOOR = 5

export interface DnaReading {
    /** "3.8", or "—" with nothing rated. */
    avgRating: string
    tones: string
    /** ["1990s", 41], most-logged first: the server's top three. */
    topDecades: [string, number][]
    autopsy: { story: number; cinematography: number; sound: number } | null
    /** The film page's obscurity mark averaged over the member's films; "—" until the house has read any. */
    obscurity: string
}

export function dnaOf(analytics: ProfileAnalytics | null | undefined): DnaReading {
    const d = analytics?.dna
    const avg = typeof d?.avg_rating === 'number' ? d.avg_rating : Number(d?.avg_rating ?? 0)
    const topDecades = (Array.isArray(d?.top_decades) ? d.top_decades : [])
        .map((td) => Object.entries(td)[0])
        .filter((e): e is [string, number] => !!e)
        .map(([decade, n]) => [decade, Number(n)] as [string, number])
    const a = analytics?.autopsy_math
    const measured = d?.obscurity_index
    return {
        avgRating: avg > 0 ? avg.toFixed(1) : '—',
        tones: avg >= 4 ? 'Romanticism' : avg >= 3 ? 'Realism' : avg >= 2 ? 'Dark Romanticism' : 'Nihilism',
        topDecades,
        autopsy: a && a.avg_story != null
            ? { story: Math.round(Number(a.avg_story) || 0), cinematography: Math.round(Number(a.avg_cinematography) || 0), sound: Math.round(Number(a.avg_sound) || 0) }
            : null,
        obscurity: typeof measured === 'number' ? String(measured) : '—',
    }
}
