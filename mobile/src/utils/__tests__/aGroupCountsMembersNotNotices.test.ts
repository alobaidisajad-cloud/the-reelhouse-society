/**
 * aGroupCountsMembersNotNotices.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A member certified a log, took it back and certified it again; another certified it. The
 * author's Notices said "3 members certified your log", counting the notices, of two members.
 * And a critique's certifications are grouped by their filing: two of a member's critiques
 * certified read "certified your critique", as one.
 *
 * Now a group counts the members its notices are from, and says "your critiques" when its notices
 * are of more than one. The board reads which critique a certification is of (its metadata's
 * comment_id) with every notice. The house, for its part, now takes a certification's notice when
 * it is taken back (round 11's migration).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { groupNotifications, type DisplayItem, type GroupedDisplayItem } from '../groupNotifications';
import { useNotificationStore, type AppNotification } from '../../stores/notificationStore';

const ME = '77777777-7777-4777-8777-777777777777';
const BEA = '22222222-2222-4222-8222-222222222222';
const CAL = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-17T12:00:00.000Z').getTime();
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

let mockHouse = supabaseFake();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('../../stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '77777777-7777-4777-8777-777777777777', username: 'me' } }) },
}));
jest.mock('../../stores/resetAllStores', () => ({ registerStoreReset: jest.fn() }));

let made = 0;
const notice = (from: string, key: string, extra: Partial<AppNotification> = {}): AppNotification => ({
  id: `n${(made += 1)}`, user_id: ME, type: 'endorse', message: 'certified your log of Metropolis.',
  read: false, created_at: ago(made), group_key: key, title: 'Metropolis', from_user_id: from, ...extra,
} as AppNotification);
const groups = (items: DisplayItem[]): GroupedDisplayItem[] => items.filter((i): i is GroupedDisplayItem => i.kind === 'group');
const only = (items: DisplayItem[]): GroupedDisplayItem => {
  const all = groups(items);
  expect(all).toHaveLength(1);
  return all[0]!;
};

it('one member who certified, took it back and certified again, and another, are two members', () => {
  const g = only(groupNotifications([
    notice(BEA, 'endorse:log:L1'), notice(BEA, 'endorse:log:L1'), notice(BEA, 'endorse:log:L1'), notice(CAL, 'endorse:log:L1'),
  ], NOW));
  expect(g.message).toBe('2 members certified your log of Metropolis');
  expect(g.count).toBe(2);
  // Every notice still goes with the group, to be marked read or dismissed with it.
  expect(g.ids).toHaveLength(4);
});

it('certifications of two of the member’s critiques under one filing say "your critiques"', () => {
  const critique = (from: string, id: string) => notice(from, 'endorse:critique:P1', { message: 'certified your critique.', title: undefined, comment_id: id });
  const g = only(groupNotifications([critique(BEA, 'C1'), critique(BEA, 'C2'), critique(CAL, 'C1')], NOW));
  expect(g.message).toBe('2 members certified your critiques');
});

it('three members certifying one critique still say "your critique"', () => {
  const critique = (from: string) => notice(from, 'endorse:critique:P1', { message: 'certified your critique.', title: undefined, comment_id: 'C1' });
  const g = only(groupNotifications([critique(BEA), critique(CAL), critique(ME)], NOW));
  expect(g.message).toBe('3 members certified your critique');
});

it('the board reads which critique a certification is of, with every notice', async () => {
  mockHouse = supabaseFake({
    rows: {
      notifications: [{
        id: '99999999-9999-4999-8999-999999999991', user_id: ME, type: 'endorse', from_user_id: BEA, from_username: 'bea',
        message: 'certified your critique.', is_read: false, created_at: ago(1), group_key: 'endorse:critique:P1',
        metadata: { dispatch_post_id: 'P1', comment_id: 'C2' },
      }],
    },
  });
  useNotificationStore.setState({ notifications: [], _fetching: false } as never);
  await useNotificationStore.getState().fetchNotifications();
  expect(useNotificationStore.getState().notifications.map((n) => n.comment_id)).toEqual(['C2']);
});
