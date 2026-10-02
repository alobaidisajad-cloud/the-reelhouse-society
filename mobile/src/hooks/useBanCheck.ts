import { useAuthStore } from '../stores/auth'
import reelToast from '../utils/reelToast'
import { standingOf } from '../utils/standing'
import { formatClockTime, formatDate } from '../utils/timeAgo'

/**
 * Whether the member may write, as the phone last read their standing. The
 * stack composer asks before writing, and says why in the server's own words;
 * every write is refused by the server anyway (enforce_not_restricted), for a
 * silence or a suspension, and the StandingNotice says it while it lasts.
 */
export function useBanCheck() {
    const { user } = useAuthStore()
    const standing = standingOf(user as { is_banned?: boolean | null; suspended_until?: string | null } | null)
    const isBanned = standing !== null

    const checkBan = (): boolean => {
        if (!standing) return false
        reelToast.error(standing.kind === 'silenced'
            ? 'Your account has been silenced by The Society.'
            : `Your account is suspended until ${formatDate(standing.until, 'long')}, ${formatClockTime(standing.until)}.`)
        return true
    }

    return { isBanned, checkBan }
}
