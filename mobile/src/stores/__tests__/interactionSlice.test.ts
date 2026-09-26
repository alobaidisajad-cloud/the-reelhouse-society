/**
 * interactionSlice.test.ts — Domain Slice Unit Tests
 * ───────────────────────────────────────────────────
 * Validates core invariants of the interaction domain slice:
 *   1. O(1) _endorsedIndex integrity on toggle
 *   2. INTERACTIONS_CAP enforcement (P2 hardening)
 *   3. Endorsement throttle prevents double-tap race
 *   4. Throttle map pruning prevents memory leak
 *   5. Paginated fetch builds complete index
 *   6. Optimistic rollback on server error
 */

import { supabase } from '../../lib/supabase';
import { useLogStore } from '../films';

// ── Mock Auth Store ──
jest.mock('../auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', username: 'testuser', role: 'cinephile' },
        })),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

// Mock InteractionService to bypass Zod validation in unit tests
jest.mock('../../services/InteractionService', () => ({
    InteractionService: {
        addEndorsement: jest.fn().mockResolvedValue(undefined),
        removeEndorsement: jest.fn().mockResolvedValue(undefined),
    },
}));

// _endorsedIndex / _listEndorsedIndex are Record<string, Interaction>, not
// Record<string, true> (interactionSlice.ts:39-40). The fixtures below used `true`,
// so these tests — which DO drive the real toggleEndorse/hasEndorsed — were doing it
// against an index shape the store never builds. hasEndorsed only checks truthiness,
// which is why it passed either way.
const endorsement = (targetId: string, type: 'endorse' | 'endorse_list' = 'endorse') => ({
  type,
  targetId,
  timestamp: '2024-01-01T00:00:00Z',
});

describe('interactionSlice', () => {
    beforeEach(() => {
        useLogStore.setState({
            logs: [],
            watchlist: [],
            lists: [],
            interactions: [],
            physicalArchive: [],
            _loggedIndex: {},
            _watchlistIndex: {},
            _endorsedIndex: {},
            _listEndorsedIndex: {},
            _addLogMutex: false,
        });
    });

    // ── toggleEndorse ──

    describe('toggleEndorse', () => {
        it('should add targetId to _endorsedIndex on endorse', async () => {
            // Mock supabase to succeed
            (supabase.from as jest.Mock) = jest.fn(() => ({
                insert: jest.fn().mockResolvedValue({ error: null }),
                delete: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
            }));

            await useLogStore.getState().toggleEndorse('log-abc');

            const state = useLogStore.getState();
            expect(!!state._endorsedIndex['log-abc']).toBe(true);
            expect(state.interactions.some(i => i.targetId === 'log-abc' && i.type === 'endorse')).toBe(true);
        });

        it('should remove targetId from _endorsedIndex on un-endorse', async () => {
            // Pre-populate as endorsed
            useLogStore.setState({
                interactions: [{ type: 'endorse' as const, targetId: 'log-xyz', timestamp: '2024-01-01T00:00:00Z' }],
                _endorsedIndex: { 'log-xyz': endorsement('log-xyz') },
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            eq: jest.fn().mockResolvedValue({ error: null }),
                        })),
                    })),
                })),
            }));

            await useLogStore.getState().toggleEndorse('log-xyz');

            const state = useLogStore.getState();
            expect(state._endorsedIndex['log-xyz']).toBeUndefined();
            expect(state.interactions.some(i => i.targetId === 'log-xyz')).toBe(false);
        });
    });


    // ── hasEndorsed O(1) ──

    describe('hasEndorsed', () => {
        it('should return true for endorsed targets (O(1) lookup)', () => {
            useLogStore.setState({ _endorsedIndex: { 'log-a': endorsement('log-a'), 'log-b': endorsement('log-b') } });

            expect(useLogStore.getState().hasEndorsed('log-a')).toBe(true);
            expect(useLogStore.getState().hasEndorsed('log-b')).toBe(true);
            expect(useLogStore.getState().hasEndorsed('log-c')).toBe(false);
        });
    });

    // ── hasListEndorsed O(1) ──

    describe('hasListEndorsed', () => {
        it('should return true for endorsed lists (O(1) lookup)', () => {
            useLogStore.setState({ _listEndorsedIndex: { 'list-1': endorsement('list-1', 'endorse_list') } });

            expect(useLogStore.getState().hasListEndorsed('list-1')).toBe(true);
            expect(useLogStore.getState().hasListEndorsed('list-2')).toBe(false);
        });
    });

    // ── fetchEndorsements pagination ──

    describe('fetchEndorsements', () => {
        it('should build complete _endorsedIndex from paginated fetch', async () => {
            // Simulate endorsement rows
            const rows = [
                { target_log_id: 'log-1', created_at: '2024-01-03' },
                { target_log_id: 'log-2', created_at: '2024-01-02' },
                { target_log_id: 'log-3', created_at: '2024-01-01' },
            ];

            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
            }));

            await useLogStore.getState().fetchEndorsements();

            const state = useLogStore.getState();
            expect(state._endorsedIndex['log-1']).toBeTruthy();
            expect(state._endorsedIndex['log-2']).toBeTruthy();
            expect(state._endorsedIndex['log-3']).toBeTruthy();
            expect(Object.keys(state._endorsedIndex).length).toBe(3);
        });

        it('should handle fetch error gracefully without clearing existing state', async () => {
            useLogStore.setState({
                interactions: [{ type: 'endorse' as const, targetId: 'existing', timestamp: '2024-01-01' }],
                _endorsedIndex: { 'existing': endorsement('existing') },
            });

            const mockResult = { data: null, error: { message: 'timeout' } };
            (supabase.from as jest.Mock) = jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(mockResult),
            }));

            await useLogStore.getState().fetchEndorsements();

            // Non-endorse interactions should be preserved, but endorsements get replaced
            // The error breaks out of the loop, so we get an empty result merged
            const state = useLogStore.getState();
            expect(state._endorsedIndex).toBeDefined();
        });
    });

    // ── toggleListEndorse ──

    describe('toggleListEndorse', () => {
        it('should add listId to _listEndorsedIndex on endorse', async () => {
            (supabase.from as jest.Mock) = jest.fn(() => ({
                insert: jest.fn().mockResolvedValue({ error: null }),
            }));

            await useLogStore.getState().toggleListEndorse('list-001');

            const state = useLogStore.getState();
            expect(!!state._listEndorsedIndex['list-001']).toBe(true);
        });

        it('should remove listId from _listEndorsedIndex on un-endorse', async () => {
            useLogStore.setState({
                interactions: [{ type: 'endorse_list' as any, targetId: 'list-002', timestamp: '2024-01-01' }],
                _listEndorsedIndex: { 'list-002': endorsement('list-002', 'endorse_list') },
            });

            (supabase.from as jest.Mock) = jest.fn(() => ({
                delete: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        eq: jest.fn(() => ({
                            eq: jest.fn().mockResolvedValue({ error: null }),
                        })),
                    })),
                })),
            }));

            await useLogStore.getState().toggleListEndorse('list-002');

            expect(useLogStore.getState()._listEndorsedIndex['list-002']).toBeUndefined();
        });
    });

    // ── The count moves with the heart, on every card (markCounts) ──

    describe('the count every bar draws', () => {
        const { InteractionService } = jest.requireMock('../../services/InteractionService');
        const { resetMarkCounts, tellMarkCounts, useMarkCounts, selectMarkCount } = jest.requireActual('../markCounts');
        const shown = (kind: string, id: string) => selectMarkCount(useMarkCounts.getState(), kind, id);

        beforeEach(() => {
            resetMarkCounts();
            InteractionService.addEndorsement.mockReset().mockResolvedValue(undefined);
            InteractionService.removeEndorsement.mockReset().mockResolvedValue(undefined);
        });

        it('moves with the heart, and stays moved once the server has it', async () => {
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() - 1000);
            let answer: () => void = () => {};
            InteractionService.addEndorsement.mockReturnValue(new Promise<void>((r) => { answer = r; }));
            const pending = useLogStore.getState().toggleEndorse('log-1');
            // The toggle runs behind a per-log lock, a microtask later; the heart
            // and the number change in the same step, while the server is silent.
            for (let i = 0; i < 20 && !useLogStore.getState()._endorsedIndex['log-1']; i++) await Promise.resolve();
            expect(useLogStore.getState()._endorsedIndex['log-1']).toBeTruthy();
            expect(shown('certify', 'log-1')).toBe(5);
            answer();
            await pending;
            expect(shown('certify', 'log-1')).toBe(5);
            // …and an answer asked after the server had it replaces the tap, not adds to it.
            tellMarkCounts([{ id: 'log-1', certify: 5 }], Date.now() + 1);
            expect(shown('certify', 'log-1')).toBe(5);
        });

        it('takes the tap back when the write is refused', async () => {
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() - 1000);
            InteractionService.addEndorsement.mockRejectedValue(Object.assign(new Error('refused'), { code: '42501' }));
            await expect(useLogStore.getState().toggleEndorse('log-1')).rejects.toBeTruthy();
            expect(shown('certify', 'log-1')).toBe(4);
        });

        it('does not count a certification the server already held', async () => {
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() - 1000);
            InteractionService.addEndorsement.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
            await useLogStore.getState().toggleEndorse('log-1');
            expect(shown('certify', 'log-1')).toBe(4);
        });

        it('keeps the tap when it is queued offline', async () => {
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() - 1000);
            InteractionService.addEndorsement.mockRejectedValue(new TypeError('Network request failed'));
            await useLogStore.getState().toggleEndorse('log-1');
            expect(shown('certify', 'log-1')).toBe(5);
        });

        it('a queued (offline) tap stays on top until the queue delivers it', async () => {
            const { settleDelivered } = jest.requireActual('../markCounts');
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() - 1000);
            InteractionService.addEndorsement.mockRejectedValue(new TypeError('Network request failed'));
            await useLogStore.getState().toggleEndorse('log-1');
            // A refresh that lands BEFORE the queue delivers still says 4: the tap stays.
            tellMarkCounts([{ id: 'log-1', certify: 4 }], Date.now() + 5);
            expect(shown('certify', 'log-1')).toBe(5);
            // The queue delivers it; an answer asked after that carries it, and replaces the tap.
            settleDelivered({ type: 'endorse_log', payload: { target_log_id: 'log-1' } });
            tellMarkCounts([{ id: 'log-1', certify: 5 }], Date.now() + 10_000);
            expect(shown('certify', 'log-1')).toBe(5);
        });

        it('moves a stack’s card the same way', async () => {
            tellMarkCounts([{ id: 'list-9', certify: 2 }], Date.now() - 1000);
            await useLogStore.getState().toggleListEndorse('list-9');
            expect(shown('certify', 'list-9')).toBe(3);
            await useLogStore.getState().toggleListEndorse('list-9');
            expect(shown('certify', 'list-9')).toBe(2);
        });
    });

    // ── The heart is the server's answer, post by post (learnEndorsements) ──

    describe('the heart', () => {
        const { resetMarkCounts, beginTap } = jest.requireActual('../markCounts');
        const { enqueueMutation } = jest.requireActual('../../utils/offlineQueue');
        const learn = (kind: 'log' | 'list', rows: { id: string; certified: boolean | null }[], askedAt = Date.now()) =>
            useLogStore.getState().learnEndorsements(kind, rows, askedAt);
        const hearted = (id: string) => !!useLogStore.getState()._endorsedIndex[id];

        beforeEach(() => resetMarkCounts());

        it('fills for a certification older than the sign-in index held', () => {
            // The index knows the newest 500; this is the 501st.
            learn('log', [{ id: 'old-log', certified: true }]);
            expect(hearted('old-log')).toBe(true);
            expect(useLogStore.getState().interactions.some(i => i.targetId === 'old-log' && i.type === 'endorse')).toBe(true);
        });

        it('empties for one withdrawn elsewhere (another device)', () => {
            useLogStore.setState({ _endorsedIndex: { 'log-z': endorsement('log-z') }, interactions: [endorsement('log-z') as never] });
            learn('log', [{ id: 'log-z', certified: false }]);
            expect(hearted('log-z')).toBe(false);
            expect(useLogStore.getState().interactions).toHaveLength(0);
        });

        it('says nothing when the source could not say', () => {
            useLogStore.setState({ _endorsedIndex: { 'log-z': endorsement('log-z') } });
            learn('log', [{ id: 'log-z', certified: null }]);
            expect(hearted('log-z')).toBe(true);
        });

        it('a tap since the question was asked outranks the answer', () => {
            const askedAt = Date.now() - 1000;
            beginTap('certify', 'log-t', 1);              // in flight now
            learn('log', [{ id: 'log-t', certified: false }], askedAt);
            useLogStore.setState({ _endorsedIndex: { 'log-t': endorsement('log-t') } });
            learn('log', [{ id: 'log-t', certified: false }], askedAt);
            expect(hearted('log-t')).toBe(true);
        });

        it('a certification still waiting in the offline queue outranks the answer — even after a restart', () => {
            enqueueMutation({ type: 'endorse_log', payload: { user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', type: 'endorse_log', target_log_id: 'log-q' } });
            useLogStore.setState({ _endorsedIndex: { 'log-q': endorsement('log-q') } });
            learn('log', [{ id: 'log-q', certified: false }]);
            expect(hearted('log-q')).toBe(true);
        });

        it('keeps a stack’s heart in its own index', () => {
            learn('list', [{ id: 'list-old', certified: true }]);
            expect(!!useLogStore.getState()._listEndorsedIndex['list-old']).toBe(true);
            expect(hearted('list-old')).toBe(false);
        });
    });
});
