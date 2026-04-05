import { get, set } from 'idb-keyval';
import { supabase } from '../supabaseClient';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    type: 'endorse_log' | 'endorse_list' | 'mark_watched';
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
            if (mutation.type === 'endorse_log') {
                const { user_id, target_log_id } = mutation.payload;
                await supabase.from('interactions').insert([{ user_id, target_log_id, type: 'endorse_log' }]);
            } else if (mutation.type === 'endorse_list') {
                const { user_id, target_list_id } = mutation.payload;
                await supabase.from('interactions').insert([{ user_id, target_list_id, type: 'endorse_list' }]);
            } else if (mutation.type === 'mark_watched') {
                await supabase.from('logs').insert([mutation.payload]);
            }
            // Add more cases as needed...
        } catch (error: any) {
            console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);
            // If it failed due to network, keep it in the queue. If it failed due to constraint (like duplicate), discard it.
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
