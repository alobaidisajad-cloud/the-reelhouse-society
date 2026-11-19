/**
 * A hidden member's words leave the salon with them, in another member's reply or card too (review
 * round 14, moderation).
 *
 * A member who blocked or muted B, sitting with B in a salon, still read B's words whenever C answered
 * B (C's reply quotes B's message, headed "B", spoken aloud too) or shared B's essay, log or stack (a
 * card "BY @B" with B's headline): every filter here checked the message's writer, C, never whose words
 * it carried. The house now names them on each message (carries_words_of) and hides such a message as
 * it hides B's own, from every read and every live message, for a block either way; here the same
 * rule (hiddenHere) takes them off the screen the moment this phone blocks or mutes B, and leaves them
 * out of every read and every word heard live. One's own message is never hidden.
 */
import { onlineManager } from '@tanstack/react-query';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { hiddenHere, useLoungeStore, type LoungeMessage } from '../lounge';

const ROOM = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const BEA = '66666666-6666-4666-8666-666666666666';
const CAL = '77777777-7777-4777-8777-777777777777';
const PEOPLE = [{ id: ME, username: 'me' }, { id: BEA, username: 'bea' }, { id: CAL, username: 'cal' }];
const START = Date.parse('2026-11-19T10:00:00Z');
const idOf = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const atOf = (i: number) => new Date(START + i * 1000).toISOString();

/** The room as the house holds it: Bea's word, Cal's answer to it, Cal's card of Bea's essay, Cal's plain word. */
const ROWS = [
  { id: idOf(0), lounge_id: ROOM, user_id: BEA, content: 'the words of bea', type: 'text', created_at: atOf(0), deleted_at: null },
  { id: idOf(1), lounge_id: ROOM, user_id: CAL, content: 'an answer of cal', type: 'text', reply_to_id: idOf(0),
    reply_to_username: 'bea', reply_to_content: 'the words of bea', carries_words_of: [BEA], created_at: atOf(1), deleted_at: null },
  { id: idOf(2), lounge_id: ROOM, user_id: CAL, content: '', type: 'dossier_share',
    metadata: { dossier_id: '88888888-8888-4888-8888-888888888888', author_username: 'bea' }, film_title: 'a headline of bea',
    carries_words_of: [BEA], created_at: atOf(2), deleted_at: null },
  { id: idOf(3), lounge_id: ROOM, user_id: CAL, content: 'a plain word of cal', type: 'text', created_at: atOf(3), deleted_at: null },
];
const held = (r: (typeof ROWS)[number]): LoungeMessage => ({ ...r, username: r.user_id === BEA ? 'bea' : 'cal' } as LoungeMessage);

const mockHidden = new Set<string>();
const mockHouse = supabaseFake({
  rows: { profiles: PEOPLE, lounge_message_reactions: [] },
  // As the house answers this member: Bea's own words are left out by the rule while she is hidden;
  // what the phone does with the rest is what is tested.
  answer: { lounge_messages: () => ROWS.filter((r) => !mockHidden.has(r.user_id)).slice().reverse() },
});
/** The channel the room joins: its handlers, handed to the test. */
const mockHandlers = new Map<string, (payload: { new?: unknown; old?: unknown }) => unknown>();
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: (kind: string, filter: { event?: string; table?: string }, handler: (payload: { new?: unknown }) => unknown) => {
    mockHandlers.set(`${kind}:${filter?.event ?? ''}:${filter?.table ?? ''}`, handler);
    return mockChannel;
  },
  subscribe: () => mockChannel,
  track: jest.fn(), send: jest.fn(), presenceState: () => ({}),
});
jest.mock('@/src/lib/supabase', () => ({
  get supabase() { return { ...mockHouse.client, channel: () => mockChannel, removeChannel: async () => 'ok' }; },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({
  useBlockStore: { getState: () => ({ isHidden: (id: string | null | undefined) => !!id && mockHidden.has(id) }), subscribe: () => () => {} },
}));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const shown = () => useLoungeStore.getState().currentMessages.map((m) => m.content || m.type);
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

let leave: (() => void) | null = null;
beforeEach(() => {
  onlineManager.setOnline(true);
  mockHidden.clear();
  mockHandlers.clear();
  useLoungeStore.setState({ currentLoungeId: null, currentMessages: [], messagesLoading: false, messagesFailed: false });
});
afterEach(() => { leave?.(); leave = null; });

describe('hiddenHere: whether a message is hidden from this member', () => {
  it('a message written by a member they hid is hidden', () => {
    mockHidden.add(BEA);
    expect(hiddenHere({ user_id: BEA })).toBe(true);
  });
  it('another member\'s message carrying the words of one they hid is hidden', () => {
    mockHidden.add(BEA);
    expect(hiddenHere({ user_id: CAL, carries_words_of: [BEA] })).toBe(true);
    expect(hiddenHere({ user_id: CAL, carries_words_of: [ME, BEA] })).toBe(true);
  });
  it('a message carrying no one hidden is read', () => {
    mockHidden.add(BEA);
    expect(hiddenHere({ user_id: CAL, carries_words_of: [CAL] })).toBe(false);
    expect(hiddenHere({ user_id: CAL, carries_words_of: null })).toBe(false);
    expect(hiddenHere({ user_id: CAL })).toBe(false);
  });
  it('the member\'s own message is never hidden, whoever it quotes', () => {
    mockHidden.add(BEA);
    expect(hiddenHere({ user_id: ME, carries_words_of: [BEA] })).toBe(false);
  });
});

it('blocking Bea takes Cal\'s answer to her and his card of her essay off the open room with her own words', () => {
  useLoungeStore.setState({ currentLoungeId: ROOM, currentMessages: ROWS.map(held) });
  expect(shown()).toEqual(['the words of bea', 'an answer of cal', 'dossier_share', 'a plain word of cal']);
  mockHidden.add(BEA);
  useLoungeStore.getState().purgeHiddenMessages();
  expect(shown()).toEqual(['a plain word of cal']);
});

it('read from the house with Bea hidden, Cal\'s answer to her and his card of her essay are never drawn', async () => {
  mockHidden.add(BEA);
  await useLoungeStore.getState().fetchMessages(ROOM);
  expect(shown()).toEqual(['a plain word of cal']);
});

it('heard live with Bea hidden, Cal\'s answer to her is never drawn, and his plain word is', async () => {
  mockHidden.add(BEA);
  useLoungeStore.setState({ currentLoungeId: ROOM, currentMessages: [] });
  leave = useLoungeStore.getState().subscribeToLounge(ROOM, { seated: false });
  const heard = mockHandlers.get('postgres_changes:INSERT:lounge_messages');
  expect(heard).toBeDefined();
  const answer = ROWS[1];
  const plain = ROWS[3];
  expect(answer).toBeDefined();
  expect(plain).toBeDefined();
  await heard!({ new: answer });
  await heard!({ new: plain });
  await settled();
  expect(shown()).toEqual(['a plain word of cal']);
});
