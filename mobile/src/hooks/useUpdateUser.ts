import { logger } from '@/src/utils/logger';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { User } from '../types';
import { ProfileService } from '../services/ProfileWriteService';
import TactileEngine from '../utils/TactileEngine';
import reelToast from '../utils/reelToast';
import { setSensitive } from '../stores/mmkv-storage';
import { CACHE_KEYS } from '../constants/cacheKeys';
import { memberUnchanged } from '../stores/domain/helpers/sessionGuard';

export function useUpdateUser() {
  return useMutation({
    mutationKey: ['updateUser'],
    mutationFn: async (updates: Partial<User>) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error("No user");
      // The handle held before, for the record of past handles (never read from a cache that a
      // phone whose keystore failed does not keep).
      await ProfileService.updateProfile(user.id, updates, user.username);
      TactileEngine.mutate();
    },
    onMutate: async (updates) => {
      const state = useAuthStore.getState();
      const prevUser = state.user;
      // The fields this save sets, as the store holds them (isSocialPrivate is the row's is_social_private).
      const mappedUpdates: Record<string, unknown> = { ...updates };
      if ('isSocialPrivate' in mappedUpdates) {
        mappedUpdates.is_social_private = mappedUpdates.isSocialPrivate;
        delete mappedUpdates.isSocialPrivate;
      }

      if (prevUser) {
        const updatedUser = { ...prevUser, ...mappedUpdates } as User;
        useAuthStore.setState({ user: updatedUser });

        setSensitive(CACHE_KEYS.USER(updatedUser.id), JSON.stringify(updatedUser));
      }
      return { prevUser, set: mappedUpdates };
    },
    onError: (err, _variables, context) => {
      if (__DEV__) logger.warn('[useUpdateUser] DB sync failed, rolling back:', err);
      const prevUser = context?.prevUser;
      if (!prevUser) return;
      // Never onto a member who has left: a save that failed after a sign-out (or the account's
      // deletion) put the departed member back in the store and wrote their profile back to disk
      // after it had been wiped (review round 11). Nothing is said to whoever is here now.
      if (!memberUnchanged(prevUser.id)) return;
      // This save alone is undone: a field changed again since keeps its newer value, and a field
      // this save did not set is not touched (a whole earlier copy laid back undid them).
      const set = context.set;
      const now = useAuthStore.getState().user;
      if (now) {
        const held = now as unknown as Record<string, unknown>;
        const was = prevUser as unknown as Record<string, unknown>;
        const undone: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(set)) {
          if (held[k] === v) undone[k] = was[k];
        }
        const reverted = { ...now, ...undone } as User;
        useAuthStore.setState({ user: reverted });
        setSensitive(CACHE_KEYS.USER(reverted.id), JSON.stringify(reverted));
      }
      reelToast.error('Profile update failed — changes reverted.');
    },
  });
}
