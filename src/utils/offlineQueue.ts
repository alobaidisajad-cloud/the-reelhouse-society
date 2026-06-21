import { get, set } from 'idb-keyval';
import { supabase } from '../supabaseClient';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    type: 'endorse_log' | 'endorse_list' | 'mark_watched' | 'add_log' | 'add_watchlist' | 'remove_watchlist';
    payload: any;
    timestamp: number;
}

const QUEUE_KEY = 'reelhouse-offline-mutations';

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
    const queue: QueuedMutation[] = (await get(QUEUE_KEY)) || [];
    const newMutation: QueuedMutation = {
        ...mutation,
        id: crypto.randomUUID(),
        timestamp: Date.now()
    };
    queue.push(newMutation);
    await set(QUEUE_KEY, queue);
    console.log(`[OfflineSync] Queued ${mutation.type} for background sync.`);
}

export async function flushOfflineQueue() {
    const queue: QueuedMutation[] = (await get(QUEUE_KEY)) || [];
    if (queue.length === 0) return;

    console.log(`[OfflineSync] Flushing ${queue.length} queued mutations...`);
    
    const remainingQueue: QueuedMutation[] = [];
    
    for (const mutation of queue) {
        try {
            let dbError = null;

            if (mutation.type === 'endorse_log') {
                const { user_id, target_log_id } = mutation.payload;
                const { error } = await supabase.from('interactions').insert([{ user_id, target_log_id, type: 'endorse_log' }]);
                dbError = error;
            } else if (mutation.type === 'endorse_list') {
                const { user_id, target_list_id } = mutation.payload;
                const { error } = await supabase.from('interactions').insert([{ user_id, target_list_id, type: 'endorse_list' }]);
                dbError = error;
            } else if (mutation.type === 'mark_watched') {
                const { error } = await supabase.from('logs').insert([mutation.payload]);
                dbError = error;
            } else if (mutation.type === 'add_log') {
                const { error } = await supabase.from('logs').insert([mutation.payload]);
                dbError = error;
            } else if (mutation.type === 'add_watchlist') {
                const { error } = await supabase.from('watchlists').insert([mutation.payload]);
                dbError = error;
            } else if (mutation.type === 'remove_watchlist') {
                const { user_id, film_id } = mutation.payload;
                const { error } = await supabase.from('watchlists').delete().eq('user_id', user_id).eq('film_id', film_id);
                dbError = error;
            }

            if (dbError) {
                console.error(`[OfflineSync] DB Error for ${mutation.type}:`, dbError);
                // Supabase returns 23505 for unique constraint violations. 
                // If it's a duplicate, we can safely discard it.
                if (dbError.code !== '23505') {
                    // For other errors (like network timeouts returned as errors), keep in queue
                    if (dbError.message?.toLowerCase().includes('fetch') || dbError.message?.toLowerCase().includes('network')) {
                        remainingQueue.push(mutation);
                    }
                }
            }
        } catch (error: any) {
            console.error(`[OfflineSync] Exception executing ${mutation.type}:`, error);
            // Fetch/Network exceptions thrown by the client should keep the item in the queue
            if (error?.message?.toLowerCase().includes('fetch') || error?.message?.toLowerCase().includes('network')) {
                remainingQueue.push(mutation);
            }
        }
    }

    if (queue.length > remainingQueue.length) {
        reelToast.success('Background sync complete — the archive has been updated with your offline actions.');
    }

    await set(QUEUE_KEY, remainingQueue);
}
