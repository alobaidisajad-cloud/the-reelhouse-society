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
import { readCode } from '@/test-utils/readCode';

import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { PaperBallot, shares } from '@/src/components/dispatch/paper/PaperBallot';
import { counted } from '@/src/components/dispatch/paper/paperText';
import { formatCount, KIND_NAME } from '@/src/components/dispatch/paper/paperMetrics';

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
    author={author} order="14" orderIs="count" measureWidth={390}
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
    //
    // The lead-in is the kind's PRINTED name, which is not its column value —
    // `dossier` is filed as an ESSAY. Asserting `kind.toUpperCase()` here would
    // re-tie the page to the schema, which is the coupling `KIND_NAME` exists to
    // cut. See `oneWordNamesOneThing.test.ts`.
    for (const kind of ['take', 'seeking', 'wire', 'ballot', 'dossier'] as const) {
      const said = wordsOf(card({ kind, body: QUESTION }).toJSON());
      expect(said).toContain(QUESTION);
      expect(said.some((w) => w.startsWith(KIND_NAME[kind]))).toBe(true);
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
  // The count is drawn as a bare figure beside the icon now (MarkFigure), so
  // the noun — and with it the plural — lives in what the button SAYS.
  it('says one critique, not one critiques', () => {
    const { getByLabelText } = card({ kind: 'take', body: 'A take.', commentCount: 1, onCritique: () => {} });
    expect(getByLabelText('Critique. 1 critique')).toBeTruthy();
  });

  it('and two critiques', () => {
    const { getByLabelText } = card({ kind: 'take', body: 'A take.', commentCount: 2, onCritique: () => {} });
    expect(getByLabelText('Critique. 2 critiques')).toBeTruthy();
  });

  it('and one member, not one members', () => {
    const { getByLabelText } = card({ kind: 'take', body: 'A take.', certifyCount: 1, onCertify: () => {} });
    expect(getByLabelText('Certify this. 1 member has certified this')).toBeTruthy();
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
    const files = fs.readdirSync(DIR).filter((n) => /\.tsx?$/.test(n));
    expect(files.length).toBeGreaterThan(10); // the paper's components were found
    for (const f of files) {
      const code = readCode(path.join(DIR, f));
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

  it('adds to exactly a hundred when equal votes allow it', () => {
    // Rounding three shares independently gives 99 or 101, which is the kind of
    // detail that quietly tells a member the app is careless.
    for (const v of [[2, 3, 4], [1, 0, 0], [8, 4], [10, 3, 3, 3], [7, 2, 2]]) {
      expect(shares(v).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('gives equal votes equal shares, before the sum', () => {
    // Largest remainder alone printed 46% beside 45% for 5 votes each: the point
    // went to whichever film was listed first. Equal must read equal.
    expect(shares([5, 5, 1])).toEqual([45, 45, 9]);
    expect(shares([1, 1, 1])).toEqual([33, 33, 33]);
    expect(shares([4, 4])).toEqual([50, 50]);
  });

  it('never passes a hundred, and every share is its exact one rounded', () => {
    let seed = 7;
    const next = () => { seed = (seed * 48271) % 2147483647; return seed; };
    for (let k = 0; k < 500; k++) {
      const votes = Array.from({ length: 2 + (next() % 5) }, () => next() % 40);
      const total = votes.reduce((a, b) => a + b, 0);
      const out = shares(votes);
      expect(out.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
      out.forEach((s, i) => {
        const exact = total ? (votes[i] / total) * 100 : 0;
        expect(s === Math.floor(exact) || s === Math.ceil(exact)).toBe(true);
        votes.forEach((w, j) => { if (w === votes[i]) expect(out[j]).toBe(s); });
      });
    }
  });
});

describe('a ballot that closed level', () => {
  const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
  const said = (node: any, out: string[] = []): string[] => {
    if (node == null) return out;
    if (typeof node === 'string') { if (node.trim()) out.push(node.trim()); return out; }
    if (Array.isArray(node)) { for (const n of node) said(n, out); return out; }
    said(node.children, out);
    return out;
  };
  const closed = (votes: number[]) => said(render(
    <PaperBallot
      question="Which Ozu?" author={author} closed closesLabel=""
      options={[
        { title: 'Tokyo Story', posterPath: '/a.jpg', votes: votes[0] },
        { title: 'Late Spring', posterPath: '/b.jpg', votes: votes[1] },
        { title: 'Floating Weeds', posterPath: '/c.jpg', votes: votes[2] },
      ]}
    />,
  ).toJSON()).join(' | ');

  it('crowns nobody when the leaders are level', () => {
    // `indexOf(max)` named the first of them THE HOUSE CHOSE: one vote each
    // and the film listed first was printed as the house's decision.
    const words = closed([1, 1, 0]);
    expect(words).not.toMatch(/THE HOUSE CHOSE/);
    expect(words).toMatch(/THE HOUSE WAS DIVIDED/);
  });

  it('names exactly the leaders, and the count they share', () => {
    const words = closed([2, 1, 2]);
    expect(words).toMatch(/TOKYO STORY · FLOATING WEEDS/);
    expect(words).not.toMatch(/LATE SPRING ·|· LATE SPRING/);
    expect(words).toMatch(/TIED AT 2 OF 5 BALLOTS EACH/);
  });

  it('still crowns a clear winner', () => {
    const words = closed([3, 1, 1]);
    expect(words).toMatch(/THE HOUSE CHOSE/);
    expect(words).not.toMatch(/DIVIDED/);
  });
});

describe('a ballot row says only what can be done with it', () => {
  const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
  const labels = (props: Partial<React.ComponentProps<typeof PaperBallot>>) => {
    const out: string[] = [];
    const walk = (n: any) => {
      if (n == null || typeof n === 'string') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.props?.accessibilityRole === 'radio') out.push(n.props.accessibilityLabel);
      walk(n.children);
    };
    walk(render(
      <PaperBallot
        question="Which Ozu?" author={author} closesLabel="Closes Friday" onVote={() => {}}
        options={[
          { title: 'Tokyo Story', posterPath: '/a.jpg', votes: 3 },
          { title: 'Late Spring', posterPath: '/b.jpg', votes: 1 },
        ]}
        {...props}
      />,
    ).toJSON());
    return out;
  };

  it('offers the mark on an open ballot', () => {
    expect(labels({})).toEqual([
      'Option 1 of 2. Tokyo Story. Mark this.',
      'Option 2 of 2. Late Spring. Mark this.',
    ]);
  });

  it('names your mark once you have made it, and offers nothing else', () => {
    // Below the floor this said "Mark this." on the option already marked.
    expect(labels({ myVote: 1 })).toEqual([
      'Option 1 of 2. Tokyo Story.',
      'Option 2 of 2. Late Spring. Your mark.',
    ]);
  });

  it('offers nothing on a closed ballot', () => {
    expect(labels({ closed: true }).join(' ')).not.toMatch(/Mark this/);
    // The rest are still read out, with no act; the winner is drawn as the house's choice.
    expect(labels({ closed: true })).toEqual(['Option 2 of 2. Late Spring.']);
  });
});

/**
 * ── A BALLOT THAT HAS CLOSED BUT NOT BEEN COUNTED ───────────────────────────
 * The numbers on a ballot come from `frozen_totals`, written by exactly one
 * database function, which is REVOKEd from the app and was meant to be run by a
 * cron. Checked against production: there is no cron. So the column was never
 * filled for any ballot, and with no totals every option reads 0 — which this
 * component printed as NO BALLOTS WERE CAST, under a question members had
 * marked.
 *
 * The distinction survives the fix to the job: between a ballot closing and the
 * next run there is always a window, and the page has to be honest inside it.
 */
describe('a ballot closed but not yet counted', () => {
  const author = { name: 'ozu', memberNo: 7, tier: 'free' as const, avatar: null };
  const words = (node: any, out: string[] = []): string[] => {
    if (node == null) return out;
    if (typeof node === 'string') { if (node.trim()) out.push(node.trim()); return out; }
    if (Array.isArray(node)) { for (const n of node) words(n, out); return out; }
    words(node.children, out);
    return out;
  };
  const draw = (sealed: boolean) => words(render(
    <PaperBallot
      question="Which Ozu?" author={author} closed sealed={sealed} closesLabel=""
      options={[
        { title: 'Tokyo Story', posterPath: '/a.jpg', votes: 0 },
        { title: 'Late Spring', posterPath: '/b.jpg', votes: 0 },
      ]}
    />,
  ).toJSON());

  it('does not claim nobody voted', () => {
    const said = draw(false);
    expect(said).not.toContain('NO BALLOTS WERE CAST');
    expect(said).toContain('THE COUNT IS BEING SEALED');
  });

  it('crowns nobody, rather than the first option by default', () => {
    // With every option at 0, `indexOf(max)` is 0 — so an unsealed ballot would
    // name the first film as the house's choice on no votes at all.
    const said = draw(false);
    expect(said).not.toContain('THE HOUSE CHOSE');
    expect(said).toContain('Which Ozu?');
  });

  it('and still says nobody voted when it really has been counted', () => {
    // The other sentence must survive: a sealed ballot with no votes is a real
    // and different fact about the house.
    const said = draw(true);
    expect(said).toContain('NO BALLOTS WERE CAST');
    expect(said).not.toContain('THE COUNT IS BEING SEALED');
  });

  it('the reader passes the real thing, never a default', () => {
    // `sealed` defaults TRUE for the render harness. If the app forgot to pass
    // it, every uncounted ballot would go straight back to lying.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', '[id].tsx'), 'utf8',
    );
    expect(src).toContain('sealed={!!live.frozenTotals}');
  });
});
