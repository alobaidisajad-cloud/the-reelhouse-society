/**
 * excerpt.test.ts — the opening of an essay, as it appears on a card.
 * ─────────────────────────────────────────────────────────────────────────────
 * The excerpt stored in `dispatch_posts.body` for a dossier was made by deleting
 * every `#*_[]()>-` from the essay, wherever it appeared. That is not stripping
 * markdown; it is stripping punctuation. The card printed
 *
 *     a wellmade film see below            for  a well-made film (see below)
 *     the pollhttpsexamplecom              for  [the poll](https://example.com)
 *
 * — the second one exactly backwards, since the entire point of unwrapping a
 * link is to keep the words and drop the URL.
 *
 * The tests below are mostly about what must NOT change, because the dangerous
 * failure here is silently editing a member's sentence.
 */
import { excerptOf, excerptFor, EXCERPT_CHARS } from '../excerpt';

describe('unwrapping markdown', () => {
  it('keeps a hyphen inside a word', () => {
    expect(excerptOf('A well-made film.')).toBe('A well-made film.');
    expect(excerptOf('state-of-the-art')).toBe('state-of-the-art');
  });

  it('keeps parentheses in prose', () => {
    expect(excerptOf('Tokyo Story (1953) is the one.')).toBe('Tokyo Story (1953) is the one.');
  });

  it('keeps an underscore inside a word', () => {
    expect(excerptOf('the snake_case_name column')).toBe('the snake_case_name column');
  });

  it('takes a link’s words and drops its URL', () => {
    expect(excerptOf('Read [the poll](https://example.com) first.'))
      .toBe('Read the poll first.');
  });

  it('drops an image entirely', () => {
    expect(excerptOf('![a still](https://example.com/x.jpg) Then the argument.'))
      .toBe('Then the argument.');
  });

  it('unwraps emphasis', () => {
    expect(excerptOf('It is **the** best, or *nearly*.')).toBe('It is the best, or nearly.');
    expect(excerptOf('__Bold__ and _italic_.')).toBe('Bold and italic.');
    expect(excerptOf('The `full_content` column.')).toBe('The full_content column.');
  });

  it('leaves a lone asterisk alone', () => {
    // Unpaired is not markup. Removing it would be editing the member's page.
    expect(excerptOf('A footnote marker * here.')).toBe('A footnote marker * here.');
  });

  it('removes line-leading markers only', () => {
    expect(excerptOf('# A Heading\n\nThe body.')).toBe('A Heading The body.');
    expect(excerptOf('> A quotation.\n\nAnd a reply.')).toBe('A quotation. And a reply.');
    expect(excerptOf('- one\n- two')).toBe('one two');
    expect(excerptOf('1. first\n2. second')).toBe('first second');
    // But a hyphen mid-line is a hyphen.
    expect(excerptOf('He was well - almost - convinced.')).toBe('He was well - almost - convinced.');
  });

  it('drops a code fence and a horizontal rule', () => {
    expect(excerptOf('Before.\n\n```\ncode here\n```\n\nAfter.')).toBe('Before. After.');
    expect(excerptOf('Before.\n\n---\n\nAfter.')).toBe('Before. After.');
  });

  it('collapses every run of whitespace into one space', () => {
    expect(excerptOf('One.\n\n\nTwo.\t\tThree.')).toBe('One. Two. Three.');
  });
});

describe('the stored excerpt', () => {
  it('is left whole when it already fits', () => {
    const short = 'Ozu frames a room and then leaves it.';
    expect(excerptFor(short)).toBe(short);
  });

  it('never ends mid-word', () => {
    const long = ('antidisestablishmentarianism '.repeat(20)).trim();
    const got = excerptFor(long);
    expect(got.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
    expect(got.endsWith('…')).toBe(true);
    // The character before the ellipsis is the end of a word, not the middle.
    expect(got.slice(0, -1).endsWith('antidisestablishmentarianism')).toBe(true);
  });

  it('cuts hard when there is no word boundary to cut on', () => {
    // One unbroken run: there is nowhere sensible to break, so it is cut rather
    // than returned whole and refused by the column.
    const wall = 'x'.repeat(400);
    const got = excerptFor(wall);
    expect(got.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
  });

  it('fits inside what the column allows for a dossier', () => {
    // `excerpt_ceiling` gives a dossier's body 500 characters. The design's 150
    // is the tighter of the two, and the one that must hold.
    const essay = 'A sentence about a film. '.repeat(200);
    expect(excerptFor(essay).length).toBeLessThanOrEqual(500);
  });
});
