import { get, set, del } from 'idb-keyval';
import { supabase } from '../supabaseClient';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    type: 'endorse_log' | 'endorse_list' | 'mark_watched' | 'add_log' | 'add_watchlist' | 'remove_watchlist' | 'update_log' | 'delete_log'
        // ── The Vault ──
        // A viewing and a note are separate acts and queue separately. Each names
        // the viewing it is about, so a queue flushed twice leaves the archive as
        // one flush would: adding a viewing that exists returns it, removing one
        // that is no longer current does nothing, and a note is written by viewing.
        | 'add_viewing' | 'remove_viewing' | 'set_viewing_note' | 'remove_viewing_note';
    payload: any;
    timestamp: number;
}

const QUEUE_KEY = 'reelhouse-offline-mutations';

/**
 * Forget everything queued. Called on sign-out, as the mobile app does.
 *
 * The queue can hold a member's private notes, waiting for a signal. Left in
 * IndexedDB after they sign out, it is their writing on a browser that may not
 * be theirs — and it would flush under whoever signs in next, where every entry
 * is refused anyway, because none of it is theirs.
 */
export async function clearOfflineQueue(): Promise<void> {
    try { await del(QUEUE_KEY); } catch { /* storage unavailable — nothing was kept */ }
}

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
            } else if (mutation.type === 'update_log') {
                const { id, updates } = mutation.payload;
                const { error } = await supabase.from('logs').update(updates).eq('id', id);
                dbError = error;
            } else if (mutation.type === 'delete_log') {
                const { id } = mutation.payload;
                const { error } = await supabase.from('logs').delete().eq('id', id);
                dbError = error;
            } else if (mutation.type === 'add_viewing') {
                const { log_id, viewing_id, fields } = mutation.payload;
                const { error } = await supabase.rpc('log_viewing_add', { p_log_id: log_id, p_viewing_id: viewing_id, p_fields: fields ?? {} });
                dbError = error;
            } else if (mutation.type === 'remove_viewing') {
                const { log_id, viewing_id } = mutation.payload;
                const { error } = await supabase.rpc('log_viewing_remove', { p_log_id: log_id, p_viewing_id: viewing_id });
                dbError = error;
            } else if (mutation.type === 'set_viewing_note') {
                const { log_id, viewing_id, notes } = mutation.payload;
                const { error } = await supabase.rpc('viewing_note_set', { p_log_id: log_id, p_viewing_id: viewing_id, p_notes: typeof notes === 'string' ? notes : '' });
                dbError = error;
            } else if (mutation.type === 'remove_viewing_note') {
                const { viewing_id } = mutation.payload;
                const { error } = await supabase.rpc('viewing_note_remove', { p_viewing_id: viewing_id });
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
