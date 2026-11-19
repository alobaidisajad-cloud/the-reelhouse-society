/**
 * aMemberReadsTheVerdictWholeAndAppealsOnce.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A member warned, suspended or banned could not read the house's reason in the app: the notice was
 * cut at three lines and opened nothing, and there was no appeal. The verdict sheet reads it whole:
 * what the house did, for how long, the reason in full, what it removed; the member writes one
 * appeal (their words kept as they write), and reads how it stands: waiting, upheld or overturned,
 * with the Tribunal's word. A second appeal is never offered, and one the house refuses is said.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { useAuthStore } from '@/src/stores/auth';
import { VerdictSheet, appealByWords, appealRefusal, appealWaitsSays, overturnedSays, verdictHeading, withheldSays } from '../VerdictSheet';
import { formatDate } from '@/src/utils/timeAgo';
import reelToast from '@/src/utils/reelToast';

const mockGetMyVerdict = jest.fn();
const mockFileAppeal = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    getMyVerdict: (...a: unknown[]) => mockGetMyVerdict(...a),
    fileAppeal: (...a: unknown[]) => mockFileAppeal(...a),
  },
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const VERDICT = '44444444-4444-4444-8444-444444444444';
const REASON = 'Your replies in The Back Row named another member in words the house does not allow, after a warning in October. '
  + 'The house keeps its rooms for argument about films, never about the members who make them.';
const verdict = (over: Record<string, unknown> = {}) => ({
  id: VERDICT, action: 'suspend', reason: REASON, created_at: '2026-11-18T10:00:00Z', duration_hours: 24,
  expires_at: '2026-11-19T10:00:00Z', removed: null, restorable: false, lifted_at: null, lift_reason: null,
  appeal: null, can_appeal: true, ...over,
});

const mount = (onClose = jest.fn()) => render(
  <QueryClientProvider client={testQueryClient()}>
    <VerdictSheet verdictId={VERDICT} onClose={onClose} />
  </QueryClientProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'member-1', username: 'answered_back' } as never });
  mockGetMyVerdict.mockResolvedValue(verdict());
  mockFileAppeal.mockResolvedValue(undefined);
});
afterEach(() => useAuthStore.setState({ user: null }));

it('the member reads the verdict whole: what the house did, until when, and the reason in full', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByText('MEMBERSHIP PAUSED · 24 HOURS')).toBeTruthy());
  expect(mockGetMyVerdict).toHaveBeenCalledWith(VERDICT);
  expect(r.getByText(REASON)).toBeTruthy();
  expect(r.getByText(/UNTIL /)).toBeTruthy();
  expect(r.getByText(/You may appeal this verdict once\. A moderator other than the one who ruled will hear it/)).toBeTruthy();
});

it('the member files one appeal in their own words, and reads it waiting for the Tribunal', async () => {
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Your appeal')).toBeTruthy());
  // Nothing written, nothing to file.
  expect(r.getByRole('button', { name: 'File the appeal', disabled: true })).toBeTruthy();
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your appeal'), '  He called me worse first; the house saw only my answer.  '); });
  mockGetMyVerdict.mockResolvedValue(verdict({
    can_appeal: false,
    appeal: { text: 'He called me worse first; the house saw only my answer.', filed_at: '2026-11-18T12:00:00Z', status: 'pending', judged_at: null, note: null },
  }));
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'File the appeal' })); });
  expect(mockFileAppeal).toHaveBeenCalledWith(VERDICT, 'He called me worse first; the house saw only my answer.');
  await waitFor(() => expect(r.getByText('YOUR APPEAL · AWAITING THE TRIBUNAL')).toBeTruthy());
  expect(r.queryByLabelText('Your appeal')).toBeNull();
  expect(reelToast).toHaveBeenCalledWith('Your appeal is filed. The Tribunal will hear it.');
});

it('an appeal the house could not take keeps the member’s words in the box', async () => {
  mockFileAppeal.mockRejectedValue(new Error('Network request failed'));
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Your appeal')).toBeTruthy());
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your appeal'), 'My words.'); });
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'File the appeal' })); });
  expect(reelToast.error).toHaveBeenCalledWith('Your appeal could not be filed. Your words are kept: try again.');
  expect(r.getByLabelText('Your appeal').props.value).toBe('My words.');
});

it('an appeal already filed elsewhere is said, and read as it stands', async () => {
  mockFileAppeal.mockRejectedValue({ code: 'P0002', message: 'ALREADY_APPEALED' });
  const r = mount();
  await waitFor(() => expect(r.getByLabelText('Your appeal')).toBeTruthy());
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your appeal'), 'Twice.'); });
  mockGetMyVerdict.mockResolvedValue(verdict({
    can_appeal: false,
    appeal: { text: 'Once, from the other phone.', filed_at: '2026-11-18T12:00:00Z', status: 'pending', judged_at: null, note: null },
  }));
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'File the appeal' })); });
  expect(reelToast).toHaveBeenCalledWith('This verdict has already been appealed.');
  await waitFor(() => expect(r.getByText('Once, from the other phone.')).toBeTruthy());
});

it('the outcome is read with the Tribunal’s word: overturned, a removal’s words handed back', async () => {
  mockGetMyVerdict.mockResolvedValue(verdict({
    action: 'delete_content', duration_hours: null, expires_at: null, can_appeal: false,
    removed: { title: 'Vertigo', body: 'The review the house removed.' }, restorable: false, lifted_at: '2026-11-19T09:00:00Z',
    appeal: { text: 'It was a review.', filed_at: '2026-11-18T12:00:00Z', status: 'overturned', judged_at: '2026-11-19T09:00:00Z', note: 'Harsh, not hateful.' },
  }));
  const r = mount();
  await waitFor(() => expect(r.getByText('YOUR APPEAL · THE VERDICT IS OVERTURNED')).toBeTruthy());
  expect(r.getByText('A PIECE REMOVED')).toBeTruthy();
  expect(r.getByText('Harsh, not hateful.')).toBeTruthy();
  expect(r.getByText('The review the house removed.')).toBeTruthy();
  expect(r.getByText('Your words are kept above, to file again.')).toBeTruthy();
});

it('a verdict no longer on the record is said so; one that could not be read is asked again', async () => {
  mockGetMyVerdict.mockRejectedValue({ code: 'P0002', message: 'VERDICT_GONE' });
  const gone = mount();
  await waitFor(() => expect(gone.getByText('This verdict is no longer on your record.')).toBeTruthy());
  await gone.unmount();
  mockGetMyVerdict.mockRejectedValue(new Error('network'));
  const failed = mount();
  await waitFor(() => expect(failed.getByText('The verdict could not be read.')).toBeTruthy(), { timeout: 5000 });
  expect(failed.getByLabelText(/read the verdict/i)).toBeTruthy();
});

it('the sheet closes on its way out', async () => {
  const onClose = jest.fn();
  const r = mount(onClose);
  await waitFor(() => expect(r.getByText(REASON)).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Close')); });
  expect(onClose).toHaveBeenCalled();
});

it('heads each verdict as what it is, and tells the house’s refusals apart', () => {
  expect(verdictHeading({ action: 'warn', duration_hours: null })).toBe('A FORMAL WARNING');
  expect(verdictHeading({ action: 'suspend', duration_hours: 1 })).toBe('MEMBERSHIP PAUSED · 1 HOUR');
  expect(verdictHeading({ action: 'ban', duration_hours: null })).toBe('MEMBERSHIP CLOSED');
  expect(verdictHeading({ action: 'permanent_exile', duration_hours: null })).toBe('PERMANENTLY CLOSED');
  expect(appealRefusal({ code: 'P0002', message: 'ALREADY_APPEALED' })).toBe('ALREADY_APPEALED');
  expect(appealRefusal({ code: 'P0002', message: 'VERDICT_GONE' })).toBe('VERDICT_GONE');
  expect(appealRefusal(new Error('x'))).toBeNull();
});

it('a piece removed is said withheld, not deleted: seen by its author alone, kept whole until the appeal window ends or the appeal is heard', async () => {
  mockGetMyVerdict.mockResolvedValue(verdict({
    action: 'delete_content', duration_hours: null, expires_at: null,
    removed: { title: 'Vertigo', body: 'The review the house withheld.' }, restorable: true,
    withheld: true, appeal_by: '2026-12-18T10:00:00Z',
  }));
  const r = mount();
  await waitFor(() => expect(r.getByText('WITHHELD, NOT DELETED')).toBeTruthy());
  expect(r.getByText(/^No one but you can see it\. Appeal by .+ and it is kept whole until your appeal is heard; unappealed, it is deleted then\. Overturned, it returns whole, its critiques and marks with it\.$/)).toBeTruthy();
  expect(withheldSays({ appeal_by: null, appeal: { text: 'x', filed_at: '2026-11-18T12:00:00Z', status: 'pending', judged_at: null, note: null } }))
    .toBe('No one but you can see it. It is kept whole until your appeal is heard. Overturned, it returns whole, its critiques and marks with it.');
});

it('overturned, a piece the house gave back whole is said to stand again, as the hearing wrote it on the verdict', async () => {
  // The register that held it goes as it is given back: the sheet reads the verdict's own word.
  mockGetMyVerdict.mockResolvedValue(verdict({
    action: 'delete_content', duration_hours: null, expires_at: null, can_appeal: false,
    removed: { title: 'Vertigo', body: 'The review the house withheld.' }, restorable: false, withheld: false, put_back: true,
    appeal: { text: 'It was a review.', filed_at: '2026-11-18T12:00:00Z', status: 'overturned', judged_at: '2026-11-19T09:00:00Z', note: 'Harsh, not hateful.' },
  }));
  const r = mount();
  await waitFor(() => expect(r.getByText('YOUR APPEAL · THE VERDICT IS OVERTURNED')).toBeTruthy());
  expect(r.getByText('What it removed stands again where it was.')).toBeTruthy();
  expect(r.queryByText('Your words are kept above, to file again.')).toBeNull();
  expect(overturnedSays({ put_back: false, removed: null })).toBe('What it removed is no longer in the house.');
});

it('the day to appeal by is said in the member’s own day and hour', () => {
  const at = '2026-12-18T10:00:00Z';
  const local = new Date(at);
  const hour = local.getHours() % 12 === 0 ? 12 : local.getHours() % 12;
  expect(appealByWords(at)).toBe(`${formatDate(at, 'long')}, ${String(hour).padStart(2, '0')}:00 ${local.getHours() < 12 ? 'AM' : 'PM'}`);
  expect(withheldSays({ appeal_by: at, appeal: null })).toContain(`Appeal by ${appealByWords(at)} and it is kept whole`);
});

it('an appeal no moderator may hear yet is said to wait for one other than the one who ruled, the piece kept whole meanwhile', async () => {
  mockGetMyVerdict.mockResolvedValue(verdict({
    action: 'delete_content', duration_hours: null, expires_at: null, can_appeal: false, no_moderator_yet: true,
    removed: { title: 'Vertigo', body: 'The review the house withheld.' }, restorable: true, withheld: true, appeal_by: null,
    appeal: { text: 'It was a review.', filed_at: '2026-11-18T12:00:00Z', status: 'pending', judged_at: null, note: null },
  }));
  const r = mount();
  await waitFor(() => expect(r.getByText('YOUR APPEAL · AWAITING THE TRIBUNAL')).toBeTruthy());
  expect(r.getByText('Your appeal waits for a moderator other than the one who ruled, and never one it is about. None may hear it yet; it is heard as soon as one may. Meanwhile what it removed stays withheld, whole, however long it waits.')).toBeTruthy();
  expect(appealWaitsSays({ action: 'suspend' })).toBe('Your appeal waits for a moderator other than the one who ruled, and never one it is about. None may hear it yet; it is heard as soon as one may.');
});

it('an appeal a moderator may hear says nothing of waiting', async () => {
  mockGetMyVerdict.mockResolvedValue(verdict({
    can_appeal: false, no_moderator_yet: false,
    appeal: { text: 'It was a review.', filed_at: '2026-11-18T12:00:00Z', status: 'pending', judged_at: null, note: null },
  }));
  const r = mount();
  await waitFor(() => expect(r.getByText('YOUR APPEAL · AWAITING THE TRIBUNAL')).toBeTruthy());
  expect(r.queryByText(/^Your appeal waits for a moderator/)).toBeNull();
});
