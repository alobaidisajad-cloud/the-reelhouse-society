/**
 * sanitize.test.ts — Text Sanitization Tests
 * ───────────────────────────────────────────
 * Tests the sanitization functions that remove competitor
 * references and clean mobile import artifacts.
 */
import { sanitizeDescription, sanitizeListTitle } from '../sanitize';

describe('sanitizeDescription', () => {
  it('passes through clean text unchanged', () => {
    expect(sanitizeDescription('A brilliant film about human connection'))
      .toBe('A brilliant film about human connection');
  });

  it('removes Letterboxd references', () => {
    const result = sanitizeDescription('I logged this on Letterboxd yesterday');
    expect(result.toLowerCase()).not.toContain('letterboxd');
  });

  it('removes IMDb references', () => {
    const result = sanitizeDescription('Check out the IMDb page for this');
    expect(result.toLowerCase()).not.toContain('imdb');
  });

  it('handles empty string', () => {
    expect(sanitizeDescription('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizeDescription(null)).toBe('');
    expect(sanitizeDescription(undefined)).toBe('');
  });

  it('preserves legitimate text around removed references', () => {
    const result = sanitizeDescription('Great film. I loved every scene.');
    expect(result).toBe('Great film. I loved every scene.');
  });

  it('strips import artifacts from mobile paste', () => {
    const desc = 'Imported from letterboxd\n\nActually a great film';
    const result = sanitizeDescription(desc);
    expect(result).toBeTruthy();
    expect(result.toLowerCase()).not.toContain('imported from');
  });

  it('removes multiple competitor references', () => {
    const desc = 'Better than Letterboxd and IMDb combined';
    const result = sanitizeDescription(desc);
    expect(result.toLowerCase()).not.toContain('letterboxd');
    expect(result.toLowerCase()).not.toContain('imdb');
  });
});

describe('sanitizeListTitle', () => {
  it('passes through clean titles unchanged', () => {
    expect(sanitizeListTitle('Blade Runner 2049')).toBe('Blade Runner 2049');
  });

  it('trims whitespace', () => {
    expect(sanitizeListTitle('  The Matrix  ')).toBe('The Matrix');
  });

  it('returns fallback for empty string', () => {
    expect(sanitizeListTitle('')).toBe('Untitled Stack');
  });

  it('returns fallback for null', () => {
    expect(sanitizeListTitle(null)).toBe('Untitled Stack');
  });

  it('returns fallback for "NULL" string', () => {
    expect(sanitizeListTitle('NULL')).toBe('Untitled Stack');
    expect(sanitizeListTitle('null')).toBe('Untitled Stack');
  });

  it('returns fallback for UUID-like strings', () => {
    expect(sanitizeListTitle('a1b2c3d4e5f6a7b8')).toBe('Untitled Stack');
  });

  it('returns fallback for numeric IDs', () => {
    expect(sanitizeListTitle('123456')).toBe('Untitled Stack');
  });
});
