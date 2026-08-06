/**
 * endorsementGrouping.test.ts — #73, grouping has never once worked
 * ────────────────────────────────────────────────────────────────
 * `getGroupKey` had two ways to identify a group and BOTH were dead:
 *   1. `film_id` — the notification trigger has never written it
 *   2. the message, matched against /your review of (.+)$/ — while the trigger writes
 *      "certified your log of Metropolis."
 *
 * A migration rewrote the notification copy because "the user literally could not
 * understand a push", and disabled grouping in passing. Nothing connected the two, so
 * every endorsement has rendered as its own row ever since.
 *
 * Identity is declared by the server now, and this file exists because NONE of this
 * code has ever executed in production — including a bulk-dismiss button. Untested and
 * unexercised is how it got here; it is not how it ships.
 */
import { describeGroup, groupRoute, parseGroupKey } from '../endorsementGroupKey';
import { getGroupKey, groupNotifications, groupTitle } from '../groupNotifications';
import type { AppNotification } from '../../stores/notificationStore';

const NOW = new Date('2026-08-06T12:00:00.000Z').getTime();
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const n = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'me',
  type: 'endorse',
  message: 'certified your log of Metropolis.',
  read: false,
  created_at: ago(1),
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('THE DEFECT — the old identity could never produce a key', () => {
  it("the trigger's real copy does not match the regex that was parsing it", () => {
    // Verbatim from the deployed trigger. The parser wanted "your review of".
    const real = 'certified your log of Metropolis.';
    expect(real.match(/your review of (.+)$/)).toBeNull();
  });

  it('a notification with no declared key is not grouped', () => {
    expect(getGroupKey(n({ group_key: undefined }))).toBeNull();
  });

  it('the message is never consulted, whatever it says', () => {
    // The whole point: copy can now change freely without touching grouping.
    const withOldCopy = n({ group_key: 'endorse:log:L1', message: 'endorsed your review of Metropolis' });
    const withNewCopy = n({ group_key: 'endorse:log:L1', message: 'certified your log of Metropolis.' });
    const withNonsense = n({ group_key: 'endorse:log:L1', message: '' });
    expect(getGroupKey(withOldCopy)).toBe('endorse:log:L1');
    expect(getGroupKey(withNewCopy)).toBe('endorse:log:L1');
    expect(getGroupKey(withNonsense)).toBe('endorse:log:L1');
  });
});

describe('parseGroupKey', () => {
  it('reads all three kinds — logs, stacks, dossiers', () => {
    expect(parseGroupKey('endorse:log:abc')).toEqual({ kind: 'log', id: 'abc' });
    expect(parseGroupKey('endorse:list:abc')).toEqual({ kind: 'list', id: 'abc' });
    expect(parseGroupKey('endorse:dossier:abc')).toEqual({ kind: 'dossier', id: 'abc' });
  });

  it('rejects anything malformed instead of throwing inside a render', () => {
    for (const bad of ['', 'endorse', 'endorse:log', 'endorse:log:', 'other:log:x',
                       'endorse:film:1', 'endorse:log:a:b', null, undefined, 42 as never]) {
      expect(parseGroupKey(bad as never)).toBeNull();
    }
  });

  it('a key from a NEWER server degrades to ungrouped, never to a crash', () => {
    expect(parseGroupKey('endorse:screening:xyz')).toBeNull();
  });
});

describe('describeGroup — the copy the old code got wrong', () => {
  it('names the right noun for each kind', () => {
    expect(describeGroup(4, 'log', 'Metropolis')).toBe('4 members certified your log of Metropolis');
    expect(describeGroup(4, 'list', 'Comfort movies')).toBe('4 members certified your stack “Comfort movies”');
    expect(describeGroup(4, 'dossier', 'On Noir')).toBe('4 members certified your dossier “On Noir”');
  });

  it('never renders "your review of your review"', () => {
    // What the old code WOULD have produced the moment grouping worked: the film name
    // came from the same broken regex, whose fallback was the literal "your review".
    for (const kind of ['log', 'list', 'dossier'] as const) {
      const s = describeGroup(5, kind, undefined);
      expect(s).not.toContain('your review');
      expect(s).not.toContain('undefined');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('degrades gracefully when the title is missing or blank', () => {
    expect(describeGroup(3, 'log', '')).toBe('3 members certified your log');
    expect(describeGroup(3, 'list', '   ')).toBe('3 members certified your stack');
  });
});

describe('groupRoute — the dead tap target', () => {
  it('every kind has somewhere to go', () => {
    expect(groupRoute({ kind: 'log', id: 'L1' }, 1234)).toBe('/film/1234');
    expect(groupRoute({ kind: 'list', id: 'S1' })).toBe('/stacks/S1');
    expect(groupRoute({ kind: 'dossier', id: 'D1' })).toBe('/dossier/D1');
  });

  it('REGRESSION: stacks and dossiers used to route nowhere', () => {
    // The old handler was `if (item.film_id) push('/film/' + film_id)`. Stacks and
    // dossiers have no film, so the sheet closed and nothing happened — a dead button
    // that only appears once grouping starts working.
    expect(groupRoute({ kind: 'list', id: 'S1' }, undefined)).not.toBeNull();
    expect(groupRoute({ kind: 'dossier', id: 'D1' }, undefined)).not.toBeNull();
  });

  it('a log with no film resolves to no route rather than a broken one', () => {
    expect(groupRoute({ kind: 'log', id: 'L1' }, undefined)).toBeNull();
    expect(groupRoute(null)).toBeNull();
  });
});

describe('groupNotifications end to end', () => {
  const three = (key: string, title: string, extra: Partial<AppNotification> = {}) =>
    [0, 1, 2].map(i => n({ group_key: key, title, created_at: ago(i + 1), ...extra }));

  it('THE HEADLINE: three endorsements of one log collapse into one row', () => {
    const items = groupNotifications(three('endorse:log:L1', 'Metropolis'), NOW);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('group');
    if (items[0].kind === 'group') {
      expect(items[0].count).toBe(3);
      expect(items[0].message).toBe('3 members certified your log of Metropolis');
    }
  });

  it('stacks group too — the audit\'s fix would have left these individual', () => {
    const items = groupNotifications(three('endorse:list:S1', 'Comfort movies'), NOW);
    expect(items).toHaveLength(1);
    if (items[0].kind === 'group') {
      expect(items[0].message).toContain('stack');
      expect(items[0].message).toContain('Comfort movies');
    }
  });

  it('dossiers group too', () => {
    const items = groupNotifications(three('endorse:dossier:D1', 'On Noir'), NOW);
    expect(items).toHaveLength(1);
    if (items[0].kind === 'group') expect(items[0].message).toContain('dossier');
  });

  it('different targets never merge, even at the same moment', () => {
    const items = groupNotifications(
      [...three('endorse:log:L1', 'Metropolis'), ...three('endorse:list:S1', 'Comfort movies')],
      NOW,
    );
    expect(items).toHaveLength(2);
    expect(items.every(i => i.kind === 'group')).toBe(true);
  });

  it('two below the minimum stay individual', () => {
    const items = groupNotifications(three('endorse:log:L1', 'Metropolis').slice(0, 2), NOW);
    expect(items).toHaveLength(2);
    expect(items.every(i => i.kind === 'individual')).toBe(true);
  });

  it('anything outside the 72-hour window stays individual', () => {
    const old = [0, 1, 2].map(i => n({ group_key: 'endorse:log:L1', title: 'Metropolis', created_at: ago(80 + i) }));
    const items = groupNotifications(old, NOW);
    expect(items).toHaveLength(3);
    expect(items.every(i => i.kind === 'individual')).toBe(true);
  });

  it('keeps the group unread if ANY member of it is unread, and carries every id', () => {
    const items = groupNotifications(
      three('endorse:log:L1', 'Metropolis').map((x, i) => ({ ...x, read: i !== 0 })),
      NOW,
    );
    if (items[0].kind === 'group') {
      expect(items[0].hasUnread).toBe(true);
      expect(items[0].ids).toHaveLength(3);   // what bulk dismiss/mark-read act on
    }
  });

  it('non-endorsements and un-keyed rows pass straight through', () => {
    const items = groupNotifications([
      n({ type: 'follow', message: 'is following you.' }),
      n({ type: 'comment', message: 'left a critique.' }),
      ...three('endorse:log:L1', 'Metropolis'),
    ], NOW);
    expect(items.filter(i => i.kind === 'individual')).toHaveLength(2);
    expect(items.filter(i => i.kind === 'group')).toHaveLength(1);
  });

  it('groupTitle reads the column and nothing else', () => {
    expect(groupTitle(n({ title: 'Metropolis' }))).toBe('Metropolis');
    expect(groupTitle(n({ title: undefined, message: 'certified your log of Metropolis.' }))).toBeUndefined();
  });
});

describe('a key this client does not understand must NOT group', () => {
  /**
   * Found by re-auditing my own execution. `parseGroupKey` correctly rejects a key it
   * does not recognise — but `getGroupKey` returned ANY string, so a key from a newer
   * server would have formed a group and then fallen back to the log wording, labelling
   * it "certified your log of …". The rejecting function existed; the grouping path
   * never called it.
   */
  it('an unrecognised kind is ungrouped, not mislabelled', () => {
    expect(getGroupKey(n({ group_key: 'endorse:screening:X1' }))).toBeNull();
  });

  it('a malformed key is ungrouped', () => {
    for (const bad of ['', 'endorse', 'endorse:log', 'nonsense', 'other:log:x']) {
      expect(getGroupKey(n({ group_key: bad }))).toBeNull();
    }
  });

  it('such notifications still RENDER — they are individual rows, not lost', () => {
    const items = groupNotifications([
      n({ group_key: 'endorse:screening:X1' }),
      n({ group_key: 'endorse:screening:X1' }),
      n({ group_key: 'endorse:screening:X1' }),
    ], NOW);
    expect(items).toHaveLength(3);
    expect(items.every(i => i.kind === 'individual')).toBe(true);
  });

  it('the three kinds this client DOES understand still group', () => {
    for (const key of ['endorse:log:L1', 'endorse:list:S1', 'endorse:dossier:D1']) {
      expect(getGroupKey(n({ group_key: key }))).toBe(key);
    }
  });
});

describe('only ENDORSEMENTS group — the invariant, held by two conditions', () => {
  /**
   * The original getGroupKey opened with `if (n.type !== 'endorse') return null`. My
   * first rewrite dropped it, relying on the key's `endorse:` prefix to imply the type.
   * That equivalence holds only while every writer is disciplined about which rows get a
   * key — an implicit invariant where an explicit one had been. Found by reading my own
   * deletions, not by any property test.
   */
  it('a non-endorsement carrying an endorse-shaped key still does NOT group', () => {
    expect(getGroupKey(n({ type: 'comment', group_key: 'endorse:log:L1' }))).toBeNull();
    expect(getGroupKey(n({ type: 'follow', group_key: 'endorse:list:S1' }))).toBeNull();
    expect(getGroupKey(n({ type: 'system', group_key: 'endorse:dossier:D1' }))).toBeNull();
  });

  it('and such rows still render, as individual notifications', () => {
    const items = groupNotifications([
      n({ type: 'comment', group_key: 'endorse:log:L1' }),
      n({ type: 'comment', group_key: 'endorse:log:L1' }),
      n({ type: 'comment', group_key: 'endorse:log:L1' }),
    ], NOW);
    expect(items).toHaveLength(3);
    expect(items.every(i => i.kind === 'individual')).toBe(true);
  });

  it('BOTH conditions are required — neither alone is enough', () => {
    expect(getGroupKey(n({ type: 'endorse', group_key: undefined }))).toBeNull();      // key alone
    expect(getGroupKey(n({ type: 'comment', group_key: 'endorse:log:L1' }))).toBeNull(); // type alone
    expect(getGroupKey(n({ type: 'endorse', group_key: 'endorse:log:L1' }))).toBe('endorse:log:L1');
  });
});
