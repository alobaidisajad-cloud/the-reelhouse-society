/**
 * anAppealIsHeardByAnotherModerator.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * The owner decided (2026-11-19): a member's one appeal of a verdict goes to the Tribunal, and is
 * judged by a moderator other than the one who ruled; the member is told the outcome. The APPEALS
 * docket shows each appeal with what a hearing needs; the moderator who gave the verdict is told
 * they may not hear it (and offered nothing to press); another upholds or overturns it with a word
 * for the member. A hearing crossed by another moderator's leaves the docket, said so.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { AppealsDocket, hearingRefusal, overturnSays, waitingForAnotherSays } from '../AppealsDocket';
import reelToast from '@/src/utils/reelToast';

const mockGetPendingAppeals = jest.fn();
const mockJudgeAppeal = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    getPendingAppeals: (...a: unknown[]) => mockGetPendingAppeals(...a),
    judgeAppeal: (...a: unknown[]) => mockJudgeAppeal(...a),
  },
}));
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const appeal = (over: Record<string, unknown> = {}) => ({
  id: 'verdict-1', action: 'suspend', reason: 'Abusive replies in three salons, after a warning.', created_at: '2026-11-10T10:00:00Z',
  duration_hours: 720, expires_at: '2026-12-10T10:00:00Z', lifted_at: null,
  appeal: 'I was answering a member who had abused me first; the house saw only my answer.', appeal_filed_at: '2026-11-11T09:00:00Z',
  ruled_by_you: false, ruled_by: 'moderator_two',
  member: { id: 'member-1', username: 'answered_back', avatar_url: null, is_banned: false, exiled: false, suspended_until: '2026-12-10T10:00:00Z' },
  case: { content_type: 'lounge_message', reason: 'harassment', details: 'Called me names.' }, removed: null, restorable: false,
  ...over,
});

const mount = () => render(
  <QueryClientProvider client={testQueryClient()}>
    <AppealsDocket adminId="admin-1" end={0} />
  </QueryClientProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPendingAppeals.mockResolvedValue([appeal()]);
  mockJudgeAppeal.mockResolvedValue(undefined);
});

it('an appeal shows the member, how they stand, the verdict whole, the case and the appeal', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByText('MEMBERSHIP PAUSED · 720 HOURS')).toBeTruthy());
  expect(r.getByText('@answered_back')).toBeTruthy();
  expect(r.getByText(/^SUSPENDED UNTIL /)).toBeTruthy();
  expect(r.getByText('Abusive replies in three salons, after a warning.')).toBeTruthy();
  expect(r.getByText(/BY @MODERATOR_TWO/)).toBeTruthy();
  expect(r.getByText('Called me names.')).toBeTruthy();
  expect(r.getByText('I was answering a member who had abused me first; the house saw only my answer.')).toBeTruthy();
});

it('the moderator who gave the verdict is told they may not hear it, and offered nothing to press', async () => {
  mockGetPendingAppeals.mockResolvedValue([appeal({ ruled_by_you: true })]);
  const r = mount();
  await waitFor(() => expect(r.getByText('You gave this verdict: another moderator must hear its appeal.')).toBeTruthy());
  expect(r.queryByLabelText('Uphold the verdict')).toBeNull();
  expect(r.queryByLabelText('Overturn the verdict')).toBeNull();
});

it('another moderator overturns it with a word for the member: the house hears it, and the appeal leaves', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Overturn the verdict')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Overturn the verdict')); });
  expect(r.getByText('OVERTURN THE VERDICT')).toBeTruthy();
  expect(r.getByText(/The pause it set no longer holds/)).toBeTruthy();
  // No word, no act.
  expect(r.getByRole('button', { name: 'Overturn the verdict', disabled: true })).toBeTruthy();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), '  The provocation was plain in the room.  '); });
  mockGetPendingAppeals.mockResolvedValue([]);
  const acts = r.getAllByRole('button', { name: 'Overturn the verdict' });
  const sheetAct = acts[acts.length - 1];
  expect(sheetAct).toBeDefined();
  await act(async () => { await fireEvent.press(sheetAct!); });
  expect(mockJudgeAppeal).toHaveBeenCalledWith('verdict-1', 'overturned', 'The provocation was plain in the room.');
  await waitFor(() => expect(r.getByText('No appeal waits. The house rests.')).toBeTruthy());
  expect(reelToast).toHaveBeenCalledWith('The verdict is overturned. The member is told.');
});

it('a hearing another moderator gave first leaves the docket, said so', async () => {
  mockJudgeAppeal.mockRejectedValue({ code: 'P0002', message: 'ALREADY_JUDGED' });
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Uphold the verdict')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Uphold the verdict')); });
  await act(async () => { await fireEvent.changeText(r.getByLabelText('your word to the member'), 'It stands.'); });
  mockGetPendingAppeals.mockResolvedValue([]);
  // The sheet's act, drawn after the card's.
  const acts = r.getAllByRole('button', { name: 'Uphold the verdict' });
  const sheetAct = acts[acts.length - 1];
  expect(sheetAct).toBeDefined();
  await act(async () => { await fireEvent.press(sheetAct!); });
  await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Already heard by another moderator.'));
  await waitFor(() => expect(r.queryByText('I was answering a member who had abused me first; the house saw only my answer.')).toBeNull());
});

it('a failed read of the appeals says so, never an empty docket', async () => {
  mockGetPendingAppeals.mockRejectedValue(new Error('network'));
  const r = mount();
  await waitFor(() => expect(r.getByText('The appeals could not be read.')).toBeTruthy(), { timeout: 4000 });
  expect(r.queryByText('No appeal waits. The house rests.')).toBeNull();
});

it('tells the house’s refusals apart, and says what overturning each verdict does', () => {
  expect(hearingRefusal({ code: '42501', message: 'OWN_VERDICT' })).toBe('OWN_VERDICT');
  expect(hearingRefusal({ code: 'P0002', message: 'ALREADY_JUDGED' })).toBe('ALREADY_JUDGED');
  expect(hearingRefusal({ code: 'P0002', message: 'VERDICT_GONE' })).toBe('VERDICT_GONE');
  expect(hearingRefusal(new Error('network'))).toBeNull();
  expect(overturnSays({ action: 'warn', restorable: false })).toMatch(/warning is withdrawn/);
  expect(overturnSays({ action: 'delete_content', restorable: true })).toMatch(/put back where it stood/);
  expect(overturnSays({ action: 'delete_content', restorable: false })).toMatch(/words are kept for the member/);
});

it('the hearing sheet asks for the house’s word before it acts, and says what upholding does', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Uphold the verdict')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Uphold the verdict')); });
  expect(r.getByRole('header', { name: 'UPHOLD THE VERDICT' })).toBeTruthy();
  expect(r.getByText('The verdict stands as given. The member is told, with your word.')).toBeTruthy();
  const acts = r.getAllByRole('button', { name: 'Uphold the verdict' });
  const sheetAct = acts[acts.length - 1];
  expect(sheetAct).toBeDefined();
  expect(sheetAct!.props.accessibilityState).toMatchObject({ disabled: true });
  expect(mockJudgeAppeal).not.toHaveBeenCalled();
});

it('a removal withheld for its hearing is given back whole if overturned, and deleted if upheld: each sheet says which', async () => {
  mockGetPendingAppeals.mockResolvedValue([appeal({ action: 'delete_content', duration_hours: null, expires_at: null, withheld: true, restorable: true, removed: { body: 'rh the review' } })]);
  expect(overturnSays({ action: 'delete_content', restorable: true, withheld: true })).toMatch(/given back whole, its critiques and marks with it/);
  const r = mount();
  await waitFor(() => expect(r.getByText('WHAT IT REMOVED · WITHHELD WHOLE FOR THIS HEARING')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Uphold the verdict')); });
  expect(r.getByText('The verdict stands as given: the piece it withheld is deleted now. The member is told, with your word.')).toBeTruthy();
});

it('a moderator is offered no hearing of an appeal of a verdict about themselves, as the house refuses it', async () => {
  mockGetPendingAppeals.mockResolvedValue([appeal({ ruled_by_you: false, refused: 'OWN_CASE' })]);
  const r = mount();
  await waitFor(() => expect(r.getByText('This verdict is about you: another moderator must hear its appeal.')).toBeTruthy());
  expect(r.queryByLabelText('Uphold the verdict')).toBeNull();
  expect(r.queryByLabelText('Overturn the verdict')).toBeNull();
  expect(hearingRefusal({ code: '42501', message: 'OWN_CASE' })).toBe('OWN_CASE');
});

it('the house’s only moderator reads which appeals wait for another: each card, and the docket above them', async () => {
  mockGetPendingAppeals.mockResolvedValue([
    appeal({ ruled_by_you: true, refused: 'OWN_VERDICT', no_moderator_yet: true }),
    appeal({ id: 'v-2', ruled_by_you: false, refused: null, no_moderator_yet: false }),
  ]);
  const r = mount();
  await waitFor(() => expect(r.getByText('One appeal here waits for another moderator: you may not hear it.')).toBeTruthy());
  expect(r.getByText('You gave this verdict: another moderator must hear its appeal. None may yet: it waits for another moderator to be appointed.')).toBeTruthy();
  // The other may be heard: its acts are there, once.
  expect(r.getAllByLabelText('Uphold the verdict')).toHaveLength(1);
  expect(waitingForAnotherSays([{ refused: 'OWN_CASE', ruled_by_you: false }, { refused: 'OWN_VERDICT', ruled_by_you: true }]))
    .toBe('2 appeals here wait for another moderator: you may not hear them.');
  expect(waitingForAnotherSays([{ refused: null, ruled_by_you: false }])).toBeNull();
});
