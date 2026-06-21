import { logger } from '@/src/utils/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { User } from '../types';
import { ProfileService } from '../services/ProfileWriteService';
import TactileEngine from '../utils/TactileEngine';
import reelToast from '../utils/reelToast';
import { storage } from '../stores/mmkv-storage';
import { CACHE_KEYS } from '../constants/cacheKeys';

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateUser'],
    mutationFn: async (updates: Partial<User>) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error("No user");
      await ProfileService.updateProfile(user.id, updates);
      TactileEngine.mutate();
    },
    onMutate: async (updates) => {
      const state = useAuthStore.getState();
      const prevUser = state.user;
      
      if (prevUser) {
        await queryClient.cancelQueries({ queryKey: ['user', prevUser.id] });

        const mappedUpdates: Record<string, unknown> = { ...updates };
        if ('isSocialPrivate' in mappedUpdates) {
          mappedUpdates.is_social_private = mappedUpdates.isSocialPrivate;
          delete mappedUpdates.isSocialPrivate;
        }
        
        const updatedUser = { ...prevUser, ...mappedUpdates } as User;
        useAuthStore.setState({ user: updatedUser });
        
        storage.set(CACHE_KEYS.USER(updatedUser.id), JSON.stringify(updatedUser));
      }
      return { prevUser };
    },
    onError: (err, _variables, context) => {
      if (__DEV__) logger.warn('[useUpdateUser] DB sync failed, rolling back:', err);
      if (context?.prevUser) {
        useAuthStore.setState({ user: context.prevUser });
        storage.set(CACHE_KEYS.USER(context.prevUser.id), JSON.stringify(context.prevUser!));
      }
      reelToast.error('Profile update failed \u2014 changes reverted.');
    },
    onSettled: () => {
      const user = useAuthStore.getState().user;
      if (user) {
        queryClient.invalidateQueries({ queryKey: ['user', user.id] });
      }
    }
  });
}
