/**
 * aVerdictIsReachedWithoutItsNotice.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A verdict was reached only from its notice: a member who dismissed "A Notice from the House" lost the
 * reason in full and their one appeal for good, and the banner of a pause opened nothing. Now every
 * verdict is on the member's own record in Settings, newest first, how each stands now, each opened
 * whole from there; and the banner of a pause or a silence opens that record.
 */
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '@/src/stores/auth';
import { SectionCard } from '@/src/features/settings/SettingsSections';
import { VerdictRecord, verdictStands } from '../VerdictRecord';
import StandingNotice from '@/src/components/StandingNotice';
import { nav } from '@/src/utils/typedRouter';

const mockVerdicts = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: { getMyVerdicts: (...a: unknown[]) => mockVerdicts(...a) },
}));
// The sheet is under test in its own file: here, which verdict the record opens.
jest.mock('@/src/components/moderation/VerdictSheet', () => {
  const actual = jest.requireActual('@/src/components/moderation/VerdictSheet');
  const { Text: T } = require('react-native');
  return { ...actual, VerdictSheet: ({ verdictId }: { verdictId: string | null }) => (verdictId ? <T testID="verdict-sheet">{verdictId}</T> : null) };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

// Each moment at the member's own noon: the record prints the member's own day, the same in every zone.
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'v-1', action: 'suspend', reason: 'Slurs in a salon.', created_at: new Date(2026, 10, 18, 12).toISOString(), duration_hours: 72,
  expires_at: new Date(2099, 10, 21, 12).toISOString(), lifted_at: null, appeal_status: null, content_type: 'lounge_message', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'member-2', username: 'two' } as never });
});
afterEach(() => useAuthStore.setState({ user: null }));

it('lists every verdict on the member, how each stands, and opens each whole: its notice dismissed or not', async () => {
  mockVerdicts.mockResolvedValue([
    entry(),
    entry({ id: 'v-2', action: 'warn', reason: 'A first warning.', duration_hours: null, expires_at: null, appeal_status: 'overturned' }),
  ]);
  const r = render(<VerdictRecord />);
  await waitFor(() => expect(r.getByText('MEMBERSHIP PAUSED · 72 HOURS')).toBeTruthy());
  expect(r.getByText('Slurs in a salon.')).toBeTruthy();
  expect(r.getByText('GIVEN NOV 18, 2026 · UNTIL NOV 21, 2099, 12:00 PM')).toBeTruthy();
  expect(r.getByText('GIVEN NOV 18, 2026 · STRUCK ON APPEAL')).toBeTruthy();
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: /^a formal warning, given nov 18, 2026, struck on appeal\. Opens it whole\.$/ })); });
  expect(r.getByTestId('verdict-sheet').props.children).toBe('v-2');
  expect(mockVerdicts).toHaveBeenCalledWith(undefined, 30);
});

it('an empty record says so; one that could not be read is never an empty one, and is asked again', async () => {
  mockVerdicts.mockResolvedValue([]);
  const empty = render(<VerdictRecord />);
  await waitFor(() => expect(empty.getByText('No verdict of the house stands on your record.')).toBeTruthy());
  await empty.unmount();
  mockVerdicts.mockRejectedValue(new Error('network'));
  const failed = render(<VerdictRecord />);
  await waitFor(() => expect(failed.getByText('Your record could not be read.')).toBeTruthy(), { timeout: 5000 });
  expect(failed.queryByText('No verdict of the house stands on your record.')).toBeNull();
});

// The card the record stands in clips at its edge: a TRY AGAIN grown past its own box to reach 48
// was cut to 30 there (the touch capture of Settings). Measured on the drawn card in CI; here, how
// the box is built, and that it asks again.
it('a record that could not be read offers TRY AGAIN in a 48pt box of its own, inside the card that clips', async () => {
  mockVerdicts.mockRejectedValue(new Error('network'));
  const r = render(<SectionCard><VerdictRecord /></SectionCard>);
  const retry = await waitFor(() => r.getByRole('button', { name: 'Try again: read your record with the house' }), { timeout: 5000 });
  const own = StyleSheet.flatten(retry.props.style) as ViewStyle;
  expect(own.minHeight).toBeGreaterThanOrEqual(48);
  expect([own.marginTop ?? 0, own.marginBottom ?? 0].every((m) => typeof m === 'number' && m >= 0)).toBe(true);
  mockVerdicts.mockResolvedValue([]);
  await act(async () => { await fireEvent.press(retry); });
  await waitFor(() => expect(r.getByText('No verdict of the house stands on your record.')).toBeTruthy());
});

it('a full page offers the next, read after the last verdict held', async () => {
  const page = Array.from({ length: 30 }, (_, i) => entry({ id: `v-${i}`, created_at: `2026-11-${String(18 - (i % 9)).padStart(2, '0')}T10:00:00Z` }));
  mockVerdicts.mockResolvedValueOnce(page).mockResolvedValueOnce([entry({ id: 'v-old', reason: 'An old one.' })]);
  const r = render(<VerdictRecord />);
  await waitFor(() => expect(r.getByRole('button', { name: 'Read more of your record' })).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByRole('button', { name: 'Read more of your record' })); });
  await waitFor(() => expect(r.getByText('An old one.')).toBeTruthy());
  expect(mockVerdicts).toHaveBeenLastCalledWith({ created_at: '2026-11-16T10:00:00Z', id: 'v-29' }, 30);
});

it('says how each verdict stands in plain words', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  expect(verdictStands({ appeal_status: 'pending', lifted_at: null, expires_at: null }, now)).toBe('YOUR APPEAL AWAITS THE TRIBUNAL');
  expect(verdictStands({ appeal_status: null, lifted_at: null, expires_at: '2026-10-01T00:00:00Z' }, now)).toBe('SERVED');
  expect(verdictStands({ appeal_status: null, lifted_at: '2026-11-18T00:00:00Z', expires_at: '2026-10-01T00:00:00Z' }, now)).toBe('SERVED');
  expect(verdictStands({ appeal_status: null, lifted_at: '2026-11-18T00:00:00Z', expires_at: null }, now)).toBe('LIFTED');
  expect(verdictStands({ appeal_status: 'upheld', lifted_at: null, expires_at: null }, now)).toBe('UPHELD ON APPEAL');
  expect(verdictStands({ appeal_status: null, lifted_at: null, expires_at: null }, now)).toBeNull();
});

it('the banner of a pause opens the record, where the verdict is read whole and appealed', async () => {
  useAuthStore.setState({ user: { id: 'member-2', username: 'two', is_banned: false, suspended_until: '2099-11-21T10:00:00Z' } as never });
  const r = render(<StandingNotice />);
  const banner = r.getByRole('button', { name: /^Your account is suspended until .+\. You may read, and may not write\.$/ });
  expect(r.getByText('READ THE VERDICT ›')).toBeTruthy();
  await act(async () => { await fireEvent.press(banner); });
  expect(nav.push).toHaveBeenCalledWith('/settings', { section: 'record' });
});
