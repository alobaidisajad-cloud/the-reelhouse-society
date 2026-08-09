/**
 * Service Layer Tests — Batch 3: Write & Utility Services
 * ProfileWriteService, ModerationService, NewsService
 */
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase');
jest.mock('@/src/utils/withAbortSignal', () => ({
    withAbortSignal: jest.fn((query) => query),
}));
jest.mock('@/src/utils/logger', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/stores/mmkv-storage', () => ({
    storage: {
        getString: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
    },
    getSecureStorage: jest.fn(),
}));
jest.mock('@/src/lib/sentry', () => ({
    initSentry: jest.fn(),
    setSentryUser: jest.fn(),
}));
jest.mock('@/src/utils/tier', () => ({
    resolveTier: jest.fn((user: any) => user?.tier || user?.role || 'cinephile'),
    isArchivistPlusTier: jest.fn(() => true),
    isAuteurPlusTier: jest.fn(() => true),
}));
jest.mock('base64-arraybuffer', () => ({
    decode: jest.fn(() => new ArrayBuffer(8)),
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
    c.not = jest.fn().mockImplementation(self);
    c.order = jest.fn().mockImplementation(self);
    c.limit = jest.fn().mockImplementation(self);
    c.lt = jest.fn().mockImplementation(self);
    c.in = jest.fn().mockImplementation(self);
    c.single = jest.fn().mockResolvedValue(resolveValue);
    c.maybeSingle = jest.fn().mockResolvedValue(resolveValue);
    c.then = jest.fn().mockImplementation((resolve) => resolve(resolveValue));
    return c;
}

beforeEach(() => jest.clearAllMocks());

// ════════════════════════════════════════════════════════════════════
// PROFILE WRITE SERVICE
// ════════════════════════════════════════════════════════════════════

describe('ProfileWriteService (ProfileService)', () => {
    let ProfileService: typeof import('@/src/services/ProfileWriteService').ProfileService;

    beforeAll(() => {
        ProfileService = require('@/src/services/ProfileWriteService').ProfileService;
    });

    beforeEach(() => {
        (supabase.auth as any) = {
            getSession: jest.fn().mockResolvedValue({
                data: { session: { user: { id: 'u1' } } },
                error: null,
            }),
        };
    });

    describe('updateProfile', () => {
        it('updates profile fields after session auth check', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await ProfileService.updateProfile('u1', { bio: 'Film lover', username: 'cinephile' });
            expect(supabase.from).toHaveBeenCalledWith('profiles');
            expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ bio: 'Film lover' }));
        });

        it('throws on session mismatch (privilege escalation prevention)', async () => {
            await expect(ProfileService.updateProfile('other-user', { bio: 'Hacked' }))
                .rejects.toThrow('Session mismatch');
        });

        it('throws when no active session', async () => {
            (supabase.auth.getSession as jest.Mock).mockResolvedValue({
                data: { session: null }, error: null,
            });
            await expect(ProfileService.updateProfile('u1', { bio: 'test' }))
                .rejects.toThrow('Unauthorized');
        });

        it('skips update when no fields provided', async () => {
            await ProfileService.updateProfile('u1', {});
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('maps camelCase isSocialPrivate to snake_case', async () => {
            const c = chain({ error: null });
            (supabase.from as jest.Mock).mockReturnValue(c);
            await ProfileService.updateProfile('u1', { isSocialPrivate: true } as any);
            expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ is_social_private: true }));
        });
    });

    describe('checkUsernameAvailable', () => {
        it('returns true when username not taken', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: null }));
            const result = await ProfileService.checkUsernameAvailable('newuser');
            expect(result).toBe(true);
        });

        it('returns false when username taken', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: { id: 'existing' }, error: null }));
            const result = await ProfileService.checkUsernameAvailable('taken');
            expect(result).toBe(false);
        });
    });

    describe('uploadAvatar', () => {
        it('rejects oversized base64 (>13.3MB)', async () => {
            const hugeString = 'a'.repeat(14_000_000);
            await expect(ProfileService.uploadAvatar('u1', hugeString))
                .rejects.toThrow('10MB size limit');
        });
    });

    describe('getSocialConnections', () => {
        it('fetches followers with cursor pagination', async () => {
            const interactionChain = chain({ data: [{ user_id: 'u2', created_at: '2024-01-01' }], error: null });
            const profileChain = chain({ data: [{ id: 'u2', username: 'follower', avatar_url: null, role: 'cinephile' }], error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(interactionChain)
                .mockReturnValueOnce(profileChain);

            const result = await ProfileService.getSocialConnections('u1', 'followers');
            expect(result.profiles).toHaveLength(1);
            expect(result.hasMore).toBe(false);
        });

        it('returns empty when no connections', async () => {
            (supabase.from as jest.Mock).mockReturnValue(chain({ data: [], error: null }));
            const result = await ProfileService.getSocialConnections('u1', 'following');
            expect(result.profiles).toEqual([]);
            expect(result.hasMore).toBe(false);
        });

        it('detects hasMore when extra row returned', async () => {
            // Create 51 items (limit=50, so 51 = hasMore)
            const manyIds = Array.from({ length: 51 }, (_, i) => ({ user_id: `u${i}`, created_at: `2024-01-${String(i).padStart(2, '0')}` }));
            const interactionChain = chain({ data: manyIds, error: null });
            const profiles = manyIds.slice(0, 50).map(r => ({ id: r.user_id, username: `user${r.user_id}`, avatar_url: null, role: 'cinephile' }));
            const profileChain = chain({ data: profiles, error: null });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce(interactionChain)
                .mockReturnValueOnce(profileChain);

            const result = await ProfileService.getSocialConnections('u1', 'followers');
            expect(result.hasMore).toBe(true);
            expect(result.profiles).toHaveLength(50);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// MODERATION SERVICE
// ════════════════════════════════════════════════════════════════════

describe('ModerationService', () => {
    let ModerationService: typeof import('@/src/services/ModerationService').ModerationService;
    beforeAll(() => { ModerationService = require('@/src/services/ModerationService').ModerationService; });

    describe('resolveReportV2', () => {
        it('calls RPC with correct params', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ error: null });
            await ModerationService.resolveReportV2('r1', 'dismiss', { admin_id: 'admin-1', reason: 'test' });
            expect(supabase.rpc).toHaveBeenCalledWith('resolve_moderation_report_v2', {
                p_report_id: 'r1',
                p_action: 'dismiss',
                p_admin_id: 'admin-1',
                p_reason: 'test',
                p_duration_hours: null,
                p_notify_user: true,
            });
        });

        it('throws on RPC error', async () => {
            (supabase.rpc as jest.Mock) = jest.fn().mockResolvedValue({ error: { message: 'RPC failed' } });
            await expect(
                ModerationService.resolveReportV2('r1', 'delete_content', { admin_id: 'admin-1', reason: 'test' }),
            ).rejects.toBeTruthy();
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// NEWS SERVICE
// ════════════════════════════════════════════════════════════════════

describe('NewsService (getNews)', () => {
    let getNews: typeof import('@/src/services/NewsService').getNews;

    beforeAll(() => {
        getNews = require('@/src/services/NewsService').getNews;
    });

    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv, EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' };
    });
    afterEach(() => { process.env = originalEnv; });

    it('returns fallback news when fetch fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network down'));
        const result = await getNews();
        expect(result).toEqual([]);
    });

    it('returns fallback news when RSS returns empty', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) });
        const result = await getNews();
        expect(result).toEqual([]);
    });

    it('parses RSS items when available', async () => {
        const rssItems = [
            { guid: 'g1', title: 'Film &amp; Art', pubDate: '2024-06-01T00:00:00Z', description: '<p>A review</p>', link: 'https://example.com' },
        ];
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: rssItems }) });
        const result = await getNews();
        // Live items only — stale fallback is NOT appended to a live feed (SVC-2)
        expect(result.length).toBe(1);
        expect(result[0].title).toBe('Film & Art'); // HTML entity decoded
    });

    it('strips HTML tags from description', async () => {
        const rssItems = [
            { guid: 'g1', title: 'Test', pubDate: '2024-06-01T00:00:00Z', description: '<p>Clean <b>text</b></p>', link: '#' },
        ];
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: rssItems }) });
        const result = await getNews();
        expect(result[0].excerpt).not.toContain('<p>');
        expect(result[0].excerpt).toContain('Clean text');
    });
});

// ════════════════════════════════════════════════════════════════════
// BOOT SERVICE — REMOVED
// ════════════════════════════════════════════════════════════════════
// BootService.ts was dead code (read from non-existent MMKV key 'auth-storage',
// never imported in app code). Removed in code-review-elevation spec.
