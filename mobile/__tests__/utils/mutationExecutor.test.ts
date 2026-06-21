/**
 * mutationExecutor.test.ts — Typed Mutation Handler Registry Tests
 * ────────────────────────────────────────────────────────────────
 * T1-1 FIX: Tests for the compile-time exhaustive mutation handler
 * registry. Validates handler behavior for major mutation types,
 * ID remapping, UnknownMutationError routing, and the T1-3 fix
 * for pre-resolved target_user_id in follow/unfollow handlers.
 */

// ── Mocks ──

// ── Imports ──

import { executeMutation, UnknownMutationError } from '../../src/utils/mutationExecutor';
import type { QueuedMutation } from '../../src/utils/offlineQueue';

const mockChain: Record<string, jest.Mock> = {};
['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'not', 'in', 'order', 'limit'].forEach(m => {
    mockChain[m] = jest.fn(() => mockChain);
});
mockChain.single = jest.fn().mockResolvedValue({ data: { id: 'server-id-001' }, error: null });
mockChain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

const mockFrom = jest.fn(() => ({ ...mockChain }));

jest.mock('../../src/lib/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
        auth: {
            getSession: jest.fn().mockResolvedValue({
                data: { session: { access_token: 'test-token' } },
            }),
        },
    },
}));

const mockAddEndorsement = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/services/InteractionService', () => ({
    InteractionService: { addEndorsement: (...args: unknown[]) => mockAddEndorsement(...args) },
}));

const mockSanitize = jest.fn((input: string) => input);
jest.mock('../../src/utils/sanitizeInput', () => ({
    sanitizeInput: (...args: unknown[]) => mockSanitize(...args),
}));

jest.mock('../../src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

// ── Helpers ──

function makeQueuedMutation(
    type: QueuedMutation['type'],
    payload: Record<string, unknown> = {},
): QueuedMutation {
    return {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        payload,
        timestamp: Date.now(),
    };
}

describe('mutationExecutor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock chain for each test
        mockFrom.mockReturnValue({ ...mockChain });
        mockChain.single.mockResolvedValue({ data: { id: 'server-id-001' }, error: null });
        mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
        // Make chain methods return chain for chaining
        Object.keys(mockChain).forEach(key => {
            if (key !== 'single' && key !== 'maybeSingle') {
                (mockChain[key] as jest.Mock).mockReturnValue(mockChain);
            }
        });
    });

    // ── Handler registry ──

    describe('handler registry', () => {
        it('should execute add_log and return newId when _fakeId is present', async () => {
            mockChain.maybeSingle.mockResolvedValue({
                data: { id: 'real-db-id-123' },
                error: null,
            });

            const result = await executeMutation(
                makeQueuedMutation('add_log', { film_id: 42, _fakeId: 'fake-123', rating: 5 }),
                {},
            );

            expect(mockFrom).toHaveBeenCalledWith('logs');
            expect(result).toEqual({ newId: 'real-db-id-123', fakeId: 'fake-123' });
        });

        it('should execute remove_log', async () => {
            // Override the chain to be thenable for the delete path
            const deleteChain = { ...mockChain };
            deleteChain.eq = jest.fn().mockResolvedValue({ error: null });
            const innerDelete = jest.fn(() => deleteChain);
            mockFrom.mockReturnValue({ ...mockChain, delete: innerDelete });

            await executeMutation(
                makeQueuedMutation('remove_log', { log_id: 'log-abc' }),
                {},
            );

            expect(mockFrom).toHaveBeenCalledWith('logs');
        });

        it('should execute endorse_log via InteractionService', async () => {
            await executeMutation(
                makeQueuedMutation('endorse_log', { user_id: 'user-1', target_log_id: 'log-1' }),
                {},
            );

            expect(mockAddEndorsement).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'endorse_log' }),
            );
        });

        it('should execute add_watchlist', async () => {
            mockChain.insert.mockResolvedValue({ error: null });
            mockFrom.mockReturnValue({ ...mockChain, insert: mockChain.insert });

            await executeMutation(
                makeQueuedMutation('add_watchlist', { user_id: 'u1', film_id: 42 }),
                {},
            );

            expect(mockFrom).toHaveBeenCalledWith('watchlists');
        });

        it('should execute add_archive with upsert', async () => {
            mockChain.upsert.mockResolvedValue({ error: null });
            mockFrom.mockReturnValue({ ...mockChain, upsert: mockChain.upsert });

            await executeMutation(
                makeQueuedMutation('add_archive', {
                    user_id: 'u1', film_id: 42, film_title: 'Test',
                    formats: ['Blu-ray'], condition: 'excellent',
                }),
                {},
            );

            expect(mockFrom).toHaveBeenCalledWith('physical_archive');
        });

        it('should execute send_lounge_message with sanitization', async () => {
            // insert() must return chainable (code does .insert().select().maybeSingle())
            mockChain.insert = jest.fn(() => mockChain);
            mockChain.select = jest.fn(() => mockChain);
            mockChain.maybeSingle.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
            mockFrom.mockReturnValue({ ...mockChain });

            await executeMutation(
                makeQueuedMutation('send_lounge_message', {
                    lounge_id: 'lounge-1', user_id: 'u1',
                    content: '<script>alert("xss")</script>Hello', type: 'text',
                }),
                {},
            );

            expect(mockSanitize).toHaveBeenCalled();
            expect(mockFrom).toHaveBeenCalledWith('lounge_messages');
        });
    });

    // ── UnknownMutationError ──

    describe('UnknownMutationError', () => {
        it('should throw for unknown mutation types', async () => {
            const badMutation = makeQueuedMutation('nonexistent_type' as QueuedMutation['type'], {});

            await expect(executeMutation(badMutation, {})).rejects.toThrow(UnknownMutationError);
        });
    });

    // ── ID Remapping ──

    describe('ID remapping', () => {
        it('should remap payload.id when idMap has a mapping', async () => {
            mockChain.single.mockResolvedValue({ data: null, error: null });
            const resolvedEq = jest.fn().mockResolvedValue({ error: null });
            mockChain.eq = jest.fn(() => ({ eq: resolvedEq, ...mockChain })) as any;
            mockFrom.mockReturnValue({ ...mockChain });

            const idMap = { 'fake-log-id': 'real-log-id-456' };

            await executeMutation(
                makeQueuedMutation('update_log', { id: 'fake-log-id', updates: { rating: 10 } }),
                idMap,
            );

            // The handler should have received the remapped ID
            expect(mockFrom).toHaveBeenCalledWith('logs');
        });

        it('should remap payload.log_id when idMap has a mapping', async () => {
            const idMap = { 'fake-log-999': 'real-log-999' };

            await executeMutation(
                makeQueuedMutation('remove_log', { log_id: 'fake-log-999' }),
                idMap,
            );

            expect(mockFrom).toHaveBeenCalledWith('logs');
        });
    });

    // ── T1-3 FIX: follow/unfollow with pre-resolved target_user_id ──

    describe('T1-3: pre-resolved target_user_id', () => {
        it('follow_user should use target_user_id directly when provided', async () => {
            mockChain.upsert.mockResolvedValue({ error: null });
            mockFrom.mockReturnValue({ ...mockChain, upsert: mockChain.upsert });

            await executeMutation(
                makeQueuedMutation('follow_user', {
                    user_id: 'u1',
                    target_username: 'oldname',
                    target_user_id: 'resolved-id-xyz',
                }),
                {},
            );

            // Should use the pre-resolved ID, not query profiles
            expect(mockFrom).toHaveBeenCalledWith('interactions');
            // Should NOT have queried profiles table for resolution
            const fromCalls = mockFrom.mock.calls.map(c => c[0]);
            expect(fromCalls).not.toContain('profiles');
        });

        it('follow_user should fall back to username resolution when target_user_id is null', async () => {
            // Profile chain: resolves username to ID
            const profileChain: Record<string, jest.Mock> = {};
            const profileSelf = () => profileChain;
            ['select', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'insert', 'upsert', 'update', 'delete'].forEach(m => {
                profileChain[m] = jest.fn().mockImplementation(profileSelf);
            });
            profileChain.single = jest.fn().mockResolvedValue({ data: { id: 'resolved-from-username' }, error: null });
            profileChain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'resolved-from-username' }, error: null });

            // Interaction chain: upsert follow
            const interactionChain: Record<string, jest.Mock> = {};
            const interactionSelf = () => interactionChain;
            ['select', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'insert', 'update', 'delete'].forEach(m => {
                interactionChain[m] = jest.fn().mockImplementation(interactionSelf);
            });
            interactionChain.upsert = jest.fn().mockResolvedValue({ error: null });
            interactionChain.single = jest.fn().mockResolvedValue({ data: null, error: null });
            interactionChain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

            mockFrom.mockImplementation((table: string) => {
                if (table === 'profiles') return profileChain;
                return interactionChain;
            });

            await executeMutation(
                makeQueuedMutation('follow_user', {
                    user_id: 'u1',
                    target_username: 'someuser',
                    target_user_id: null,
                }),
                {},
            );

            // Should have queried profiles for resolution
            expect(mockFrom).toHaveBeenCalledWith('profiles');
            expect(mockFrom).toHaveBeenCalledWith('interactions');
        });

        it('unfollow_user should use target_user_id directly when provided', async () => {
            // The unfollow chain is: .delete().eq('user_id').eq('target_user_id').eq('type', 'follow')
            // Need 3 levels of .eq() chaining
            const innerResolve = jest.fn().mockResolvedValue({ error: null });
            const level3 = { eq: innerResolve };
            const level2 = { eq: jest.fn(() => level3) };
            const level1 = { eq: jest.fn(() => level2) };
            const deleteReturn = jest.fn(() => level1);

            mockFrom.mockImplementation((table: string) => {
                return { ...mockChain, delete: deleteReturn };
            });

            await executeMutation(
                makeQueuedMutation('unfollow_user', {
                    user_id: 'u1',
                    target_username: 'oldname',
                    target_user_id: 'resolved-id-abc',
                }),
                {},
            );

            expect(mockFrom).toHaveBeenCalledWith('interactions');
            const fromCalls = mockFrom.mock.calls.map(c => c[0]);
            expect(fromCalls).not.toContain('profiles');
        });
    });

    // ── Idempotency: at-least-once delivery for log inserts ──
    // A 504 / dropped connection after the server already committed gets re-queued
    // with the SAME client-generated id. On flush the insert collides (23505); the
    // merge must treat a same-id conflict as a no-op (not a phantom rewatch), while a
    // genuinely concurrent log (different id) still merges as a rewatch.

    describe('add_log idempotency on same-id duplicate', () => {
        it('treats a same-id 23505 conflict as a no-op (no phantom rewatch)', async () => {
            mockChain.maybeSingle
                // insertLog: insert(...).select('id').maybeSingle() → duplicate
                .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
                // handleDuplicateLogMerge: select('*')...maybeSingle() → the already-committed row, SAME id
                .mockResolvedValueOnce({ data: { id: 'log-ABC', user_id: 'u1', film_id: 42, view_count: 1, viewing_history: [] }, error: null });

            const result = await executeMutation(
                makeQueuedMutation('add_log', { id: 'log-ABC', user_id: 'u1', film_id: 42, rating: 5 }),
                {},
            );

            // No-op: the row is NOT re-written, so view_count is never incremented.
            expect(mockChain.update).not.toHaveBeenCalled();
            expect(result).toEqual({});
        });

        it('still merges a genuinely concurrent log (different id) as a rewatch', async () => {
            mockChain.maybeSingle
                .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
                // Existing row was created on another device — DIFFERENT id
                .mockResolvedValueOnce({ data: { id: 'log-OLD', user_id: 'u1', film_id: 42, view_count: 1, viewing_history: [] }, error: null });

            const result = await executeMutation(
                makeQueuedMutation('add_log', { id: 'log-NEW', user_id: 'u1', film_id: 42, rating: 5 }),
                {},
            );

            // Rewatch merge: row is updated with an archived history entry + bumped count.
            expect(mockChain.update).toHaveBeenCalledTimes(1);
            const updatePayload = (mockChain.update as jest.Mock).mock.calls[0][0];
            expect(updatePayload.view_count).toBe(2);
            expect(Array.isArray(updatePayload.viewing_history)).toBe(true);
            expect(updatePayload.viewing_history).toHaveLength(1);
            expect(result).toEqual({});
        });
    });
});
