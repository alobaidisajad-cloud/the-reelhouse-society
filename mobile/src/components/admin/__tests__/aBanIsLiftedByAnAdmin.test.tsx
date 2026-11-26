/**
 * aBanIsLiftedByAnAdmin.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * The BAN sheet and its confirmation promised "until an admin lifts it", and nothing could: no
 * screen or function lifted a ban or a suspension. The Tribunal's SANCTIONS lists every member a
 * ban or a suspension holds now (a banned member may have no case open), and LIFT asks for the
 * house's word to the member, who is told. An exile is listed and never lifted by hand.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { SanctionsList, liftRefusal, sanctionWords } from '../SanctionsList';
import reelToast from '@/src/utils/reelToast';
import { ONE_PRESS_MS } from '@/src/utils/onePress';

const mockGetSanctioned = jest.fn();
const mockLift = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    getSanctionedMembers: (...a: unknown[]) => mockGetSanctioned(...a),
    liftSanction: (...a: unknown[]) => mockLift(...a),
  },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const BANNED = { id: 'm-1', username: 'loud_one', avatar_url: null, is_banned: true, exiled: false, suspended_until: null, reason: 'Slurs in three salons.', since: '2026-11-01T00:00:00Z' };
const EXILED = { id: 'm-2', username: 'gone_for_good', avatar_url: null, is_banned: true, exiled: true, suspended_until: null, reason: 'PERMANENT EXILE: Threats.', since: '2026-10-01T00:00:00Z' };

const mount = () => render(
  <QueryClientProvider client={testQueryClient()}>
    <SanctionsList end={0} />
  </QueryClientProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSanctioned.mockResolvedValue([BANNED, EXILED]);
  mockLift.mockResolvedValue(undefined);
});

it('lists each member held, how, and why; an exile with nothing to press', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByText('@loud_one')).toBeTruthy());
  expect(r.getByText('BANNED')).toBeTruthy();
  expect(r.getByText('Slurs in three salons.')).toBeTruthy();
  expect(r.getByText('EXILED · NEVER LIFTED BY HAND')).toBeTruthy();
  expect(r.getByLabelText('Lift the ban on loud_one')).toBeTruthy();
  expect(r.queryByLabelText('Lift the ban on gone_for_good')).toBeNull();
});

it('an admin lifts a ban with a word for the member: the house hears it, and the member leaves the list', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Lift the ban on loud_one')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Lift the ban on loud_one')); });
  // The sheet, headed as the row's act is.
  expect(r.getByRole('header', { name: 'LIFT THE BAN' })).toBeTruthy();
  expect(r.getByText(/may write again at once/)).toBeTruthy();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), 'A second chance, after an apology.'); });
  mockGetSanctioned.mockResolvedValue([EXILED]);
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Lift the ban' })); });
  expect(mockLift).toHaveBeenCalledWith('m-1', 'A second chance, after an apology.');
  await waitFor(() => expect(r.queryByText('@loud_one')).toBeNull());
  expect(reelToast).toHaveBeenCalledWith('Lifted. @loud_one is told, and may write again.');
});

it('a ban lifted meanwhile by another admin leaves the list, said so', async () => {
  mockLift.mockRejectedValue({ code: 'P0002', message: 'NOT_SANCTIONED' });
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Lift the ban on loud_one')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Lift the ban on loud_one')); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), 'Served.'); });
  mockGetSanctioned.mockResolvedValue([EXILED]);
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Lift the ban' })); });
  await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Nothing stands to lift: lifted meanwhile, or run out.'));
  await waitFor(() => expect(r.queryByText('@loud_one')).toBeNull());
});

it('a failed read of the sanctions says so, never an empty list', async () => {
  mockGetSanctioned.mockRejectedValue(new Error('network'));
  const r = mount();
  await waitFor(() => expect(r.getByText('The sanctions could not be read.')).toBeTruthy(), { timeout: 4000 });
});

it('tells the house’s refusals apart, and says how each member is held', () => {
  expect(liftRefusal({ code: 'P0001', message: 'EXILE_STANDS' })).toBe('EXILE_STANDS');
  expect(liftRefusal({ code: 'P0002', message: 'NOT_SANCTIONED' })).toBe('NOT_SANCTIONED');
  expect(liftRefusal(new Error('network'))).toBeNull();
  expect(sanctionWords({ exiled: false, is_banned: false, suspended_until: '2026-12-01T10:00:00Z' })).toMatch(/^SUSPENDED UNTIL /);
});

it('an admin under a sanction of their own is offered no lift of it: another admin must, as the house refuses it', async () => {
  const { useAuthStore } = require('@/src/stores/auth');
  useAuthStore.setState({ user: { id: 'm-1', username: 'loud_one', role: 'admin' } as never });
  try {
    const r = mount();
    await waitFor(() => expect(r.getByText('@loud_one')).toBeTruthy());
    expect(r.getByText('Your own sanction: another admin must lift it.')).toBeTruthy();
    expect(r.queryByLabelText('Lift the ban on loud_one')).toBeNull();
    expect(liftRefusal({ code: '42501', message: 'OWN_CASE' })).toBe('OWN_CASE');
  } finally {
    useAuthStore.setState({ user: null });
  }
});

/** Stage C, every word written is kept: a sheet closed emptied the word for the member. */
describe('the word for the member', () => {
  const { useAuthStore } = require('@/src/stores/auth');
  const { readDraft } = require('@/src/utils/memberDrafts');
  const kept = () => readDraft('admin-9', 'hearing', 'lift:m-1')?.data.body;
  beforeEach(() => {
    require('@/src/stores/mmkv-storage').storage.clearAll();
    useAuthStore.setState({ user: { id: 'admin-9', username: 'keeper', role: 'admin' } as never });
  });
  afterEach(() => { useAuthStore.setState({ user: null }); });

  it('is kept per lift: closed and opened again, the sheet opens on it; lifted, it is let go', async () => {
    const r = mount();
    await waitFor(() => expect(r.getByLabelText('Lift the ban on loud_one')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Lift the ban on loud_one')); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), 'A second chance, after an apology.'); });
    const xs = r.getAllByLabelText('Close');
    await act(async () => { await fireEvent.press(xs[xs.length - 1]!); });
    expect(kept()).toBe('A second chance, after an apology.');
    // A press on the same act again is heard once the one-press window has passed (onePress).
    await act(async () => { await new Promise((done) => setTimeout(done, ONE_PRESS_MS)); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Lift the ban on loud_one')); });
    expect(r.getByLabelText('your word to the member').props.value).toBe('A second chance, after an apology.');
    mockGetSanctioned.mockResolvedValue([EXILED]);
    await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Lift the ban' })); });
    await waitFor(() => expect(r.queryByText('@loud_one')).toBeNull());
    expect(kept()).toBeUndefined();
  });
});
