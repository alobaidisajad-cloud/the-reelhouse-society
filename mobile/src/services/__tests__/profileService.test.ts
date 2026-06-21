/**
 * profileService.test.ts — Profile Service Tests
 * ────────────────────────────────────────────────
 * Tests the security-critical profile operations:
 * session authorization, Zod validation, username checks,
 * and avatar upload size guards.
 */

// Updated import path from legacy '../profileService' to '../ProfileWriteService'
import { ProfileService, PROFILE_SELECT_COLUMNS } from '../ProfileWriteService';

const mockGetSession = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatar.jpg' } }),
      }),
    },
  },
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn().mockReturnValue(new ArrayBuffer(8)),
}));

jest.mock('../../utils/withAbortSignal', () => ({
  withAbortSignal: jest.fn().mockImplementation((query: unknown) => query),
}));

describe('ProfileService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('PROFILE_SELECT_COLUMNS', () => {
    it('contains all required auth-bootstrap fields', () => {
      expect(PROFILE_SELECT_COLUMNS).toContain('id');
      expect(PROFILE_SELECT_COLUMNS).toContain('username');
      expect(PROFILE_SELECT_COLUMNS).toContain('role');
      expect(PROFILE_SELECT_COLUMNS).toContain('avatar_url');
      expect(PROFILE_SELECT_COLUMNS).toContain('preferences');
    });

    it('does not contain heavy display fields', () => {
      // Auth bootstrap should be lean — these belong in ProfileDataService
      expect(PROFILE_SELECT_COLUMNS).not.toContain('favorite_films');
      expect(PROFILE_SELECT_COLUMNS).not.toContain('followers_count');
    });
  });

  describe('updateProfile', () => {
    it('throws when no session exists', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      await expect(ProfileService.updateProfile('u1', { bio: 'test' }))
        .rejects.toThrow('Unauthorized');
    });

    it('throws on session error', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
      await expect(ProfileService.updateProfile('u1', { bio: 'test' }))
        .rejects.toThrow('Unauthorized');
    });

    it('throws on session mismatch (privilege escalation guard)', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'other-user-id' } } },
        error: null,
      });
      await expect(ProfileService.updateProfile('u1', { bio: 'hacked' }))
        .rejects.toThrow('Session mismatch');
    });

    it('skips database call for empty updates', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      });
      await ProfileService.updateProfile('u1', {});
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('checkUsernameAvailable', () => {
    it('returns true when username is not taken', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });
      const result = await ProfileService.checkUsernameAvailable('newuser');
      expect(result).toBe(true);
    });

    it('returns false when username is taken', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
          }),
        }),
      });
      const result = await ProfileService.checkUsernameAvailable('takenuser');
      expect(result).toBe(false);
    });

    it('throws on database error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
          }),
        }),
      });
      await expect(ProfileService.checkUsernameAvailable('test')).rejects.toThrow('DB error');
    });
  });

  describe('uploadAvatar', () => {
    it('rejects oversized base64 payload (SEC-01 guard)', async () => {
      const oversized = 'x'.repeat(13_300_001);
      await expect(ProfileService.uploadAvatar('u1', oversized))
        .rejects.toThrow('10MB size limit');
    });
  });
});
