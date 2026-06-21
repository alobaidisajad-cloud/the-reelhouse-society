import { useMutation } from '@tanstack/react-query';
import { useLoungeStore, LoungeMessage } from '../stores/lounge';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../lib/supabase';
import reelToast from '../utils/reelToast';
import { isNetworkError } from '../utils/networkError';
import { enqueueMutation, flushOfflineQueue } from '../utils/offlineQueue';

export function useSendMessage() {
  return useMutation({
    mutationFn: async (variables: { loungeId: string; content: string; type?: string; meta?: Record<string, unknown> }) => {
      const { loungeId, content, type = 'text', meta = {} } = variables;
      const user = useAuthStore.getState().user;
      if (!user) throw new Error("No user");
      
      const { data, error } = await supabase.from('lounge_messages').insert([{
        lounge_id: loungeId,
        user_id: user.id,
        content: content.trim().slice(0, 500).replace(/<[^>]*>/g, ''),
        type,
        ...meta,
      }]).select('id, created_at').maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error("Insert succeeded but no data returned (RLS blocked read)");
      return data;
    },
    onMutate: async (variables) => {
      const { loungeId, content, type = 'text', meta = {} } = variables;
      const user = useAuthStore.getState().user;
      if (!user) return;
      
      const now = Date.now();
      const optimisticMsg: LoungeMessage = {
        id: `optimistic-${now}`,
        lounge_id: loungeId,
        user_id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        content: content.trim().slice(0, 500),
        type: type as LoungeMessage['type'],
        created_at: new Date().toISOString(),
        ...meta,
      };

      useLoungeStore.setState(s => ({
        currentMessages: [...s.currentMessages, optimisticMsg]
      }));
      
      return { optimisticId: optimisticMsg.id };
    },
    onSuccess: (data, variables, context) => {
      useLoungeStore.setState(s => {
        const alreadyReplaced = s.currentMessages.some(m => m.id === data.id);
        if (alreadyReplaced) {
          return { currentMessages: s.currentMessages.filter(m => m.id !== context?.optimisticId) };
        }
        return {
          currentMessages: s.currentMessages.map(m => 
            m.id === context?.optimisticId 
              ? { ...m, id: data.id, created_at: data.created_at } 
              : m
          ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        };
      });
    },
    onError: (err, variables, context) => {
      if (isNetworkError(err)) {
        // Queue for offline sync — keep the optimistic message visible.
        // The message will be flushed to Supabase when connectivity returns.
        const user = useAuthStore.getState().user;
        if (user) {
          enqueueMutation({
            type: 'send_lounge_message',
            payload: {
              lounge_id: variables.loungeId,
              user_id: user.id,
              content: variables.content.trim().slice(0, 500),
              type: variables.type ?? 'text',
              ...(variables.meta ?? {}),
            },
          });
          flushOfflineQueue();
        }
        reelToast.error('Message queued — will send when back online.');
        return; // Keep the optimistic message
      }
      // Non-network error (e.g., RLS violation) — remove optimistic message
      useLoungeStore.setState(s => ({
        currentMessages: s.currentMessages.filter(m => m.id !== context?.optimisticId)
      }));
      reelToast.error('Failed to send message.');
    }
  });
}

