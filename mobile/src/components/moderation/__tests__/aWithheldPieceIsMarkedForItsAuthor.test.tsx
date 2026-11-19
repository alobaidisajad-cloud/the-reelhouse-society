/**
 * aWithheldPieceIsMarkedForItsAuthor.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A piece the house withholds is read by its author alone. Wherever they read it (its own page, a
 * critique of theirs, a row of their room) it is marked as withheld, never shown as if it stood public:
 * a member must never believe others can read what the house withholds. The page's banner says so,
 * names until when it is kept unappealed (or that it waits for its hearing), and opens the verdict whole.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '@/src/stores/auth';
import { WITHHELD_TITLE, WithheldBanner, WithheldStamp, useWithheldSaid, withheldLine } from '../WithheldBanner';

const mockMine = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: { getMyWithheldPieces: (...a: unknown[]) => mockMine(...a) },
}));
// The verdict sheet is under test in its own file: here, which verdict the banner opens.
jest.mock('@/src/components/moderation/VerdictSheet', () => {
  const actual = jest.requireActual('@/src/components/moderation/VerdictSheet');
  const { Text: T } = require('react-native');
  return { ...actual, VerdictSheet: ({ verdictId }: { verdictId: string | null }) => (verdictId ? <T testID="verdict-sheet">{verdictId}</T> : null) };
});

const LOG = '55555555-5555-4555-8555-555555555555';
const VERDICT = '66666666-6666-4666-8666-666666666666';
const piece = (over: Record<string, unknown> = {}) => ({ kind: 'log', piece_id: LOG, verdict_id: VERDICT, appeal_by: '2026-12-18T10:00:00Z', appealed: false, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'member-2', username: 'two' } as never });
  mockMine.mockResolvedValue([piece()]);
});
afterEach(() => useAuthStore.setState({ user: null }));

it('the author reads their withheld log marked so: who can read it, until when it is kept, and its verdict a tap away', async () => {
  const r = render(<WithheldBanner pieceId={LOG} />);
  await waitFor(() => expect(r.getByRole('button', { name: 'Read the verdict' })).toBeTruthy());
  expect(r.getByText(WITHHELD_TITLE)).toBeTruthy();
  expect(r.getByText(/^No one but you can read this\. Appeal by .+ and it is kept whole until your appeal is heard; unappealed, it is deleted then\.$/)).toBeTruthy();
  expect(r.getByLabelText(/^Withheld by the house\. No one but you can read this\. Appeal by /)).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Read the verdict' })); });
  expect(r.getByTestId('verdict-sheet').props.children).toBe(VERDICT);
});

it('appealed, the banner says it is kept until the hearing', async () => {
  mockMine.mockResolvedValue([piece({ appeal_by: null, appealed: true })]);
  const r = render(<WithheldBanner pieceId={LOG} compact />);
  await waitFor(() => expect(r.getByText('No one but you can read this. It is kept whole until your appeal is heard.')).toBeTruthy());
});

it('the page’s own row says it is withheld before the member’s list is read: the mark stands, the verdict waits', async () => {
  mockMine.mockReturnValue(new Promise(() => {}));
  const r = render(<WithheldBanner pieceId={LOG} withheldAt="2026-11-18T10:00:00Z" />);
  expect(r.getByText(WITHHELD_TITLE)).toBeTruthy();
  expect(r.getByText('No one but you can read this.')).toBeTruthy();
  expect(r.queryByRole('button', { name: 'Read the verdict' })).toBeNull();
});

it('a piece that stands carries no mark', async () => {
  mockMine.mockResolvedValue([]);
  const r = render(<WithheldBanner pieceId={LOG} withheldAt={null} />);
  await act(async () => {});
  expect(r.queryByText(WITHHELD_TITLE)).toBeNull();
});

it('a row of the member’s room is stamped, and says so', async () => {
  function Row({ id }: { id: string }) {
    const said = useWithheldSaid(id);
    return <><WithheldStamp pieceId={id} /><Text>{`row${said}`}</Text></>;
  }
  const r = render(<><Row id={LOG} /><Row id="other" /></>);
  // The stamp is said by its row's label, so it is drawn but not a stop of its own.
  await waitFor(() => expect(r.getByText('WITHHELD', { includeHiddenElements: true })).toBeTruthy());
  expect(r.getByText('row, withheld by the house')).toBeTruthy();
  expect(r.getByText('row')).toBeTruthy();
  expect(r.getAllByText('WITHHELD', { includeHiddenElements: true })).toHaveLength(1);
});

it('says each state in plain words', () => {
  expect(withheldLine(null)).toBe('No one but you can read this.');
  expect(withheldLine({ appeal_by: null, appealed: true })).toBe('No one but you can read this. It is kept whole until your appeal is heard.');
});

it('a critique of theirs is marked under its words, its verdict and WITHDRAW each a control of their own', async () => {
  const { CritiqueRow } = require('@/src/components/critique/CritiqueRow');
  mockMine.mockResolvedValue([piece({ kind: 'log_comment', piece_id: 'c1' })]);
  const r = render(
    <CritiqueRow c={{ id: 'c1', user_id: 'member-2', username: 'two', avatar_url: null, body: 'Cold is not unfeeling.', created_at: '2026-09-30T12:00:00Z' }}
      currentUserId="member-2" onPressUser={jest.fn()} onWithdraw={jest.fn()} />,
  );
  await waitFor(() => expect(r.getByRole('button', { name: 'Read the verdict' })).toBeTruthy());
  expect(r.getByText(WITHHELD_TITLE)).toBeTruthy();
  expect(r.getByLabelText('Withdraw your critique')).toBeTruthy();
});

it('the list outlives a restart: the phone keeps it in its stored cache, and a row read from that store still finds its piece', async () => {
  const { QueryClientProvider, dehydrate, hydrate } = require('@tanstack/react-query');
  const { testQueryClient } = require('@/test-utils/testQueryClient');
  const { keepsQuery } = require('@/src/lib/queryClient');
  const { myWithheldKey } = require('@/src/hooks/useMyWithheld');
  function Row({ id }: { id: string }) {
    const said = useWithheldSaid(id);
    return <><WithheldStamp pieceId={id} /><Text>{`row${said}`}</Text></>;
  }
  // Read once, as a page reads it.
  const before = testQueryClient();
  const first = render(<QueryClientProvider client={before}><WithheldBanner pieceId={LOG} /></QueryClientProvider>);
  await waitFor(() => expect(first.getByRole('button', { name: 'Read the verdict' })).toBeTruthy());
  first.unmount();
  // Written to the store as text and read back at the next start, with no word from the house yet.
  const stored = JSON.parse(JSON.stringify(dehydrate(before, { shouldDehydrateQuery: keepsQuery })));
  const after = testQueryClient();
  hydrate(after, stored);
  mockMine.mockReturnValue(new Promise(() => {}));
  expect(after.getQueryData(myWithheldKey('member-2'))).toEqual([piece()]);
  const r = render(<QueryClientProvider client={after}><Row id={LOG} /></QueryClientProvider>);
  expect(r.getByText('row, withheld by the house')).toBeTruthy();
  expect(r.getAllByText('WITHHELD', { includeHiddenElements: true })).toHaveLength(1);
});
