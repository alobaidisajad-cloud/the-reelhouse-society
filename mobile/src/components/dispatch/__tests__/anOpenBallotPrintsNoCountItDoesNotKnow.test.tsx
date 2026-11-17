/**
 * anOpenBallotPrintsNoCountItDoesNotKnow.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member marks an open ballot and its foot said "0 BALLOTS CAST" under their own mark; every
 * voter after them read the same until the close. The options' numbers came only from the count
 * frozen at the close, and nothing counted an open ballot.
 *
 * Now the house gives a member who has voted the running count (ballot_tally), and the ballot
 * draws it. Until it is read, the ballot says the member's ballot is cast and prints no number.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { PaperBallot } from '@/src/components/dispatch/paper/PaperBallot';

const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
const words = (node: any, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node.trim()); return out; }
  if (Array.isArray(node)) { for (const n of node) words(n, out); return out; }
  words(node.children, out);
  return out;
};
const ballot = (over: Partial<React.ComponentProps<typeof PaperBallot>>) => render(
  <PaperBallot
    question="Which Ozu?" author={author} closesLabel="CLOSES SUNDAY" onVote={() => {}}
    options={[
      { title: 'Tokyo Story', posterPath: '/a.jpg', year: 1953, director: 'Ozu', votes: 0 },
      { title: 'Late Spring', posterPath: '/b.jpg', year: 1949, director: 'Ozu', votes: 0 },
    ]}
    {...over}
  />,
);

it('marked, with its count not yet known, says the ballot is cast and prints no number', () => {
  const r = ballot({ myVote: 1, tallied: false });
  const said = words(r.toJSON());
  expect(said).toContain('YOUR BALLOT IS CAST');
  expect(said.join(' ')).not.toMatch(/\d+ BALLOTS? CAST/);
  expect(said.join(' ')).not.toMatch(/%/);
  // The member's own mark is still theirs, and nothing else is offered.
  expect(r.getByLabelText(/^Option 2 of 2\. Late Spring, 1949, Ozu\. Your mark\.$/)).toBeTruthy();
});

it('marked, with the running count read, draws it', () => {
  const r = ballot({
    myVote: 1, tallied: true,
    options: [{ title: 'Tokyo Story', posterPath: '/a.jpg', votes: 1 }, { title: 'Late Spring', posterPath: '/b.jpg', votes: 2 }],
  });
  expect(words(r.toJSON())).toContain('3 BALLOTS CAST');
});

it('unmarked, invites the mark as before', () => {
  expect(words(ballot({ myVote: null, tallied: false }).toJSON())).toContain('MARK YOUR BALLOT');
});
