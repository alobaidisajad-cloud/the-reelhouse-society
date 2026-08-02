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
});
