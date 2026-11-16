/**
 * aCertifiedCritiqueIsCalledACritique.test.ts — review round 6
 * ─────────────────────────────────────────────────────────────────────────────
 * A certification of a member's critique was written under its filing's own key, and three of them
 * read "3 members certified your filing", a filing the critic never wrote. Its key now names the
 * critique (`endorse:critique:<filing>`): it groups apart from the filing's own certifications,
 * says "critique", and a tap still opens the filing the critique stands under.
 */
import { groupRoute, parseGroupKey } from '../endorsementGroupKey';
import { groupNotifications, type DisplayItem, type GroupedDisplayItem } from '../groupNotifications';
import type { AppNotification } from '../../stores/notificationStore';

const NOW = new Date('2026-11-16T12:00:00.000Z').getTime();
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const POST = 'P1';

let made = 0;
const certified = (key: string, i: number): AppNotification => ({
  id: `n${(made += 1)}`,
  user_id: 'me',
  type: 'endorse',
  message: 'certified your critique.',
  read: false,
  created_at: ago(i + 1),
  group_key: key,
} as AppNotification);
const three = (key: string) => [0, 1, 2].map((i) => certified(key, i));
const groups = (items: DisplayItem[]): GroupedDisplayItem[] =>
  items.filter((i): i is GroupedDisplayItem => i.kind === 'group');

it('three certifications of a critique read "3 members certified your critique"', () => {
  const items = groupNotifications(three(`endorse:critique:${POST}`), NOW);
  expect(items).toHaveLength(1);
  const one = groups(items)[0];
  expect(one).toBeDefined();
  expect(one!.message).toBe('3 members certified your critique');
  expect(one!.message).not.toContain('filing');
});

it('a critique certified groups apart from the filing it stands under being certified', () => {
  const items = groupNotifications([...three(`endorse:critique:${POST}`), ...three(`endorse:post:${POST}`)], NOW);
  const both = groups(items);
  expect(both).toHaveLength(2);
  expect(both.map((g) => g.message).sort()).toEqual(['3 members certified your critique', '3 members certified your filing']);
});

it('tapping a certified critique opens the filing it stands under', () => {
  const target = parseGroupKey(`endorse:critique:${POST}`);
  expect(target).toEqual({ kind: 'critique', id: POST });
  expect(groupRoute(target)).toBe(`/dispatch/${POST}`);
});
