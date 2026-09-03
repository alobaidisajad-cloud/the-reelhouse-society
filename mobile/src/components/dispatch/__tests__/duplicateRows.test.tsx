/**
 * duplicateRows.test.tsx — two rows that look alike are still two rows.
 * ─────────────────────────────────────────────────────────────────────────────
 * Both lists in the Dispatch were keyed on the CONTENT of a row rather than its
 * position, and both had a real duplicate waiting for them:
 *
 *   the film finder   keyed on `f.title`. Search "Suspiria" and TMDB returns
 *                     1977 and 2018. One key, and React drops a row from the
 *                     one list whose entire job is picking between them.
 *
 *   the series list   keyed on `x.n`, which is `part_number` — a number the
 *                     member typed. Nothing in the schema stops two parts being
 *                     numbered `2`.
 *
 * Neither shows up in a screenshot, because the duplicate has to exist before
 * anything goes wrong.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS THE WARNING ────────────────────────────
 * The first draft of these tests asserted only that both rows render and that
 * pressing the second gives you the second. Then the fix was reverted to check
 * the guard bit — and it did not. On a fresh mount React renders both rows with
 * colliding keys perfectly well; it only WARNS, and reserves the right to omit
 * or duplicate a row on a later update. A guard that passes against the bug it
 * was written for is worse than no guard, because it is read as coverage.
 *
 * So the warning is the assertion. It is the only thing React actually promises
 * here, and it is what these fixes exist to remove. The behavioural checks stay
 * underneath it — they say the row is the right row, which is a different claim
 * and still worth making.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import { FilmFinder } from '@/src/components/dispatch/paper/PaperDesk';
import { SeriesList } from '@/src/components/dispatch/paper/PaperEssay';

const author = { name: 'tomasreyes', memberNo: 147, tier: 'auteur' as const };

/** Everything React complained about while the block ran. */
let complaints: string[] = [];
let realError: typeof console.error;

beforeEach(() => {
  complaints = [];
  realError = console.error;
  console.error = (...args: unknown[]) => { complaints.push(String(args[0])); };
});
afterEach(() => { console.error = realError; });

const noKeyComplaint = () => {
  const keys = complaints.filter((c) => c.includes('same key') || c.includes('unique "key"'));
  expect(keys).toEqual([]);
};

describe('rows that share a label', () => {
  it('the film finder keeps a remake and its original apart', () => {
    const picked: string[] = [];
    const { getByLabelText } = render(
      <FilmFinder
        query="suspiria"
        results={[
          { title: 'Suspiria', year: 1977, posterPath: null },
          { title: 'Suspiria', year: 2018, posterPath: null },
        ]}
        onPick={(f) => picked.push(`${f.title} ${f.year}`)}
      />,
    );

    // Two rows, not one. Asserted on the labels, because that is what separates
    // them for the person picking — the row prints the title and the year, and
    // the title alone is the half they have in common.
    expect(getByLabelText('Suspiria, 1977')).toBeTruthy();
    expect(getByLabelText('Suspiria, 2018')).toBeTruthy();

    // And the second one is the second one.
    fireEvent.press(getByLabelText('Suspiria, 2018'));
    expect(picked).toEqual(['Suspiria 2018']);

    noKeyComplaint();
  });

  it('the series list keeps two parts a member numbered alike apart', () => {
    const opened: string[] = [];
    const { getByText, getAllByText } = render(
      <SeriesList
        title="Ozu, in four parts"
        author={author}
        parts={[
          { n: '2', title: 'The Empty Room' },
          { n: '2', title: 'A Train Leaves' },
        ]}
        onPart={(x) => opened.push(x.title)}
      />,
    );

    expect(getAllByText('2')).toHaveLength(2);
    expect(getByText('The Empty Room')).toBeTruthy();

    fireEvent.press(getByText('A Train Leaves'));
    expect(opened).toEqual(['A Train Leaves']);

    noKeyComplaint();
  });
});

/**
 * ── AND THE ROW WHERE A NAME COMPETES WITH A NUMBER ─────────────────────────
 * `SeriesList`'s meta row is `space-between`: the byline on the left, `3 OF 3`
 * on the right. The byline's NAME sets flexShrink, and in a space-between row
 * that is inert — Yoga shrinks a child only if the CHILD's flexShrink is
 * non-zero, and the byline row's was 0.
 *
 * Measured in a browser at the 30-character handle both clients accept: the
 * count was pushed 104pt past the right edge of a 390pt sheet at normal text
 * size, and 290pt on a 320pt phone at 1.35x. Off the page, every time.
 *
 * jest cannot lay out, so what is held here is the CONTRACT that made the
 * measurement come out right: the shrink is on the wrapper, and the count is
 * pinned. Both halves matter — the shrink alone lets the count shrink too.
 */
describe('the series meta row under a long handle', () => {
  it('shrinks the name and pins the count', () => {
    const { getByText, toJSON } = render(
      <SeriesList
        title="Ozu, in four parts"
        author={{ ...author, name: 'b'.padEnd(30, 'w') }}
        parts={[{ n: 'I', title: 'The Empty Room' }]}
      />,
    );

    const count = getByText(/OF/);
    const flat = (n: { props: { style?: unknown } }) =>
      (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

    // The count does not give way.
    expect(flat(count).flexShrink).toBe(0);

    // THE row — the one this count is actually in, not any row that happens to
    // look like it. A guard that settles for "some View somewhere shrinks" is
    // satisfied by a View that has nothing to do with this one.
    type Node = { props?: { style?: unknown }; children?: unknown[] } | string | null;
    const rows: Array<{ props?: { style?: unknown }; children?: unknown[] }> = [];
    const walk = (n: Node) => {
      if (!n || typeof n === 'string') return;
      const s = (StyleSheet.flatten(n.props?.style) ?? {}) as Record<string, unknown>;
      if (s.justifyContent === 'space-between' && JSON.stringify(n).includes(' OF ')) rows.push(n);
      for (const k of n.children ?? []) walk(k as Node);
    };
    walk(toJSON() as Node);
    expect(rows).toHaveLength(1);

    // Its first child is the box the byline sits in, and that is what gives way.
    const first = rows[0].children?.[0] as { props?: { style?: unknown } };
    expect(StyleSheet.flatten(first.props?.style)).toMatchObject({ flexShrink: 1, minWidth: 0 });
  });
});
