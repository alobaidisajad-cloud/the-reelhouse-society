import { useAuthStore } from '../stores/auth'
import reelToast from '../utils/reelToast'

/**
 * Whether the member is banned, as the phone last read their profile. The
 * stack composer asks before writing, and says so; every write is refused by
 * the server anyway (enforce_not_restricted), for a ban or a suspension.
 */
export function useBanCheck() {
    const { user } = useAuthStore()
    const isBanned = user?.is_banned === true

    const checkBan = (): boolean => {
        if (isBanned) {
            reelToast.error('Your account has been silenced by The Society.')
            return true
        }
        return false
    }

    return { isBanned, checkBan }
}
