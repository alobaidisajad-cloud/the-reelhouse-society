/**
 * sessionGuard — "is this still the member who asked for this work?"
 *
 * Every async store operation reads the member at the start, awaits the network,
 * then writes the result. None of them re-checked in between, so a logout during
 * that await let the previous member's data land in the store AFTER the reset
 * had cleared it — and because a store change triggers a disk write, it also
 * re-created the persisted copy that #64 exists to delete.
 *
 * A single wrapper around `set` cannot do this job: it sees only that *a* write
 * is happening, not who it was for, so it could catch "signed out" but not
 * "signed out and back in as someone else" — which is the case that actually
 * moves data between two people. The check has to carry the captured id, so it
 * lives at the call site.
 *
 * Usage — the id is the one the operation already captured at its start:
 *
 *   const user = useAuthStore.getState().user;
 *   if (!user) return;
 *   const { data } = await supabase...
 *   if (!stillSignedIn(user.id)) return;   // ← the write below is now safe
 *   set({ logs: data });
 */
import { useAuthStore } from '../../auth';

export function stillSignedIn(capturedUserId: string | null | undefined): boolean {
    if (!capturedUserId) return false;
    return useAuthStore.getState().user?.id === capturedUserId;
}
