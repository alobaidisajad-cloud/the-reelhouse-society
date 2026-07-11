/**
 * deepLinks.test.ts — Deep Link Validation Tests
 * ────────────────────────────────────────────────
 * Tests the screen allowlist and URL scheme validation
 * introduced in T1-04 hardening.
 */

import { isSafeDeepLinkUrl, isValidDeepLink } from '../deepLinks';

describe('deepLinks', () => {
  describe('isValidDeepLink', () => {
    it('accepts all allowed screens', () => {
      const allowedScreens = [
        'film', 'user', 'lounge', 'notifications', 'log',
        'search', 'list-modal', 'membership', 'vault', 'social',
      ];
      for (const screen of allowedScreens) {
        expect(isValidDeepLink(screen)).toBe(true);
      }
    });

    it('rejects unknown screen names', () => {
      expect(isValidDeepLink('admin')).toBe(false);
      expect(isValidDeepLink('delete-account')).toBe(false);
      expect(isValidDeepLink('../../../etc/passwd')).toBe(false);
    });

    it('rejects non-string inputs', () => {
      expect(isValidDeepLink(null)).toBe(false);
      expect(isValidDeepLink(undefined)).toBe(false);
      expect(isValidDeepLink(42)).toBe(false);
      expect(isValidDeepLink({})).toBe(false);
      expect(isValidDeepLink([])).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidDeepLink('')).toBe(false);
    });

    it('is case-sensitive (rejects uppercase)', () => {
      expect(isValidDeepLink('Film')).toBe(false);
      expect(isValidDeepLink('LOUNGE')).toBe(false);
    });
  });

  describe('isSafeDeepLinkUrl', () => {
    it('allows https URLs', () => {
      expect(isSafeDeepLinkUrl('https://reelhouse.app/film/123')).toBe(true);
    });

    it('allows http URLs', () => {
      expect(isSafeDeepLinkUrl('http://localhost:3000')).toBe(true);
    });

    it('allows reelhouse:// scheme', () => {
      expect(isSafeDeepLinkUrl('reelhouse://film/123')).toBe(true);
    });

    it('blocks tel: scheme (phone injection)', () => {
      expect(isSafeDeepLinkUrl('tel:+1234567890')).toBe(false);
    });

    it('blocks sms: scheme', () => {
      expect(isSafeDeepLinkUrl('sms:+1234567890')).toBe(false);
    });

    it('blocks intent: scheme (Android injection)', () => {
      expect(isSafeDeepLinkUrl('intent://evil.com#Intent;scheme=https;end')).toBe(false);
    });

    it('blocks javascript: scheme (XSS)', () => {
      expect(isSafeDeepLinkUrl('javascript:alert(1)')).toBe(false);
    });

    it('blocks data: scheme', () => {
      expect(isSafeDeepLinkUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('rejects non-string inputs', () => {
      expect(isSafeDeepLinkUrl(null)).toBe(false);
      expect(isSafeDeepLinkUrl(undefined)).toBe(false);
      expect(isSafeDeepLinkUrl(42)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isSafeDeepLinkUrl('')).toBe(false);
    });

    it('rejects malformed URLs', () => {
      expect(isSafeDeepLinkUrl('not-a-url')).toBe(false);
      expect(isSafeDeepLinkUrl('://missing-scheme')).toBe(false);
    });
  });
});
