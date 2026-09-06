/**
 * theNumberIsAMembershipFact.test.tsx — where a member's house number may be
 * printed, and where it may not.
 * ─────────────────────────────────────────────────────────────────────────────
 * `No. 402` is a fact about somebody's MEMBERSHIP, not about the thing they just
 * wrote. It belongs where membership is: their room, their file card, and the
 * card a filing travels out of the app as — that card has to say whose house
 * this is, to someone who has never heard of the house.
 *
 * It used to be printed twice on every post: once in the byline and again inside
 * the avatar disc, where it stood in for a face. So the loudest thing about a
 * stranger's opinion of a film was a serial number, and a reader with a screen
 * reader heard it twice — "147. TOMASREYES · No. 147".
 *
 * What stands in for a face now is the member's initial. This test holds the
 * line in both directions: gone from the page, still on the card.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Byline, initialOf, type PaperAuthor } from '../paper/PaperPost';
import { DossierShareCard, PaperRoom } from '../paper/PaperMore';

const ANA: PaperAuthor = { name: 'Ana', memberNo: 17, tier: 'auteur', avatar: null };

/** Every string in a rendered tree, flattened. */
const textOf = (tree: unknown): string => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n === 'string') { out.push(n); return; }
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out.join(' ');
};

describe('a member’s number is not a fact about their post', () => {
  it('is nowhere on a byline', () => {
    const { toJSON } = render(<Byline author={ANA} trailing="31 CRITIQUES" />);
    const text = textOf(toJSON());
    expect(text).toContain('ANA');
    expect(text).not.toMatch(/No\./);
    expect(text).not.toContain('17');
  });

  it('is not hiding in the disc that stands in for a face', () => {
    // The disc printed it whenever a member had set no photo — which is most of
    // them — so removing it from the byline alone would have moved the number
    // rather than retired it.
    const { toJSON } = render(<Byline author={ANA} trailing="31 CRITIQUES" />);
    expect(textOf(toJSON())).not.toContain('17');
  });

  it('puts the member’s initial there instead', () => {
    const { toJSON } = render(<Byline author={ANA} trailing="31 CRITIQUES" />);
    // 'A' from Ana — and the name beside it, so the disc repeats nothing.
    expect(textOf(toJSON())).toContain('A');
    expect(initialOf('Ana')).toBe('A');
  });

  it('takes no letter when there is no name to take one from', () => {
    // A departed member's disc is already empty; an empty name must not print a
    // stray mark that means nothing.
    expect(initialOf('')).toBe('');
    expect(initialOf(null)).toBe('');
    expect(initialOf(undefined)).toBe('');
    expect(initialOf('  ')).toBe('');
  });
});

describe('and it stays where membership is', () => {
  it('prints the number at the head of a member’s room', () => {
    // A member's room IS their profile inside the Dispatch. Taking the number
    // off every byline took it off this head too, because the head draws a
    // byline — so the head prints it itself. Without this, the one screen that
    // is ABOUT the member would be the one screen not naming them.
    const { toJSON } = render(<PaperRoom author={ANA} filed={128} certified={4102} />);
    expect(textOf(toJSON())).toMatch(/No\.\s*17/);
  });
});

describe('and it stays on the card that leaves the house', () => {
  it('prints the number on the share card', () => {
    // This one travels to people who have never heard of the Dispatch. The
    // number is what says a house stands behind the writing.
    const { toJSON } = render(
      <DossierShareCard
        title="The Long Silence in Ozu"
        opening="There is a shot in Tokyo Story that lasts eleven seconds."
        author={ANA}
        filed="24 AUGUST 2026"
      />,
    );
    expect(textOf(toJSON())).toMatch(/No\.\s*17/);
  });
});
