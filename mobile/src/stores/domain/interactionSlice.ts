import { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { FilmState } from '../films';
import reelToast from '../../utils/reelToast';
import { enqueueMutation } from '../../utils/offlineQueue';
import { Interaction } from '../../types';

// ── Per-target endorsement throttle — prevents double-tap race conditions ──
const _endorseThrottles = new Map<string, number>();
const ENDORSE_COOLDOWN = 500; // 500ms between toggles on the same target
function isEndorseThrottled(targetId: string): boolean {
    const last = _endorseThrottles.get(targetId);
    const now = Date.now();
    if (last && now - last < ENDORSE_COOLDOWN) return true;
    _endorseThrottles.set(targetId, now);
    // L-09 AUDIT FIX: Batch-prune oldest 50 entries to prevent linear growth
    if (_endorseThrottles.size > 200) {
        const keys = Array.from(_endorseThrottles.keys());
        for (let i = 0; i < 50 && i < keys.length; i++) {
            _endorseThrottles.delete(keys[i]);
        }
    }
    return false;
}

export interface InteractionSlice {
    interactions: Interaction[];
    _endorsedIndex: Record<string, true>;
    _listEndorsedIndex: Record<string, true>;

    toggleEndorse: (targetId: string) => Promise<void>;
    hasEndorsed: (targetId: string) => boolean;
    fetchEndorsements: () => Promise<void>;

    toggleListEndorse: (listId: string) => Promise<void>;
    hasListEndorsed: (listId: string) => boolean;
    fetchListEndorsements: () => Promise<void>;
}

export const createInteractionSlice: StateCreator<FilmState, [], [], InteractionSlice> = (set, get) => ({
    interactions: [],
    _endorsedIndex: {},
    _listEndorsedIndex: {},

    toggleEndorse: async (targetId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        if (isEndorseThrottled(`endorse:${targetId}`)) return; // Prevent double-tap race
        const prevInteractions = get().interactions;
        const exists = prevInteractions.find((i) => i.targetId === targetId && i.type === 'endorse');

        if (exists) {
            const current = get().interactions;
            const next = current.filter((i: Interaction) => !(i.targetId === targetId && i.type === 'endorse'));
            const idx: Record<string, true> = {};
            next.forEach((i: Interaction) => { if (i.type === 'endorse') idx[i.targetId] = true; });
            set({ interactions: next, _endorsedIndex: idx });
        } else {
            const current = get().interactions;
            const next: Interaction[] = [...current, { type: 'endorse' as const, targetId, timestamp: new Date().toISOString() }];
            set({ interactions: next, _endorsedIndex: { ...get()._endorsedIndex, [targetId]: true as const } });
        }

        try {
            if (exists) {
                const { error } = await supabase.from('interactions').delete()
                    .eq('user_id', user.id).eq('target_log_id', targetId).eq('type', 'endorse_log');
                if (error) throw error;
            } else {
                const { error } = await supabase.from('interactions_queue_buffer').insert([
                    { user_id: user.id, target_log_id: targetId, type: 'endorse_log' }
                ]);
                if (error && !error.message?.includes('duplicate')) throw error;
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
                // C-03 AUDIT FIX: Queue BOTH add and remove for offline sync
                if (exists) {
                    enqueueMutation({ type: 'remove_endorsement', payload: { user_id: user.id, target_log_id: targetId } });
                } else {
                    enqueueMutation({ type: 'endorse_log', payload: { user_id: user.id, target_log_id: targetId } });
                }
            } else {
                if (exists) {
                    set((state) => {
                        const next = [...state.interactions, exists];
                        const idx: Record<string, true> = {};
                        next.forEach((i: Interaction) => { if (i.type === 'endorse') idx[i.targetId] = true; });
                        return { interactions: next, _endorsedIndex: idx };
                    });
                } else {
                    set((state) => {
                        const next = state.interactions.filter((i) => !(i.targetId === targetId && i.type === 'endorse'));
                        const idx: Record<string, true> = {};
                        next.forEach((i: Interaction) => { if (i.type === 'endorse') idx[i.targetId] = true; });
                        return { interactions: next, _endorsedIndex: idx };
                    });
                }
                reelToast.error('Endorsement failed — please try again.');
            }
        }
    },

    hasEndorsed: (targetId) => !!get()._endorsedIndex[targetId],

    fetchEndorsements: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const { data, error } = await supabase
            .from('interactions')
            .select('target_log_id, created_at')
            .eq('user_id', user.id)
            .eq('type', 'endorse_log')
            .limit(500); // M-03 AUDIT FIX: Reduced from 2000 — prevents massive payloads
        if (!error && data) {
            const mapped: Interaction[] = (data ?? []).map(r => ({
                type: 'endorse' as const,
                targetId: r.target_log_id,
                timestamp: r.created_at,
            }));
            const idx: Record<string, true> = {};
            mapped.forEach(i => { if (i.type === 'endorse') idx[i.targetId] = true; });
            set((state) => ({
                interactions: [
                    ...state.interactions.filter(i => i.type !== 'endorse'),
                    ...mapped
                ],
                _endorsedIndex: idx,
            }));
        }
    },

    toggleListEndorse: async (listId) => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        if (isEndorseThrottled(`list:${listId}`)) return; // Prevent double-tap race
        const prev = get().interactions;
        const exists = prev.find((i) => i.targetId === listId && i.type === 'endorse_list');

        if (exists) {
            const next = prev.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'));
            const idx: Record<string, true> = {};
            next.forEach((i) => { if (i.type === 'endorse_list') idx[i.targetId] = true; });
            set({ interactions: next, _listEndorsedIndex: idx });
        } else {
            const next = [...prev, { type: 'endorse_list', targetId: listId, timestamp: new Date().toISOString() }];
            set({ interactions: next as Interaction[], _listEndorsedIndex: { ...get()._listEndorsedIndex, [listId]: true } });
        }

        try {
            if (exists) {
                const { error } = await supabase.from('interactions').delete()
                    .eq('user_id', user.id).eq('target_list_id', listId).eq('type', 'endorse_list');
                if (error) throw error;
            } else {
                const { error } = await supabase.from('interactions_queue_buffer').insert([
                    { user_id: user.id, target_list_id: listId, type: 'endorse_list' }
                ]);
                if (error && !error.message?.includes('duplicate')) throw error;
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
                // C-03 AUDIT FIX: Queue BOTH add and remove for offline sync
                if (exists) {
                    enqueueMutation({ type: 'remove_endorsement', payload: { user_id: user.id, target_list_id: listId, type: 'endorse_list' } });
                } else {
                    enqueueMutation({ type: 'endorse_list', payload: { user_id: user.id, target_list_id: listId } });
                }
            } else {
                if (exists) {
                    const next = [...get().interactions, exists];
                    set({ interactions: next, _listEndorsedIndex: { ...get()._listEndorsedIndex, [listId]: true } });
                } else {
                    const next = get().interactions.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'));
                    const idx: Record<string, true> = {};
                    next.forEach((i) => { if (i.type === 'endorse_list') idx[i.targetId] = true; });
                    set({ interactions: next, _listEndorsedIndex: idx });
                }
                reelToast.error('Failed to certify list.');
            }
        }
    },

    hasListEndorsed: (listId) => !!get()._listEndorsedIndex[listId],

    fetchListEndorsements: async () => {
        const user = useAuthStore.getState().user;
        if (!user) return;
        const { data, error } = await supabase
            .from('interactions')
            .select('target_list_id, created_at')
            .eq('user_id', user.id)
            .eq('type', 'endorse_list')
            .limit(500); // M-03 AUDIT FIX: Reduced from 2000
        if (!error && data) {
            const newListEndorsements = (data ?? []).map(r => ({
                type: 'endorse_list' as const,
                targetId: r.target_list_id,
                timestamp: r.created_at,
            }));
            
            const idx: Record<string, true> = {};
            newListEndorsements.forEach(i => { idx[i.targetId] = true; });

            set((state) => ({
                interactions: [
                    ...state.interactions.filter(i => i.type !== 'endorse_list'), 
                    ...newListEndorsements
                ],
                _listEndorsedIndex: idx
            }));
        }
    },
});
