import { StateCreator } from 'zustand';
import { captureError } from '../../lib/sentry';
import { supabase } from '../../lib/supabase';
import { InteractionService } from '../../services/InteractionService';
import { Interaction } from '../../types';
import { isNetworkError } from '../../utils/networkError';
import { enqueueMutation, flushOfflineQueue } from '../../utils/offlineQueue';
import reelToast from '../../utils/reelToast';
import { useAuthStore } from '../auth';

// The implementation that used to live here is now shared — the watchlist had
// the same problem and solved it by growing a map in Zustand state forever.
// One copy, both callers, and it is cleared on logout. Behaviour is unchanged:
// FIFO per key, active garbage collection, and the rejection still reaches the
// caller so toggleEndorse can roll back.
import { runWithMutex } from './helpers/promiseMutex';
import { stillSignedIn } from './helpers/sessionGuard';

/** The DATA this slice owns — see the note on `LogSliceData`. */
export interface InteractionSliceData {
    interactions: Interaction[];
    _endorsedIndex: Record<string, Interaction>;
    _listEndorsedIndex: Record<string, Interaction>;
}

/** A FUNCTION, never a shared constant — see `logSliceInitialState`. */
export const interactionSliceInitialState = (): InteractionSliceData => ({
    interactions: [],
    _endorsedIndex: {},
    _listEndorsedIndex: {},
});

export interface InteractionSlice extends InteractionSliceData {

    toggleEndorse: (targetId: string) => Promise<void>;
    hasEndorsed: (targetId: string) => boolean;
    fetchEndorsements: () => Promise<void>;

    toggleListEndorse: (listId: string) => Promise<void>;
    hasListEndorsed: (listId: string) => boolean;
    fetchListEndorsements: () => Promise<void>;
}

export const createInteractionSlice: StateCreator<InteractionSlice, [], [], InteractionSlice> = (set, get) => ({
    ...interactionSliceInitialState(),

    toggleEndorse: async (targetId) => {
        return runWithMutex(`endorse:${targetId}`, async () => {
            const user = useAuthStore.getState().user;
            if (!user) return;
            const exists = get()._endorsedIndex[targetId];

            if (exists) {
                const current = get().interactions;
                const next = current.filter((i: Interaction) => !(i.targetId === targetId && i.type === 'endorse'));
                const idx: Record<string, Interaction> = { ...get()._endorsedIndex };
                delete idx[targetId];
                set({ interactions: next, _endorsedIndex: idx });
            } else {
                const current = get().interactions;
                const newInteraction: Interaction = { type: 'endorse' as const, targetId, timestamp: new Date().toISOString() };
                const next: Interaction[] = [...current, newInteraction];
                set({ interactions: next, _endorsedIndex: { ...get()._endorsedIndex, [targetId]: newInteraction } });
            }

            try {
                if (exists) {
                    await InteractionService.removeEndorsement({
                        user_id: user.id,
                        type: 'endorse_log',
                        target_log_id: targetId,
                    });
                    try { require('react-native').AccessibilityInfo.announceForAccessibility('Certification removed'); } catch { /* test env */ }
                } else {
                    await InteractionService.addEndorsement({
                        user_id: user.id,
                        type: 'endorse_log',
                        target_log_id: targetId,
                    });
                    try { require('react-native').AccessibilityInfo.announceForAccessibility('Entry certified'); } catch { /* test env */ }
                }
            } catch (e: any) {
                // Two EXPECTED failures are excluded: 23505 is a duplicate row
                // (idempotent success, handled just below) and a network error is
                // queued offline. Anything else is a genuine defect.
                if (e?.code !== '23505' && !isNetworkError(e)) {
                    captureError(e, { scope: 'interactionSlice.toggleEndorsement' });
                }
                // Telemetry above still fires — a defect is worth knowing about
                // either way — but the rollbacks below must not run once the
                // member has gone: the optimistic change they undo left with the
                // rest of the store.
                if (!stillSignedIn(user.id)) return;
                // Idempotent: silently succeed if the row already exists
                if (e?.code === '23505') {
                    return;
                }
                
                if (isNetworkError(e)) {
                    // Queue BOTH add and remove for offline sync
                    if (exists) {
                        enqueueMutation({ type: 'remove_endorsement', payload: { user_id: user.id, type: 'endorse_log', target_log_id: targetId } });
                    } else {
                        enqueueMutation({ type: 'endorse_log', payload: { user_id: user.id, type: 'endorse_log', target_log_id: targetId } });
                    }
                    flushOfflineQueue();
                } else {
                    if (exists) {
                        set((state) => {
                            const next = [...state.interactions, exists];
                            return { interactions: next, _endorsedIndex: { ...state._endorsedIndex, [targetId]: exists } };
                        });
                    } else {
                        set((state) => {
                            const next = state.interactions.filter((i: Interaction) => !(i.targetId === targetId && i.type === 'endorse'));
                            const idx: Record<string, Interaction> = { ...state._endorsedIndex };
                            delete idx[targetId];
                            return { interactions: next, _endorsedIndex: idx };
                        });
                    }
                    reelToast.error('Failed to certify entry.');
                    throw e; // Propagate to trigger caller rollback
                }
            }
        });
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
            .order('created_at', { ascending: false })
            .limit(500); // Reduced from 2000 — prevents massive payloads
        // Left mid-fetch — see sessionGuard.
        if (!stillSignedIn(user.id)) return;
        if (!error && data) {
            const mapped: Interaction[] = (data ?? []).map(r => ({
                type: 'endorse' as const,
                targetId: r.target_log_id,
                timestamp: r.created_at,
            }));
            set((state) => {
                // MERGE, never replace. This used to build a fresh index and
                // assign it, so a re-run — it is called from an auth effect —
                // discarded anything learned since, including a certification the
                // member had just made optimistically.
                const idx: Record<string, Interaction> = { ...state._endorsedIndex };
                mapped.forEach(i => { if (i.type === 'endorse') idx[i.targetId] = i; });
                return {
                    interactions: [
                        ...state.interactions.filter(i => i.type !== 'endorse'),
                        ...mapped
                    ],
                    _endorsedIndex: idx,
                };
            });
        }
    },

    toggleListEndorse: async (listId) => {
        return runWithMutex(`list:${listId}`, async () => {
            const user = useAuthStore.getState().user;
            if (!user) return;
            const exists = get()._listEndorsedIndex[listId];

            if (exists) {
                const next = get().interactions.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'));
                const idx: Record<string, Interaction> = { ...get()._listEndorsedIndex };
                delete idx[listId];
                set({ interactions: next, _listEndorsedIndex: idx });
            } else {
                const newInteraction: Interaction = { type: 'endorse_list', targetId: listId, timestamp: new Date().toISOString() };
                const next = [...get().interactions, newInteraction];
                set({ interactions: next, _listEndorsedIndex: { ...get()._listEndorsedIndex, [listId]: newInteraction } });
            }

            try {
                if (exists) {
                    await InteractionService.removeEndorsement({
                        user_id: user.id,
                        type: 'endorse_list',
                        target_list_id: listId,
                    });
                } else {
                    await InteractionService.addEndorsement({
                        user_id: user.id,
                        type: 'endorse_list',
                        target_list_id: listId,
                    });
                }
            } catch (e: any) {
                // Two EXPECTED failures are excluded: 23505 is a duplicate row
                // (idempotent success, handled just below) and a network error is
                // queued offline. Anything else is a genuine defect.
                if (e?.code !== '23505' && !isNetworkError(e)) {
                    captureError(e, { scope: 'interactionSlice.toggleEndorsement' });
                }
                // Telemetry above still fires — a defect is worth knowing about
                // either way — but the rollbacks below must not run once the
                // member has gone: the optimistic change they undo left with the
                // rest of the store.
                if (!stillSignedIn(user.id)) return;
                // Idempotent: silently succeed if the row already exists
                if (e?.code === '23505') {
                    return;
                }
                
                if (isNetworkError(e)) {
                    // Queue BOTH add and remove for offline sync
                    if (exists) {
                        enqueueMutation({ type: 'remove_endorsement', payload: { user_id: user.id, target_list_id: listId, type: 'endorse_list' } });
                    } else {
                        enqueueMutation({ type: 'endorse_list', payload: { user_id: user.id, type: 'endorse_list', target_list_id: listId } });
                    }
                    flushOfflineQueue();
                } else {
                    // FIX 7: Race Condition in Rollback fix
                    if (exists) {
                        set((state) => {
                            const next = [...state.interactions, exists];
                            return { interactions: next, _listEndorsedIndex: { ...state._listEndorsedIndex, [listId]: exists } };
                        });
                    } else {
                        set((state) => {
                            const next = state.interactions.filter((i) => !(i.targetId === listId && i.type === 'endorse_list'));
                            const idx = { ...state._listEndorsedIndex };
                            delete idx[listId];
                            return { interactions: next, _listEndorsedIndex: idx };
                        });
                    }
                    reelToast.error('Failed to certify list.');
                    throw e; // Propagate to trigger caller rollback
                }
            }
        });
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
            .order('created_at', { ascending: false })
            .limit(500); // Reduced from 2000
        // Left mid-fetch — see sessionGuard.
        if (!stillSignedIn(user.id)) return;
        if (!error && data) {
            const newListEndorsements = (data ?? []).map(r => ({
                type: 'endorse_list' as const,
                targetId: r.target_list_id,
                timestamp: r.created_at,
            }));
            
            // MERGE, never replace — same reason as the log index above.
            const idx: Record<string, Interaction> = { ...get()._listEndorsedIndex };
            newListEndorsements.forEach(i => { idx[i.targetId] = i; });

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
