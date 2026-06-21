/**
 * validateUsername.test.ts — Username Validation Tests
 * ────────────────────────────────────────────────────
 * Tests the signup username validation rules:
 * length, character set, reserved words, profanity, edge cases.
 */

import { validateUsername } from '../validateUsername';

describe('validateUsername', () => {
  describe('valid usernames', () => {
    it('accepts standard alphanumeric username', () => {
      const result = validateUsername('cinephile42');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('cinephile42');
      expect(result.error).toBeUndefined();
    });

    it('accepts username with underscores', () => {
      const result = validateUsername('film_lover');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('film_lover');
    });

    it('accepts minimum length (3 chars)', () => {
      expect(validateUsername('abc').valid).toBe(true);
    });

    it('accepts maximum length (30 chars)', () => {
      expect(validateUsername('a'.repeat(30)).valid).toBe(true);
    });
  });

  describe('sanitization', () => {
    it('converts to lowercase', () => {
      const result = validateUsername('CinePhile');
      expect(result.sanitized).toBe('cinephile');
      expect(result.valid).toBe(true);
    });

    it('replaces spaces with underscores', () => {
      const result = validateUsername('film lover');
      expect(result.sanitized).toBe('film_lover');
      expect(result.valid).toBe(true);
    });

    it('strips special characters', () => {
      const result = validateUsername('film!@#$%lover');
      expect(result.sanitized).toBe('filmlover');
      expect(result.valid).toBe(true);
    });

    it('trims whitespace', () => {
      const result = validateUsername('  filmfan  ');
      expect(result.sanitized).toBe('filmfan');
      expect(result.valid).toBe(true);
    });
  });

  describe('length validation', () => {
    it('rejects empty string', () => {
      const result = validateUsername('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects too short (< 3 chars)', () => {
      const result = validateUsername('ab');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3');
    });

    it('rejects too long (> 30 chars)', () => {
      const result = validateUsername('a'.repeat(31));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('30 characters');
    });
  });

  describe('underscore rules', () => {
    it('rejects leading underscore', () => {
      const result = validateUsername('_filmfan');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('underscore');
    });

    it('rejects trailing underscore', () => {
      const result = validateUsername('filmfan_');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('underscore');
    });

    it('rejects consecutive underscores', () => {
      const result = validateUsername('film__fan');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('consecutive');
    });
  });

  describe('reserved words', () => {
    it('rejects "admin"', () => {
      expect(validateUsername('admin').valid).toBe(false);
      expect(validateUsername('admin').error).toContain('reserved');
    });

    it('rejects "reelhouse"', () => {
      expect(validateUsername('reelhouse').valid).toBe(false);
    });

    it('rejects "system"', () => {
      expect(validateUsername('system').valid).toBe(false);
    });

    it('rejects "settings"', () => {
      expect(validateUsername('settings').valid).toBe(false);
    });

    it('is case-insensitive for reserved words', () => {
      expect(validateUsername('ADMIN').valid).toBe(false);
      expect(validateUsername('Admin').valid).toBe(false);
    });
  });

  describe('profanity filter', () => {
    it('rejects obvious profanity', () => {
      expect(validateUsername('testfuck').valid).toBe(false);
      expect(validateUsername('testfuck').error).toContain('not allowed');
    });

    it('rejects stretched profanity variations', () => {
      expect(validateUsername('fuuuck').valid).toBe(false);
    });
  });
});
