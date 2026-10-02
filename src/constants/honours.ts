/**
 * honours.ts — the honours and the passport's stamps, earned from a member's
 * whole record, as the app earns them (mobile/src/components/profile/
 * Achievements.tsx and NoirPassport.tsx). A test holds the names and the rules
 * to the app's.
 *
 * The record is get_public_profile_analytics: counts the server makes over
 * every log. The website used to judge each honour from the logs that had
 * loaded on the page (fifty at a time), so a member with three hundred films
 * could see THE ORACLE locked; and its own lists named the same honours four
 * different ways.
 */
import { rungAt } from './standing'

/** get_public_profile_analytics: the member's record over the WHOLE history. */
export interface ProfileAnalytics {
    stamps?: {
        total_logs: number
        pre_1960_count: number
        perfect_ratings_count: number
        has_physical_media: boolean | null
        has_abandoned: boolean | null
        decades_logged_count: number
        has_rewatched: boolean
        reviews_count: number
        genres_count: number
        busiest_day_count: number
        unrated_count: number
    }
    dna?: {
        avg_rating: number | null
        top_decades: Record<string, number>[] | null
        /** The film page's obscurity mark, averaged over the films read; absent before 20261002_03. */
        obscurity_index?: number | null
    }
    autopsy_math?: { avg_story: number | null; avg_cinematography: number | null; avg_sound: number | null } | null
    /** Present instead of the record when the viewer may not read it. */
    error?: string
}

export type Stamps = NonNullable<ProfileAnalytics['stamps']>

export interface Honour {
    id: string
    title: string
    desc: string
    glyph: string
    check: (s: Stamps) => boolean
}

export const HONOURS: Honour[] = [
    { id: 'first-reel', title: 'FIRST REEL', desc: 'Log your first film', glyph: '✦', check: (s) => s.total_logs >= rungAt('FIRST REEL') },
    { id: 'the-regular', title: 'THE REGULAR', desc: 'Log 10 films', glyph: '❖', check: (s) => s.total_logs >= rungAt('THE REGULAR') },
    { id: 'midnight-devotee', title: 'MIDNIGHT DEVOTEE', desc: 'Log 25 films', glyph: '◆', check: (s) => s.total_logs >= rungAt('MIDNIGHT DEVOTEE') },
    { id: 'the-oracle', title: 'THE ORACLE', desc: 'Log 100 films', glyph: '◈', check: (s) => s.total_logs >= rungAt('THE ORACLE') },
    { id: 'the-connoisseur', title: 'THE CONNOISSEUR', desc: 'Rate 5 films with 5 reels', glyph: '✧', check: (s) => s.perfect_ratings_count >= 5 },
    { id: 'the-critic', title: 'THE CRITIC', desc: 'Write 10 reviews', glyph: '§', check: (s) => s.reviews_count >= 10 },
    { id: 'genre-explorer', title: 'GENRE EXPLORER', desc: 'Log films in 5+ genres', glyph: '⊕', check: (s) => s.genres_count >= 5 },
    { id: 'decade-drifter', title: 'DECADE DRIFTER', desc: 'Watch films from 4+ decades', glyph: '⊗', check: (s) => s.decades_logged_count >= 4 },
    { id: 'marathon-runner', title: 'MARATHON RUNNER', desc: 'Log 3+ films in one day', glyph: '⟐', check: (s) => s.busiest_day_count >= 3 },
    { id: 'the-completionist', title: 'THE COMPLETIONIST', desc: 'Rate every logged film', glyph: '⊛', check: (s) => s.total_logs >= 5 && s.unrated_count === 0 },
]

export interface PassportStamp {
    id: string
    label: string
    sub: string
    glyph: string
    earned: (s: Stamps) => boolean
}

export const PASSPORT_STAMPS: PassportStamp[] = [
    { id: 'century', label: 'THE CENTURY', sub: '100 FILMS LOGGED', glyph: '◈', earned: (s) => s.total_logs >= 100 },
    { id: 'devotee', label: 'THE DEVOTEE', sub: '500 FILMS LOGGED', glyph: '✦', earned: (s) => s.total_logs >= 500 },
    { id: 'silver_screen', label: 'SILVER SCREEN', sub: '20 FILMS PRE-1960', glyph: '†', earned: (s) => s.pre_1960_count >= 20 },
    { id: 'masterpiece', label: 'MASTERPIECE HUNTER', sub: '10 PERFECT RATINGS', glyph: '★', earned: (s) => s.perfect_ratings_count >= 10 },
    { id: 'vault_keeper', label: 'THE COLLECTOR', sub: 'PHYSICAL MEDIA LOGGED', glyph: '▣', earned: (s) => !!s.has_physical_media },
    { id: 'honest_critic', label: 'HONEST CRITIC', sub: 'ABANDONED A FILM', glyph: '✕', earned: (s) => !!s.has_abandoned },
    { id: 'historian', label: 'THE HISTORIAN', sub: 'FILMS FROM 7 DECADES', glyph: '∞', earned: (s) => s.decades_logged_count >= 7 },
    { id: 'half_life', label: 'THE RETURNER', sub: 'REWATCHED A FILM', glyph: '↻', earned: (s) => !!s.has_rewatched },
]

/** The record, or null while it is unread or when it may not be read. */
export function stampsOf(analytics: ProfileAnalytics | null | undefined): Stamps | null {
    return analytics && !analytics.error && analytics.stamps ? analytics.stamps : null
}

/** A stamp's label in up to two lines of 14, broken between words, never inside one. */
export function stampLines(label: string, width = 14): [string, string] {
    if (label.length <= width) return [label, '']
    const cut = label.lastIndexOf(' ', width)
    return cut > 0 ? [label.slice(0, cut), label.slice(cut + 1)] : [label, '']
}
