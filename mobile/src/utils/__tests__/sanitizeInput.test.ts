/**
 * D-01: SanitizeInput tests — ensures user-generated content is properly
 * cleaned at the mutation boundary. These tests verify zero-width char
 * stripping, max length enforcement, and control character removal.
 */
import { sanitizeInput, isOverLimit, remainingChars, MAX_LENGTHS } from '../../utils/sanitizeInput';

describe('sanitizeInput', () => {
  it('should return empty string for falsy input', () => {
    expect(sanitizeInput('', 'review')).toBe('');
  });

  it('should strip zero-width characters', () => {
    const input = 'Hello\u200BWorld\u200C!';
    expect(sanitizeInput(input, 'review')).toBe('HelloWorld!');
  });

  it('should strip control characters but preserve newlines and tabs', () => {
    const input = 'Line 1\nLine 2\tTabbed\x00\x01';
    const result = sanitizeInput(input, 'review');
    expect(result).toContain('\n');
    expect(result).toContain('\t');
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x01');
  });

  it('should collapse excessive newlines to max 3', () => {
    const input = 'Before\n\n\n\n\nAfter';
    const result = sanitizeInput(input, 'review');
    const newlineCount = (result.match(/\n/g) || []).length;
    expect(newlineCount).toBeLessThanOrEqual(3);
  });

  it('should enforce max length per field type', () => {
    const longText = 'a'.repeat(6000);
    const result = sanitizeInput(longText, 'review');
    expect(result.length).toBe(MAX_LENGTHS.review);
  });

  it('should enforce bio max length', () => {
    const longBio = 'b'.repeat(1000);
    const result = sanitizeInput(longBio, 'bio');
    expect(result.length).toBe(MAX_LENGTHS.bio);
  });

  it('should enforce lounge message max length', () => {
    const longMsg = 'c'.repeat(3000);
    const result = sanitizeInput(longMsg, 'loungeMessage');
    expect(result.length).toBe(MAX_LENGTHS.loungeMessage);
  });

  it('should trim leading and trailing whitespace', () => {
    const input = '  hello world  ';
    expect(sanitizeInput(input, 'review')).toBe('hello world');
  });
});

describe('isOverLimit', () => {
  it('should return false for text within limit', () => {
    expect(isOverLimit('hello', 'review')).toBe(false);
  });

  it('should return true for text over limit', () => {
    const overLimit = 'x'.repeat(MAX_LENGTHS.username + 1);
    expect(isOverLimit(overLimit, 'username')).toBe(true);
  });
});

describe('remainingChars', () => {
  it('should return full limit for empty text', () => {
    expect(remainingChars('', 'review')).toBe(MAX_LENGTHS.review);
  });

  it('should return correct remaining count', () => {
    expect(remainingChars('hello', 'username')).toBe(MAX_LENGTHS.username - 5);
  });

  it('should return negative for over-limit text', () => {
    const overLimit = 'x'.repeat(MAX_LENGTHS.bio + 10);
    expect(remainingChars(overLimit, 'bio')).toBeLessThan(0);
  });
});

describe('the joiners are kept where they join, and only there', () => {
  // Built from code points, so what each case holds is not left to an editor.
  const s = (...cps: number[]) => String.fromCodePoint(...cps);
  const ZWJ = 0x200d;
  const ZWNJ = 0x200c;

  it.each([
    ['a shrug, a woman', s(0x1f937, ZWJ, 0x2640, 0xfe0f)],
    ['a technologist', s(0x1f469, ZWJ, 0x1f4bb)],
    ['a rainbow flag', s(0x1f3f3, 0xfe0f, ZWJ, 0x1f308)],
    ['a heart on fire', s(0x2764, 0xfe0f, ZWJ, 0x1f525)],
    ['a family', s(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467)],
    ['a skin tone, then a joiner', s(0x1f469, 0x1f3fd, ZWJ, 0x1f4bb)],
  ])('%s stays one emoji', (_name, emoji) => {
    expect(sanitizeInput(`Loved it ${emoji}`, 'loungeMessage')).toBe(`Loved it ${emoji}`);
  });

  it('a Persian word keeps the non-joiner it is spelled with', () => {
    const word = s(0x0645, 0x06cc, ZWNJ, 0x062e, 0x0648, 0x0627, 0x0647, 0x0645);
    expect(sanitizeInput(word, 'review')).toBe(word);
  });

  it('a joiner that joins nothing goes: between Latin letters, at an edge, doubled', () => {
    expect(sanitizeInput(`Ka${s(ZWJ)}ne`, 'review')).toBe('Kane');
    expect(sanitizeInput(`Ka${s(ZWNJ)}ne`, 'review')).toBe('Kane');
    expect(sanitizeInput(`${s(ZWJ)}Kane${s(ZWNJ)}`, 'review')).toBe('Kane');
    expect(sanitizeInput(s(0x1f469, ZWJ, ZWJ, 0x1f4bb), 'review')).toBe(s(0x1f469, ZWJ, 0x1f4bb));
    expect(sanitizeInput(`${s(0x1f469, ZWJ)} done`, 'review')).toBe(`${s(0x1f469)} done`);
  });

  it('the length helpers measure the same kept joiners', () => {
    const emoji = s(0x1f469, ZWJ, 0x1f4bb);
    expect(remainingChars(emoji, 'bio')).toBe(MAX_LENGTHS.bio - emoji.length);
  });
});
