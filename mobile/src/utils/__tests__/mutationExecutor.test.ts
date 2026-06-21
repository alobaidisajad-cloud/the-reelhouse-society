/**
 * mutationExecutor.test.ts — Integration Tests for the Write Pipeline
 * ────────────────────────────────────────────────────────────────────
 * Tests all 27 mutation handlers + the executeMutation wrapper.
 * This is the most critical untested path in the app — every write
 * (log, watchlist, endorsement, follow, list edit) flows through here.
 */

import { supabase } from '../../lib/supabase';
import { InteractionService } from '../../services/InteractionService';
import { executeMutation, UnknownMutationError } from '../mutationExecutor';
import { sanitizeInput } from '../sanitizeInput';

// ── Mocks ──────────────────────────────────────────────────────────

jest.mock('../../lib/supabase');
jest.mock('../../services/InteractionService');
jest.mock('../sanitizeInput', () => ({
    sanitizeInput: jest.fn((input: string) => input),
}));
jest.mock('../logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Chainable mock builder — mirrors Supabase's PostgREST query builder
function createMockChain(resolveValue: { data?: unknown; error: unknown } = { data: null, error: null }) {
    const chain: Record<string, jest.Mock> = {};
    const self = () => chain;
    chain.insert = jest.fn().mockImplementation(self);
    chain.upsert = jest.fn().mockImplementation(self);
    chain.update = jest.fn().mockImplementation(self);
    chain.delete = jest.fn().mockImplementation(self);
    chain.select = jest.fn().mockImplementation(self);
    chain.eq = jest.fn().mockImplementation(self);
    chain.not = jest.fn().mockImplementation(self);
    chain.maybeSingle = jest.fn().mockResolvedValue(resolveValue);
    chain.maybeSingle = jest.fn().mockResolvedValue(resolveValue);
    // For non-.single() terminal calls, make the chain itself thenable
    chain.then = jest.fn().mockImplementation((resolve) => resolve(resolveValue));
    return chain;
}

// Helper: make the chain resolve when awaited (without .single())
function makeChainResolveTo(chain: Record<string, jest.Mock>, value: { data?: unknown; error: unknown }) {
    // When the chain is awaited directly (no .single()), resolve with value
    const originalThen = (resolve: (v: unknown) => void) => resolve(value);
    chain.then = jest.fn().mockImplementation(originalThen);
    // Also handle single() and maybeSingle() calls
    chain.maybeSingle = jest.fn().mockResolvedValue(value);
    chain.maybeSingle = jest.fn().mockResolvedValue(value);
    return chain;
}

let mockChain: Record<string, jest.Mock>;

beforeEach(() => {
    jest.useFakeTimers();
    mockChain = createMockChain();
    (supabase.from as jest.Mock) = jest.fn(() => mockChain);
    jest.clearAllMocks();
    (supabase.from as jest.Mock) = jest.fn(() => mockChain);
});

afterEach(() => {
    jest.useRealTimers();
});

// Helper to run executeMutation with timer advancement
async function runMutation(type: string, payload: Record<string, unknown>, idMap: Record<string, string> = {}) {
    const promise = executeMutation(
        { id: `test-${Date.now()}`, type: type as any, payload, timestamp: Date.now() },
        idMap
    );
    // Advance past the 100ms breathing setTimeout
    jest.advanceTimersByTime(150);
    return promise;
}

// ════════════════════════════════════════════════════════════════════
// ENDORSEMENTS
// ════════════════════════════════════════════════════════════════════

describe('Endorsements', () => {
    const endorseTypes = ['endorse_log', 'endorse_list', 'endorse_film', 'endorse_review'] as const;

    endorseTypes.forEach((type) => {
        it(`${type}: calls InteractionService.addEndorsement with correct type`, async () => {
            (InteractionService.addEndorsement as jest.Mock) = jest.fn().mockResolvedValue(undefined);
            const payload = { user_id: 'u1', target_log_id: 'log1' };
            const result = await runMutation(type, payload);
            expect(InteractionService.addEndorsement).toHaveBeenCalledWith({ ...payload, type });
            expect(result).toEqual({});
        });

        it(`${type}: propagates InteractionService errors`, async () => {
            (InteractionService.addEndorsement as jest.Mock) = jest.fn().mockRejectedValue(new Error('Service down'));
            await expect(runMutation(type, { user_id: 'u1' })).rejects.toThrow('Service down');
        });
    });

    describe('remove_endorsement', () => {
        it('deletes by target_log_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_endorsement', { user_id: 'u1', target_log_id: 'log1' });
            expect(supabase.from).toHaveBeenCalledWith('interactions');
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'u1');
            expect(mockChain.eq).toHaveBeenCalledWith('target_log_id', 'log1');
            expect(mockChain.eq).toHaveBeenCalledWith('type', 'endorse_log');
        });

        it('deletes by target_film_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_endorsement', { user_id: 'u1', target_film_id: '550' });
            expect(mockChain.eq).toHaveBeenCalledWith('target_film_id', '550');
            expect(mockChain.eq).toHaveBeenCalledWith('type', 'endorse_film');
        });

        it('deletes by target_review_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_endorsement', { user_id: 'u1', target_review_id: 'r1' });
            expect(mockChain.eq).toHaveBeenCalledWith('target_review_id', 'r1');
            expect(mockChain.eq).toHaveBeenCalledWith('type', 'endorse_review');
        });

        it('throws on Supabase error', async () => {
            makeChainResolveTo(mockChain, { error: { message: 'DB error' } });
            await expect(runMutation('remove_endorsement', { user_id: 'u1', target_log_id: 'x' }))
                .rejects.toEqual({ message: 'DB error' });
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// LOGS
// ════════════════════════════════════════════════════════════════════

describe('Logs', () => {
    describe('mark_watched', () => {
        it('inserts to logs and returns newId + fakeId when _fakeId present', async () => {
            mockChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'real-db-id' }, error: null });
            const result = await runMutation('mark_watched', { _fakeId: 'fake-1', film_id: 123, user_id: 'u1' });
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(mockChain.insert).toHaveBeenCalledWith([{ film_id: 123, user_id: 'u1' }]);
            expect(result).toEqual({ newId: 'real-db-id', fakeId: 'fake-1' });
        });

        it('returns empty when no _fakeId', async () => {
            mockChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'real-id' }, error: null });
            const result = await runMutation('mark_watched', { film_id: 123, user_id: 'u1' });
            expect(result).toEqual({});
        });

        it('throws on insert error', async () => {
            mockChain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } });
            await expect(runMutation('mark_watched', { film_id: 1 })).rejects.toBeTruthy();
        });
    });

    describe('add_log', () => {
        it('inserts and returns ID mapping', async () => {
            mockChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null });
            const result = await runMutation('add_log', { _fakeId: 'temp-1', film_id: 550, rating: 4 });
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(mockChain.insert).toHaveBeenCalledWith([{ film_id: 550, rating: 4 }]);
            expect(result).toEqual({ newId: 'new-id', fakeId: 'temp-1' });
        });
    });

    describe('update_log', () => {
        it('updates log by id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('update_log', { id: 'log-1', updates: { rating: 5 } });
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(mockChain.update).toHaveBeenCalledWith({ rating: 5 });
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'log-1');
        });

        it('throws on update error', async () => {
            makeChainResolveTo(mockChain, { error: { message: 'update failed' } });
            await expect(runMutation('update_log', { id: 'x', updates: {} })).rejects.toBeTruthy();
        });
    });

    describe('remove_log', () => {
        it('deletes log by log_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_log', { log_id: 'log-1' });
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'log-1');
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════════

describe('Profile', () => {
    describe('update_profile', () => {
        it('updates preferences by user_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const prefs = { theme: 'dark', language: 'en' };
            await runMutation('update_profile', { user_id: 'u1', preferences: prefs });
            expect(supabase.from).toHaveBeenCalledWith('profiles');
            expect(mockChain.update).toHaveBeenCalledWith({ preferences: prefs });
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'u1');
        });

        it('throws on update error', async () => {
            makeChainResolveTo(mockChain, { error: { message: 'forbidden' } });
            await expect(runMutation('update_profile', { user_id: 'u1', preferences: {} })).rejects.toBeTruthy();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// WATCHLIST
// ════════════════════════════════════════════════════════════════════

describe('Watchlist', () => {
    describe('add_watchlist', () => {
        it('inserts to watchlists', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const payload = { user_id: 'u1', film_id: 550, film_title: 'Fight Club' };
            await runMutation('add_watchlist', payload);
            expect(supabase.from).toHaveBeenCalledWith('watchlists');
            expect(mockChain.insert).toHaveBeenCalledWith([payload]);
        });

        it('throws on duplicate insert', async () => {
            makeChainResolveTo(mockChain, { error: { code: '23505', message: 'duplicate' } });
            await expect(runMutation('add_watchlist', { user_id: 'u1', film_id: 550 })).rejects.toBeTruthy();
        });
    });

    describe('remove_watchlist', () => {
        it('deletes by user_id + film_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_watchlist', { user_id: 'u1', film_id: 550 });
            expect(supabase.from).toHaveBeenCalledWith('watchlists');
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'u1');
            expect(mockChain.eq).toHaveBeenCalledWith('film_id', 550);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// LISTS
// ════════════════════════════════════════════════════════════════════

describe('Lists', () => {
    describe('create_list', () => {
        it('upserts list and inserts films', async () => {
            // First call: lists.upsert → returns id
            const listsChain = createMockChain();
            listsChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'list-1' }, error: null });
            // Second call: list_items.upsert
            const itemsChain = createMockChain();
            makeChainResolveTo(itemsChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listsChain)
                .mockReturnValueOnce(itemsChain);

            const films = [
                { film_id: 550, film_title: 'Fight Club', poster_path: '/fc.jpg', position: 0 },
                { film_id: 680, film_title: 'Pulp Fiction', poster_path: '/pf.jpg', position: 1 },
            ];
            await runMutation('create_list', { title: 'Favorites', user_id: 'u1', films });

            expect(supabase.from).toHaveBeenCalledWith('lists');
            expect(supabase.from).toHaveBeenCalledWith('list_items');
            expect(itemsChain.upsert).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ list_id: 'list-1', film_id: 550 }),
                ]),
                { onConflict: 'list_id,film_id' }
            );
        });

        it('skips film insert when films array is empty', async () => {
            const listsChain = createMockChain();
            listsChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'list-2' }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(listsChain);

            await runMutation('create_list', { title: 'Empty', user_id: 'u1', films: [] });
            expect(supabase.from).toHaveBeenCalledTimes(1); // Only lists, not list_items
        });
    });

    describe('delete_list', () => {
        it('calls delete_list_cascade RPC for atomic deletion', async () => {
            // Mock supabase.rpc to succeed
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: null });

            await runMutation('delete_list', { list_id: 'list-1', user_id: 'u1' });

            expect(supabase.rpc).toHaveBeenCalledWith('delete_list_cascade', { p_list_id: 'list-1' });
        });

        it('falls back to sequential cascade if RPC does not exist (42883)', async () => {
            // Mock supabase.rpc to fail with "function does not exist"
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ 
                data: null, 
                error: { code: '42883', message: 'function delete_list_cascade(uuid) does not exist' } 
            });

            const itemsChain = createMockChain();
            makeChainResolveTo(itemsChain, { error: null });
            const commentsChain = createMockChain();
            makeChainResolveTo(commentsChain, { error: null });
            const interactionsChain = createMockChain();
            makeChainResolveTo(interactionsChain, { error: null });
            const listsChain = createMockChain();
            makeChainResolveTo(listsChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(itemsChain)
                .mockReturnValueOnce(commentsChain)
                .mockReturnValueOnce(interactionsChain)
                .mockReturnValueOnce(listsChain);

            await runMutation('delete_list', { list_id: 'list-1', user_id: 'u1' });

            expect(supabase.from).toHaveBeenCalledWith('list_items');
            expect(supabase.from).toHaveBeenCalledWith('list_comments');
            expect(supabase.from).toHaveBeenCalledWith('interactions');
            expect(supabase.from).toHaveBeenCalledWith('lists');
            expect(listsChain.eq).toHaveBeenCalledWith('user_id', 'u1');
        });
    });

    describe('add_film_to_list', () => {
        it('inserts single film to list_items', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('add_film_to_list', { list_id: 'l1', film_id: 550, film_title: 'FC', poster_path: '/x', position: 0 });
            expect(supabase.from).toHaveBeenCalledWith('list_items');
            expect(mockChain.upsert).toHaveBeenCalledWith([expect.objectContaining({ list_id: 'l1', film_id: 550 })], expect.anything());
        });
    });

    describe('remove_film_from_list', () => {
        it('deletes by list_id + film_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_film_from_list', { list_id: 'l1', film_id: 550 });
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('list_id', 'l1');
            expect(mockChain.eq).toHaveBeenCalledWith('film_id', 550);
        });
    });

    describe('add_list_items', () => {
        it('inserts multiple films', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const items = [
                { film_id: 1, film_title: 'A', poster_path: '/a', position: 0 },
                { film_id: 2, film_title: 'B', poster_path: '/b', position: 1 },
            ];
            await runMutation('add_list_items', { list_id: 'l1', items });
            expect(mockChain.upsert).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ list_id: 'l1', film_id: 1 })]),
                expect.anything()
            );
        });

        it('skips insert on empty items', async () => {
            await runMutation('add_list_items', { list_id: 'l1', items: [] });
            expect(supabase.from).not.toHaveBeenCalled();
        });
    });

    describe('update_list (FLAW-01 upsert-then-prune)', () => {
        it('updates list metadata and upserts then prunes films', async () => {
            // 3 calls: lists.update, list_items.upsert, list_items.delete (prune)
            const listsChain = createMockChain();
            makeChainResolveTo(listsChain, { error: null });
            const upsertChain = createMockChain();
            makeChainResolveTo(upsertChain, { error: null });
            const pruneChain = createMockChain();
            makeChainResolveTo(pruneChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listsChain)
                .mockReturnValueOnce(upsertChain)
                .mockReturnValueOnce(pruneChain);

            const films = [{ film_id: 550, film_title: 'FC', poster_path: '/fc', position: 0 }];
            await runMutation('update_list', {
                list_id: 'l1', user_id: 'u1',
                updates: { title: 'New Title' }, films
            });

            expect(supabase.from).toHaveBeenCalledWith('lists');
            expect(listsChain.update).toHaveBeenCalledWith({ title: 'New Title' });
            expect(upsertChain.upsert).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ film_id: 550 })]),
                { onConflict: 'list_id,film_id' }
            );
            // Prune: delete items NOT in keepIds
            expect(pruneChain.not).toHaveBeenCalledWith('film_id', 'in', '(550)');
        });

        it('deletes all items when films is empty array', async () => {
            // updates is empty → skips lists.update. Only list_items.delete is called.
            const deleteChain = createMockChain();
            makeChainResolveTo(deleteChain, { error: null });

            (supabase.from as jest.Mock).mockReturnValue(deleteChain);

            await runMutation('update_list', { list_id: 'l1', user_id: 'u1', updates: {}, films: [] });
            expect(supabase.from).toHaveBeenCalledWith('list_items');
            expect(deleteChain.delete).toHaveBeenCalled();
            expect(deleteChain.eq).toHaveBeenCalledWith('list_id', 'l1');
        });

        it('skips metadata update when updates is empty', async () => {
            const upsertChain = createMockChain();
            makeChainResolveTo(upsertChain, { error: null });
            const pruneChain = createMockChain();
            makeChainResolveTo(pruneChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(upsertChain)
                .mockReturnValueOnce(pruneChain);

            await runMutation('update_list', {
                list_id: 'l1', user_id: 'u1', updates: {},
                films: [{ film_id: 1, film_title: 'X', poster_path: '/x', position: 0 }]
            });

            // Should NOT have called lists.update since updates is empty
            expect(upsertChain.upsert).toHaveBeenCalled();
        });

        it('tolerates prune failure without throwing (non-critical)', async () => {
            const listsChain = createMockChain();
            makeChainResolveTo(listsChain, { error: null });
            const upsertChain = createMockChain();
            makeChainResolveTo(upsertChain, { error: null });
            const pruneChain = createMockChain();
            makeChainResolveTo(pruneChain, { error: { message: 'prune failed' } });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listsChain)
                .mockReturnValueOnce(upsertChain)
                .mockReturnValueOnce(pruneChain);

            // Should NOT throw even though prune failed
            const result = await runMutation('update_list', {
                list_id: 'l1', user_id: 'u1', updates: {},
                films: [{ film_id: 1, film_title: 'X', poster_path: '/x', position: 0 }]
            });
            expect(result).toEqual({});
        });
    });

    describe('restore_list_items', () => {
        it('upserts items with onConflict', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const items = [{ film_id: 1, film_title: 'A', poster_path: '/a', position: 0 }];
            await runMutation('restore_list_items', { list_id: 'l1', items });
            expect(mockChain.upsert).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ list_id: 'l1', film_id: 1 })]),
                { onConflict: 'list_id,film_id' }
            );
        });

        it('skips upsert on empty items', async () => {
            await runMutation('restore_list_items', { list_id: 'l1', items: [] });
            expect(supabase.from).not.toHaveBeenCalled();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// ARCHIVE
// ════════════════════════════════════════════════════════════════════

describe('Archive', () => {
    describe('add_archive', () => {
        it('upserts to physical_archive', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const payload = { user_id: 'u1', film_id: 550, film_title: 'FC', poster_path: '/fc', year: 1999, formats: ['blu-ray'], notes: '', condition: 'mint' };
            await runMutation('add_archive', payload);
            expect(supabase.from).toHaveBeenCalledWith('physical_archive');
            expect(mockChain.upsert).toHaveBeenCalledWith(
                [expect.objectContaining({ film_id: 550, condition: 'mint' })],
                { onConflict: 'user_id, film_id' }
            );
        });
    });

    describe('remove_archive', () => {
        it('deletes by user_id + film_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('remove_archive', { user_id: 'u1', film_id: 550 });
            expect(supabase.from).toHaveBeenCalledWith('physical_archive');
            expect(mockChain.delete).toHaveBeenCalled();
        });
    });

    describe('update_archive', () => {
        it('updates by user_id + film_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('update_archive', { user_id: 'u1', film_id: 550, updates: { condition: 'good' } });
            expect(mockChain.update).toHaveBeenCalledWith({ condition: 'good' });
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// SOCIAL
// ════════════════════════════════════════════════════════════════════

describe('Social', () => {
    describe('follow_user', () => {
        it('resolves username to ID then upserts follow', async () => {
            // First call: profiles.select (username lookup)
            const profileChain = createMockChain();
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'target-id' }, error: null });
            // Second call: interactions.upsert
            const interactionChain = createMockChain();
            makeChainResolveTo(interactionChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(profileChain)
                .mockReturnValueOnce(interactionChain);

            await runMutation('follow_user', { user_id: 'u1', target_username: 'cinephile42' });

            expect(supabase.from).toHaveBeenCalledWith('profiles');
            expect(profileChain.eq).toHaveBeenCalledWith('username', 'cinephile42');
            expect(supabase.from).toHaveBeenCalledWith('interactions');
            expect(interactionChain.upsert).toHaveBeenCalledWith(
                [{ user_id: 'u1', target_user_id: 'target-id', type: 'follow' }],
                { onConflict: 'user_id,target_user_id,type', ignoreDuplicates: true }
            );
        });

        it('skips follow when username not found', async () => {
            const profileChain = createMockChain();
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
            (supabase.from as jest.Mock).mockReturnValue(profileChain);

            await runMutation('follow_user', { user_id: 'u1', target_username: 'ghost' });
            // Should not try to insert interaction
            expect(supabase.from).toHaveBeenCalledTimes(1); // Only profiles lookup
        });
    });

    describe('unfollow_user', () => {
        it('resolves username then deletes interaction', async () => {
            const profileChain = createMockChain();
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'target-id' }, error: null });
            const deleteChain = createMockChain();
            makeChainResolveTo(deleteChain, { error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(profileChain)
                .mockReturnValueOnce(deleteChain);

            await runMutation('unfollow_user', { user_id: 'u1', target_username: 'cinephile42' });
            expect(deleteChain.delete).toHaveBeenCalled();
            expect(deleteChain.eq).toHaveBeenCalledWith('type', 'follow');
        });

        it('skips delete when username not found', async () => {
            const profileChain = createMockChain();
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
            (supabase.from as jest.Mock).mockReturnValue(profileChain);

            await runMutation('unfollow_user', { user_id: 'u1', target_username: 'ghost' });
            expect(supabase.from).toHaveBeenCalledTimes(1);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// LOUNGE
// ════════════════════════════════════════════════════════════════════

describe('Lounge', () => {
    describe('send_lounge_message', () => {
        it('inserts sanitized message', async () => {
            makeChainResolveTo(mockChain, { error: null });
            (sanitizeInput as jest.Mock).mockReturnValue('clean message');

            await runMutation('send_lounge_message', {
                lounge_id: 'lounge-1', user_id: 'u1', content: 'raw message', type: 'text',
            });

            expect(sanitizeInput).toHaveBeenCalledWith(expect.any(String), 'loungeMessage');
            expect(supabase.from).toHaveBeenCalledWith('lounge_messages');
            expect(mockChain.insert).toHaveBeenCalledWith([
                expect.objectContaining({ lounge_id: 'lounge-1', content: 'clean message', type: 'text' }),
            ]);
        });

        it('truncates content to 500 chars before sanitizing', async () => {
            makeChainResolveTo(mockChain, { error: null });
            (sanitizeInput as jest.Mock).mockImplementation((s: string) => s);
            const longContent = 'a'.repeat(1000);
            await runMutation('send_lounge_message', { lounge_id: 'l1', user_id: 'u1', content: longContent, type: 'text' });
            expect(sanitizeInput).toHaveBeenCalledWith(expect.any(String), 'loungeMessage');
            const calledWith = (sanitizeInput as jest.Mock).mock.calls[0][0];
            expect(calledWith.length).toBe(500);
        });
    });

    describe('delete_lounge_message', () => {
        it('deletes by id + user_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('delete_lounge_message', { message_id: 'msg-1', user_id: 'u1' });
            expect(supabase.from).toHaveBeenCalledWith('lounge_messages');
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'msg-1');
            expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'u1');
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// ENTITLEMENTS
// ════════════════════════════════════════════════════════════════════

describe('Entitlements', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' };
        (supabase.auth as any) = {
            getSession: jest.fn().mockResolvedValue({
                data: { session: { access_token: 'test-jwt' } },
            }),
        };
        global.fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('calls Edge Function with correct auth header', async () => {
        await runMutation('sync_entitlement', { tier: 'auteur' });
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/functions/v1/sync-entitlement'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer test-jwt' }),
                body: JSON.stringify({ tier: 'auteur' }),
            })
        );
    });

    it('throws when Edge Function returns non-ok', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
        await expect(runMutation('sync_entitlement', { tier: 'auteur' })).rejects.toThrow('500');
    });

    it('skips when no active session', async () => {
        (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
            data: { session: null },
        });
        // Should NOT throw, just return silently
        const result = await runMutation('sync_entitlement', { tier: 'auteur' });
        expect(result).toEqual({});
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════
// DOSSIERS
// ════════════════════════════════════════════════════════════════════

describe('Dossiers', () => {
    describe('add_dossier', () => {
        it('inserts to dispatch_dossiers, stripping _tempId', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('add_dossier', { _tempId: 'temp-1', title: 'My Review', user_id: 'u1', full_content: 'Great film' });
            expect(supabase.from).toHaveBeenCalledWith('dispatch_dossiers');
            expect(mockChain.insert).toHaveBeenCalledWith([
                expect.not.objectContaining({ _tempId: 'temp-1' }),
            ]);
            expect(mockChain.insert).toHaveBeenCalledWith([
                expect.objectContaining({ title: 'My Review', full_content: 'Great film' }),
            ]);
        });
    });

    describe('update_dossier', () => {
        it('updates by id + user_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('update_dossier', { id: 'd1', user_id: 'u1', updates: { title: 'Updated' } });
            expect(supabase.from).toHaveBeenCalledWith('dispatch_dossiers');
            expect(mockChain.update).toHaveBeenCalledWith({ title: 'Updated' });
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'd1');
            expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'u1');
        });
    });

    describe('delete_dossier', () => {
        it('deletes by id + user_id', async () => {
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('delete_dossier', { id: 'd1', user_id: 'u1' });
            expect(supabase.from).toHaveBeenCalledWith('dispatch_dossiers');
            expect(mockChain.delete).toHaveBeenCalled();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// STUBS
// ════════════════════════════════════════════════════════════════════

describe('Stubs', () => {
    describe('save_stub', () => {
        it('inserts to tickets', async () => {
            makeChainResolveTo(mockChain, { error: null });
            const payload = { user_id: 'u1', showtime_id: 's1', slot_id: 'slot1', seat: 'A1', ticket_type: 'standard', amount: 12, qr_code: 'qr', screen_name: 'Screen 1' };
            await runMutation('save_stub', payload);
            expect(supabase.from).toHaveBeenCalledWith('tickets');
            expect(mockChain.insert).toHaveBeenCalledWith([expect.objectContaining({ seat: 'A1' })]);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// EXECUTOR WRAPPER
// ════════════════════════════════════════════════════════════════════

describe('executeMutation wrapper', () => {
    it('throws UnknownMutationError for unknown types', async () => {
        await expect(runMutation('nonexistent_type' as any, {})).rejects.toThrow(UnknownMutationError);
        await expect(runMutation('nonexistent_type' as any, {})).rejects.toThrow('Unknown mutation type: nonexistent_type');
    });

    it('remaps payload.id from idMap', async () => {
        makeChainResolveTo(mockChain, { error: null });
        const idMap = { 'fake-log-id': 'real-log-id' };
        await runMutation('update_log', { id: 'fake-log-id', updates: { rating: 5 } }, idMap);
        // The eq should be called with the remapped real ID
        expect(mockChain.eq).toHaveBeenCalledWith('id', 'real-log-id');
    });

    it('remaps payload.log_id from idMap', async () => {
        makeChainResolveTo(mockChain, { error: null });
        const idMap = { 'fake-log': 'real-log' };
        await runMutation('remove_log', { log_id: 'fake-log' }, idMap);
        expect(mockChain.eq).toHaveBeenCalledWith('id', 'real-log');
    });

    it('does not remap IDs not in idMap', async () => {
        makeChainResolveTo(mockChain, { error: null });
        await runMutation('update_log', { id: 'original-id', updates: {} }, {});
        expect(mockChain.eq).toHaveBeenCalledWith('id', 'original-id');
    });

    it('includes 100ms breathing delay between mutations', async () => {
        makeChainResolveTo(mockChain, { error: null });

        const promise = executeMutation(
            { id: 'test', type: 'remove_log', payload: { log_id: 'x' }, timestamp: Date.now() },
            {}
        );
        // Should not resolve immediately (100ms delay)
        jest.advanceTimersByTime(50);
        // Advance past delay
        jest.advanceTimersByTime(60);
        await promise;
    });
});

