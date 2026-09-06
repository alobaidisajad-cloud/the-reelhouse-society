/**
 * everyCardSaysSomething.test.tsx — the matrix the ballot fell through.
 * ─────────────────────────────────────────────────────────────────────────────
 * A ballot card printed a byline, four marks and no question, and three
 * thousand seven hundred tests did not notice — because every one of them
 * asserted something SPECIFIC about a state somebody had thought of. Nothing
 * asked the flat question: for each kind, in each state, does this card say
 * anything a member can read?
 *
 * So this walks the matrix. Five kinds by the states the card actually
 * branches on, rendering each and reading the words back off the tree.
 *
 * Two rules, and they are deliberately crude:
 *
 *   IT SAYS SOMETHING     every combination puts words on the screen beyond the
 *                         chrome — beyond the byline, the marks and the margin.
 *                         A missing branch is invisible to every specific
 *                         assertion and obvious to this one.
 *
 *   IT SAYS THE RIGHT THING
 *                         a card that is not veiled or struck prints the
 *                         member's own words; a veiled one prints the warning
 *                         INSTEAD, because a spoiler that leaks the sentence it
 *                         is covering is worse than no cover at all.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { PaperPost, type PaperKind } from '@/src/components/dispatch/paper/PaperPost';

const KINDS: PaperKind[] = ['take', 'seeking', 'wire', 'ballot', 'dossier'];

const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
const film = { title: 'Tokyo Story', year: 1953, posterPath: '/p.jpg', backdropPath: '/b.jpg' };

/** The member's own sentence, distinctive enough to find in a tree. */
const BODY = 'The ending is the whole film and nothing before it matters.';

/** Words the CHROME contributes, which do not count as the card saying anything. */
const CHROME = new Set([
  'CERTIFY', 'CERTIFIED', 'CRITIQUE', 'SHARE', 'SAVE', 'SAVED',
  // The byline: the name, and the letter standing in for a face beside it. Both
  // are furniture. They were one string, `OZU · No. 7`, until the member's house
  // number left the page — and if this list is not kept level with that, a
  // struck row passes the test below on its own author's name.
  'OZU', 'O', 'A MEMBER, DEPARTED', '14', '7', 'UNCOVER IT',
  'TAKE — ', 'SEEKING — ', 'WIRE — ', 'BALLOT — ', 'DOSSIER — ',
]);

const wordsOf = (node: any, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
  if (Array.isArray(node)) { for (const n of node) wordsOf(n, out); return out; }
  wordsOf(node.children, out);
  return out;
};

/**
 * The states this card branches on, named. Each is what the app really passes:
 * these are the props the feed and the reader set, not invented combinations.
 */
const STATES: { name: string; props: Record<string, unknown>; veiled?: boolean; struck?: boolean }[] = [
  { name: 'plain', props: {} },
  { name: 'with a film', props: { film } },
  { name: 'with a still', props: { film, still: true } },
  { name: 'certified and saved', props: { certified: true, saved: true } },
  { name: 'edited', props: { edited: true } },
  { name: 'signed out', props: { onCertify: undefined, onSave: undefined } },
  { name: 'unsent', props: { pending: true } },
  { name: 'by a departed member', props: { author: null } },
  { name: 'in a series', props: { series: 'Part II of Ozu, in four parts' } },
  { name: 'veiled', props: { spoiler: 'SPOILERS' }, veiled: true },
  { name: 'withheld', props: { withheld: true } },
  { name: 'struck by its author', props: { ended: 'author' }, struck: true },
  { name: 'struck by the house', props: { ended: 'house' }, struck: true },
];

const draw = (kind: PaperKind, props: Record<string, unknown>) => wordsOf(
  render(
    <PaperPost
      kind={kind}
      author={author}
      body={BODY}
      order="14"
      measureWidth={390}
      certifyCount={3}
      commentCount={2}
      onOpen={() => {}}
      onCritique={() => {}}
      onCertify={() => {}}
      onSave={() => {}}
      onShare={() => {}}
      {...(props as any)}
    />,
  ).toJSON(),
);

describe('every kind, in every state the card branches on', () => {
  it('the matrix is the whole matrix', () => {
    // Checked against a RUNTIME table keyed by kind, not a length. `PaperKind`
    // is a type union and types do not exist at run time — which is exactly why
    // a missing branch was invisible in the first place. `KIND_RULE` is what
    // the app itself reads to colour a filing, so a sixth kind cannot be added
    // without showing up here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KIND_RULE } = require('@/src/components/dispatch/paper/paperMetrics');
    expect([...KINDS].sort()).toEqual(Object.keys(KIND_RULE).sort());
    expect(STATES.length).toBeGreaterThan(10);
  });

  for (const kind of KINDS) {
    for (const state of STATES) {
      it(`${kind}, ${state.name} — prints what it is meant to`, () => {
        const said = draw(kind, state.props);

        if (state.veiled) {
          // The veil replaces the writing. Printing both would make the cover
          // decorative, and the sentence would still be there for a screen
          // reader and one frame from being on screen.
          expect(said).toContain('UNCOVER IT');
          expect(said).not.toContain(BODY);
          return;
        }
        if (state.struck) {
          // The row keeps its room and its critique count; the words go.
          expect(said).not.toContain(BODY);
          expect(said.filter((w) => !CHROME.has(w) && !/^[·\s]+$/.test(w)).length)
            .toBeGreaterThan(0);
          return;
        }

        // Every other state prints the member's own sentence. Asserting on the
        // SENTENCE, not on "something beyond the chrome" — the first draft used
        // the looser rule and a mutation that deleted a whole kind's branch
        // still passed twelve of its thirteen states, because the byline's
        // trailing count counted as substance. A crude rule that can be
        // satisfied by furniture is not a guard.
        expect(said).toContain(BODY);
      });
    }
  }
});

describe('and it says the right thing', () => {
  for (const kind of KINDS) {
    it(`${kind} prints the member's own words when nothing is covering them`, () => {
      expect(draw(kind, {})).toContain(BODY);
    });

    it(`${kind} does NOT leak them behind a veil`, () => {
      // A spoiler that renders the sentence it is covering is worse than no
      // cover at all — the words would be in the tree for anyone reading it
      // with a screen reader, and one frame from being on screen.
      const said = draw(kind, { spoiler: 'SPOILERS' });
      expect(said).not.toContain(BODY);
      expect(said).toContain('UNCOVER IT');
    });

    it(`${kind} does NOT keep them after it is struck`, () => {
      // The row keeps its room and its critique count; the words go.
      for (const ended of ['author', 'house'] as const) {
        expect(draw(kind, { ended })).not.toContain(BODY);
      }
    });

    it(`${kind} names WHO struck it, never the wrong party`, () => {
      const byAuthor = draw(kind, { ended: 'author' }).join(' ').toLowerCase();
      const byHouse = draw(kind, { ended: 'house' }).join(' ').toLowerCase();
      expect(byAuthor).not.toBe(byHouse);
      expect(byAuthor).toMatch(/author|member|withdrew|withdrawn/);
      expect(byHouse).toMatch(/house/);
    });
  }
});
