/**
 * deepLinks.test.ts — Deep Link Validation Tests
 * ────────────────────────────────────────────────
 * Tests the URL scheme validation introduced in T1-04 hardening. (The screen
 * allowlist is gone — a tapped push opens its notice; see
 * theTappedNoticeOpensIt.test.ts.)
 */

import { isSafeDeepLinkUrl } from '../deepLinks';

describe('deepLinks', () => {
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
