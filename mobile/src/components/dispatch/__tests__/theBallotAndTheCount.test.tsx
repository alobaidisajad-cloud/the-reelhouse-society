/**
 * theBallotAndTheCount.test.tsx — a blank department, and `1 CRITIQUES`.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two defects found by asking the component what it draws instead of reading it.
 *
 * ── THE BALLOTS DEPARTMENT PRINTED NOTHING ──────────────────────────────────
 * `PaperPost` branched on kind for take, seeking, wire and dossier. There was no
 * ballot branch, and the feed renders `PaperPost` and nothing else. BALLOTS is
 * one of the six departments in the index, and ALL applies no kind filter at
 * all, so a ballot in the paper drew a byline, four marks, and no question.
 *
 * Nothing failed. Nothing warned. Every test passed. The card rendered
 * perfectly and said nothing, which is why this file renders the thing and
 * reads the words back rather than asserting on the source.
 *
 * ── AND THE HOUSE PRINTED `1 CRITIQUES` ─────────────────────────────────────
 * Ten places glued a count to a plural noun. Four of them were SPOKEN labels, so
 * a screen reader announced "Critique. 1 critiques" and "1 members have
 * certified this". A house that sets its own type does not print `1 CRITIQUES`.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { PaperBallot, shares } from '@/src/components/dispatch/paper/PaperBallot';
import { counted } from '@/src/components/dispatch/paper/paperText';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';

const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };

/** Every string the tree actually renders, in order. */
const wordsOf = (node: any, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
  if (Array.isArray(node)) { for (const n of node) wordsOf(n, out); return out; }
  wordsOf(node.children, out);
  return out;
};

const card = (props: Record<string, unknown>) => render(
  <PaperPost
    author={author} order="14" measureWidth={390}
    certifyCount={3} commentCount={2}
    {...(props as any)}
  />,
);

describe('a ballot in the feed', () => {
  const QUESTION = 'Which Ozu should the house watch in October?';

  it('prints its question, which it did not', () => {
    // Read off the rendered tree, not `getByText`: the question is a bare string
    // sibling of the nested `BALLOT — ` lead-in inside one <Text>, so a query for
    // the whole line never matches it and a query for the fragment finds no
    // element of its own. What matters is that the words reach the screen.
    const said = wordsOf(card({ kind: 'ballot', body: QUESTION }).toJSON());
    expect(said).toContain(QUESTION);
  });

  it('leads with BALLOT, the way every other kind leads with its own word', () => {
    const { getByText } = card({ kind: 'ballot', body: QUESTION });
    expect(getByText('BALLOT — ')).toBeTruthy();
  });

  it('draws as much as the other four kinds do', () => {
    // The check that would have caught this: a ballot card must not be shorter
    // than a take card by exactly the words. Counting text runs is the crudest
    // possible measure and it is the one that fails when a branch is missing.
    const ballot = wordsOf(card({ kind: 'ballot', body: QUESTION }).toJSON());
    const take = wordsOf(card({ kind: 'take', body: QUESTION }).toJSON());
    expect(ballot.length).toBe(take.length);
  });

  it('every kind the type allows draws its own words', () => {
    // Enumerated from the union, not hand-listed, so a sixth kind added later
    // cannot quietly repeat this.
    for (const kind of ['take', 'seeking', 'wire', 'ballot', 'dossier'] as const) {
      const said = wordsOf(card({ kind, body: QUESTION }).toJSON());
      expect(said).toContain(QUESTION);
      expect(said.some((w) => w.startsWith(kind.toUpperCase()))).toBe(true);
    }
  });

  it('turns for a member who writes right to left', () => {
    // The Dispatch sets each piece of member writing in its own direction. A
    // ballot's question is member writing, and a new branch is exactly where
    // that gets forgotten.
    const { toJSON } = card({ kind: 'ballot', body: 'أي فيلم لأوزو تشاهد البيت؟' });
    expect(JSON.stringify(toJSON())).toContain('rtl');
  });
});

describe('the house counts in English', () => {
  it('says one critique, not one critiques', () => {
    // It rides in the byline's trailing facts, which is why it reads `· 1 …`.
    const { getByText } = card({ kind: 'take', body: 'A take.', commentCount: 1 });
    expect(getByText('· 1 CRITIQUE')).toBeTruthy();
  });

  it('and two critiques', () => {
    const { getByText } = card({ kind: 'take', body: 'A take.', commentCount: 2 });
    expect(getByText('· 2 CRITIQUES')).toBeTruthy();
  });

  it('says it to a screen reader too', () => {
    const { getByLabelText } = card({
      kind: 'take', body: 'A take.', commentCount: 1, onCritique: () => {},
    });
    expect(getByLabelText('Critique. 1 critique')).toBeTruthy();
  });

  it('one ballot cast, not one ballots cast', () => {
    const { getByText } = render(
      <PaperBallot
        question="Which one?" author={author} closesLabel="CLOSES SUNDAY"
        myVote={0}
        options={[{ title: 'Tokyo Story', votes: 1 }, { title: 'Late Spring', votes: 0 }]}
      />,
    );
    expect(getByText('1 BALLOT CAST')).toBeTruthy();
  });

  it('and the helper keeps the FORMATTED number while deciding on the raw one', () => {
    // At a thousand `formatCount` returns `1K`, and `1K CRITIQUE` would be the
    // same mistake in the other direction. Only exactly one takes the singular.
    expect(counted(1, 'CRITIQUE', 'CRITIQUES', formatCount)).toBe('1 CRITIQUE');
    expect(counted(2, 'CRITIQUE', 'CRITIQUES', formatCount)).toBe('2 CRITIQUES');
    expect(counted(1000, 'CRITIQUE', 'CRITIQUES', formatCount)).toBe('1K CRITIQUES');
    expect(counted(0, 'CRITIQUE', 'CRITIQUES')).toBe('0 CRITIQUES');
  });
});

describe('nothing in the feature glues a count to a plural again', () => {
  /**
   * The class, not the ten sites. A template literal that puts a count directly
   * against a word ending in S has no way to say "one", and this is the shape
   * every one of the ten had.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const DIR = path.join(__dirname, '..', 'paper');
  /** English words ending in S that are not plural nouns. */
  const NOT_PLURAL = new Set([
    'as', 'is', 'was', 'has', 'this', 'its', 'his', 'us', 'plus', 'less',
    'yes', 'thus', 'across', 'across', 'always', 'perhaps', 'unless', 'press',
  ]);

  it('finds none, in any component of the paper', () => {
    const offenders: string[] = [];
    for (const f of fs.readdirSync(DIR).filter((n) => /\.tsx?$/.test(n))) {
      const code = fs.readFileSync(path.join(DIR, f), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      // `${anything} WORDS` or `${anything} words` — a count against a plural.
      for (const m of code.matchAll(/\$\{[^{}]*\}\s+([A-Za-z]+[sS])\b/g)) {
        // `counted(...)` is the sanctioned form and produces the whole phrase,
        // so a plural INSIDE its arguments is not a violation.
        const before = code.slice(Math.max(0, m.index! - 120), m.index!);
        if (/counted\([^)]*$/.test(before)) continue;
        // Not every word ending in S is a plural. `${film.title} as your answer`
        // was the first thing this caught, and a detector that cries wolf on
        // prepositions is a detector the next person turns off.
        if (NOT_PLURAL.has(m[1].toLowerCase())) continue;
        offenders.push(`${f}: …${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * ── A BALLOT AFTER IT CLOSES ────────────────────────────────────────────────
 * The whole second half of this component was dark. A ballot has three states
 * and only the open one had ever been drawn:
 *
 *   open, unvoted   empty boxes, no numbers — you cannot see the result until
 *                   you mark it, which is the engine of the thing
 *   open, voted     your ✗, and the rules fill
 *   closed          the winner lifted out and set large, the rest beneath
 *
 * The closed state is the one that becomes a permanent record of what the
 * house decided, and nothing had ever rendered it.
 */
describe('a ballot that has closed', () => {
  const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
  const said = (node: any, out: string[] = []): string[] => {
    if (node == null) return out;
    if (typeof node === 'string') { if (node.trim()) out.push(node.trim()); return out; }
    if (Array.isArray(node)) { for (const n of node) said(n, out); return out; }
    said(node.children, out);
    return out;
  };

  const closed = (votes: number[]) => render(
    <PaperBallot
      question="Which Ozu?" author={author} closed closesLabel=""
      options={[
        { title: 'Tokyo Story', year: 1953, posterPath: '/a.jpg', votes: votes[0] },
        { title: 'Late Spring', year: 1949, posterPath: '/b.jpg', votes: votes[1] },
      ]}
    />,
  );

  it('lifts the winner out and names it', () => {
    const words = said(closed([7, 2]).toJSON());
    expect(words).toContain('THE HOUSE CHOSE');
    expect(words).toContain('TOKYO STORY');
  });

  it('prints the share it won once there are enough votes for one to mean anything', () => {
    // 8 of 12 is 67% under largest-remainder, and the noun agrees with the count.
    expect(said(closed([8, 4]).toJSON()).join(' ')).toMatch(/67% OF 12 BALLOTS/);
  });

  it('prints the COUNT below the floor, never a zero percent', () => {
    /**
     * ── THIS FOUND A REAL ONE ───────────────────────────────────────────────
     * The line was `{pct[top]}% OF …` unconditionally. Below
     * BALLOT_PERCENT_FLOOR the whole `pct` array is zeros — that is HOW a
     * percentage is suppressed on a ballot too small for one to mean anything
     * — so a closed ballot with nine votes printed
     *
     *     0% OF 9 BALLOTS
     *
     * under the film the house had just chosen with seven of them. A false
     * number, set as the permanent record of a decision.
     */
    const words = said(closed([7, 2]).toJSON()).join(' ');
    expect(words).toMatch(/7 OF 9 BALLOTS/);
    expect(words).not.toMatch(/0% OF/);
  });

  it('says one ballot, not one ballots, when one was cast', () => {
    expect(said(closed([1, 0]).toJSON()).join(' ')).toMatch(/1 OF 1 BALLOT\b/);
  });

  it('says plainly that nobody voted, rather than showing a winner', () => {
    // A ballot nobody marked has no winner. Picking index 0 anyway would print
    // a film as "the house's choice" that the house never chose.
    const words = said(closed([0, 0]).toJSON());
    expect(words).toContain('NO BALLOTS WERE CAST');
    expect(words).not.toContain('THE HOUSE CHOSE');
  });

  it('divides nothing by nothing without inventing a percentage', () => {
    // `shares([])` on a zero total. Every option is 0%, not NaN%.
    expect(shares([0, 0, 0])).toEqual([0, 0, 0]);
    expect(shares([])).toEqual([]);
  });

  it('always adds to exactly a hundred', () => {
    // Rounding three shares independently gives 99 or 101, which is the kind of
    // detail that quietly tells a member the app is careless.
    for (const v of [[1, 1, 1], [2, 3, 4], [1, 0, 0], [5, 5, 1], [10, 3, 3, 3]]) {
      expect(shares(v).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});
