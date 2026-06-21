/**
 * T4-3: Unit tests for html.ts — stripHtml() and decodeEntities()
 */

import { stripHtml, decodeEntities } from '../html';

describe('stripHtml', () => {
  // ── Basic tag stripping ──
  it('strips simple tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('strips nested tags', () => {
    expect(stripHtml('<div><p><strong>Bold</strong> text</p></div>')).toBe('Bold text');
  });

  it('strips self-closing tags', () => {
    expect(stripHtml('line one<br/>line two')).toBe('line oneline two');
  });

  it('handles malformed tags gracefully', () => {
    expect(stripHtml('<p>unclosed paragraph')).toBe('unclosed paragraph');
    expect(stripHtml('text with <stray angle')).toBe('text with');
  });

  // ── Script/style removal ──
  it('removes script blocks entirely', () => {
    expect(stripHtml('before<script>alert("xss")</script>after')).toBe('beforeafter');
  });

  it('removes style blocks entirely', () => {
    expect(stripHtml('before<style>.red{color:red}</style>after')).toBe('beforeafter');
  });

  it('removes multiline script blocks', () => {
    const html = 'safe<script>\nvar x = 1;\nalert(x);\n</script>content';
    expect(stripHtml(html)).toBe('safecontent');
  });

  // ── Entity decoding ──
  it('decodes named entities', () => {
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripHtml('&lt;not a tag&gt;')).toBe('<not a tag>');
    expect(stripHtml('She said &ldquo;hello&rdquo;')).toBe('She said \u201Chello\u201D');
  });

  it('decodes decimal numeric entities', () => {
    expect(stripHtml('&#8217;')).toBe('\u2019');  // right single quote
    expect(stripHtml('&#169;')).toBe('©');         // copyright
  });

  it('decodes hex numeric entities', () => {
    expect(stripHtml('&#x2019;')).toBe('\u2019');  // right single quote
    expect(stripHtml('&#x00A9;')).toBe('©');       // copyright
  });

  it('handles mixed entities', () => {
    expect(stripHtml('&copy; 2024 &ndash; All rights reserved&#8230;'))
      .toBe('© 2024 – All rights reserved…');
  });

  // ── Whitespace normalization ──
  it('normalizes multiple spaces', () => {
    expect(stripHtml('too    many     spaces')).toBe('too many spaces');
  });

  it('normalizes excessive newlines', () => {
    expect(stripHtml('line1\n\n\n\n\nline2')).toBe('line1\n\nline2');
  });

  it('trims leading/trailing whitespace', () => {
    expect(stripHtml('  <p>  padded  </p>  ')).toBe('padded');
  });

  // ── Edge cases ──
  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('returns empty string for null-ish input', () => {
    expect(stripHtml(null as unknown as string)).toBe('');
    expect(stripHtml(undefined as unknown as string)).toBe('');
  });

  it('passes through plain text unchanged', () => {
    expect(stripHtml('Just plain text')).toBe('Just plain text');
  });

  // ── Real-world TMDB content ──
  it('handles TMDB overview with HTML', () => {
    const tmdbHtml = '<p>A young FBI cadet must receive the help of an incarcerated and manipulative cannibal killer to help catch another serial killer, a madman who skins his victims.</p>';
    expect(stripHtml(tmdbHtml)).toBe(
      'A young FBI cadet must receive the help of an incarcerated and manipulative cannibal killer to help catch another serial killer, a madman who skins his victims.'
    );
  });

  it('handles review text with entities and tags', () => {
    const review = '<em>Kubrick&apos;s</em> masterpiece &mdash; a film that rewards repeated viewing&#8230;';
    expect(stripHtml(review)).toBe('Kubrick\'s masterpiece — a film that rewards repeated viewing…');
  });
});

describe('decodeEntities', () => {
  it('decodes named entities without stripping tags', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('preserves angle brackets in plain text', () => {
    expect(decodeEntities('5 &gt; 3')).toBe('5 > 3');
  });

  it('returns empty for falsy input', () => {
    expect(decodeEntities('')).toBe('');
    expect(decodeEntities(null as unknown as string)).toBe('');
  });
});
