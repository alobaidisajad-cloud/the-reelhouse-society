/**
 * The house says what it did not take (WORKLIST P4.14).
 *
 * A change the house refused for good is held for the member. While any is held, the notice frame
 * shows how many; pressed, a sheet names each in plain words with why, to send again or let go.
 * Every kind of change that can be held has a name, and every refusal a reason a member reads.
 */
import { fireEvent, render } from '@testing-library/react-native';
import StandingNotice from '../StandingNotice';
import { UnsentChangesPlate } from '../UnsentChanges';
import { useOfflineQueueStore } from '@/src/stores/offlineQueueStore';
import { useAuthStore } from '@/src/stores/auth';
import { HELD_NOUN, QUEUED_WRITE_KIND, whyRefused } from '@/src/utils/queueOwnership';
import type { QueuedMutation } from '@/src/utils/offlineQueue';

jest.mock('@/src/utils/offlineQueue', () => ({ letRefusedGo: jest.fn(), sendRefusedAgain: jest.fn() }));
const { letRefusedGo, sendRefusedAgain } = jest.requireMock('@/src/utils/offlineQueue') as { letRefusedGo: jest.Mock; sendRefusedAgain: jest.Mock };

const write = (id: string, type: QueuedMutation['type'], payload: Record<string, unknown>, held?: Partial<QueuedMutation>): QueuedMutation =>
  ({ id, type, payload, timestamp: 1, owner: 'me', ...held });
const REFUSED = { _held: 'refused' as const, _refusal: 'new row violates row-level security policy' };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null });
  useOfflineQueueStore.setState({ queued: [] });
});

it('draws no plate of its own while nothing is held', async () => {
  useOfflineQueueStore.setState({ queued: [write('w', 'add_log', { film_title: 'Stalker' })] });
  const { toJSON } = await render(<UnsentChangesPlate />);
  expect(toJSON()).toBeNull();
});

it('says nothing while nothing is held, and no standing is to be said', async () => {
  useOfflineQueueStore.setState({ queued: [write('w', 'add_log', { film_title: 'Stalker' })] });
  const { toJSON } = await render(<StandingNotice />);
  expect(toJSON()).toBeNull();
});

it('counts the held changes, and names each in the sheet with why, to send again or let go', async () => {
  useOfflineQueueStore.setState({ queued: [
    write('a', 'add_log', { film_title: 'Stalker' }, REFUSED),
    write('b', 'update_profile', { bio: 'x' }, { _held: 'refused', _refusal: 'schema: column "x" does not exist' }),
    write('c', 'add_log', { film_title: 'Not held' }),
  ] });
  const { getByText, getByLabelText, queryByText } = await render(<StandingNotice />);
  expect(getByText('2 CHANGES NOT TAKEN')).toBeTruthy();
  await fireEvent.press(getByLabelText('2 changes not taken. Review: the house did not take them.'));
  expect(getByText('Unsent Changes')).toBeTruthy();
  expect(getByText('A log: Stalker')).toBeTruthy();
  expect(getByText('The house refused it.')).toBeTruthy();
  expect(getByText('An edit to the profile')).toBeTruthy();
  expect(getByText('The house no longer reads it as this phone sent it.')).toBeTruthy();
  expect(queryByText('A log: Not held')).toBeNull();
  await fireEvent.press(getByLabelText('Send again: A log'));
  await fireEvent.press(getByLabelText('Let go: An edit to the profile'));
  expect([sendRefusedAgain.mock.calls, letRefusedGo.mock.calls]).toEqual([[['a']], [['b']]]);
});

it('stands above a silenced member\'s plate, both said', async () => {
  useAuthStore.setState({ user: { id: 'me', is_banned: true } as never });
  useOfflineQueueStore.setState({ queued: [write('a', 'add_log', { film_title: 'Stalker' }, REFUSED)] });
  const { getByText } = await render(<StandingNotice />);
  expect(getByText('1 CHANGE NOT TAKEN')).toBeTruthy();
  expect(getByText('SILENCED BY THE SOCIETY')).toBeTruthy();
});

it('has a name for every kind of change that can be held', () => {
  const holdable = Object.entries(QUEUED_WRITE_KIND)
    .filter(([type, kind]) => kind === 'record' || ['add_filing', 'add_dossier_comment', 'send_lounge_message'].includes(type))
    .map(([type]) => type as QueuedMutation['type']);
  expect(holdable.filter((type) => !HELD_NOUN[type])).toEqual([]);
});

it('gives each refusal a reason a member reads, the house\'s own sentence when it wrote one', () => {
  expect([
    whyRefused(undefined),
    whyRefused('new row violates row-level security policy'),
    whyRefused('transient-exhausted: Internal Server Error'),
    whyRefused('Your account has been silenced by The Society.'),
  ]).toEqual([
    'The house refused it.',
    'The house refused it.',
    'The house failed it five times over.',
    'Your account has been silenced by The Society.',
  ]);
});
