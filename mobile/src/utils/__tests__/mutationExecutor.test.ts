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
    chain.in = jest.fn().mockImplementation(self);
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
// THE VAULT
// ════════════════════════════════════════════════════════════════════
// Each act replays by the name of the viewing it is about, which is what makes a
// queue flushed twice leave the archive as one flush would. What is pinned here
// is that the replay reaches the right RPC with the SAME names it was queued
// with — including after a log created offline is given its real id.

describe('The Vault', () => {
    const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const V1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
    let rpc: jest.Mock;

    beforeEach(() => {
        rpc = jest.fn().mockResolvedValue({ data: null, error: null });
        (supabase as any).rpc = rpc;
    });

    it('add_viewing replays the rewatch by the viewing it named', async () => {
        await runMutation('add_viewing', { log_id: LOG, viewing_id: V1, fields: { rating: 5 } });
        expect(rpc).toHaveBeenCalledWith('log_viewing_add', { p_log_id: LOG, p_viewing_id: V1, p_fields: { rating: 5 } });
    });

    it('remove_viewing replays the removal by the viewing it named', async () => {
        await runMutation('remove_viewing', { log_id: LOG, viewing_id: V1 });
        expect(rpc).toHaveBeenCalledWith('log_viewing_remove', { p_log_id: LOG, p_viewing_id: V1 });
    });

    it('set_viewing_note is cleaned on the way out, as every queued prose is', async () => {
        // The queue persists, so an entry written by an older build flushes
        // through this code after the source was fixed.
        (sanitizeInput as jest.Mock).mockImplementationOnce((s: string) => `clean:${s}`);
        await runMutation('set_viewing_note', { log_id: LOG, viewing_id: V1, notes: 'raw' });
        expect(sanitizeInput).toHaveBeenCalledWith('raw', 'review');
        expect(rpc).toHaveBeenCalledWith('viewing_note_set', { p_log_id: LOG, p_viewing_id: V1, p_notes: 'clean:raw' });
    });

    it('remove_viewing_note replays by the viewing alone', async () => {
        await runMutation('remove_viewing_note', { viewing_id: V1 });
        expect(rpc).toHaveBeenCalledWith('viewing_note_remove', { p_viewing_id: V1 });
    });

    it('a note on a log filed offline follows the log to its real id', async () => {
        await runMutation('set_viewing_note', { log_id: 'temp-log', viewing_id: V1, notes: 'n' }, { 'temp-log': LOG });
        expect(rpc).toHaveBeenCalledWith('viewing_note_set', expect.objectContaining({ p_log_id: LOG }));
    });

    it('a refusal on replay is raised, so the queue does not drop it as done', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: 'The Vault is an Archivist feature' } });
        await expect(runMutation('set_viewing_note', { log_id: LOG, viewing_id: V1, notes: 'n' })).rejects.toBeTruthy();
    });
});

// ════════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════════

describe('Profile', () => {
    describe('update_profile', () => {
        it('merges preferences via the update_my_preferences RPC', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: null });
            const prefs = { theme: 'dark', language: 'en' };
            await runMutation('update_profile', { user_id: 'u1', preferences: prefs });
            expect(supabase.rpc).toHaveBeenCalledWith('update_my_preferences', { p_preferences: prefs });
        });

        it('throws on RPC error', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } });
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
    // A stack is saved whole, or not at all (save_stack, 20260930_01): one call,
    // one transaction. These were upsert-then-insert and upsert-then-prune.
    describe('create_list', () => {
        it('makes the stack and its films in one save, and a replay is a no-op on the house\'s side', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: { id: 'list-1' }, error: null });
            const films = [
                { film_id: 550, film_title: 'Fight Club', poster_path: '/fc.jpg', rank_position: 0 },
                { film_id: 680, film_title: 'Pulp Fiction', poster_path: '/pf.jpg', rank_position: 1 },
            ];
            await runMutation('create_list', { id: 'list-1', title: 'Favorites', user_id: 'u1', is_private: false, is_ranked: true, films });
            expect(supabase.rpc).toHaveBeenCalledTimes(1);
            expect(supabase.rpc).toHaveBeenCalledWith('save_stack', expect.objectContaining({
                p_id: 'list-1', p_title: 'Favorites', p_is_ranked: true, p_create: true,
                p_films: [
                    expect.objectContaining({ film_id: 550, film_title: 'Fight Club', rank_position: 0 }),
                    expect.objectContaining({ film_id: 680, rank_position: 1 }),
                ],
            }));
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('a stack of no films is made with none', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: { id: 'list-2' }, error: null });
            await runMutation('create_list', { id: 'list-2', title: 'Empty', user_id: 'u1', films: [] });
            expect(supabase.rpc).toHaveBeenCalledWith('save_stack', expect.objectContaining({ p_films: [], p_create: true }));
        });

        it('a refusal is thrown, so the queue keeps it', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: { code: '23514', message: 'check' } });
            await expect(runMutation('create_list', { id: 'list-3', title: 'X', user_id: 'u1', films: [] })).rejects.toBeTruthy();
        });
    });

    describe('delete_list', () => {
        it('calls delete_list_cascade RPC for atomic deletion', async () => {
            // Mock supabase.rpc to succeed
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: null });

            await runMutation('delete_list', { list_id: 'list-1', user_id: 'u1' });

            expect(supabase.rpc).toHaveBeenCalledWith('delete_list_cascade', { p_list_id: 'list-1' });
        });

        it('raises any failure, so the queue keeps the delete, and deletes nothing table by table', async () => {
            // There was a fallback for a database without the function: it deleted
            // the stack's films, its critiques (other members' too) and marks one
            // table at a time. The function is live; a failure is a failure.
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({
                data: null,
                error: { code: '42883', message: 'function delete_list_cascade(uuid) does not exist' },
            });
            (supabase.from as jest.Mock).mockClear();

            await expect(runMutation('delete_list', { list_id: 'list-1', user_id: 'u1' })).rejects.toBeTruthy();
            expect(supabase.from).not.toHaveBeenCalled();
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

    describe('add_list_comment', () => {
        it('files the critique under the id the phone made, and a replay files nothing twice', async () => {
            // An insert with no id made a NEW row on every replay: a send whose
            // answer was lost filed the critique a second time.
            makeChainResolveTo(mockChain, { error: null });
            await runMutation('add_list_comment', { id: 'c-1', list_id: 'l1', user_id: 'u1', content: 'Noir, done right.' });
            expect(supabase.from).toHaveBeenCalledWith('list_comments');
            expect(mockChain.insert).not.toHaveBeenCalled();
            expect(mockChain.upsert).toHaveBeenCalledWith(
                [{ id: 'c-1', list_id: 'l1', user_id: 'u1', content: 'Noir, done right.' }],
                { onConflict: 'id', ignoreDuplicates: true },
            );
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

    describe('update_list', () => {
        beforeEach(() => { (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: { id: 'l1' }, error: null }); });

        it('saves the details and exactly the films it carries, in one save', async () => {
            await runMutation('update_list', {
                list_id: 'l1', user_id: 'u1', updates: { title: 'New', is_private: true },
                films: [{ id: 7, title: 'Seven', poster: '/7.jpg' }, { film_id: 9, film_title: 'Nine' }],
                removed_film_ids: [3],
            });
            expect(supabase.rpc).toHaveBeenCalledTimes(1);
            expect(supabase.rpc).toHaveBeenCalledWith('save_stack', {
                p_id: 'l1', p_title: 'New', p_description: null, p_is_private: true, p_is_ranked: null,
                // Both shapes a phone's queue may hold, as one; removals are implied by the list.
                p_films: [
                    { film_id: 7, film_title: 'Seven', poster_path: '/7.jpg', rank_position: 0 },
                    { film_id: 9, film_title: 'Nine', poster_path: null, rank_position: 1 },
                ],
            });
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('an emptied stack is saved empty', async () => {
            await runMutation('update_list', { list_id: 'l1', user_id: 'u1', updates: {}, films: [] });
            expect(supabase.rpc).toHaveBeenCalledWith('save_stack', expect.objectContaining({ p_films: [] }));
        });

        it('a rename leaves the films alone (no films in the payload)', async () => {
            await runMutation('update_list', { list_id: 'l1', user_id: 'u1', updates: { title: 'Only the name' } });
            expect(supabase.rpc).toHaveBeenCalledWith('save_stack', expect.objectContaining({ p_title: 'Only the name', p_films: null }));
        });

        it('a refusal is thrown, so the queue keeps it', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: { code: 'P0002', message: 'No such stack of yours' } });
            await expect(runMutation('update_list', { list_id: 'l1', user_id: 'u1', updates: { title: 'X' } })).rejects.toBeTruthy();
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
            // #78: both row types, so an offline cancel does not leave the request standing
            expect(deleteChain.in).toHaveBeenCalledWith('type', ['follow', 'follow_request']);
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

        it('sends the message under its own id, so a retry of a send that landed is not posted twice', async () => {
            makeChainResolveTo(mockChain, { error: null });
            (sanitizeInput as jest.Mock).mockImplementation((s: string) => s);
            const id = '2b1c0f7e-1111-4111-8111-111111111111';
            await runMutation('send_lounge_message', {
                id, _tempId: id, lounge_id: 'l1', user_id: 'u1', content: 'hello', type: 'text',
            });
            expect(mockChain.insert).toHaveBeenCalledWith([expect.objectContaining({ id })]);
        });

        it('hands content to the sanitizer WHOLE — one cap, in one place', async () => {
            // This used to assert a `.slice(0, 500)` applied before sanitizing, and
            // it was right to exist: it is what caught the change. But the second
            // cap was the defect. It was stricter than MAX_LENGTHS.loungeMessage and
            // hardcoded, so widening the composer changed nothing — every message
            // was still cut at 500 on its way to the database, online and offline.
            //
            // The sanitizer owns the length. Passing the text through untouched is
            // what makes raising the limit in one place actually raise it.
            makeChainResolveTo(mockChain, { error: null });
            (sanitizeInput as jest.Mock).mockImplementation((s: string) => s);
            const longContent = 'a'.repeat(1000);
            await runMutation('send_lounge_message', { lounge_id: 'l1', user_id: 'u1', content: longContent, type: 'text' });
            expect(sanitizeInput).toHaveBeenCalledWith(longContent, 'loungeMessage');
            expect((sanitizeInput as jest.Mock).mock.calls[0][0].length).toBe(1000);
        });
    });

    describe('withdraw_lounge_message', () => {
        it('goes through the RPC — never a hard delete', async () => {
            // The row must survive as a tombstone. A .delete() here would
            // resurrect the hole-in-the-transcript problem the RPC exists to fix.
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: null });

            await runMutation('withdraw_lounge_message', { message_id: 'msg-1' });

            expect(supabase.rpc).toHaveBeenCalledWith('withdraw_lounge_message', { p_message_id: 'msg-1' });
            expect(mockChain.delete).not.toHaveBeenCalled();
        });

        it('throws so the queue retries rather than silently dropping it', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });

            await expect(runMutation('withdraw_lounge_message', { message_id: 'msg-1' })).rejects.toBeTruthy();
        });

        it('LEGACY: a delete queued by a pre-tombstone build completes as a withdrawal', async () => {
            // A member who deleted a message offline and then updated the app
            // still has this in their queue. Without the alias the executor
            // throws UnknownMutationError, the queue dead-letters it, and their
            // deletion is silently lost — the message reappears.
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ data: null, error: null });

            await runMutation('delete_lounge_message', { message_id: 'msg-1', user_id: 'u1' });

            // Honoured with CURRENT semantics: tombstone, never a hard delete.
            expect(supabase.rpc).toHaveBeenCalledWith('withdraw_lounge_message', { p_message_id: 'msg-1' });
            expect(mockChain.delete).not.toHaveBeenCalled();
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

    // ⚠️ This used to assert `result).toEqual({})` — "should NOT throw, just return
    // silently". That WAS the bug: reporting success made the queue delete the mutation,
    // so the member's tier never synced at all. The test encoded the defect as intent.
    it('keeps the mutation queued when there is no session, instead of reporting success', async () => {
        (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
            data: { session: null },
        });
        await expect(runMutation('sync_entitlement', { tier: 'auteur' })).rejects.toThrow(/no session/i);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('marks that failure as retryable so the queue preserves it', async () => {
        // A plain error is dead-lettered by flushOfflineQueue's "unknown failure" branch,
        // which would lose the sync exactly like returning {} did. status 503 makes
        // isNetworkError classify it and the flush halts with the mutation intact.
        (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
            data: { session: null },
        });
        await expect(runMutation('sync_entitlement', { tier: 'auteur' }))
            .rejects.toMatchObject({ status: 503 });
    });

    it('refuses a mutation queued for a DIFFERENT account', async () => {
        // The queue partitions by payload.user_id, but this is the last place a mismatch
        // can be caught — the edge function derives the account from the JWT and would
        // apply one member's tier to another person's profile.
        (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
            data: { session: { access_token: 'test-jwt', user: { id: 'user-B' } } },
        });
        await expect(
            runMutation('sync_entitlement', { tier: 'auteur', user_id: 'user-A' })
        ).rejects.toThrow(/different account/i);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('proceeds when the queued owner matches the session', async () => {
        (supabase.auth as any).getSession = jest.fn().mockResolvedValue({
            data: { session: { access_token: 'test-jwt', user: { id: 'user-A' } } },
        });
        await runMutation('sync_entitlement', { tier: 'auteur', user_id: 'user-A' });
        expect(global.fetch).toHaveBeenCalled();
    });

    it("returns the server's reply instead of discarding it", async () => {
        // finding 100: seatClaimed=false means the 100 founding seats were full and the
        // member was granted Auteur instead. This used to `return {}`, so someone who
        // paid for a seat that no longer existed was never told.
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ tier: 'auteur', seatClaimed: false, applied: true }),
        });
        const result = await runMutation('sync_entitlement', { tier: 'founding' });
        expect(result).toMatchObject({ seatClaimed: false });
    });

    it('still resolves when the reply has no JSON body', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
        await expect(runMutation('sync_entitlement', { tier: 'auteur' })).resolves.toEqual({});
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

        it('sends no id: the view files the essay under a fresh one, and the answer renames the optimistic row', async () => {
            // dossiers_write ignores NEW.id, so an id sent here only claimed a
            // retry would meet the key — it never could.
            makeChainResolveTo(mockChain, { data: { id: 'real-1' }, error: null });
            const result = await runMutation('add_dossier', { _tempId: 'temp-1', title: 'My Review', user_id: 'u1' });
            expect(Object.keys((mockChain.insert as jest.Mock).mock.calls[0][0][0])).not.toContain('id');
            expect(result).toEqual({ newId: 'real-1', fakeId: 'temp-1' });
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
        // Batch 31 dropped `tickets` with the rest of the abandoned cinema
        // feature. The handler is kept as a no-op so that any item left in a
        // queue persisted by an older install drains instead of retrying
        // forever against a table that no longer exists.
        it('drains without touching the database', async () => {
            const payload = { user_id: 'u1', showtime_id: 's1', seat: 'A1' };
            await expect(runMutation('save_stub', payload)).resolves.toBeDefined();
            expect(supabase.from).not.toHaveBeenCalledWith('tickets');
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

    it('yields the JS thread (a 0 ms macrotask) before each mutation, then sends it', async () => {
        // This was "includes 100ms breathing delay" and asserted nothing: it passed
        // with no yield at all, and the yield is 0 ms, not 100.
        makeChainResolveTo(mockChain, { error: null });

        const promise = executeMutation(
            { id: 'test', type: 'remove_log', payload: { log_id: 'x' }, timestamp: Date.now() },
            {}
        );
        await Promise.resolve();
        await Promise.resolve();
        // Held behind the macrotask: nothing has been sent yet.
        expect(mockChain.eq).not.toHaveBeenCalled();
        jest.advanceTimersByTime(0);
        await promise;
        expect(mockChain.eq).toHaveBeenCalledWith('id', 'x');
    });
});

