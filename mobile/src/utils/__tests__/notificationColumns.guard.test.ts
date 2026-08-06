/**
 * notificationColumns.guard.test.ts — the four gates a column must pass
 * ────────────────────────────────────────────────────────────────────
 * For `group_key` to reach the grouping code it has to survive FOUR places, and missing
 * any one silently disables grouping — which is how grouping died the first time:
 *
 *   1. the SELECT column list  — or the database never sends it
 *   2. the Zod schema          — or Zod STRIPS it (unknown keys are dropped, not an error)
 *   3. the AppNotification type — or nothing can read it
 *   4. the trigger             — server side, proven separately
 *
 * Gate 1 was the sharpest hazard: the column list was written out TWICE, byte-identical,
 * in fetch and in load-more. Adding a column to one and not the other would have given
 * notifications that group on first load and stop grouping as you scroll.
 *
 * Failure here is silent in every case — nothing throws, grouping just quietly stops —
 * so it is asserted rather than trusted.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const store = fs.readFileSync(path.join(ROOT, 'stores', 'notificationStore.ts'), 'utf8');
const modal = fs.readFileSync(path.join(ROOT, '..', 'app', '(modals)', 'notifications-modal.tsx'), 'utf8');
const grouping = fs.readFileSync(path.join(ROOT, 'utils', 'groupNotifications.ts'), 'utf8');

/** Comments stripped — prose explaining a rule must not satisfy the rule. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('GATE 1 · one column list, and it carries the new fields', () => {
  it('there is exactly ONE list, not two copies that can drift', () => {
    expect(store).toMatch(/const NOTIFICATION_COLUMNS = '/);
    // The literal must not reappear inline anywhere.
    const inline = code(store).match(/select\('id, user_id, type/g) ?? [];
    expect(inline).toHaveLength(0);
  });

  it('both read paths use it', () => {
    const uses = code(store).match(/\.select\(NOTIFICATION_COLUMNS\)/g) ?? [];
    expect(uses).toHaveLength(2);   // fetchNotifications + loadMoreNotifications
  });

  it('it asks for group_key and title', () => {
    const list = store.slice(store.indexOf('const NOTIFICATION_COLUMNS'), store.indexOf('const RealtimeNotifSchema'));
    expect(list).toContain('group_key');
    expect(list).toContain('title');
  });
});

describe('GATE 2 · the schema declares them, or Zod strips them', () => {
  it('group_key and title are in the schema', () => {
    const schema = store.slice(store.indexOf('const RealtimeNotifSchema'), store.indexOf('export interface AppNotification'));
    expect(schema).toMatch(/group_key: z\./);
    expect(schema).toMatch(/title: z\./);
  });

  it('both are nullish — Postgres sends null, and .optional() would reject it', () => {
    const schema = store.slice(store.indexOf('const RealtimeNotifSchema'), store.indexOf('export interface AppNotification'));
    expect(schema).toMatch(/group_key: z\.string\(\)\.nullish\(\)/);
    expect(schema).toMatch(/title: z\.string\(\)\.nullish\(\)/);
  });
});

describe('GATE 3 · the type declares them', () => {
  it('AppNotification carries group_key and title', () => {
    const iface = store.slice(store.indexOf('export interface AppNotification'), store.indexOf('export interface NotificationState'));
    expect(iface).toMatch(/group_key\?: string;/);
    expect(iface).toMatch(/title\?: string;/);
  });
});

describe('the grouping code reads the declared key and nothing else', () => {
  it('getGroupKey reads the column, and only accepts keys it understands', () => {
    // It must NOT return the raw value. A key from a newer server would then form a
    // group and fall back to the log wording, labelling it "certified your log of …".
    // Unknown means ungrouped — which renders as ordinary rows, not as a wrong label.
    expect(code(grouping)).toMatch(/parseGroupKey\(n\.group_key\)/);
    expect(code(grouping)).not.toMatch(/return n\.group_key \?\? null;/);
  });

  it('the message regex is GONE from the module, not merely unused', () => {
    // Repairing it to match today's copy would have re-armed the same trap for the next
    // copy edit. It was deleted.
    expect(code(grouping)).not.toMatch(/your review of/);
    expect(code(grouping)).not.toMatch(/extractFilmName/);
  });
});

describe('the group tap routes by KIND, not by film alone', () => {
  it('the modal derives its destination from the key', () => {
    expect(modal).toMatch(/groupRoute\(parseGroupKey\(item\.groupKey\), item\.film_id\)/);
  });

  it('it no longer routes on film_id alone inside the GROUP handler', () => {
    const group = modal.slice(modal.indexOf('GroupedNotificationItem'), modal.indexOf('export default function'));
    expect(code(group)).not.toMatch(/if \(item\.film_id\) nav\.push/);
  });
});

describe('the never-run bulk actions are consistent with their siblings', () => {
  it('markGroupRead carries the ownership filter dismissGroup documents', () => {
    // Row security is the real protection; of four mutators here two had this filter and
    // two did not. This path had never executed — grouping was inert — so it is being
    // made reachable and consistent in the same change.
    const fn = store.slice(store.indexOf('markGroupRead: async'), store.indexOf('dismissGroup: async'));
    expect(fn).toMatch(/\.eq\('user_id', user\.id\)/);
  });

  it('both bulk actions still act in ONE request, not one per id', () => {
    // NB: both boundaries need a from-index. 'unreadCount:' also matches '_unreadCount:',
    // and 'setupRealtime:' appears in the interface long before the implementation.
    const from = store.indexOf('markGroupRead: async');
    const both = store.slice(from, store.indexOf('setupRealtime: () =>', from));
    expect(both.match(/\.in\('id', ids\)/g) ?? []).toHaveLength(2);
  });
});
