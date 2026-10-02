/**
 * standing.ts — how far a member has come, decided in one place, as the app
 * decides it (mobile/src/constants/standing.ts): the same rungs at the same
 * film counts, and those counts are the honours' own thresholds.
 *
 * The website had three ladders that disagreed with the app and with each
 * other: the profile crowned THE ORACLE above 50 films while its honours grid
 * printed "Log 100 films" beside it, and the DNA card ranked members with the
 * paid ranks' names ("Archivist" at fifteen films).
 */

export interface Rung {
    /** Films required to hold this standing. */
    at: number
    name: string
    color: string
}

/** Ascending. A test holds these names and counts to the app's. */
export const STANDING_LADDER: readonly Rung[] = [
    { at: 0, name: 'UNSEATED', color: 'var(--fog)' },
    { at: 1, name: 'FIRST REEL', color: 'var(--bone)' },
    { at: 10, name: 'THE REGULAR', color: 'var(--flicker)' },
    { at: 25, name: 'MIDNIGHT DEVOTEE', color: 'var(--crimson-ink)' },
    { at: 100, name: 'THE ORACLE', color: 'var(--sepia)' },
]

/** The film count a named rung (and the honour of that name) is earned at. */
export function rungAt(name: string): number {
    return STANDING_LADDER.find((r) => r.name === name)?.at ?? Number.MAX_SAFE_INTEGER
}

export interface Standing {
    count: number
    level: string
    color: string
    /** How far along the rung held, 0–100; 100 at the top, where no bar is drawn. */
    progress: number
    isHighest: boolean
}

export function standingFor(films: number): Standing {
    const n = Number.isFinite(films) && films > 0 ? Math.floor(films) : 0
    let i = 0
    for (let k = 0; k < STANDING_LADDER.length; k++) if (n >= STANDING_LADDER[k].at) i = k
    const held = STANDING_LADDER[i]
    const next = STANDING_LADDER[i + 1]
    const progress = next ? Math.max(0, Math.min(100, Math.round(((n - held.at) / (next.at - held.at)) * 100))) : 100
    return { count: n, level: held.name, color: held.color, progress, isHighest: !next }
}
