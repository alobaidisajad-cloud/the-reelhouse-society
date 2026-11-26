/**
 * aCritiqueMovesTheRowsOwnCount.test.tsx — review round 8, FilingRow's critique count.
 * ─────────────────────────────────────────────────────────────────────────────
 * A list that holds its own copy of a filing (a member's room, a film's archive) printed the
 * critique count it read for good: the member critiqued the filing from it, came back, and the
 * row still said one critique beside the paper's two. Such a row is handed the member's critiques
 * on the filing when it was read (critiquedAtRead) and moves its count by what they have moved
 * since. The paper's own copy is moved in place by the store, and is handed nothing: it is never
 * moved twice.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

import { FilingRow } from '../FilingRow';
import { useDispatch } from '@/src/stores/dispatch';
import { parseFilingRows } from '@/src/stores/dispatchTypes';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));

const row = (id: string, body: string) => ({
  id, kind: 'take', user_id: 'u2', author_username: 'tomasreyes',
  title: null, body,
  source: null, source_url: null, options: null, closes_at: null,
  frozen_totals: null, answer_id: null,
  series_id: null, series_title: null, part_number: null,
  spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 0, comment_count: 1,
  created_at: '2026-08-28T12:00:00.000Z', edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'free', role: null, is_founding: false },
});

const { filings } = parseFilingRows([row('held', 'A take a room holds.'), row('paper', 'A take on the paper.')]);
const held = filings[0];
const paper = filings[1];

beforeEach(() => {
  useDispatch.setState({ critiqued: {}, acted: {} } as never);
});

/** Both rows: the first as a room draws it (read when the member had critiqued it `atRead` times), the second as the paper does. */
const draw = (atRead: number) => {
  expect(held).toBeDefined();
  expect(paper).toBeDefined();
  const common = { width: 390, order: '21:00', orderIs: 'hour' as const, certified: false, saved: false, member: true, noByline: true };
  return render(
    <>
      <FilingRow f={held!} {...common} critiquedAtRead={atRead} />
      <FilingRow f={paper!} {...common} />
    </>,
  );
};
/** Each row's critique control, as it is read aloud, in order. */
const counts = (r: ReturnType<typeof render>) =>
  r.getAllByLabelText(/^Critique/).map((n) => n.props.accessibilityLabel as string);

it('a critique written from a room moves that row by one, and the paper\'s row is never moved twice', async () => {
  const r = draw(0);
  expect(counts(r)).toEqual(['Critique. 1 critique', 'Critique. 1 critique']);
  // Written from the room: the store counts it; the paper's copy is moved in place by the store.
  await act(async () => { useDispatch.setState({ critiqued: { held: 1, paper: 1 } } as never); });
  expect(counts(r)).toEqual(['Critique. 2 critiques', 'Critique. 1 critique']);
  // Refused, the store moves it back, and the room's row with it.
  await act(async () => { useDispatch.setState({ critiqued: { held: 0, paper: 0 } } as never); });
  expect(counts(r)).toEqual(['Critique. 1 critique', 'Critique. 1 critique']);
});

it('a critique taken back from a room moves that row down by one, never below none', async () => {
  const r = draw(0);
  await act(async () => { useDispatch.setState({ critiqued: { held: -1 } } as never); });
  expect(counts(r)).toEqual(['Critique', 'Critique. 1 critique']);
  await act(async () => { useDispatch.setState({ critiqued: { held: -2 } } as never); });
  expect(counts(r)).toEqual(['Critique', 'Critique. 1 critique']);
});

it('a row handed its list\'s old copy draws what the member\'s act left: the amended words, then the withdrawal', async () => {
  const r = draw(0);
  const drawn = () => JSON.stringify(r.toJSON());
  expect(drawn()).toContain('A take a room holds.');
  const left = { title: null, fullContent: null, source: null, sourceUrl: null, spoilerLabel: null, film: null, endedBy: null };
  await act(async () => { useDispatch.setState({ acted: { held: { ...left, body: 'The take, amended.', endedAt: null, editedAt: '2026-11-16T09:00:00Z' } } } as never); });
  expect(drawn()).toContain('The take, amended.');
  expect(drawn()).not.toContain('A take a room holds.');
  await act(async () => { useDispatch.setState({ acted: { held: { ...left, body: '', endedAt: '2026-11-16T10:00:00Z', endedBy: 'author', editedAt: null } } } as never); });
  expect(drawn()).not.toContain('The take, amended.');
  expect(drawn()).toContain('A take on the paper.');
});

it('a row read after the member\'s critique is not moved by it again, only by one written since', async () => {
  // The house's count already holds the member's critique: read with it, the row prints it once.
  useDispatch.setState({ critiqued: { held: 1 } } as never);
  const r = draw(1);
  expect(counts(r)).toEqual(['Critique. 1 critique', 'Critique. 1 critique']);
  await act(async () => { useDispatch.setState({ critiqued: { held: 2 } } as never); });
  expect(counts(r)).toEqual(['Critique. 2 critiques', 'Critique. 1 critique']);
});
