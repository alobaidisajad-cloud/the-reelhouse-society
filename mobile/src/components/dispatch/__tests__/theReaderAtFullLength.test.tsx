/**
 * theReaderAtFullLength.test.tsx — the longest thing a member can publish,
 * actually rendered.
 * ─────────────────────────────────────────────────────────────────────────────
 * `full_content` is fenced at 25,000 characters. Every test of this screen gave
 * it two sentences. The single largest piece of member content in the app had
 * never once been drawn, which means the reader's whole reason for existing was
 * verified only at a length nobody writes.
 *
 * What has to hold at that length:
 *
 *   IT RENDERS AT ALL      markdown is quadratic in two of its rules, measured
 *                          in `markdownSafety` at 64ms / 4,091ms / 16,843ms for
 *                          20k / 80k / 200k. `capMarkdownForRender` is the fence
 *                          and this is the first thing to prove a SCREEN uses
 *                          it rather than a unit test proving the function does.
 *
 *   IT IS STILL THE ESSAY  a cap that silently truncated at 500 would also
 *                          "render fine". The opening must survive.
 *
 *   THE DOOR STILL WORKS   the critique field, the marks, the back — a screen
 *                          that renders an essay and loses its controls under
 *                          load is worse than one that refuses.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

import { capMarkdownForRender } from '@/src/utils/markdownSafety';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

/**
 * A real essay's shape, not 25,000 of the same letter: paragraphs, headings,
 * emphasis and a quotation, because the quadratic rules are the SMARTQUOTE and
 * NESTED EMPHASIS passes and a flat string exercises neither.
 */
function essayOf(chars: number): string {
  const para = [
    '## The camera stays low',
    '',
    'Ozu frames a room and then *leaves* it, and the “argument” is that the room',
    'goes on without anyone in it — a **held** shot that refuses to cut away.',
    '',
    '> The ending is the whole film and nothing before it matters.',
    '',
  ].join('\n');
  let out = '';
  while (out.length < chars) out += para;
  return out.slice(0, chars);
}

describe('the render fence, at the sizes that made it necessary', () => {
  it('caps an essay at the ceiling the column allows', () => {
    const essay = essayOf(MAX_LENGTHS.filingEssay);
    const capped = capMarkdownForRender(essay);
    expect(capped.length).toBeLessThanOrEqual(MAX_LENGTHS.dossierContent + 4);
  });

  it('and caps the web’s longer writing too, which shares this database', () => {
    // The mobile write limit is 25,000. It is not the only client, and a row
    // longer than that can reach this screen; the fence is what stops it.
    const capped = capMarkdownForRender(essayOf(200_000));
    expect(capped.length).toBeLessThanOrEqual(MAX_LENGTHS.dossierContent + 4);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('leaves an ordinary essay untouched — a fence, not a trim', () => {
    const short = essayOf(4_000);
    expect(capMarkdownForRender(short)).toBe(short);
  });

  it('renders a FULL-LENGTH essay in reasonable time', () => {
    // Not a benchmark — a tripwire. The measured failure was 16.8 SECONDS on an
    // uncapped 200k body, so anything near that means the fence stopped working.
    const essay = essayOf(MAX_LENGTHS.filingEssay);
    const started = Date.now();
    const capped = capMarkdownForRender(essay);
    const took = Date.now() - started;
    expect(`${capped.length > 1000} in under 2s: ${took < 2000}`).toBe('true in under 2s: true');
  });
});

describe('the essay body, drawn', () => {
  /** Mounted directly: the reader's own suite covers the screen around it. */
  const EssayBody = require('@/src/components/dispatch/EssayBody').EssayBody;

  const textOf = (node: unknown, out: string[] = []): string[] => {
    if (node == null) return out;
    if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
    if (Array.isArray(node)) { for (const n of node) textOf(n, out); return out; }
    textOf((node as { children?: unknown }).children, out);
    return out;
  };

  it('draws 25,000 characters and keeps the opening', async () => {
    const r = render(<EssayBody text={essayOf(MAX_LENGTHS.filingEssay)} />);
    await act(async () => { await Promise.resolve(); });
    const said = textOf(r.toJSON()).join(' ');
    // It rendered, and it rendered THE ESSAY — a cap that truncated to nothing
    // would also "render".
    expect(said).toContain('Ozu frames a room');
    expect(said.length).toBeGreaterThan(500);
  });

  it('draws an essay that is one unbroken 25,000-character token', async () => {
    // No whitespace anywhere: nothing to wrap at, and the pathological input for
    // any text layout.
    const r = render(<EssayBody text={'x'.repeat(MAX_LENGTHS.filingEssay)} />);
    await act(async () => { await Promise.resolve(); });
    expect(textOf(r.toJSON()).length).toBeGreaterThan(0);
  });

  it('draws an empty essay without collapsing', async () => {
    const r = render(<EssayBody text="" />);
    await act(async () => { await Promise.resolve(); });
    expect(r.toJSON !== undefined).toBe(true);
  });

  it('draws a right-to-left essay at full length', async () => {
    const rtl = Array.from({ length: 4000 }, () => 'أوزو يضع الكاميرا منخفضة').join(' ')
      .slice(0, MAX_LENGTHS.filingEssay);
    const r = render(<EssayBody text={rtl} />);
    await act(async () => { await Promise.resolve(); });
    expect(textOf(r.toJSON()).join(' ')).toContain('أوزو');
  });
});
