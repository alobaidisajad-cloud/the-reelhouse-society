/**
 * Service Layer Tests — Batch 1: Core Services
 * LogService, InteractionService, AuthService, NotificationService
 */
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase');
jest.mock('@/src/utils/withAbortSignal', () => ({
    withAbortSignal: jest.fn((query) => query),
}));
jest.mock('@/src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/stores/auth', () => ({
    useAuthStore: {
        getState: jest.fn(() => ({
            user: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', username: 'testuser' },
        })),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

// ── Chainable Supabase mock ──
function chain(resolveValue: { data?: unknown; error: unknown; count?: number } = { data: null, error: null }) {
    const c: Record<string, jest.Mock> = {};
    const self = () => c;
    c.insert = jest.fn().mockImplementation(self);
    c.upsert = jest.fn().mockImplementation(self);
    c.update = jest.fn().mockImplementation(self);
    c.delete = jest.fn().mockImplementation(self);
    c.select = jest.fn().mockImplementation(self);
    c.eq = jest.fn().mockImplementation(self);
    c.in = jest.fn().mockImplementation(self);
    c.not = jest.fn().mockImplementation(self);
    c.order = jest.fn().mockImplementation(self);
    c.limit = jest.fn().mockImplementation(self);
    c.single = jest.fn().mockResolvedValue(resolveValue);
    c.maybeSingle = jest.fn().mockResolvedValue(resolveValue);
    c.then = jest.fn().mockImplementation((resolve) => resolve(resolveValue));
    return c;
}

beforeEach(() => {
    jest.clearAllMocks();
    // Drain any unconsumed mockReturnValueOnce values so chains can't leak
    // between tests (clearAllMocks does not clear the once-queue).
    (supabase.from as jest.Mock).mockReset();
});

// ════════════════════════════════════════════════════════════════════
// LOG SERVICE
// ════════════════════════════════════════════════════════════════════

describe('LogService', () => {
    // Must import after mocks
    let LogService: typeof import('@/src/services/LogService').LogService;

    beforeAll(() => {
        LogService = require('@/src/services/LogService').LogService;
    });

    describe('getLogDetails', () => {
        it('returns log data for valid ID', async () => {
            const mockLog = { id: 'log-1', user_id: 'u1', film_id: 123, film_title: 'Test', created_at: '2024-01-01' };
            const c = chain({ data: mockLog, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            const result = await LogService.getLogDetails('log-1');
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(c.eq).toHaveBeenCalledWith('id', 'log-1');
            expect(result).toEqual(mockLog);
        });

        it('throws on Supabase error', async () => {
            const c = chain({ data: null, error: { message: 'Not found', code: 'PGRST116' } });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await expect(LogService.getLogDetails('bad-id')).rejects.toBeTruthy();
        });

        it('accepts AbortSignal parameter', async () => {
            const c = chain({ data: { id: 'log-1', user_id: 'u1', film_id: 1, created_at: '2024-01-01' }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            const controller = new AbortController();
            await LogService.getLogDetails('log-1', controller.signal);
            expect(supabase.from).toHaveBeenCalledWith('logs');
        });
    });

    describe('getLogComments', () => {
        it('returns comments ordered by created_at', async () => {
            const comments = [
                { id: 'c1', log_id: 'log-1', user_id: 'u1', body: 'Great!', created_at: '2024-01-01' },
            ];
            const profiles = [
                { id: 'u1', username: 'filmfan', avatar_url: null, display_name: null },
            ];
            const commentsChain = chain({ data: comments, error: null });
            const totalChain = chain({ data: null, error: null, count: 7 });
            const profilesChain = chain({ data: profiles, error: null });
            (supabase.from as jest.Mock)
                .mockReturnValueOnce(commentsChain)   // the bounded page of comments
                .mockReturnValueOnce(totalChain)      // the TRUE total, head:true
                .mockReturnValueOnce(profilesChain);  // profiles DataLoader join

            const result = await LogService.getLogComments('log-1');
            expect(supabase.from).toHaveBeenCalledWith('log_comments');
            // Newest-first ON THE WIRE, so the bound keeps the most recent
            // comments rather than the oldest — then reversed for display.
            expect(commentsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
            expect(commentsChain.limit).toHaveBeenCalled();
            // getLogComments attaches the author profile to each comment for display.
            expect(result.comments).toEqual(comments.map(cm => ({
                ...cm,
                profiles: { username: 'filmfan', avatar_url: null, display_name: null },
            })));
            // The total comes from the SERVER, not from the page length — a
            // 7-comment thread reports 7 even when one page is returned.
            expect(result.total).toBe(7);
        });

        it('returns the page oldest-first even though it is fetched newest-first', async () => {
            const newestFirst = [
                { id: 'c3', log_id: 'log-1', user_id: 'u1', body: 'third', created_at: '2024-01-03' },
                { id: 'c2', log_id: 'log-1', user_id: 'u1', body: 'second', created_at: '2024-01-02' },
                { id: 'c1', log_id: 'log-1', user_id: 'u1', body: 'first', created_at: '2024-01-01' },
            ];
            (supabase.from as jest.Mock)
                .mockReturnValueOnce(chain({ data: newestFirst, error: null }))
                .mockReturnValueOnce(chain({ data: null, error: null, count: 3 }))
                .mockReturnValueOnce(chain({ data: [{ id: 'u1', username: 'filmfan', avatar_url: null, display_name: null }], error: null }));

            const result = await LogService.getLogComments('log-1');
            expect(result.comments.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2', 'c3']);
        });

        it('throws on error', async () => {
            const c = chain({ data: null, error: { message: 'DB down' } });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await expect(LogService.getLogComments('log-1')).rejects.toBeTruthy();
        });
    });

    describe('addLogComment', () => {
        it('validates payload with Zod before insert', async () => {
            const c = chain({ data: { id: 'new-c', log_id: 'l1', user_id: 'u1', body: 'Nice', created_at: '2024-01-01' }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            const result = await LogService.addLogComment({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', log_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', body: 'Nice film' });
            expect(c.upsert).toHaveBeenCalled();
            expect(result).toBeTruthy();
        });

        it('rejects invalid payload (missing body)', async () => {
            await expect(LogService.addLogComment({ log_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12' }))
                .rejects.toThrow();
        });

        it('rejects invalid UUID format', async () => {
            await expect(LogService.addLogComment({ log_id: 'not-uuid', user_id: 'not-uuid', body: 'test' }))
                .rejects.toThrow();
        });
    });

    describe('deleteLogComment', () => {
        it('deletes by comment ID', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await LogService.deleteLogComment('c1');
            expect(supabase.from).toHaveBeenCalledWith('log_comments');
            expect(c.delete).toHaveBeenCalled();
            expect(c.eq).toHaveBeenCalledWith('id', 'c1');
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// INTERACTION SERVICE
// ════════════════════════════════════════════════════════════════════

describe('InteractionService', () => {
    let InteractionService: typeof import('@/src/services/InteractionService').InteractionService;

    beforeAll(() => {
        InteractionService = require('@/src/services/InteractionService').InteractionService;
    });

    describe('addEndorsement', () => {
        it('routes endorse_log to interactions', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await InteractionService.addEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_log',
                target_log_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
            });
            expect(supabase.from).toHaveBeenCalledWith('interactions');
        });

        it('routes endorse_film to interactions (direct)', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await InteractionService.addEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_film',
                target_film_id: '550',
            });
            expect(supabase.from).toHaveBeenCalledWith('interactions');
        });

        it('rejects payload missing all target IDs', async () => {
            await expect(InteractionService.addEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_log',
            })).rejects.toThrow();
        });

        it('accepts numeric film_id (TMDB IDs are integers)', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await InteractionService.addEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_film',
                target_film_id: 550,
            });
            expect(supabase.from).toHaveBeenCalledWith('interactions');
        });

        it('throws on Supabase error', async () => {
            const c = chain({ error: { message: 'insert failed' } });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await expect(InteractionService.addEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_review',
                target_review_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
            })).rejects.toEqual({ message: 'insert failed' });
        });
    });

    describe('removeEndorsement', () => {
        it('deletes with correct filter chain', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await InteractionService.removeEndorsement({
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                type: 'endorse_log',
                target_log_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
            });
            expect(supabase.from).toHaveBeenCalledWith('interactions');
            expect(c.delete).toHaveBeenCalled();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// AUTH SERVICE
// ════════════════════════════════════════════════════════════════════

describe('AuthService', () => {
    let AuthService: typeof import('@/src/services/AuthService').AuthService;

    beforeAll(() => {
        AuthService = require('@/src/services/AuthService').AuthService;
    });

    beforeEach(() => {
        (supabase.auth as any) = {
            updateUser: jest.fn(),
            getSession: jest.fn(),
            refreshSession: jest.fn(),
            verifyOtp: jest.fn(),
        };
    });

    describe('updatePassword', () => {
        it('calls supabase.auth.updateUser', async () => {
            (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
            await AuthService.updatePassword('newpass123');
            expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
        });

        it('throws on auth error', async () => {
            (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: { message: 'weak password' } });
            await expect(AuthService.updatePassword('123')).rejects.toBeTruthy();
        });
    });

    describe('requestAccountDeletion', () => {
        it('calls RPC', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ error: null });
            await AuthService.requestAccountDeletion();
            expect(supabase.rpc).toHaveBeenCalledWith('request_account_deletion');
        });
    });

    describe('getSession', () => {
        it('delegates to supabase.auth.getSession', async () => {
            const sessionData = { data: { session: { user: { id: 'u1' } } } };
            (supabase.auth.getSession as jest.Mock).mockResolvedValue(sessionData);
            const result = await AuthService.getSession();
            expect(result).toEqual(sessionData);
        });
    });

    describe('verifyOtp', () => {
        it('passes token_hash and type', async () => {
            (supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({ data: {}, error: null });
            await AuthService.verifyOtp('hash123', 'email');
            expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash123', type: 'email' });
        });
    });

    describe('getSessionProfile', () => {
        it('returns profile on first attempt', async () => {
            jest.useFakeTimers();
            const profile = { id: 'u1', username: 'testuser' };
            const c = chain({ data: profile, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            const promise = AuthService.getSessionProfile('u1');
            jest.advanceTimersByTime(100);
            const result = await promise;
            expect(result).toEqual(profile);
            jest.useRealTimers();
        });

        it('returns null after hard timeout (15s)', async () => {
            jest.useFakeTimers();
            const c = chain({ data: null, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            const promise = AuthService.getSessionProfile('u1');
            // Advance well past 15s
            for (let i = 0; i < 20; i++) {
                jest.advanceTimersByTime(1000);
                await Promise.resolve(); // flush microtasks
            }
            const result = await promise;
            expect(result).toBeNull();
            jest.useRealTimers();
        });
    });
});
