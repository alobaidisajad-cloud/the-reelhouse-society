/**
 * useAchievements — tells a member, once, when they earn an honour.
 *
 * The honours are the profile's own (constants/honours.ts), judged from the
 * member's whole record (useProfileAnalytics), read again as their film count
 * changes. What has been announced is kept on this device, per member; the
 * first reading on a device is taken as already known, so nobody is greeted
 * with every honour they already hold.
 *
 * It used to judge a list of its own from the logs in the store, under other
 * names than the profile's grid (THE INITIATE, THE NOCTURNE…), and to save the
 * result to profiles.badges, which members cannot write: every save failed,
 * unread.
 */
import { useCallback, useEffect, useState } from 'react'
import { HONOURS, stampsOf, type Honour } from '../constants/honours'
import { useProfileAnalytics } from './useProfileAnalytics'

const announcedKey = (userId: string) => `reelhouse-honours-announced:${userId}`

/** The ids already announced to this member here, or null before the first reading. */
function readAnnounced(userId: string): string[] | null {
    try {
        const raw = localStorage.getItem(announcedKey(userId))
        return raw ? (JSON.parse(raw) as string[]) : null
    } catch {
        return null
    }
}

function writeAnnounced(userId: string, ids: string[]) {
    try { localStorage.setItem(announcedKey(userId), JSON.stringify(ids)) } catch { /* private browsing: nothing is announced twice in one visit anyway */ }
}

export function useAchievements(userId: string | undefined, filmCount: number) {
    const { data } = useProfileAnalytics(userId, filmCount)
    const stamps = stampsOf(data)
    const [newBadges, setNewBadges] = useState<Honour[]>([])

    useEffect(() => {
        if (!userId || !stamps) return
        const earned = HONOURS.filter((h) => h.check(stamps)).map((h) => h.id)
        const announced = readAnnounced(userId)
        if (announced === null) { writeAnnounced(userId, earned); return }
        const fresh = earned.filter((id) => !announced.includes(id))
        if (fresh.length === 0) return
        writeAnnounced(userId, [...announced, ...fresh])
        setNewBadges((shown) => [...shown, ...HONOURS.filter((h) => fresh.includes(h.id) && !shown.some((s) => s.id === h.id))])
    }, [userId, stamps])

    const dismissNewBadge = useCallback((id: string) => setNewBadges((shown) => shown.filter((b) => b.id !== id)), [])
    const badges = stamps ? HONOURS.filter((h) => h.check(stamps)) : []

    return { badges, newBadges, dismissNewBadge }
}
