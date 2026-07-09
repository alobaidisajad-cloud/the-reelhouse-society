/**
 * Service Layer Tests — Batch 2: Data Services
 * StackService, FilmService, LoungeService, DossierService
 */
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase');
jest.mock('@/src/utils/withAbortSignal', () => ({
    withAbortSignal: jest.fn((query) => query),
}));
jest.mock('@/src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Chainable mock
function chain(resolveValue: { data?: unknown; error: unknown; count?: number } = { data: null, error: null }) {
    const c: Record<string, jest.Mock> = {};
    const self = () => c;
    c.insert = jest.fn().mockImplementation(self);
    c.upsert = jest.fn().mockImplementation(self);
    c.update = jest.fn().mockImplementation(self);
    c.delete = jest.fn().mockImplementation(self);
    c.select = jest.fn().mockImplementation(self);
    c.eq = jest.fn().mockImplementation(self);
    c.neq = jest.fn().mockImplementation(self);
    c.not = jest.fn().mockImplementation(self);
    c.or = jest.fn().mockImplementation(self);
    c.order = jest.fn().mockImplementation(self);
    c.limit = jest.fn().mockImplementation(self);
    c.in = jest.fn().mockImplementation(self);
    c.contains = jest.fn().mockImplementation(self);
    c.maybeSingle = jest.fn().mockResolvedValue(resolveValue);
    c.single = jest.fn().mockResolvedValue(resolveValue);
    c.then = jest.fn().mockImplementation((resolve) => resolve(resolveValue));
    return c;
}

beforeEach(() => {
    jest.clearAllMocks();
    // Drain any unconsumed mockReturnValueOnce values — clearAllMocks does NOT
    // clear the once-queue, so leftover chains would leak into later tests.
    (supabase.from as jest.Mock).mockReset();
});

// ════════════════════════════════════════════════════════════════════
// STACK SERVICE
// ════════════════════════════════════════════════════════════════════

describe('StackService', () => {
    let StackService: typeof import('@/src/services/StackService').StackService;
    beforeAll(() => { StackService = require('@/src/services/StackService').StackService; });

    describe('getStackFullPayload', () => {
        it('fetches stack full payload from lists table', async () => {
            const listData = { id: 's1', title: 'Best of 2024', user_id: 'u1', is_public: true, created_at: '2024-01-01', description: null, cover_film_poster: null, is_private: false, is_ranked: false, profiles: { username: 'cinephile' } };
            const itemsData = [{ film_id: 550, film_title: 'Fight Club', poster_path: '/fc.jpg' }];
            
            const listChain = chain({ data: listData, error: null });
            const itemsChain = chain({ data: itemsData, error: null });
            const endorseChain = chain({ data: [], error: null, count: 5 });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listChain)
                .mockReturnValueOnce(itemsChain)
                .mockReturnValueOnce(endorseChain);

            const result = await StackService.getStackFullPayload('s1');
            expect(supabase.from).toHaveBeenCalledWith('lists');
            expect(result.title).toBe('Best of 2024');
            expect(result.films).toHaveLength(1);
        });

        it('throws on Supabase error', async () => {
            const listChain = chain({ data: null, error: { message: 'Not found' } });
            const itemsChain = chain({ data: [], error: null });
            const endorseChain = chain({ data: [], error: null, count: 0 });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listChain)
                .mockReturnValueOnce(itemsChain)
                .mockReturnValueOnce(endorseChain);

            await expect(StackService.getStackFullPayload('bad')).rejects.toBeTruthy();
        });

        it('logs warning on schema mismatch (non-blocking)', async () => {
            // Missing required field 'title'
            const badData = { id: 's1', user_id: 'u1', created_at: '2024-01-01' };
            const listChain = chain({ data: badData, error: null });
            const itemsChain = chain({ data: [], error: null });
            const endorseChain = chain({ data: [], error: null, count: 0 });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(listChain)
                .mockReturnValueOnce(itemsChain)
                .mockReturnValueOnce(endorseChain);

            const { logger } = require('@/src/utils/logger');
            // The schema validation should log a warning but not throw
            const result = await StackService.getStackFullPayload('s1');
            expect(result).toBeTruthy();
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('getStackComments', () => {
        it('returns mapped comments with username', async () => {
            const rawComments = [
                { id: 'c1', list_id: 's1', user_id: 'u1', content: 'Great list!', created_at: '2024-01-01', profiles: { username: 'filmfan' } },
            ];
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: rawComments, error: null }));
            const result = await StackService.getStackComments('s1');
            expect(result[0].username).toBe('filmfan');
            expect(result[0].content).toBe('Great list!');
        });

        it('handles profiles as array (Supabase join variant)', async () => {
            const rawComments = [
                { id: 'c1', list_id: 's1', user_id: 'u1', content: 'Nice!', created_at: '2024-01-01', profiles: [{ username: 'arrayuser' }] },
            ];
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: rawComments, error: null }));
            const result = await StackService.getStackComments('s1');
            expect(result[0].username).toBe('arrayuser');
        });

        it('returns empty array when no comments', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: [], error: null }));
            const result = await StackService.getStackComments('s1');
            expect(result).toEqual([]);
        });
    });

    describe('addStackComment', () => {
        it('validates payload with Zod then inserts', async () => {
            // addStackComment now performs a single insert; the list-owner
            // notification is emitted by the tr_notify_list_comment DB trigger.
            const c = chain({ data: { id: 'new-c', list_id: 's1', user_id: 'u1', content: 'Comment', created_at: '2024-01-01', profiles: { username: 'testuser' } }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);

            await StackService.addStackComment({
                list_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
                content: 'Great stack!',
            });
            expect(supabase.from).toHaveBeenCalledWith('list_comments');
        });

        it('rejects empty content', async () => {
            await expect(StackService.addStackComment({
                list_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
                content: '',
            })).rejects.toThrow();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// FILM SERVICE
// ════════════════════════════════════════════════════════════════════

describe('FilmService', () => {
    let FilmService: typeof import('@/src/services/FilmService').FilmService;
    beforeAll(() => { FilmService = require('@/src/services/FilmService').FilmService; });

    describe('getFilmReviewCount', () => {
        it('returns count from Supabase', async () => {
            const c = chain({ data: null, error: null, count: 42 });
            // Make it resolve with count at top level
            c.then = jest.fn().mockImplementation((resolve) => resolve({ count: 42, error: null }));
            (supabase.from as jest.Mock).mockReturnValue(c);
            const result = await FilmService.getFilmReviewCount(550);
            expect(supabase.from).toHaveBeenCalledWith('logs');
            expect(result).toBe(42);
        });

        it('returns 0 when count is null', async () => {
            const c = chain({ data: null, error: null });
            c.then = jest.fn().mockImplementation((resolve) => resolve({ count: null, error: null }));
            (supabase.from as jest.Mock).mockReturnValue(c);
            const result = await FilmService.getFilmReviewCount(999);
            expect(result).toBe(0);
        });
    });

    describe('getFilmReviews', () => {
        it('returns empty page when no reviews', async () => {
            const c = chain({ data: [], error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            const result = await FilmService.getFilmReviews('550', 20);
            expect(result).toEqual({ items: [], nextCursor: null });
        });

        it('throws on Supabase error', async () => {
            const c = chain({ data: null, error: { message: 'timeout' } });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await expect(FilmService.getFilmReviews('550', 20)).rejects.toBeTruthy();
        });

        it('applies cursor-based pagination when cursor provided', async () => {
            const c = chain({ data: [], error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await FilmService.getFilmReviews('550', 20, '2024-01-01T00:00:00Z|review-1');
            expect(c.or).toHaveBeenCalledWith(
                expect.stringContaining('created_at.lt.2024-01-01T00:00:00Z')
            );
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// LOUNGE SERVICE
// ════════════════════════════════════════════════════════════════════

describe('LoungeService', () => {
    let LoungeService: typeof import('@/src/services/LoungeService').LoungeService;
    beforeAll(() => { LoungeService = require('@/src/services/LoungeService').LoungeService; });

    describe('getLoungeDetails', () => {
        it('fetches lounge by ID', async () => {
            const lounge = { id: 'l1', name: 'Film Club', description: 'A group', created_at: '2024-01-01', created_by: 'u1', member_count: 5, is_public: true, cover_image: null };
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: lounge, error: null }));
            const result = await LoungeService.getLoungeDetails('l1');
            expect(result).toEqual(lounge);
        });
    });

    describe('checkMembership', () => {
        it('returns true when member exists', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: { id: 'm1' }, error: null }));
            const result = await LoungeService.checkMembership('l1', 'u1');
            expect(result).toBe(true);
        });

        it('returns false when PGRST116 (no rows)', async () => {
            // maybeSingle returns null data when no rows found
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: null }));
            const result = await LoungeService.checkMembership('l1', 'u1');
            expect(result).toBe(false);
        });

        it('throws on errors', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: { code: '42P01', message: 'Table not found' } }));
            await expect(LoungeService.checkMembership('l1', 'u1')).rejects.toBeTruthy();
        });
    });

    describe('shareToLounge', () => {
        it('validates and inserts message', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ error: null }));
            await LoungeService.shareToLounge({
                lounge_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
                content: 'Check this out!',
                type: 'text',
            });
            expect(supabase.from).toHaveBeenCalledWith('lounge_messages');
        });

        it('rejects invalid type', async () => {
            await expect(LoungeService.shareToLounge({
                lounge_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
                content: 'Test',
                type: 'invalid_type',
            })).rejects.toThrow();
        });
    });

    describe('getUserLounges', () => {
        it('returns Zod-parsed user lounges', async () => {
            const data = [{ lounge_id: 'l1', lounges: { id: 'l1', name: 'Club' } }];
            (supabase.from as jest.Mock).mockReturnValue(chain({ data, error: null }));
            const result = await LoungeService.getUserLounges('u1');
            expect(result).toHaveLength(1);
            expect(result[0].lounge_id).toBe('l1');
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// DOSSIER SERVICE
// ════════════════════════════════════════════════════════════════════

describe('DossierService', () => {
    let DossierService: typeof import('@/src/services/DossierService').DossierService;
    beforeAll(() => { DossierService = require('@/src/services/DossierService').DossierService; });

    describe('getComments', () => {
        it('returns empty array when no comments', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: [], error: null }));
            const result = await DossierService.getComments('d1');
            expect(result).toEqual([]);
        });

        it('throws on Supabase error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: { message: 'err' } }));
            await expect(DossierService.getComments('d1')).rejects.toBeTruthy();
        });
    });

    describe('addComment', () => {
        it('validates payload with Zod', async () => {
            await expect(DossierService.addComment({
                dossier_id: 'not-uuid', user_id: 'not-uuid', body: 'Test',
            })).rejects.toThrow();
        });

        it('inserts valid comment', async () => {
            const mockReturn = { id: 'c1', user_id: 'u1', body: 'Nice', created_at: '2024-01-01', profiles: { username: 'user', avatar_url: null } };
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: mockReturn, error: null }));
            const result = await DossierService.addComment({
                dossier_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
                body: 'Great article',
            });
            expect(result).toBeTruthy();
        });
    });

    describe('deleteComment', () => {
        it('deletes by ID with ownership filter', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await DossierService.deleteComment('c1', 'u1');
            expect(c.delete).toHaveBeenCalled();
            expect(c.eq).toHaveBeenCalledWith('id', 'c1');
            expect(c.eq).toHaveBeenCalledWith('user_id', 'u1');
        });
    });

    describe('incrementViews', () => {
        it('calls RPC', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ error: null });
            await DossierService.incrementViews('d1');
            expect(supabase.rpc).toHaveBeenCalledWith('increment_dossier_views', { dossier_uuid: 'd1' });
        });
    });

    describe('checkUserCertification', () => {
        it('returns true when certified', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: { id: 'cert1' }, error: null }));
            const result = await DossierService.checkUserCertification('d1', 'u1');
            expect(result).toBe(true);
        });

        it('returns false on no rows', async () => {
            // maybeSingle returns null data when no rows found
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: null }));
            const result = await DossierService.checkUserCertification('d1', 'u1');
            expect(result).toBe(false);
        });
    });
});
