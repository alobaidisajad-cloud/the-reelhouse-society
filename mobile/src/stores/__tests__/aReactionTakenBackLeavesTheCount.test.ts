/**
 * aReactionTakenBackLeavesTheCount.test.ts — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * Two members sit in a salon; one reacts BRAVO to a message, then taps it again to take it back.
 * The other's chip still said BRAVO 1 until they left the room. The reactions table keeps row
 * security, so the house's channel sends a deleted reaction with its key alone ({ id }): the
 * room's handler needed the message and the reaction and dropped the withdrawal.
 *
 * Now the room keeps its reaction rows by their id, from every read and every reaction heard, and
 * a withdrawal heard as its id alone takes its count away.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';
const BEA = '77777777-7777-4777-8777-777777777777';
const WORDS = '44444444-4444-4444-8444-444444444441';
const READ_REACTION = '55555555-5555-4555-8555-555555555551';
const HEARD_REACTION = '55555555-5555-4555-8555-555555555552';
const PEOPLE = [{ id: ME, username: 'me' }, { id: ANA, username: 'ana' }, { id: BEA, username: 'bea' }];

const mockHouse = supabaseFake({
  rows: {
    profiles: PEOPLE,
    lounge_messages: [{ id: WORDS, lounge_id: ROOM, user_id: ANA, content: 'Ozu, again.', type: 'text', created_at: '2026-11-17T10:00:00Z' }],
    lounge_message_reactions: [{ id: READ_REACTION, message_id: WORDS, lounge_id: ROOM, user_id: ANA, reaction: 'bravo' }],
  },
});

/** The salon's channel, as the room opens it: each change it listens for, by event and table. */
type Heard = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => void;
const mockHeard = new Map<string, Heard>();
const mockChannel = () => {
  const channel: Record<string, unknown> = {};
  channel.on = (_kind: string, filter: { event?: string; table?: string }, handler: Heard) => {
    if (filter.table) mockHeard.set(`${filter.event}:${filter.table}`, handler);
    return channel;
  };
  channel.subscribe = () => channel;
  channel.track = () => Promise.resolve('ok');
  channel.presenceState = () => ({});
  return channel;
};
// The shared fake, with the realtime half the room's channel needs (the fake keeps no sockets).
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, channel: mockChannel, removeChannel: () => Promise.resolve('ok') }; },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));

const chips = () => {
  const words = useLoungeStore.getState().currentMessages.find((m) => m.id === WORDS);
  expect(words).toBeDefined();
  return (words!.reactions ?? []).map((r) => `${r.reaction} ${r.count}`);
};
const heard = (key: string): Heard => {
  const handler = mockHeard.get(key);
  expect(handler).toBeDefined();
  return handler!;
};

let leave: () => void = () => {};
beforeEach(async () => {
  mockHeard.clear();
  useLoungeStore.setState({ currentLoungeId: null, currentMessages: [], messagesLoading: false, messagesFailed: false });
  await useLoungeStore.getState().fetchMessages(ROOM);
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: true });
});
afterEach(() => leave());

it('a reaction read with the room, taken back by its member, leaves the count at once', () => {
  expect(chips()).toEqual(['bravo 1']);
  // As the house sends it: the deleted row's key alone.
  heard('DELETE:lounge_message_reactions')({ old: { id: READ_REACTION } });
  expect(chips()).toEqual([]);
});

it('a reaction heard live, then taken back, leaves the count as it came', () => {
  heard('INSERT:lounge_message_reactions')({ new: { id: HEARD_REACTION, message_id: WORDS, lounge_id: ROOM, user_id: BEA, reaction: 'bravo' } });
  expect(chips()).toEqual(['bravo 2']);
  heard('DELETE:lounge_message_reactions')({ old: { id: HEARD_REACTION } });
  expect(chips()).toEqual(['bravo 1']);
});

it('a withdrawal heard twice, or of a reaction the room never held, takes nothing more', () => {
  heard('DELETE:lounge_message_reactions')({ old: { id: READ_REACTION } });
  heard('DELETE:lounge_message_reactions')({ old: { id: READ_REACTION } });
  heard('DELETE:lounge_message_reactions')({ old: { id: '55555555-5555-4555-8555-555555555559' } });
  expect(chips()).toEqual([]);
});
