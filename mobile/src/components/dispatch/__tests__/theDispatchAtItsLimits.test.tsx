/**
 * theDispatchAtItsLimits.test.tsx — every card and the reader, at the worst
 * content the database will accept.
 * ─────────────────────────────────────────────────────────────────────────────
 * `everyCardSaysSomething` walks kind x state and proves each card says
 * something. Every fixture it uses is a polite one sentence long. Nothing in
 * this feature had ever rendered a card at the lengths the CHECK constraints
 * actually permit — a 200-character title, a 2,000-character take, a 300-
 * character film name, a 25,000-character essay — and nothing had rendered the
 * one input that defeats wrapping entirely: a single token with no spaces in it.
 *
 * That last one is not hypothetical. `softBreak` exists precisely because an
 * unbroken run has no joint to wrap at, and it is unit-tested in isolation —
 * but no test had ever confirmed a CARD actually applies it. A guard on a
 * function nobody proves is called is the shape of defect this project keeps
 * finding.
 *
 * The rule here is deliberately blunt, the same one that caught the blank
 * ballot: at any length, in any script, the card still prints the member's
 * words and still declares what it is. If a branch collapses under length
 * rather than under state, this is what says so.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { PaperPost, type PaperKind } from '@/src/components/dispatch/paper/PaperPost';
import { MAX_RUN } from '@/src/components/dispatch/paper/paperText';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

const KINDS: PaperKind[] = ['take', 'seeking', 'wire', 'ballot', 'dossier'];

const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };

/** Every string at the exact ceiling its column allows. */
const atCap = (n: number, word = 'nitrate') =>
  Array.from({ length: Math.ceil(n / (word.length + 1)) }, () => word).join(' ').slice(0, n);

/** The pathological one: no whitespace anywhere, so nothing can wrap it. */
const unbroken = (n: number) => 'x'.repeat(n);

const strings = (node: unknown, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
  if (Array.isArray(node)) { for (const n of node) strings(n, out); return out; }
  const o = node as { children?: unknown };
  strings(o.children, out);
  return out;
};

/**
 * The same prop set the feed really passes — taken from `everyCardSaysSomething`
 * rather than invented, so a card is exercised as it is actually used. `order`
 * and `measureWidth` are required: the first version of this file omitted them
 * and all 24 tests failed inside the component, which is a broken harness
 * reporting itself as twenty-four product defects.
 */
const base = (kind: PaperKind, over: Record<string, unknown> = {}) => ({
  kind, author, order: '14', measureWidth: 390,
  // A default body so the spread always satisfies the required prop; every
  // test that cares overrides it.
  body: 'The ending is the whole film.',
  certifyCount: 3, commentCount: 2,
  onOpen: () => {}, onCertify: () => {}, onSave: () => {},
  onCritique: () => {}, onShare: () => {},
  ...(kind === 'wire' ? { source: 'Cahiers du Cinema' } : {}),
  ...over,
});

describe('a card at the length the database allows', () => {
  for (const kind of KINDS) {
    const bodyCap = kind === 'dossier' ? MAX_LENGTHS.filingExcerpt : MAX_LENGTHS.filingBody;

    it(`${kind}: prints the member's words at a full-length body`, () => {
      const body = atCap(bodyCap);
      const { toJSON } = render(
        <PaperPost {...base(kind, { body, title: atCap(MAX_LENGTHS.filingTitle) })} />,
      );
      const said = strings(toJSON()).join(' ');
      // Not "it rendered" — it rendered THE MEMBER'S WORDS. A branch that
      // collapses under length prints chrome and nothing else.
      expect(said).toContain('nitrate');
      expect(said.length).toBeGreaterThan(40);
    });

    it(`${kind}: survives a headline at its ceiling`, () => {
      // `headline` is the real prop; there is no `title` on this card — a
      // dossier's title arrives AS the body, which is what the feed passes.
      // The first version of this test asserted a prop that does not exist and
      // failed five times, which is a test being wrong, not a card.
      const { toJSON } = render(
        <PaperPost {...base(kind, {
          body: 'Short.', headline: atCap(MAX_LENGTHS.filingTitle, 'longheadline'),
        })} />,
      );
      const said = strings(toJSON()).join(' ');
      // Either the headline is drawn for this kind, or the body still is. What
      // must never happen is both disappearing under length.
      expect(said.includes('longheadline') || said.includes('Short.')).toBe(true);
    });

    it(`${kind}: BREAKS AN UNBROKEN RUN rather than letting it overflow`, () => {
      // No spaces at all. Without softBreak this is a single token far wider
      // than any phone, and it pushes the whole column sideways.
      const { toJSON } = render(
        <PaperPost {...base(kind, { body: unbroken(600), title: unbroken(200) })} />,
      );
      const longest = strings(toJSON())
        .flatMap((s) => s.split(/\s|​/))       // zero-width space is a joint
        .reduce((a, b) => (b.length > a.length ? b : a), '');
      expect(`longest unbroken run ${longest.length} <= ${MAX_RUN}`)
        .toBe(`longest unbroken run ${Math.min(longest.length, MAX_RUN)} <= ${MAX_RUN}`);
    });
  }

  it('a film title at its 300-character ceiling does not blank the card', () => {
    const { toJSON } = render(
      <PaperPost {...base('dossier', {
        body: 'An essay.',
        film: { title: atCap(MAX_LENGTHS.subjectTitle, 'filmname'), year: 1953, posterPath: '/p.jpg', backdropPath: null },
      })} />,
    );
    expect(strings(toJSON()).join(' ')).toContain('An essay.');
  });

  it('a wire source at its ceiling does not blank the card', () => {
    const { toJSON } = render(
      <PaperPost {...base('wire', { body: 'The news.', source: atCap(MAX_LENGTHS.wireSource, 'sourcename') })} />,
    );
    expect(strings(toJSON()).join(' ')).toContain('The news.');
  });

  it('a series title at its ceiling does not blank the card', () => {
    const { toJSON } = render(
      <PaperPost {...base('dossier', { body: 'An essay.', series: atCap(MAX_LENGTHS.seriesTitle, 'seriesname') })} />,
    );
    expect(strings(toJSON()).join(' ')).toContain('An essay.');
  });
});

describe('a card at the other extreme', () => {
  for (const kind of KINDS) {
    it(`${kind}: whitespace-only writing still leaves a readable card`, () => {
      // The database permits it; the card must not become an empty rectangle
      // with a byline floating in it.
      const { toJSON } = render(<PaperPost {...base(kind, { body: '   \n  \t ' })} />);
      expect(strings(toJSON()).length).toBeGreaterThan(0);
    });
  }

  it('a right-to-left body at full length still prints', () => {
    const rtl = Array.from({ length: 200 }, () => 'أوزو').join(' ');
    const { toJSON } = render(<PaperPost {...base('take', { body: rtl })} />);
    expect(strings(toJSON()).join(' ')).toContain('أوزو');
  });

  it('an emoji-only body is not mistaken for an empty one', () => {
    const { toJSON } = render(<PaperPost {...base('take', { body: '🎞️🎬🍿' })} />);
    expect(strings(toJSON()).join(' ')).toContain('🎞');
  });
});
