import { useAuthStore } from '../store'
import reelToast from '../utils/reelToast'

/**
 * Returns true if the current user is banned.
 * Call `checkBan()` before any write operation (post review, create list, comment).
 * If banned, it shows a toast and returns true — the caller should abort.
 */
export function useBanCheck() {
    const { user } = useAuthStore()
    const isBanned = user?.is_banned === true

    const checkBan = (): boolean => {
        if (isBanned) {
            reelToast.error('Your account has been silenced by The Society.', { duration: 4000 })
            return true
        }
        return false
    }

    return { isBanned, checkBan }
}
