import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import reelToast from './reelToast';

export interface QueuedMutation {
    id: string;
    type: 'endorse_log' | 'endorse_list' | 'mark_watched';
    payload: Record<string, unknown>;
    timestamp: number;
}

const QUEUE_KEY = 'reelhouse-offline-mutations';
const MAX_QUEUE_SIZE = 100; // Cap to prevent unbounded growth
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
    let queue: QueuedMutation[] = [];
    try {
        const stored = await AsyncStorage.getItem(QUEUE_KEY);
        if (stored) {
            queue = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load queue:', e);
    }
    
    const newMutation: QueuedMutation = {
        ...mutation,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now()
    };
    
    queue.push(newMutation);

    // Cap queue size to prevent unbounded growth
    if (queue.length > MAX_QUEUE_SIZE) {
        queue = queue.slice(-MAX_QUEUE_SIZE);
    }
    
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        console.log(`[OfflineSync] Queued ${mutation.type} for background sync.`);
    } catch (e) {
        console.error('Failed to save queue:', e);
    }
}

export async function flushOfflineQueue() {
    let queue: QueuedMutation[] = [];
    try {
        const stored = await AsyncStorage.getItem(QUEUE_KEY);
        if (stored) {
            queue = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load queue:', e);
        return;
    }

    if (queue.length === 0) return;

    // Prune stale mutations (>24h old)
    const now = Date.now();
    queue = queue.filter(m => now - m.timestamp < STALE_THRESHOLD_MS);

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
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : '';
            console.error(`[OfflineSync] Failed to execute ${mutation.type}:`, error);
            // If it failed due to network, keep it in the queue. If it failed due to constraint (like duplicate), discard it.
            if (errMsg.toLowerCase().includes('fetch') || errMsg.toLowerCase().includes('network')) {
                remainingQueue.push(mutation);
            }
        }
    }

    if (queue.length > remainingQueue.length) {
        reelToast(`Archive updated with offline actions.`);
    }

    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (e) {
        console.error('Failed to update queue:', e);
    }
}
