/**
 * The website's profile reads a member's whole record, and names it as the app does.
 * ─────────────────────────────────────────────────────────────────────────────
 * The website counted honours, stamps and standing from the logs that had
 * loaded (fifty at a time), downloaded every rating a member ever gave to
 * count their films (stopping at a thousand), printed an "obscurity index"
 * made up from the average rating, and kept four ladders of names: THE ORACLE
 * above 50 films beside an honour that said "Log 100 films", and paid ranks'
 * names ("Archivist") as a DNA archetype. Now one record
 * (get_public_profile_analytics) and one vocabulary, the app's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { render, screen, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc } }))

import { STANDING_LADDER, standingFor } from '../constants/standing'
import { HONOURS, PASSPORT_STAMPS, stampLines, type ProfileAnalytics, type Stamps } from '../constants/honours'
import Achievements from '../components/profile/Achievements'
import { NoirPassport } from '../components/profile/NoirPassport'
import { TasteDNA } from '../components/profile/TasteDNA'
import { useAchievements } from '../hooks/useAchievements'

const ROOT = join(__dirname, '..', '..')
const app = (rel: string) => readFileSync(join(ROOT, 'mobile', rel), 'utf8')

const STAMPS: Stamps = {
    total_logs: 120, pre_1960_count: 3, perfect_ratings_count: 6, has_physical_media: false, has_abandoned: true,
    decades_logged_count: 5, has_rewatched: false, reviews_count: 2, genres_count: 9, busiest_day_count: 1, unrated_count: 4,
}
const RECORD: ProfileAnalytics = {
    stamps: STAMPS,
    dna: { avg_rating: 3.6, top_decades: [{ '1990s': 60 }, { '1970s': 30 }], obscurity_index: 71 },
    autopsy_math: { avg_story: null, avg_cinematography: null, avg_sound: null },
}

describe('one vocabulary: the app’s', () => {
    it('the ladder is the app’s rungs at the app’s film counts', () => {
        const rungs = [...app('src/constants/standing.ts').matchAll(/\{ at: (\d+),\s+name: '([^']+)'/g)].map((m) => [Number(m[1]), m[2]])
        expect(rungs.length).toBeGreaterThan(3)
        expect(STANDING_LADDER.map((r) => [r.at, r.name])).toEqual(rungs)
    })

    it('the honours and the stamps are the app’s, by id, name and promise', () => {
        const badges = [...app('src/components/profile/Achievements.tsx').matchAll(/id: '([^']+)',\s+title: '([^']+)',\s+desc: '([^']+)'/g)].map((m) => [m[1], m[2], m[3]])
        expect(badges.length).toBe(10)
        expect(HONOURS.map((h) => [h.id, h.title, h.desc])).toEqual(badges)
        const stamps = [...app('src/components/profile/NoirPassport.tsx').matchAll(/\{ id: '([^']+)', label: '([^']+)', sub: '([^']+)'/g)].map((m) => [m[1], m[2], m[3]])
        expect(stamps.length).toBe(8)
        expect(PASSPORT_STAMPS.map((s) => [s.id, s.label, s.sub])).toEqual(stamps)
    })

    it('a rung’s name is written in one place on the website', () => {
        const files: string[] = []
        const walk = (d: string) => readdirSync(d).forEach((e) => {
            const p = join(d, e)
            if (statSync(p).isDirectory()) { if (e !== 'test' && e !== '__tests__') walk(p) } else if (/\.(ts|tsx)$/.test(e)) files.push(p)
        })
        walk(join(ROOT, 'src'))
        const homes = new Set(['standing.ts', 'honours.ts'])
        // THE ORACLE is also the news desk's byline, so it counts only beside a
        // count; the other three names belong to the ladder alone.
        const rung = (line: string) => /'(MIDNIGHT DEVOTEE|THE REGULAR|FIRST REEL)'/.test(line)
            || (/'THE ORACLE'/.test(line) && /[<>]=?\s*\d/.test(line))
        const strays = files.filter((f) => !homes.has(f.split(/[\\/]/).pop()!) && readFileSync(f, 'utf8').split('\n').some(rung))
        expect(strays).toEqual([])
    })

    it('the honours are judged from the record’s counts, at the promised thresholds', () => {
        const earned = HONOURS.filter((h) => h.check(STAMPS)).map((h) => h.id)
        expect(earned).toEqual(['first-reel', 'the-regular', 'midnight-devotee', 'the-oracle', 'the-connoisseur', 'genre-explorer', 'decade-drifter'])
        expect(standingFor(99).level).toBe('MIDNIGHT DEVOTEE')
        expect(standingFor(100).level).toBe('THE ORACLE')
        expect(standingFor(0).level).toBe('UNSEATED')
    })

    it('a stamp’s name breaks between words, never inside one', () => {
        expect(stampLines('MASTERPIECE HUNTER')).toEqual(['MASTERPIECE', 'HUNTER'])
        expect(stampLines('THE COLLECTOR')).toEqual(['THE COLLECTOR', ''])
    })
})

describe('the rooms say what they know', () => {
    it('honours: counted from the record, and never "nothing earned" before it is read', () => {
        const { unmount } = render(<Achievements analytics={RECORD} />)
        expect(screen.getByText('7/10 EARNED')).toBeTruthy()
        unmount()
        render(<Achievements analytics={undefined} />)
        expect(screen.getByRole('status').textContent).toBe('READING THE RECORD…')
        expect(screen.queryByText(/EARNED/)).toBeNull()
    })

    it('a record not open to the viewer, or not reachable, says so', () => {
        const { unmount } = render(<NoirPassport analytics={{ error: 'forbidden' }} />)
        expect(screen.getByRole('status').textContent).toBe('THIS RECORD IS NOT OPEN TO YOU')
        unmount()
        render(<NoirPassport analytics={undefined} failed />)
        expect(screen.getByRole('status').textContent).toBe('THE RECORD COULD NOT BE READ')
    })

    it('the passport counts its stamps from the record', () => {
        render(<NoirPassport analytics={RECORD} />)
        expect(screen.getByText('2 of 8 STAMPS EARNED')).toBeTruthy()
    })

    it('the DNA prints the measured obscurity, or a dash — never a figure made from the average', () => {
        const { unmount, container } = render(<TasteDNA analytics={RECORD} />)
        expect(container.textContent).toContain('OBSCURITY INDEX71')
        expect(container.textContent).toContain('THE ORACLE · 1990s · School of Realism')
        unmount()
        const unmeasured = { ...RECORD, dna: { ...RECORD.dna!, obscurity_index: undefined } }
        const { container: c2 } = render(<TasteDNA analytics={unmeasured} />)
        expect(c2.textContent).toContain('OBSCURITY INDEX—')
    })

    it('below five films the DNA says how many a reading needs', () => {
        render(<TasteDNA analytics={{ ...RECORD, stamps: { ...STAMPS, total_logs: 3 } }} />)
        expect(screen.getByRole('status').textContent).toBe('A reading needs 5 films; 3 are logged.')
    })
})

describe('an honour is announced once, when it is earned', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    )
    beforeEach(() => { localStorage.clear(); mocks.rpc.mockReset() })

    it('the first reading on a device is taken as known; the next honour is announced', async () => {
        mocks.rpc.mockResolvedValue({ data: { stamps: { ...STAMPS, total_logs: 24, perfect_ratings_count: 0, genres_count: 0, decades_logged_count: 0 } }, error: null })
        const { result, rerender } = renderHook(({ n }) => useAchievements('u1', n), { wrapper, initialProps: { n: 24 } })
        await waitFor(() => expect(result.current.badges.length).toBe(2))
        expect(result.current.newBadges).toEqual([])
        expect(mocks.rpc).toHaveBeenCalledWith('get_public_profile_analytics', { p_user_id: 'u1' })

        mocks.rpc.mockResolvedValue({ data: { stamps: { ...STAMPS, total_logs: 25, perfect_ratings_count: 0, genres_count: 0, decades_logged_count: 0 } }, error: null })
        rerender({ n: 25 })
        await waitFor(() => expect(result.current.newBadges.map((b) => b.title)).toEqual(['MIDNIGHT DEVOTEE']))
    })
})
