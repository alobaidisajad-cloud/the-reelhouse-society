/**
 * aDocketReadAgainKeepsItsLaterPages.test.tsx — a list read again keeps the pages read past its first
 * ─────────────────────────────────────────────────────────────────────────────
 * The Tribunal's SANCTIONS and APPEALS, and a member's own record of verdicts, are read page by page.
 * Each is read again when something in it changes (a member lifted, an appeal heard, an appeal filed).
 * Read again by its first page alone, each would lose every page the member had read past it; read
 * again, each comes back as far as the member had read, as the house now holds it.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { SanctionsList } from '../SanctionsList';
import { AppealsDocket } from '../AppealsDocket';
import { VerdictRecord, myVerdictsKey } from '@/src/components/moderation/VerdictRecord';
import { useAuthStore } from '@/src/stores/auth';

const mockSanctioned = jest.fn();
const mockLift = jest.fn();
const mockAppeals = jest.fn();
const mockVerdicts = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    getSanctionedMembers: (...a: unknown[]) => mockSanctioned(...a),
    liftSanction: (...a: unknown[]) => mockLift(...a),
    getPendingAppeals: (...a: unknown[]) => mockAppeals(...a),
    getMyVerdicts: (...a: unknown[]) => mockVerdicts(...a),
  },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

/** The house: its rows in order, read after a cursor's row, at most 50 at a time. */
function house<T extends { id: string }>(rows: T[]) {
  return async (after: { id: string } | undefined, size: number) => {
    const from = after ? rows.findIndex((r) => r.id === after.id) + 1 : 0;
    return rows.slice(from, from + Math.min(size, 50));
  };
}
const n45 = Array.from({ length: 45 }, (_, i) => i + 1);

/** Presses MORE until the list is read to its end, each page landed before the next is asked. */
async function readToTheEnd(r: ReturnType<typeof render>, more: string, last: string) {
  for (let i = 0; i < 5 && r.queryByLabelText(more); i++) {
    await act(async () => { await fireEvent.press(r.getByLabelText(more)); });
    await waitFor(() => expect(r.queryByLabelText(more)?.props.accessibilityState?.busy ?? false).toBe(false));
  }
  await waitFor(() => expect(r.getByText(last)).toBeTruthy());
  expect(r.queryByLabelText(more)).toBeNull();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLift.mockResolvedValue(undefined);
});

it('SANCTIONS: a member lifted reads the list again as far as the admin had read, not its first page alone', async () => {
  const held = n45.map((i) => ({ id: `m-${i}`, username: `held_${i}`, avatar_url: null, is_banned: true, exiled: false, suspended_until: null, reason: `Reason ${i}.`, since: '2026-11-01T00:00:00Z' }));
  let rows = held;
  mockSanctioned.mockImplementation((after, size) => house(rows)(after, size));
  const r = render(<QueryClientProvider client={testQueryClient()}><SanctionsList end={0} /></QueryClientProvider>);
  await waitFor(() => expect(r.getByText('@held_1')).toBeTruthy());
  await readToTheEnd(r, 'Load more members', '@held_45');
  expect(r.getByText('@held_45')).toBeTruthy();

  await act(async () => { await fireEvent.press(r.getByLabelText('Lift the ban on held_2')); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), 'Served.'); });
  rows = held.filter((m) => m.id !== 'm-2');
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Lift the ban' })); });
  await waitFor(() => expect(r.queryByText('@held_2')).toBeNull());
  await waitFor(() => expect(mockSanctioned.mock.calls.filter(([after]) => after === undefined)).toHaveLength(2));
  expect(r.getByText('@held_45')).toBeTruthy();
  expect(r.getByText('@held_31')).toBeTruthy();
});

it('APPEALS: read again after a hearing, the docket keeps the appeals read past its first page', async () => {
  // One page and a part of one: a second MORE pressed at once is a double tap, and waits.
  let rows = n45.slice(0, 35).map((i) => ({
    id: `verdict-${i}`, action: 'warn', reason: `Verdict ${i}.`, created_at: '2026-11-10T10:00:00Z', duration_hours: null, expires_at: null, lifted_at: null,
    appeal: `Appeal ${i}.`, appeal_filed_at: `2026-11-11T09:${String(i).padStart(2, '0')}:00Z`, ruled_by_you: false, ruled_by: 'moderator_two',
    member: { id: `member-${i}`, username: `appealing_${i}`, avatar_url: null, is_banned: false, exiled: false, suspended_until: null },
    case: { content_type: 'lounge_message', reason: 'harassment', details: null }, removed: null, restorable: false,
  }));
  mockAppeals.mockImplementation((after, size) => house(rows)(after, size));
  const client = testQueryClient();
  const r = render(<QueryClientProvider client={client}><AppealsDocket adminId="admin-1" end={0} /></QueryClientProvider>);
  await waitFor(() => expect(r.getByText('Appeal 1.')).toBeTruthy());
  await readToTheEnd(r, 'Load more appeals', 'Appeal 35.');
  expect(r.getByText('Appeal 35.')).toBeTruthy();
  // Another moderator heard the third meanwhile: the docket is read again without it.
  rows = rows.filter((a) => a.id !== 'verdict-3');
  await act(async () => { await client.invalidateQueries({ queryKey: ['admin', 'appeals'] }); });
  await waitFor(() => expect(mockAppeals.mock.calls.filter(([after]) => after === undefined)).toHaveLength(2));
  expect(r.getByText('Appeal 35.')).toBeTruthy();
  expect(r.getByText('Appeal 21.')).toBeTruthy();
  expect(r.queryByText('Appeal 3.')).toBeNull();
});

it('A MEMBER’S RECORD: read again after an appeal is filed, the record keeps the verdicts read past its first page', async () => {
  useAuthStore.setState({ user: { id: 'member-2', username: 'two' } as never });
  let rows = n45.map((i) => ({
    id: `v-${i}`, action: 'warn', reason: `Warned ${i}.`, created_at: new Date(2026, 10, 18, 12).toISOString(), duration_hours: null,
    expires_at: null, lifted_at: null, appeal_status: null as string | null, content_type: 'lounge_message',
  }));
  mockVerdicts.mockImplementation((after, size) => house(rows)(after, size));
  const client = testQueryClient();
  const r = render(<QueryClientProvider client={client}><VerdictRecord /></QueryClientProvider>);
  await waitFor(() => expect(r.getByText('Warned 1.')).toBeTruthy());
  await readToTheEnd(r, 'Read more of your record', 'Warned 45.');
  expect(r.getByText('Warned 45.')).toBeTruthy();
  // The member appealed the second: their record is read again, that verdict awaiting the Tribunal.
  rows = rows.map((v) => (v.id === 'v-2' ? { ...v, appeal_status: 'pending' } : v));
  await act(async () => { await client.invalidateQueries({ queryKey: myVerdictsKey('member-2') }); });
  await waitFor(() => expect(mockVerdicts.mock.calls.filter(([after]) => after === undefined)).toHaveLength(2));
  await waitFor(() => expect(r.getAllByLabelText(/your appeal awaits the tribunal/)).toBeTruthy());
  expect(r.getByText('Warned 45.')).toBeTruthy();
  useAuthStore.setState({ user: null });
});
